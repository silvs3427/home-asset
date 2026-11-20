/**
 * Free public-style safety/recall catalog for EPIC 7.
 *
 * MVP uses a deterministic fixture list shaped like CPSC / NHTSA notices
 * (kids’ gear, home equipment, vehicle parts). Live SaferProducts lookup
 * plugs in via source.ts without changing match or ack behavior.
 */

export type RecallCatalogEntry = {
  /** Stable external id (fixture or live source). */
  externalId: string;
  source: "cpsc_fixture" | "cpsc_live" | "nhtsa_fixture";
  title: string;
  summary: string;
  hazard: string | null;
  manufacturer: string;
  /** Model / product name to match against asset.model. */
  model: string;
  /** Optional serial substring / prefix; null = manufacturer+model only. */
  serialPattern: string | null;
  productType: string | null;
  recallDate: string | null;
  sourceUrl: string | null;
};

/**
 * Deterministic demo recalls. Manufacturer/model pairs are intentional so
 * tests and phone demos can create a matching asset and see an alert.
 */
export const FIXTURE_RECALLS: RecallCatalogEntry[] = [
  {
    externalId: "fixture-cpsc-evenflo-highchair",
    source: "cpsc_fixture",
    title: "Evenflo Big Kid High Chair — fall hazard",
    summary:
      "Public safety notice: certain Evenflo Big Kid High Chair units may pose a fall hazard. Check the model on your asset and follow the remedy on the official notice.",
    hazard: "Fall hazard",
    manufacturer: "Evenflo",
    model: "Big Kid High Chair",
    serialPattern: null,
    productType: "kids_gear",
    recallDate: "2024-03-12",
    sourceUrl: "https://www.cpsc.gov/",
  },
  {
    externalId: "fixture-cpsc-graco-carseat",
    source: "cpsc_fixture",
    title: "Graco SlimFit3 LX — harness buckle check",
    summary:
      "Public safety notice: selected Graco SlimFit3 LX car seats need a buckle inspection. Confirm your model and serial on the official notice.",
    hazard: "Injury hazard",
    manufacturer: "Graco",
    model: "SlimFit3 LX",
    serialPattern: "SF3",
    productType: "kids_gear",
    recallDate: "2023-11-02",
    sourceUrl: "https://www.cpsc.gov/",
  },
  {
    externalId: "fixture-cpsc-generac-gp6500",
    source: "cpsc_fixture",
    title: "Generac GP6500 portable generator — carbon monoxide risk",
    summary:
      "Public safety notice: Generac GP6500 portable generators may present a carbon monoxide risk if used incorrectly indoors. Review the official remedy and never run generators indoors.",
    hazard: "Carbon monoxide hazard",
    manufacturer: "Generac",
    model: "GP6500",
    serialPattern: null,
    productType: "generator",
    recallDate: "2022-08-19",
    sourceUrl: "https://www.cpsc.gov/",
  },
  {
    externalId: "fixture-cpsc-whirlpool-washer",
    source: "cpsc_fixture",
    title: "Whirlpool WFW72HEDW washer — fire hazard",
    summary:
      "Public safety notice: certain Whirlpool WFW72HEDW washers may pose a fire hazard. Check your model and follow the manufacturer remedy.",
    hazard: "Fire hazard",
    manufacturer: "Whirlpool",
    model: "WFW72HEDW",
    serialPattern: null,
    productType: "appliance",
    recallDate: "2021-05-06",
    sourceUrl: "https://www.cpsc.gov/",
  },
  {
    externalId: "fixture-nhtsa-firestone-wilderness",
    source: "nhtsa_fixture",
    title: "Firestone Wilderness AT tire — tread separation",
    summary:
      "Public safety notice (NHTSA-style): Firestone Wilderness AT tires may experience tread separation. Confirm size/model on your vehicle part record.",
    hazard: "Crash hazard",
    manufacturer: "Firestone",
    model: "Wilderness AT",
    serialPattern: null,
    productType: "vehicle",
    recallDate: "2000-08-09",
    sourceUrl: "https://www.nhtsa.gov/recalls",
  },
  {
    externalId: "fixture-cpsc-britax-bouncer",
    source: "cpsc_fixture",
    title: "Britax B-Agile — hinge pinch hazard",
    summary:
      "Public safety notice: Britax B-Agile strollers may have a hinge pinch hazard. Inspect your unit against the official notice.",
    hazard: "Pinch hazard",
    manufacturer: "Britax",
    model: "B-Agile",
    serialPattern: null,
    productType: "kids_gear",
    recallDate: "2019-04-23",
    sourceUrl: "https://www.cpsc.gov/",
  },
];

/** Normalize manufacturer / model / serial for case-insensitive matching. */
export function normalizeRecallKey(value: string | null | undefined): string {
  if (value == null) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type MatchCandidate = {
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
};

export type RecallMatchResult = {
  entry: RecallCatalogEntry;
  matchedOn: "manufacturer_model" | "manufacturer_model_serial";
};

/**
 * Match one asset against catalog entries.
 * Requires manufacturer + model. Serial pattern is required only when the
 * notice lists one.
 */
export function matchAssetToRecalls(
  asset: MatchCandidate,
  catalog: RecallCatalogEntry[],
): RecallMatchResult[] {
  const mfr = normalizeRecallKey(asset.manufacturer);
  const model = normalizeRecallKey(asset.model);
  if (!mfr || !model) return [];

  const serial = normalizeRecallKey(asset.serial);
  const hits: RecallMatchResult[] = [];

  for (const entry of catalog) {
    const entryMfr = normalizeRecallKey(entry.manufacturer);
    const entryModel = normalizeRecallKey(entry.model);
    if (!entryMfr || !entryModel) continue;
    if (mfr !== entryMfr) continue;
    // Exact or contained model (covers "GP6500" vs "GP6500E")
    if (!(model === entryModel || model.includes(entryModel) || entryModel.includes(model))) {
      continue;
    }

    const pattern = normalizeRecallKey(entry.serialPattern);
    if (pattern) {
      if (!serial || !serial.includes(pattern)) continue;
      hits.push({ entry, matchedOn: "manufacturer_model_serial" });
    } else {
      hits.push({ entry, matchedOn: "manufacturer_model" });
    }
  }

  return hits;
}
