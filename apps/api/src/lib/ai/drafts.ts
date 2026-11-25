import { randomUUID } from "node:crypto";
import type { AssetCategory } from "../types.js";
import type {
  AssetIntakeMissingField,
  AssetIntakeSourceKind,
  AssetIntakeSuggestedFields,
} from "./provider.js";
import type { PublicPermitHint } from "./permits.js";

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
  /** YYYY-MM-DD when grounded in a receipt / retailer purchase screenshot. */
  purchaseDate?: string | null;
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

/** Email / forward paste → AI summary draft (D18). */
export type EmailIntakeDraftRecord = {
  id: string;
  userId: string;
  propertyId: string;
  mode: "mock" | "live";
  summary: string;
  workPerformed: string;
  contractorName: string | null;
  workDate: string | null;
  assetsSuggested: SuggestedAssetDraft[];
  /** Full pasted email kept server-side until confirm (or discard/expiry). */
  rawEmailText: string;
  createdAt: string;
  expiresAt: string;
};

/** Multi-source Ask HomeAsset asset intake draft. */
export type AssetIntakeDraftRecord = {
  id: string;
  userId: string;
  propertyId: string;
  mode: "mock" | "live";
  sourceKind: AssetIntakeSourceKind;
  intent: "add" | "update";
  matchedAssetId: string | null;
  matchedAssetLabel: string | null;
  identificationLabel: string;
  confidence: number;
  suggestedAsset: AssetIntakeSuggestedFields;
  missingFields: AssetIntakeMissingField[];
  /** Held until confirm so we can attach the source email/PDF/photo after approve. */
  sourceText: string | null;
  sourceFilename: string | null;
  sourceMediaBase64: string | null;
  sourceMediaMimeType: string | null;
  createdAt: string;
  expiresAt: string;
};

/** Public permit hints → suggest assets/jobs draft (D18). */
export type PermitSuggestDraftRecord = {
  id: string;
  userId: string;
  propertyId: string;
  mode: "stub" | "live";
  addressQuery: string;
  sourceNote: string;
  permits: PublicPermitHint[];
  createdAt: string;
  expiresAt: string;
};

const drafts = new Map<string, ScanDraftRecord>();
const emailDrafts = new Map<string, EmailIntakeDraftRecord>();
const assetIntakeDrafts = new Map<string, AssetIntakeDraftRecord>();
const permitDrafts = new Map<string, PermitSuggestDraftRecord>();
const TTL_MS = 30 * 60 * 1000;

function pruneExpired(now = Date.now()): void {
  for (const [id, draft] of drafts) {
    if (Date.parse(draft.expiresAt) <= now) drafts.delete(id);
  }
  for (const [id, draft] of emailDrafts) {
    if (Date.parse(draft.expiresAt) <= now) emailDrafts.delete(id);
  }
  for (const [id, draft] of assetIntakeDrafts) {
    if (Date.parse(draft.expiresAt) <= now) assetIntakeDrafts.delete(id);
  }
  for (const [id, draft] of permitDrafts) {
    if (Date.parse(draft.expiresAt) <= now) permitDrafts.delete(id);
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

export function createEmailIntakeDraft(input: {
  userId: string;
  propertyId: string;
  mode: "mock" | "live";
  summary: string;
  workPerformed: string;
  contractorName: string | null;
  workDate: string | null;
  assetsSuggested: SuggestedAssetDraft[];
  rawEmailText: string;
}): EmailIntakeDraftRecord {
  pruneExpired();
  const now = Date.now();
  const draft: EmailIntakeDraftRecord = {
    id: randomUUID(),
    userId: input.userId,
    propertyId: input.propertyId,
    mode: input.mode,
    summary: input.summary,
    workPerformed: input.workPerformed,
    contractorName: input.contractorName,
    workDate: input.workDate,
    assetsSuggested: input.assetsSuggested,
    rawEmailText: input.rawEmailText,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  };
  emailDrafts.set(draft.id, draft);
  return draft;
}

export function getEmailIntakeDraftForUser(
  draftId: string,
  userId: string,
  propertyId: string,
): EmailIntakeDraftRecord | undefined {
  pruneExpired();
  const draft = emailDrafts.get(draftId);
  if (!draft) return undefined;
  if (draft.userId !== userId || draft.propertyId !== propertyId) {
    return undefined;
  }
  return draft;
}

export function consumeEmailIntakeDraft(
  draftId: string,
  userId: string,
  propertyId: string,
): EmailIntakeDraftRecord | undefined {
  const draft = getEmailIntakeDraftForUser(draftId, userId, propertyId);
  if (!draft) return undefined;
  emailDrafts.delete(draftId);
  return draft;
}

export function toPublicEmailIntakeDraft(draft: EmailIntakeDraftRecord) {
  return {
    draftId: draft.id,
    mode: draft.mode,
    summary: draft.summary,
    workPerformed: draft.workPerformed,
    contractorName: draft.contractorName,
    workDate: draft.workDate,
    assetsSuggested: draft.assetsSuggested,
    expiresAt: draft.expiresAt,
    privacy: {
      writes: false as const,
      confirmRequired: true as const,
      note: "Draft only from the email you pasted. Nothing is official until you approve.",
    },
  };
}

export function createAssetIntakeDraft(input: {
  userId: string;
  propertyId: string;
  mode: "mock" | "live";
  sourceKind: AssetIntakeSourceKind;
  intent: "add" | "update";
  matchedAssetId: string | null;
  matchedAssetLabel: string | null;
  identificationLabel: string;
  confidence: number;
  suggestedAsset: AssetIntakeSuggestedFields;
  missingFields: AssetIntakeMissingField[];
  sourceText?: string | null;
  sourceFilename?: string | null;
  sourceMediaBase64?: string | null;
  sourceMediaMimeType?: string | null;
}): AssetIntakeDraftRecord {
  pruneExpired();
  const now = Date.now();
  const draft: AssetIntakeDraftRecord = {
    id: randomUUID(),
    userId: input.userId,
    propertyId: input.propertyId,
    mode: input.mode,
    sourceKind: input.sourceKind,
    intent: input.intent,
    matchedAssetId: input.matchedAssetId,
    matchedAssetLabel: input.matchedAssetLabel,
    identificationLabel: input.identificationLabel,
    confidence: input.confidence,
    suggestedAsset: input.suggestedAsset,
    missingFields: input.missingFields,
    sourceText: input.sourceText?.trim() || null,
    sourceFilename: input.sourceFilename?.trim() || null,
    sourceMediaBase64: input.sourceMediaBase64?.trim() || null,
    sourceMediaMimeType: input.sourceMediaMimeType?.trim() || null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  };
  assetIntakeDrafts.set(draft.id, draft);
  return draft;
}

export function getAssetIntakeDraftForUser(
  draftId: string,
  userId: string,
  propertyId: string,
): AssetIntakeDraftRecord | undefined {
  pruneExpired();
  const draft = assetIntakeDrafts.get(draftId);
  if (!draft) return undefined;
  if (draft.userId !== userId || draft.propertyId !== propertyId) {
    return undefined;
  }
  return draft;
}

export function consumeAssetIntakeDraft(
  draftId: string,
  userId: string,
  propertyId: string,
): AssetIntakeDraftRecord | undefined {
  const draft = getAssetIntakeDraftForUser(draftId, userId, propertyId);
  if (!draft) return undefined;
  assetIntakeDrafts.delete(draftId);
  return draft;
}

export function toPublicAssetIntakeDraft(draft: AssetIntakeDraftRecord) {
  return {
    draftId: draft.id,
    mode: draft.mode,
    sourceKind: draft.sourceKind,
    intent: draft.intent,
    matchedAssetId: draft.matchedAssetId,
    matchedAssetLabel: draft.matchedAssetLabel,
    identificationLabel: draft.identificationLabel,
    confidence: draft.confidence,
    suggestedAsset: draft.suggestedAsset,
    missingFields: draft.missingFields,
    expiresAt: draft.expiresAt,
    privacy: {
      writes: false as const,
      confirmRequired: true as const,
      note: "Draft only. Nothing is official until you choose Add or Update and confirm.",
    },
  };
}

export function createPermitSuggestDraft(input: {
  userId: string;
  propertyId: string;
  mode: "stub" | "live";
  addressQuery: string;
  sourceNote: string;
  permits: PublicPermitHint[];
}): PermitSuggestDraftRecord {
  pruneExpired();
  const now = Date.now();
  const draft: PermitSuggestDraftRecord = {
    id: randomUUID(),
    userId: input.userId,
    propertyId: input.propertyId,
    mode: input.mode,
    addressQuery: input.addressQuery,
    sourceNote: input.sourceNote,
    permits: input.permits,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  };
  permitDrafts.set(draft.id, draft);
  return draft;
}

export function getPermitSuggestDraftForUser(
  draftId: string,
  userId: string,
  propertyId: string,
): PermitSuggestDraftRecord | undefined {
  pruneExpired();
  const draft = permitDrafts.get(draftId);
  if (!draft) return undefined;
  if (draft.userId !== userId || draft.propertyId !== propertyId) {
    return undefined;
  }
  return draft;
}

export function consumePermitSuggestDraft(
  draftId: string,
  userId: string,
  propertyId: string,
): PermitSuggestDraftRecord | undefined {
  const draft = getPermitSuggestDraftForUser(draftId, userId, propertyId);
  if (!draft) return undefined;
  permitDrafts.delete(draftId);
  return draft;
}

export function toPublicPermitSuggestDraft(draft: PermitSuggestDraftRecord) {
  return {
    draftId: draft.id,
    mode: draft.mode,
    addressQuery: draft.addressQuery,
    sourceNote: draft.sourceNote,
    permits: draft.permits.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      filedOrClosedOn: p.filedOrClosedOn,
      description: p.description,
      sourceLabel: p.sourceLabel,
      sourceUrl: p.sourceUrl,
      suggestedAsset: p.suggestedAsset,
      selectedByDefault: p.status === "final" || p.status === "closed",
    })),
    expiresAt: draft.expiresAt,
    privacy: {
      writes: false as const,
      confirmRequired: true as const,
      note: "Permit hints are suggestions only. You choose what to add — nothing silent.",
    },
  };
}

/** Test helper. */
export function __resetAiDraftsForTests(): void {
  drafts.clear();
  emailDrafts.clear();
  assetIntakeDrafts.clear();
  permitDrafts.clear();
}
