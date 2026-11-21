import { readDocumentBytes, listDocumentsForProperty } from "../documents.js";
import { getAssetForProperty, listAssetsForProperty } from "../assets.js";
import { listRemindersForProperty } from "../reminders.js";
import { getCatalogProduct } from "./catalog.js";
import { resolveAiMode, type AiMode } from "./provider.js";
import {
  formatReminderLine,
  isReminderScheduleQuestion,
} from "./reminderSchedule.js";
import type { AssetRecord, DocumentRecord } from "../types.js";

export type HowToCitation = {
  kind: "document" | "asset" | "catalog" | "reminder";
  id: string;
  title: string;
};

export type HowToAnswer = {
  mode: AiMode;
  answer: string;
  grounded: boolean;
  citations: HowToCitation[];
  privacy: {
    writes: false;
    note: string;
  };
};

function scoreText(haystack: string, question: string): number {
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return 0;
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const w of words) {
    if (h.includes(w)) hits += 1;
  }
  return hits / words.length;
}

function extractRelevantSnippets(content: string, question: string): string[] {
  const blocks = content
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const ranked = blocks
    .map((block) => ({ block, score: scoreText(block, question) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) {
    return blocks.slice(0, 2);
  }
  return ranked.slice(0, 3).map((r) => r.block);
}

function assetLedgerBlurb(asset: AssetRecord): string {
  const parts = [
    `Asset: ${asset.name}`,
    `Category: ${asset.category}`,
    asset.manufacturer ? `Manufacturer: ${asset.manufacturer}` : null,
    asset.model ? `Model: ${asset.model}` : null,
    asset.serial ? `Serial: ${asset.serial}` : null,
    asset.location ? `Location: ${asset.location}` : null,
    asset.installDate ? `Install date: ${asset.installDate}` : null,
    asset.lastServicedAt ? `Last serviced: ${asset.lastServicedAt}` : null,
    asset.confirmedByContractorName
      ? `Confirmed by contractor: ${asset.confirmedByContractorName}`
      : null,
    asset.warrantyEndDate ? `Warranty ends: ${asset.warrantyEndDate}` : null,
    asset.notes ? `Notes: ${asset.notes}` : null,
  ].filter(Boolean);
  return parts.join("\n");
}

/**
 * Answer home / ledger asks. Reminder/schedule questions read this home's
 * reminders (+ related asset service fields) under ownership checks — never
 * invent. Manuals / how-to stay on the grounded manuals path.
 */
export async function answerHowTo(input: {
  propertyId: string;
  ownerUserId: string;
  question: string;
  assetId?: string | null;
}): Promise<HowToAnswer> {
  const mode = resolveAiMode();
  const question = input.question.trim();

  if (isReminderScheduleQuestion(question)) {
    return answerReminderSchedule({
      propertyId: input.propertyId,
      ownerUserId: input.ownerUserId,
      assetId: input.assetId,
      mode,
    });
  }

  const citations: HowToCitation[] = [];
  const snippets: string[] = [];

  let assets: AssetRecord[] = [];
  if (input.assetId) {
    const asset = getAssetForProperty(
      input.assetId,
      input.propertyId,
      input.ownerUserId,
    );
    if (!asset) throw new Error("ASSET_NOT_FOUND");
    assets = [asset];
  } else {
    assets = listAssetsForProperty(input.propertyId, input.ownerUserId);
  }

  for (const asset of assets) {
    const blurb = assetLedgerBlurb(asset);
    if (scoreText(blurb, question) > 0 || input.assetId) {
      snippets.push(blurb);
      citations.push({
        kind: "asset",
        id: asset.id,
        title: asset.name,
      });
    }

    const docs = listDocumentsForProperty(input.propertyId, input.ownerUserId, {
      assetId: asset.id,
    }).filter(
      (d) =>
        d.docType === "manual" ||
        d.source === "ai_fetched" ||
        d.mimeType.startsWith("text/"),
    );

    for (const doc of docs) {
      const text = await readDocAsText(doc);
      if (!text) continue;
      const relevant = extractRelevantSnippets(text, question);
      if (relevant.length === 0) continue;
      snippets.push(...relevant.map((s) => `[${doc.title}]\n${s}`));
      citations.push({
        kind: "document",
        id: doc.id,
        title: doc.title,
      });
    }

    // Soft catalog fallback when the asset matches a known product but manuals
    // were not yet confirmed/stored — still cite as catalog, not open web.
    if (docs.length === 0 && asset.manufacturer && asset.model) {
      const catalog = getCatalogProductMatch(asset.manufacturer, asset.model);
      if (catalog) {
        for (const manual of catalog.manuals) {
          const relevant = extractRelevantSnippets(manual.content, question);
          snippets.push(...relevant.map((s) => `[${manual.title}]\n${s}`));
          citations.push({
            kind: "catalog",
            id: manual.id,
            title: `${manual.title} (not yet saved — confirm scan to store)`,
          });
        }
        for (const note of catalog.howtoNotes) {
          if (scoreText(note, question) > 0) snippets.push(note);
        }
      }
    }
  }

  const uniqueCitations = dedupeCitations(citations);
  const grounded = snippets.length > 0;

  if (!grounded) {
    return {
      mode,
      grounded: false,
      answer:
        "I don’t have enough saved manuals or home records to answer that safely. " +
        "Scan the product and confirm storing its manuals, or attach a manual photo, then ask again.",
      citations: [],
      privacy: {
        writes: false,
        note: "How-to answers never change your ledger.",
      },
    };
  }

  const answer = [
    "Based on your home records and stored / catalog manuals:",
    "",
    ...snippets.slice(0, 6),
    "",
    "Sources are listed below. This is not a substitute for the full manufacturer manual or a licensed pro when safety is involved.",
  ].join("\n");

  return {
    mode,
    grounded: true,
    answer,
    citations: uniqueCitations.slice(0, 8),
    privacy: {
      writes: false,
      note: "How-to answers never change your ledger.",
    },
  };
}

async function readDocAsText(doc: DocumentRecord): Promise<string | null> {
  try {
    const bytes = await readDocumentBytes(doc);
    if (
      doc.mimeType.startsWith("text/") ||
      doc.mimeType === "application/json" ||
      doc.originalFilename.endsWith(".txt") ||
      doc.originalFilename.endsWith(".md")
    ) {
      return bytes.toString("utf8");
    }
    // Binary PDFs / images are not OCR'd in MVP — title still helps slightly.
    return `${doc.title}\n${doc.originalFilename}`;
  } catch {
    return null;
  }
}

function getCatalogProductMatch(manufacturer: string, model: string) {
  const q = `${manufacturer} ${model}`.toLowerCase();
  return (
    getCatalogProduct(
      // try known ids first via manufacturer/model equality
      ["generac-gp6500", "carrier-infinity-24", "rheem-performance-50"].find(
        (id) => {
          const p = getCatalogProduct(id);
          return (
            !!p &&
            p.manufacturer.toLowerCase() === manufacturer.toLowerCase() &&
            p.model.toLowerCase() === model.toLowerCase()
          );
        },
      ) ?? "",
    ) ??
    // loose match
    (q.includes("generac")
      ? getCatalogProduct("generac-gp6500")
      : q.includes("carrier")
        ? getCatalogProduct("carrier-infinity-24")
        : q.includes("rheem")
          ? getCatalogProduct("rheem-performance-50")
          : undefined)
  );
}

function dedupeCitations(citations: HowToCitation[]): HowToCitation[] {
  const seen = new Set<string>();
  const out: HowToCitation[] = [];
  for (const c of citations) {
    const key = `${c.kind}:${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * List upcoming reminders + related asset service fields for this home only.
 * Grounded even when the list is empty — we read the ledger, we do not invent.
 */
function answerReminderSchedule(input: {
  propertyId: string;
  ownerUserId: string;
  assetId?: string | null;
  mode: AiMode;
}): HowToAnswer {
  const reminders = listRemindersForProperty(
    input.propertyId,
    input.ownerUserId,
    {
      assetId: input.assetId ?? undefined,
      includeCompleted: false,
    },
  );

  let assets: AssetRecord[] = [];
  if (input.assetId) {
    const asset = getAssetForProperty(
      input.assetId,
      input.propertyId,
      input.ownerUserId,
    );
    if (!asset) throw new Error("ASSET_NOT_FOUND");
    assets = [asset];
  } else {
    assets = listAssetsForProperty(input.propertyId, input.ownerUserId);
  }

  const citations: HowToCitation[] = [];
  const lines: string[] = [];

  if (reminders.length > 0) {
    lines.push("Upcoming maintenance reminders for this home:");
    lines.push("");
    for (const reminder of reminders.slice(0, 20)) {
      lines.push(
        formatReminderLine({
          title: reminder.title,
          dueDate: reminder.dueDate,
          assetName: reminder.assetName,
          recurrence: reminder.recurrence,
          notes: reminder.notes,
        }),
      );
      citations.push({
        kind: "reminder",
        id: reminder.id,
        title: reminder.title,
      });
    }
  } else {
    lines.push(
      "This home has no upcoming maintenance reminders saved.",
      "Add one from Notifications → Add reminder. Ask HomeAsset only lists reminders you already saved — it does not invent them.",
    );
  }

  const serviceFacts: string[] = [];
  for (const asset of assets) {
    const facts = [
      asset.lastServicedAt ? `Last serviced: ${asset.lastServicedAt}` : null,
      asset.confirmedByContractorName
        ? `Confirmed by contractor: ${asset.confirmedByContractorName}`
        : null,
      asset.installDate ? `Install date: ${asset.installDate}` : null,
      asset.warrantyEndDate ? `Warranty ends: ${asset.warrantyEndDate}` : null,
    ].filter(Boolean);
    if (facts.length === 0) continue;
    serviceFacts.push(`• ${asset.name}: ${facts.join(" · ")}`);
    citations.push({ kind: "asset", id: asset.id, title: asset.name });
  }

  if (serviceFacts.length > 0) {
    lines.push("");
    lines.push("Related asset service fields on this home:");
    lines.push(...serviceFacts.slice(0, 12));
  }

  lines.push("");
  lines.push(
    "Open Notifications to mark a reminder done or add more. Asking never changes your ledger.",
  );

  return {
    mode: input.mode,
    grounded: true,
    answer: lines.join("\n"),
    citations: dedupeCitations(citations).slice(0, 12),
    privacy: {
      writes: false,
      note: "Reminder answers never change your ledger.",
    },
  };
}
