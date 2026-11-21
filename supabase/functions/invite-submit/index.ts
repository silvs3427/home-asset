/**
 * Public invite-link submit (non-LightLift contractors).
 *
 * GET  ?t=TOKEN  → phone-friendly HTML form (voice + photos + text)
 * POST multipart/JSON with token → pending submission + AI draft
 *
 * Deploy with verify_jwt=false (see supabase/config.toml).
 * Secrets: GEMINI_API_KEY (preferred) — same as ai-assist / LightLift.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getCatalogProduct,
  matchCatalogProducts,
} from "../_shared/catalog.ts";
import { HOME_SCOPE_SYSTEM_BLURB } from "../_shared/topicGuard.ts";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const MAX_PHOTOS = 8;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

type AssetCategory =
  | "hvac"
  | "roof"
  | "appliance"
  | "generator"
  | "water_heater"
  | "plumbing"
  | "electrical"
  | "kids_gear"
  | "vehicle"
  | "other";

type DraftAsset = {
  name: string;
  category: AssetCategory;
  manufacturer: string | null;
  model: string | null;
  notes: string | null;
};

type DraftPacket = {
  summary: string;
  workPerformed: string;
  contractorName: string | null;
  workDate: string | null;
  assetsSuggested: DraftAsset[];
  materials: string[];
  followUps: string[];
};

type LiveConfig =
  | { mode: "mock" }
  | {
      mode: "live";
      provider: "gemini" | "openai";
      apiKey: string;
      model: string;
      baseUrl?: string;
    };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(req.url);
  const tokenFromQuery = (url.searchParams.get("t") || "").trim();

  if (req.method === "GET") {
    if (!tokenFromQuery) {
      return htmlResponse(errorPage("Missing invite link."), 400);
    }
    const invite = await loadInvite(tokenFromQuery);
    if (!invite.ok) {
      return htmlResponse(errorPage(invite.message), invite.status);
    }
    return htmlResponse(
      formPage({
        token: tokenFromQuery,
        homeLabel: invite.homeLabel,
        inviteLabel: invite.label,
      }),
    );
  }

  if (req.method !== "POST") {
    return jsonError(405, "method_not_allowed", "Method not allowed");
  }

  try {
    const parsed = await parseSubmitBody(req, tokenFromQuery);
    if (!parsed.ok) {
      const accept = req.headers.get("accept") || "";
      if (accept.includes("text/html")) {
        return htmlResponse(errorPage(parsed.message), parsed.status);
      }
      return jsonError(parsed.status, parsed.code, parsed.message);
    }

    const result = await processSubmission(parsed);
    const accept = req.headers.get("accept") || "";
    if (accept.includes("text/html") || parsed.fromForm) {
      return htmlResponse(
        successPage({
          homeLabel: result.homeLabel,
          summary: result.draft.summary,
        }),
      );
    }
    return jsonResponse({
      ok: true,
      submissionId: result.submissionId,
      status: "pending",
      draft: result.draft,
      aiMode: result.aiMode,
      privacy: {
        writesOfficial: false,
        note: "Pending only. Homeowner must approve before anything is official.",
      },
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: "invite_submit_error",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    const accept = req.headers.get("accept") || "";
    const message =
      err instanceof Error ? err.message : "Could not save submission.";
    if (accept.includes("text/html")) {
      return htmlResponse(errorPage(message), 500);
    }
    return jsonError(500, "submit_failed", message);
  }
});

type LoadedInvite = {
  ok: true;
  inviteId: string;
  propertyId: string;
  ownerUserId: string;
  homeLabel: string;
  label: string | null;
} | {
  ok: false;
  status: number;
  message: string;
};

async function loadInvite(token: string): Promise<LoadedInvite> {
  const admin = serviceClient();
  const { data, error } = await admin
    .from("contractor_invites")
    .select(
      "id, property_id, label, expires_at, revoked_at, properties!inner(name, address_line1, city, owner_user_id)",
    )
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({ msg: "invite_lookup_error", error: error.message }),
    );
    return {
      ok: false,
      status: 503,
      message: "Invite lookup failed. Ask the homeowner to try again later.",
    };
  }
  if (!data) {
    return {
      ok: false,
      status: 404,
      message: "This invite link is invalid or was removed.",
    };
  }
  if (data.revoked_at) {
    return {
      ok: false,
      status: 410,
      message: "This invite link was revoked by the homeowner.",
    };
  }
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      status: 410,
      message: "This invite link has expired. Ask the homeowner for a new one.",
    };
  }

  const rawProp = data.properties as
    | {
      name: string;
      address_line1: string;
      city: string;
      owner_user_id: string;
    }
    | Array<{
      name: string;
      address_line1: string;
      city: string;
      owner_user_id: string;
    }>
    | null;
  const prop = Array.isArray(rawProp) ? rawProp[0] : rawProp;
  if (!prop) {
    return {
      ok: false,
      status: 404,
      message: "This invite link is invalid or was removed.",
    };
  }
  return {
    ok: true,
    inviteId: String(data.id),
    propertyId: String(data.property_id),
    ownerUserId: String(prop.owner_user_id),
    homeLabel: `${prop.name} · ${prop.address_line1}, ${prop.city}`,
    label: data.label ? String(data.label) : null,
  };
}

type ParsedSubmit = {
  ok: true;
  fromForm: boolean;
  token: string;
  notes: string;
  contractorName: string;
  companyName: string;
  phone: string;
  email: string;
  servicesOffered: string[];
  photos: FilePart[];
  audio: FilePart | null;
} | {
  ok: false;
  status: number;
  code: string;
  message: string;
};

function parseServicesOffered(raw: unknown): string[] {
  const text = Array.isArray(raw)
    ? raw.map((s) => String(s)).join(",")
    : String(raw ?? "");
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((s) => s.slice(0, 80));
}

type FilePart = {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  kind: "photo" | "audio" | "other";
};

async function parseSubmitBody(
  req: Request,
  tokenFromQuery: string,
): Promise<ParsedSubmit> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        status: 400,
        code: "invalid_json",
        message: "Invalid JSON body.",
      };
    }
    const token = String(body.token ?? tokenFromQuery).trim();
    const notes = String(body.notes ?? "").trim();
    const contractorName = String(body.contractorName ?? "").trim();
    const companyName = String(body.companyName ?? "").trim();
    const phone = String(body.phone ?? "").trim().slice(0, 40);
    const email = String(body.email ?? "").trim().slice(0, 120);
    const servicesOffered = parseServicesOffered(body.servicesOffered);
    if (!token) {
      return {
        ok: false,
        status: 400,
        code: "missing_token",
        message: "Invite token required.",
      };
    }
    if (!notes && !contractorName) {
      return {
        ok: false,
        status: 400,
        code: "empty_submit",
        message: "Add notes about the work (or use the form with voice/photos).",
      };
    }
    return {
      ok: true,
      fromForm: false,
      token,
      notes,
      contractorName,
      companyName,
      phone,
      email,
      servicesOffered,
      photos: [],
      audio: null,
    };
  }

  // multipart (browser form) or urlencoded
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      status: 400,
      code: "invalid_form",
      message: "Could not read form data.",
    };
  }

  const token = String(form.get("token") ?? tokenFromQuery).trim();
  const notes = String(form.get("notes") ?? "").trim();
  const contractorName = String(form.get("contractorName") ?? "").trim();
  const companyName = String(form.get("companyName") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim().slice(0, 40);
  const email = String(form.get("email") ?? "").trim().slice(0, 120);
  const servicesOffered = parseServicesOffered(form.get("servicesOffered"));
  if (!token) {
    return {
      ok: false,
      status: 400,
      code: "missing_token",
      message: "Invite token required.",
    };
  }

  const photos: FilePart[] = [];
  const photoEntries = form.getAll("photos");
  for (const entry of photoEntries) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (photos.length >= MAX_PHOTOS) break;
    if (entry.size > MAX_PHOTO_BYTES) {
      return {
        ok: false,
        status: 400,
        code: "photo_too_large",
        message: "Each photo must be under 8 MB.",
      };
    }
    const mime = entry.type || "image/jpeg";
    if (!mime.startsWith("image/")) {
      return {
        ok: false,
        status: 400,
        code: "invalid_photo",
        message: "Photos must be image files.",
      };
    }
    photos.push({
      bytes: new Uint8Array(await entry.arrayBuffer()),
      mimeType: mime,
      filename: sanitizeFilename(entry.name || `photo-${photos.length + 1}.jpg`),
      kind: "photo",
    });
  }

  let audio: FilePart | null = null;
  const audioEntry = form.get("audio");
  if (audioEntry instanceof File && audioEntry.size > 0) {
    if (audioEntry.size > MAX_AUDIO_BYTES) {
      return {
        ok: false,
        status: 400,
        code: "audio_too_large",
        message: "Voice recording must be under 12 MB.",
      };
    }
    const mime = audioEntry.type || "audio/webm";
    if (!mime.startsWith("audio/") && mime !== "video/webm") {
      return {
        ok: false,
        status: 400,
        code: "invalid_audio",
        message: "Voice must be an audio recording.",
      };
    }
    audio = {
      bytes: new Uint8Array(await audioEntry.arrayBuffer()),
      mimeType: mime.startsWith("audio/") ? mime : "audio/webm",
      filename: sanitizeFilename(audioEntry.name || "voice.webm"),
      kind: "audio",
    };
  }

  if (!notes && photos.length === 0 && !audio) {
    return {
      ok: false,
      status: 400,
      code: "empty_submit",
      message: "Add notes, a voice recording, or at least one photo.",
    };
  }

  return {
    ok: true,
    fromForm: true,
    token,
    notes,
    contractorName,
    companyName,
    phone,
    email,
    servicesOffered,
    photos,
    audio,
  };
}

async function processSubmission(input: Extract<ParsedSubmit, { ok: true }>) {
  const invite = await loadInvite(input.token);
  if (!invite.ok) {
    throw new Error(invite.message);
  }

  const live = resolveLiveConfig();
  const inputKind = input.audio
    ? "voice"
    : input.photos.length > 0
    ? "upload"
    : "typed";

  const formatText = buildFormatText({
    notes: input.notes,
    contractorName: input.contractorName,
    companyName: input.companyName,
    photoCount: input.photos.length,
    hasAudio: Boolean(input.audio),
  });

  const formatted = await formatContractorDraft({
    inputText: formatText,
    inputKind,
    contractorName: input.contractorName || null,
    live,
  });

  const admin = serviceClient();
  const submissionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: subErr } = await admin.from("contractor_submissions").insert({
    id: submissionId,
    invite_id: invite.inviteId,
    property_id: invite.propertyId,
    status: "pending",
    contractor_name: input.contractorName || formatted.draft.contractorName,
    company_name: input.companyName || null,
    phone: input.phone || null,
    email: input.email || null,
    services_offered: input.servicesOffered,
    notes_text: input.notes || null,
    draft_json: formatted.draft,
    ai_mode: formatted.mode,
    created_at: now,
    updated_at: now,
  });
  if (subErr) {
    throw new Error(`Could not save submission: ${subErr.message}`);
  }

  const mediaParts = [
    ...input.photos,
    ...(input.audio ? [input.audio] : []),
  ];
  for (const part of mediaParts) {
    const mediaId = crypto.randomUUID();
    const storageKey = `${invite.propertyId}/${submissionId}/${mediaId}-${part.filename}`;
    const { error: upErr } = await admin.storage
      .from("invite-media")
      .upload(storageKey, part.bytes, {
        contentType: part.mimeType,
        upsert: false,
      });
    if (upErr) {
      console.error(
        JSON.stringify({
          msg: "invite_media_upload_failed",
          error: upErr.message,
          storageKey,
        }),
      );
      continue;
    }
    const { error: metaErr } = await admin
      .from("contractor_submission_media")
      .insert({
        id: mediaId,
        submission_id: submissionId,
        property_id: invite.propertyId,
        kind: part.kind,
        mime_type: part.mimeType,
        original_filename: part.filename,
        storage_key: storageKey,
        byte_size: part.bytes.byteLength,
        created_at: now,
      });
    if (metaErr) {
      console.error(
        JSON.stringify({
          msg: "invite_media_meta_failed",
          error: metaErr.message,
        }),
      );
    }
  }

  await notifyHomeowner({
    ownerUserId: invite.ownerUserId,
    propertyId: invite.propertyId,
    submissionId,
    summary: formatted.draft.summary,
  });

  return {
    submissionId,
    homeLabel: invite.homeLabel,
    draft: formatted.draft,
    aiMode: formatted.mode,
  };
}

async function notifyHomeowner(input: {
  ownerUserId: string;
  propertyId: string;
  submissionId: string;
  summary: string;
}) {
  const admin = serviceClient();
  const now = new Date().toISOString();
  const title = "Contractor submitted work";
  const body =
    `${input.summary.slice(0, 140)}. Nothing is official until you approve.`;
  const dedupe = `contractor_submit:${input.submissionId}`;

  const { data: prefs } = await admin
    .from("notification_preferences")
    .select(
      "contractor_submits_enabled, in_app_enabled, push_enabled",
    )
    .eq("user_id", input.ownerUserId)
    .maybeSingle();

  const submitsOn = prefs?.contractor_submits_enabled !== false;
  const inAppOn = prefs?.in_app_enabled !== false;
  const pushOn = prefs?.push_enabled !== false;
  if (!submitsOn) return;

  let notificationId: string | null = null;
  if (inAppOn) {
    const { data: note, error } = await admin
      .from("notifications")
      .upsert(
        {
          user_id: input.ownerUserId,
          property_id: input.propertyId,
          kind: "contractor_submit",
          title,
          body,
          related_entity_id: input.submissionId,
          dedupe_key: dedupe,
          push_status: pushOn ? "pending" : "skipped",
          created_at: now,
        },
        { onConflict: "user_id,dedupe_key" },
      )
      .select("id")
      .single();
    if (error) {
      console.error(
        JSON.stringify({
          msg: "invite_notify_in_app_failed",
          error: error.message,
        }),
      );
    } else if (note?.id) {
      notificationId = String(note.id);
    }
  }

  if (pushOn) {
    // Best-effort Expo push via same path as recalls (service role → devices).
    try {
      const { data: devices } = await admin
        .from("push_devices")
        .select("expo_push_token")
        .eq("user_id", input.ownerUserId);
      const tokens = ((devices as Array<{ expo_push_token: string }> | null) ??
        [])
        .map((d) => d.expo_push_token)
        .filter(Boolean);
      if (tokens.length > 0) {
        const { sendExpoPushMessages } = await import("../_shared/expoPush.ts");
        const result = await sendExpoPushMessages(
          tokens,
          {
            title,
            body,
            data: {
              kind: "contractor_submit",
              notificationId: notificationId ?? "",
              propertyId: input.propertyId,
              relatedEntityId: input.submissionId,
            },
          },
          Deno.env.get("EXPO_ACCESS_TOKEN") ?? undefined,
        );
        if (notificationId) {
          await admin
            .from("notifications")
            .update({
              push_status: result.status,
              push_sent_at: now,
            })
            .eq("id", notificationId);
        }
      }
    } catch (pushErr) {
      console.error(
        JSON.stringify({
          msg: "invite_notify_push_failed",
          error: pushErr instanceof Error ? pushErr.message : String(pushErr),
        }),
      );
    }
  }
}

function buildFormatText(input: {
  notes: string;
  contractorName: string;
  companyName: string;
  photoCount: number;
  hasAudio: boolean;
}): string {
  const parts: string[] = [];
  if (input.contractorName) parts.push(`Contractor: ${input.contractorName}`);
  if (input.companyName) parts.push(`Company: ${input.companyName}`);
  if (input.notes) parts.push(input.notes);
  if (input.hasAudio) {
    parts.push(
      "Voice recording attached (homeowner can listen before approving).",
    );
  }
  if (input.photoCount > 0) {
    parts.push(`${input.photoCount} photo(s) attached for homeowner review.`);
  }
  return parts.join("\n").trim() || "Contractor submitted work via invite link.";
}

async function formatContractorDraft(input: {
  inputText: string;
  inputKind: "typed" | "voice" | "upload";
  contractorName: string | null;
  live: LiveConfig;
}): Promise<{ mode: "mock" | "live"; draft: DraftPacket }> {
  const text = input.inputText.trim();

  if (input.live.mode === "live") {
    try {
      const content = await chatJsonText({
        live: input.live,
        system:
          `${HOME_SCOPE_SYSTEM_BLURB} ` +
          "Format contractor job notes into JSON with keys: summary, workPerformed, " +
          "contractorName (string|null), workDate (YYYY-MM-DD|null), " +
          "assetsSuggested (array of {name,category,manufacturer,model,notes}), " +
          "materials (string[]), followUps (string[]). Categories: hvac,roof,appliance," +
          "generator,water_heater,plumbing,electrical,kids_gear,vehicle,other.",
        user: text,
      });
      const jsonMatch = content?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<DraftPacket>;
        return {
          mode: "live",
          draft: normalizeDraft(parsed, text, input.contractorName),
        };
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          msg: "invite_ai_format_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  const product = matchCatalogProducts(text)[0] ?? getCatalogProduct("generac-gp6500")!;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    mode: "mock",
    draft: {
      summary:
        lines[0]?.slice(0, 160) ||
        `${input.inputKind} notes for ${product.manufacturer} ${product.model}`,
      workPerformed: text || `Installed / serviced ${product.name}.`,
      contractorName: input.contractorName,
      workDate: null,
      assetsSuggested: [
        {
          name: product.name,
          category: product.category as AssetCategory,
          manufacturer: product.manufacturer,
          model: product.model,
          notes: `Formatted from invite-link ${input.inputKind} input (mock AI). Approve before official.`,
        },
      ],
      materials: lines
        .filter((l) => /part|filter|seal|wire|panel|unit/i.test(l))
        .slice(0, 5),
      followUps: [
        "Homeowner must approve before this becomes official in the ledger.",
        "Review attached photos or voice before approving.",
      ],
    },
  };
}

function normalizeDraft(
  parsed: Partial<DraftPacket>,
  fallbackText: string,
  contractorName: string | null,
): DraftPacket {
  const assets = Array.isArray(parsed.assetsSuggested)
    ? parsed.assetsSuggested.map((a) => ({
      name: String(a?.name ?? "Installed item").slice(0, 200),
      category: normalizeCategory(a?.category),
      manufacturer: a?.manufacturer != null
        ? String(a.manufacturer).slice(0, 120)
        : null,
      model: a?.model != null ? String(a.model).slice(0, 120) : null,
      notes: a?.notes != null ? String(a.notes).slice(0, 500) : null,
    }))
    : [];
  return {
    summary: String(parsed.summary ?? fallbackText.slice(0, 160)).slice(0, 200),
    workPerformed: String(parsed.workPerformed ?? fallbackText).slice(0, 4000),
    contractorName: parsed.contractorName != null
      ? String(parsed.contractorName).slice(0, 120)
      : contractorName,
    workDate: parsed.workDate && /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.workDate))
      ? String(parsed.workDate)
      : null,
    assetsSuggested: assets,
    materials: Array.isArray(parsed.materials)
      ? parsed.materials.map((m) => String(m).slice(0, 120)).slice(0, 12)
      : [],
    followUps: Array.isArray(parsed.followUps)
      ? parsed.followUps.map((f) => String(f).slice(0, 200)).slice(0, 8)
      : [],
  };
}

function normalizeCategory(raw: unknown): AssetCategory {
  const value = String(raw ?? "other").toLowerCase().replace(/\s+/g, "_");
  const allowed: AssetCategory[] = [
    "hvac",
    "roof",
    "appliance",
    "generator",
    "water_heater",
    "plumbing",
    "electrical",
    "kids_gear",
    "vehicle",
    "other",
  ];
  return (allowed.includes(value as AssetCategory)
    ? value
    : "other") as AssetCategory;
}

function resolveLiveConfig(): LiveConfig {
  const flag = (Deno.env.get("AI_ASSIST_LIVE") || "").trim().toLowerCase();
  const geminiKey = (Deno.env.get("GEMINI_API_KEY") || "").trim();
  const openaiKey =
    (Deno.env.get("OPENAI_API_KEY") || Deno.env.get("AI_API_KEY") || "").trim();
  if (flag === "false" || flag === "0" || flag === "off") {
    return { mode: "mock" };
  }
  if (geminiKey) {
    return {
      mode: "live",
      provider: "gemini",
      apiKey: geminiKey,
      model: (Deno.env.get("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL).trim(),
    };
  }
  if (openaiKey) {
    return {
      mode: "live",
      provider: "openai",
      apiKey: openaiKey,
      model: (Deno.env.get("AI_MODEL") || DEFAULT_OPENAI_MODEL).trim(),
      baseUrl: (Deno.env.get("AI_BASE_URL") || DEFAULT_OPENAI_BASE).trim(),
    };
  }
  return { mode: "mock" };
}

async function chatJsonText(input: {
  live: Extract<LiveConfig, { mode: "live" }>;
  system: string;
  user: string;
}): Promise<string | null> {
  if (input.live.provider === "gemini") {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${input.live.model}:generateContent?key=${input.live.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${input.system}\n\n${input.user}` }],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return body.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  }

  const res = await fetch(`${input.live.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.live.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.live.model,
      temperature: 0,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return body.choices?.[0]?.message?.content ?? null;
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Supabase service env missing on invite-submit.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file.bin";
}

function corsHeaders(): HeadersInit {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type, accept",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function jsonError(status: number, code: string, message: string): Response {
  return jsonResponse({ error: code, message }, status);
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      ...corsHeaders(),
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function formPage(input: {
  token: string;
  homeLabel: string;
  inviteLabel: string | null;
}): string {
  const title = input.inviteLabel
    ? escapeHtml(input.inviteLabel)
    : "Submit finished work";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>HomeAsset · Contractor submit</title>
  <style>
    :root {
      --bg: #F2F5FA;
      --surface: #FFFFFF;
      --brand: #002D72;
      --brand-muted: #1E4D96;
      --accent: #FF5910;
      --ink: #0B1B33;
      --copy: #3D4F66;
      --muted: #5C6E84;
      --border: #C5D0DE;
      --danger: #B42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: linear-gradient(180deg, #e8eef8 0%, var(--bg) 40%, #f7f9fc 100%);
      color: var(--ink);
      min-height: 100vh;
    }
    main {
      max-width: 520px;
      margin: 0 auto;
      padding: 28px 18px 48px;
    }
    .brand {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--brand-muted);
      margin-bottom: 8px;
    }
    h1 {
      font-size: 1.65rem;
      line-height: 1.2;
      margin: 0 0 8px;
      color: var(--brand);
    }
    .home {
      color: var(--copy);
      font-size: 0.95rem;
      margin-bottom: 20px;
    }
    .note {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px;
      color: var(--muted);
      font-size: 0.9rem;
      margin-bottom: 18px;
    }
    label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--brand-muted);
      margin: 14px 0 6px;
    }
    input[type=text], textarea {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      font-size: 1rem;
      background: var(--surface);
      color: var(--ink);
    }
    textarea { min-height: 120px; resize: vertical; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    button, .file-btn {
      appearance: none;
      border: none;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 1rem;
      font-weight: 650;
      cursor: pointer;
    }
    .primary {
      background: var(--brand);
      color: #fff;
      width: 100%;
      margin-top: 18px;
    }
    .primary:disabled { opacity: 0.55; cursor: wait; }
    .secondary {
      background: #fff;
      color: var(--brand);
      border: 1px solid var(--border);
    }
    .accent {
      background: var(--accent);
      color: #fff;
    }
    .status { margin-top: 10px; color: var(--muted); font-size: 0.9rem; min-height: 1.2em; }
    .err { color: var(--danger); }
    .hint { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }
    input[type=file] { width: 100%; margin-top: 4px; }
  </style>
</head>
<body>
  <main>
    <div class="brand">HomeAsset</div>
    <h1>${title}</h1>
    <p class="home">${escapeHtml(input.homeLabel)}</p>
    <div class="note">
      You are submitting work for the homeowner to review.
      Nothing becomes official until they approve.
      No HomeAsset account needed.
    </div>
    <form id="submitForm" method="POST" enctype="multipart/form-data" accept="text/html">
      <input type="hidden" name="token" value="${escapeHtml(input.token)}" />
      <label for="contractorName">Your name</label>
      <input id="contractorName" name="contractorName" type="text" maxlength="120" autocomplete="name" />
      <label for="companyName">Company (optional)</label>
      <input id="companyName" name="companyName" type="text" maxlength="120" />
      <label for="phone">Phone (optional)</label>
      <input id="phone" name="phone" type="tel" maxlength="40" autocomplete="tel" />
      <label for="email">Email (optional)</label>
      <input id="email" name="email" type="email" maxlength="120" autocomplete="email" />
      <label for="servicesOffered">Other services you offer (optional)</label>
      <input id="servicesOffered" name="servicesOffered" type="text" maxlength="400" placeholder="e.g. HVAC, plumbing, roofing" />
      <p class="hint">Comma-separated. Saved for the homeowner only after they approve.</p>
      <label for="notes">What was done / installed</label>
      <textarea id="notes" name="notes" maxlength="8000" placeholder="e.g. Replaced furnace filter, installed Carrier Infinity…">${""}</textarea>
      <label>Voice recording</label>
      <div class="row">
        <button type="button" class="secondary" id="recBtn">Record voice</button>
        <button type="button" class="accent" id="stopBtn" disabled>Stop</button>
      </div>
      <p class="status" id="recStatus">Optional — tap Record, describe the work, then Stop.</p>
      <input type="file" id="audioFile" name="audio" accept="audio/*,video/webm" style="display:none" />
      <label for="photos">Photos</label>
      <input id="photos" name="photos" type="file" accept="image/*" multiple capture="environment" />
      <p class="hint">Up to 8 photos. Add notes, voice, or photos — at least one.</p>
      <button class="primary" id="sendBtn" type="submit">Send for homeowner review</button>
      <p class="status" id="formStatus"></p>
    </form>
  </main>
  <script>
    (function () {
      const recBtn = document.getElementById("recBtn");
      const stopBtn = document.getElementById("stopBtn");
      const recStatus = document.getElementById("recStatus");
      const audioFile = document.getElementById("audioFile");
      const form = document.getElementById("submitForm");
      const sendBtn = document.getElementById("sendBtn");
      const formStatus = document.getElementById("formStatus");
      let mediaRecorder = null;
      let chunks = [];
      let recordedBlob = null;

      recBtn.addEventListener("click", async function () {
        formStatus.textContent = "";
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          recStatus.textContent = "Voice recording is not supported in this browser. Type notes or add photos.";
          recStatus.className = "status err";
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          chunks = [];
          recordedBlob = null;
          const mime = MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
          mediaRecorder = mime
            ? new MediaRecorder(stream, { mimeType: mime })
            : new MediaRecorder(stream);
          mediaRecorder.ondataavailable = function (e) {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          mediaRecorder.onstop = function () {
            stream.getTracks().forEach(function (t) { t.stop(); });
            recordedBlob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
            const ext = (recordedBlob.type || "").includes("mp4") ? "m4a" : "webm";
            const file = new File([recordedBlob], "voice." + ext, { type: recordedBlob.type });
            const dt = new DataTransfer();
            dt.items.add(file);
            audioFile.files = dt.files;
            recStatus.textContent = "Voice recorded (" + Math.round(recordedBlob.size / 1024) + " KB).";
            recStatus.className = "status";
            recBtn.disabled = false;
            stopBtn.disabled = true;
          };
          mediaRecorder.start();
          recBtn.disabled = true;
          stopBtn.disabled = false;
          recStatus.textContent = "Recording… tap Stop when finished.";
          recStatus.className = "status";
        } catch (err) {
          recStatus.textContent = "Microphone permission denied. Type notes or add photos instead.";
          recStatus.className = "status err";
        }
      });

      stopBtn.addEventListener("click", function () {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      });

      form.addEventListener("submit", function (ev) {
        const notes = (document.getElementById("notes").value || "").trim();
        const photos = document.getElementById("photos").files;
        const hasAudio = audioFile.files && audioFile.files.length > 0;
        if (!notes && (!photos || photos.length === 0) && !hasAudio) {
          formStatus.textContent = "Add notes, a voice recording, or at least one photo.";
          formStatus.className = "status err";
          ev.preventDefault();
          return;
        }
        sendBtn.disabled = true;
        formStatus.textContent = "Sending…";
        formStatus.className = "status";
      });
    })();
  </script>
</body>
</html>`;
}

function successPage(input: { homeLabel: string; summary: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HomeAsset · Sent</title>
  <style>
    body {
      margin: 0; font-family: "Segoe UI", system-ui, sans-serif;
      background: #F2F5FA; color: #0B1B33;
    }
    main { max-width: 520px; margin: 0 auto; padding: 40px 18px; }
    h1 { color: #002D72; }
    p { color: #3D4F66; line-height: 1.45; }
    .pill {
      display: inline-block; background: #002D72; color: #fff;
      padding: 8px 12px; border-radius: 999px; font-size: 0.85rem; font-weight: 650;
    }
  </style>
</head>
<body>
  <main>
    <div class="pill">Sent for review</div>
    <h1>Thanks — the homeowner got your submit</h1>
    <p><strong>${escapeHtml(input.homeLabel)}</strong></p>
    <p>${escapeHtml(input.summary)}</p>
    <p>Nothing is official until they approve. You can close this page.</p>
  </main>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HomeAsset · Invite</title>
  <style>
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #F2F5FA; color: #0B1B33; }
    main { max-width: 520px; margin: 0 auto; padding: 40px 18px; }
    h1 { color: #002D72; }
    p { color: #3D4F66; }
  </style>
</head>
<body>
  <main>
    <h1>HomeAsset</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
