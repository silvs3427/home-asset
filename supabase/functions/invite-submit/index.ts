/**
 * Public invite-link submit (non-LightLift contractors).
 *
 * GET  ?t=TOKEN
 *   - Browser navigation (Accept: text/html) → 302 to GitHub Pages landing
 *     (Supabase project hosts rewrite GET text/html → text/plain, so HTML
 *     cannot be served from *.supabase.co — see invite-landing app.)
 *   - Accept: application/json → invite metadata for the landing page
 * POST multipart/JSON with token → pending submission + AI draft
 *
 * Deploy with verify_jwt=false (see supabase/config.toml).
 * Secrets: GEMINI_API_KEY (preferred) — same as ai-assist / LightLift.
 * Optional: INVITE_LANDING_BASE_URL (default GitHub Pages invite site).
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
const DEFAULT_INVITE_LANDING_BASE =
  "https://silvs3427.github.io/home-asset/";
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
    const accept = (req.headers.get("accept") || "").toLowerCase();
    const fetchDest = (req.headers.get("sec-fetch-dest") || "").toLowerCase();
    const wantsJson =
      accept.includes("application/json") && !accept.includes("text/html");
    const isBrowserDocument =
      fetchDest === "document" ||
      (accept.includes("text/html") && !accept.includes("application/json"));

    // Browsers opening the old edge URL: redirect to the real HTML host.
    // (GET text/html on *.supabase.co is rewritten to text/plain.)
    if (isBrowserDocument) {
      const landing = buildLandingRedirectUrl(tokenFromQuery);
      return Response.redirect(landing, 302);
    }

    if (!tokenFromQuery) {
      if (wantsJson || !isBrowserDocument) {
        return jsonError(400, "missing_token", "Missing invite link.");
      }
      return htmlResponse(errorPage("Missing invite link."), 400);
    }

    const invite = await loadInvite(tokenFromQuery);
    if (!invite.ok) {
      if (wantsJson || !isBrowserDocument) {
        return jsonError(invite.status, "invite_unavailable", invite.message);
      }
      return htmlResponse(errorPage(invite.message), invite.status);
    }

    // Landing page bootstrap (JSON). HTML form lives on GitHub Pages.
    return jsonResponse({
      ok: true,
      token: tokenFromQuery,
      homeLabel: invite.homeLabel,
      inviteLabel: invite.label,
      submitPath: "/functions/v1/invite-submit",
      privacy: {
        writesOfficial: false,
        note: "Pending only. Homeowner must approve before anything is official.",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonError(405, "method_not_allowed", "Method not allowed");
  }

  try {
    const parsed = await parseSubmitBody(req, tokenFromQuery);
    if (!parsed.ok) {
      const accept = (req.headers.get("accept") || "").toLowerCase();
      if (accept.includes("application/json")) {
        return jsonError(parsed.status, parsed.code, parsed.message);
      }
      if (accept.includes("text/html")) {
        return htmlResponse(errorPage(parsed.message), parsed.status);
      }
      return jsonError(parsed.status, parsed.code, parsed.message);
    }

    const result = await processSubmission(parsed);
    const accept = (req.headers.get("accept") || "").toLowerCase();
    // Prefer JSON when the landing page asks for it (fetch + FormData).
    if (accept.includes("application/json")) {
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
    }
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
    const accept = (req.headers.get("accept") || "").toLowerCase();
    const message =
      err instanceof Error ? err.message : "Could not save submission.";
    if (accept.includes("application/json")) {
      return jsonError(500, "submit_failed", message);
    }
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
  photos: FilePart[];
  audio: FilePart | null;
} | {
  ok: false;
  status: number;
  code: string;
  message: string;
};

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

function inviteLandingBaseUrl(): string {
  const raw =
    Deno.env.get("INVITE_LANDING_BASE_URL")?.trim() ||
    DEFAULT_INVITE_LANDING_BASE;
  return raw.endsWith("/") ? raw : `${raw}/`;
}

/** Browser-safe landing URL (HTML hosted outside *.supabase.co). */
function buildLandingRedirectUrl(token: string): string {
  const landing = new URL(inviteLandingBaseUrl());
  if (token) landing.searchParams.set("t", token);
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  if (supabaseUrl) landing.searchParams.set("api", supabaseUrl);
  return landing.toString();
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
