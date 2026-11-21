/**
 * Phone-side fixture catalog for cloud (Supabase-direct) recall checks.
 * Mirrors apps/api/src/lib/recalls/catalog.ts and
 * supabase/functions/_shared/recallCatalog.ts (same external ids + match rules)
 * so demos work without a LAN API and stay aligned with monthly cron scans.
 */

export type MobileRecallFixture = {
  externalId: string;
  source: "cpsc_fixture" | "nhtsa_fixture";
  title: string;
  summary: string;
  hazard: string | null;
  manufacturer: string;
  model: string;
  serialPattern: string | null;
  productType: string | null;
  recallDate: string | null;
  sourceUrl: string | null;
};

export const MOBILE_RECALL_FIXTURES: MobileRecallFixture[] = [
  {
    externalId: "fixture-cpsc-evenflo-highchair",
    source: "cpsc_fixture",
    title: "Evenflo Big Kid High Chair — fall hazard",
    summary:
      "Public safety notice: certain Evenflo Big Kid High Chair units may pose a fall hazard.",
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
      "Public safety notice: selected Graco SlimFit3 LX car seats need a buckle inspection.",
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
      "Public safety notice: Generac GP6500 portable generators may present a carbon monoxide risk if used incorrectly indoors.",
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
      "Public safety notice: certain Whirlpool WFW72HEDW washers may pose a fire hazard.",
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
      "Public safety notice (NHTSA-style): Firestone Wilderness AT tires may experience tread separation.",
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
      "Public safety notice: Britax B-Agile strollers may have a hinge pinch hazard.",
    hazard: "Pinch hazard",
    manufacturer: "Britax",
    model: "B-Agile",
    serialPattern: null,
    productType: "kids_gear",
    recallDate: "2019-04-23",
    sourceUrl: "https://www.cpsc.gov/",
  },
];

export function normalizeRecallKey(value: string | null | undefined): string {
  if (value == null) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchMobileRecallFixtures(asset: {
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
}): Array<{
  entry: MobileRecallFixture;
  matchedOn: "manufacturer_model" | "manufacturer_model_serial";
}> {
  const mfr = normalizeRecallKey(asset.manufacturer);
  const model = normalizeRecallKey(asset.model);
  if (!mfr || !model) return [];
  const serial = normalizeRecallKey(asset.serial);
  const hits: Array<{
    entry: MobileRecallFixture;
    matchedOn: "manufacturer_model" | "manufacturer_model_serial";
  }> = [];

  for (const entry of MOBILE_RECALL_FIXTURES) {
    const entryMfr = normalizeRecallKey(entry.manufacturer);
    const entryModel = normalizeRecallKey(entry.model);
    if (mfr !== entryMfr) continue;
    if (
      !(
        model === entryModel ||
        model.includes(entryModel) ||
        entryModel.includes(model)
      )
    ) {
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
