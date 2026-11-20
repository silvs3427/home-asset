import type { AssetCategory } from "../types.js";
import type { SuggestedAssetDraft } from "./drafts.js";

/**
 * Public-permit suggestion source for D18.
 *
 * MVP ships a deterministic stub keyed off the home address so the
 * suggest → approve UX is real. Live municipal/open-data connectors plug in
 * via `fetchPublicPermitsForAddress` without changing the approve gate.
 */

export type PermitSourceMode = "stub" | "live";

export type PublicPermitHint = {
  id: string;
  /** Human-readable permit / job label from the public record. */
  title: string;
  /** open | closed | issued | final — whatever the source exposes. */
  status: "open" | "closed" | "issued" | "final" | "unknown";
  /** ISO date when available. */
  filedOrClosedOn: string | null;
  /** Short public description (least data needed for a suggestion). */
  description: string;
  /** Where this hint came from (stub catalog vs live connector). */
  sourceLabel: string;
  sourceUrl: string | null;
  suggestedAsset: SuggestedAssetDraft;
};

export type PermitSuggestResult = {
  mode: PermitSourceMode;
  addressQuery: string;
  permits: PublicPermitHint[];
  /** Honest capability note for the UI / docs. */
  sourceNote: string;
  privacy: {
    writes: false;
    confirmRequired: true;
    note: string;
  };
};

type StubPermitTemplate = {
  id: string;
  matchTerms: string[];
  title: string;
  status: PublicPermitHint["status"];
  filedOrClosedOn: string;
  description: string;
  category: AssetCategory;
  assetName: string;
  manufacturer: string | null;
  model: string | null;
};

/**
 * Deterministic demo permits. Matched lightly against city/region/street so
 * demos feel address-aware without calling external APIs in CI.
 */
const STUB_PERMITS: StubPermitTemplate[] = [
  {
    id: "stub-roof-reroof",
    matchTerms: ["main", "oak", "maple", "elm", "pine", "any"],
    title: "Residential re-roof",
    status: "final",
    filedOrClosedOn: "2024-06-12",
    description:
      "Building permit for asphalt shingle re-roof. Final inspection recorded.",
    category: "roof",
    assetName: "Asphalt shingle roof",
    manufacturer: null,
    model: null,
  },
  {
    id: "stub-hvac-replace",
    matchTerms: ["main", "oak", "maple", "elm", "pine", "any"],
    title: "HVAC equipment replacement",
    status: "final",
    filedOrClosedOn: "2023-09-04",
    description:
      "Mechanical permit for outdoor condenser / furnace replacement.",
    category: "hvac",
    assetName: "Central HVAC system",
    manufacturer: null,
    model: null,
  },
  {
    id: "stub-water-heater",
    matchTerms: ["main", "oak", "maple", "elm", "pine", "any"],
    title: "Water heater replacement",
    status: "closed",
    filedOrClosedOn: "2022-03-18",
    description: "Plumbing permit for tank water heater swap.",
    category: "water_heater",
    assetName: "Tank water heater",
    manufacturer: null,
    model: null,
  },
  {
    id: "stub-electrical-panel",
    matchTerms: ["main", "oak", "maple", "elm", "pine", "any"],
    title: "Electrical service / panel upgrade",
    status: "issued",
    filedOrClosedOn: "2025-01-22",
    description: "Electrical permit for panel upgrade (may still be open).",
    category: "electrical",
    assetName: "Electrical service panel",
    manufacturer: null,
    model: null,
  },
  {
    id: "stub-generator",
    matchTerms: ["generator", "standby", "any"],
    title: "Standby generator install",
    status: "final",
    filedOrClosedOn: "2021-11-02",
    description: "Electrical + mechanical permits for standby generator.",
    category: "generator",
    assetName: "Standby generator",
    manufacturer: null,
    model: null,
  },
];

function addressBlob(input: {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  region: string;
  postalCode: string;
}): string {
  return [
    input.addressLine1,
    input.addressLine2,
    input.city,
    input.region,
    input.postalCode,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function templateToHint(
  template: StubPermitTemplate,
  addressQuery: string,
): PublicPermitHint {
  return {
    id: template.id,
    title: template.title,
    status: template.status,
    filedOrClosedOn: template.filedOrClosedOn,
    description: template.description,
    sourceLabel: "HomeAsset stub permit catalog (MVP)",
    sourceUrl: null,
    suggestedAsset: {
      name: template.assetName,
      category: template.category,
      manufacturer: template.manufacturer,
      model: template.model,
      serial: null,
      notes: [
        `Suggested from public permit hint: ${template.title}.`,
        `Permit status: ${template.status}` +
          (template.filedOrClosedOn
            ? ` (${template.filedOrClosedOn})`
            : "") +
          ".",
        `Address used for lookup: ${addressQuery}.`,
        "Stub source — live municipal open data plugs in later. Approve before saving.",
      ].join(" "),
    },
  };
}

/**
 * Live connector hook. Returns null until a real open-data source is wired.
 * Keep signatures stable so routes/UI do not change when live mode lands.
 */
export async function fetchPublicPermitsForAddress(_input: {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  region: string;
  postalCode: string;
  country?: string;
}): Promise<PublicPermitHint[] | null> {
  // Intentionally unused until a municipal / open-data connector is configured.
  return null;
}

/**
 * Suggest assets/jobs from public permit-style hints for one home address.
 * Never writes — callers must require homeowner confirm.
 */
export async function suggestPermitsForAddress(input: {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  region: string;
  postalCode: string;
  country?: string;
}): Promise<PermitSuggestResult> {
  const addressQuery = [
    input.addressLine1,
    input.addressLine2,
    input.city,
    input.region,
    input.postalCode,
  ]
    .filter((part) => part && String(part).trim())
    .join(", ");

  const live = await fetchPublicPermitsForAddress(input);
  if (live && live.length > 0) {
    return {
      mode: "live",
      addressQuery,
      permits: live,
      sourceNote:
        "Live public permit source. Suggestions only — you approve before anything is saved.",
      privacy: {
        writes: false,
        confirmRequired: true,
        note: "Permit hints never write your ledger. Approve each suggestion you want to keep.",
      },
    };
  }

  const blob = addressBlob(input);
  const matched = STUB_PERMITS.filter((template) =>
    template.matchTerms.some(
      (term) => term === "any" || blob.includes(term.toLowerCase()),
    ),
  );
  // Cap suggestions so the approve UI stays scannable on a phone.
  const permits = matched.slice(0, 4).map((t) => templateToHint(t, addressQuery));

  return {
    mode: "stub",
    addressQuery,
    permits,
    sourceNote:
      "MVP uses a stub permit catalog keyed to your address shape. Live municipal / open-data lookup is a later hook — same approve gate either way.",
    privacy: {
      writes: false,
      confirmRequired: true,
      note: "Suggestions only. Nothing becomes official until you approve. Hints stay scoped to this home.",
    },
  };
}
