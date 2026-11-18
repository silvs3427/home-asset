import { randomUUID } from "node:crypto";
import type { AssetCategory } from "../types.js";

export type SuggestedManualDraft = {
  id: string;
  title: string;
  sourceUrl: string;
  /** Preview excerpt only — full body stays server-side until confirm. */
  preview: string;
  selectedByDefault: boolean;
};

export type SuggestedAssetDraft = {
  name: string;
  category: AssetCategory;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  notes: string | null;
};

export type ScanDraftRecord = {
  id: string;
  userId: string;
  propertyId: string;
  mode: "mock" | "live";
  catalogProductId: string;
  identificationLabel: string;
  confidence: number;
  suggestedAsset: SuggestedAssetDraft;
  manuals: Array<SuggestedManualDraft & { content: string }>;
  createdAt: string;
  expiresAt: string;
};

const drafts = new Map<string, ScanDraftRecord>();
const TTL_MS = 30 * 60 * 1000;

function pruneExpired(now = Date.now()): void {
  for (const [id, draft] of drafts) {
    if (Date.parse(draft.expiresAt) <= now) drafts.delete(id);
  }
}

export function createScanDraft(input: {
  userId: string;
  propertyId: string;
  mode: "mock" | "live";
  catalogProductId: string;
  identificationLabel: string;
  confidence: number;
  suggestedAsset: SuggestedAssetDraft;
  manuals: Array<SuggestedManualDraft & { content: string }>;
}): ScanDraftRecord {
  pruneExpired();
  const now = Date.now();
  const draft: ScanDraftRecord = {
    id: randomUUID(),
    userId: input.userId,
    propertyId: input.propertyId,
    mode: input.mode,
    catalogProductId: input.catalogProductId,
    identificationLabel: input.identificationLabel,
    confidence: input.confidence,
    suggestedAsset: input.suggestedAsset,
    manuals: input.manuals,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  };
  drafts.set(draft.id, draft);
  return draft;
}

export function getScanDraftForUser(
  draftId: string,
  userId: string,
  propertyId: string,
): ScanDraftRecord | undefined {
  pruneExpired();
  const draft = drafts.get(draftId);
  if (!draft) return undefined;
  if (draft.userId !== userId || draft.propertyId !== propertyId) {
    return undefined;
  }
  return draft;
}

export function consumeScanDraft(
  draftId: string,
  userId: string,
  propertyId: string,
): ScanDraftRecord | undefined {
  const draft = getScanDraftForUser(draftId, userId, propertyId);
  if (!draft) return undefined;
  drafts.delete(draftId);
  return draft;
}

export function toPublicScanDraft(draft: ScanDraftRecord) {
  return {
    draftId: draft.id,
    mode: draft.mode,
    identificationLabel: draft.identificationLabel,
    confidence: draft.confidence,
    catalogProductId: draft.catalogProductId,
    suggestedAsset: draft.suggestedAsset,
    manuals: draft.manuals.map((m) => ({
      id: m.id,
      title: m.title,
      sourceUrl: m.sourceUrl,
      preview: m.preview,
      selectedByDefault: m.selectedByDefault,
    })),
    expiresAt: draft.expiresAt,
    privacy: {
      writes: false as const,
      confirmRequired: true as const,
      note: "Nothing is saved until you confirm. You choose which manuals to keep.",
    },
  };
}

/** Test helper. */
export function __resetAiDraftsForTests(): void {
  drafts.clear();
}
