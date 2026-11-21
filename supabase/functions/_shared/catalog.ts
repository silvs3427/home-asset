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

/**
 * Local "box docs" catalog for mock / CI and as a fallback when no live AI key.
 * Content is short, grounded excerpts — never treated as open-web advice.
 */
export type CatalogManual = {
  id: string;
  title: string;
  /** Stable stub URL for provenance display (not fetched live in mock mode). */
  sourceUrl: string;
  /** Plain-text body stored when the homeowner confirms. */
  content: string;
};

export type CatalogProduct = {
  id: string;
  /** Keywords matched against photo filename, hint text, or OCR stub. */
  matchTerms: string[];
  name: string;
  category: AssetCategory;
  manufacturer: string;
  model: string;
  confidence: number;
  manuals: CatalogManual[];
  /** Extra how-to snippets used only when grounding answers. */
  howtoNotes: string[];
};

export const PRODUCT_CATALOG: CatalogProduct[] = [
  {
    id: "generac-gp6500",
    matchTerms: [
      "generator",
      "generac",
      "gp6500",
      "gp-6500",
      "portable generator",
    ],
    name: "Generac GP6500 Portable Generator",
    category: "generator",
    manufacturer: "Generac",
    model: "GP6500",
    confidence: 0.92,
    manuals: [
      {
        id: "generac-gp6500-om",
        title: "GP6500 Owner's Manual (excerpt)",
        sourceUrl: "https://example.invalid/manuals/generac-gp6500.pdf",
        content: [
          "Generac GP6500 Portable Generator — Owner's Manual (excerpt)",
          "",
          "SAFE STARTUP",
          "1. Place the unit outdoors, at least 5 feet from windows and doors.",
          "2. Check oil level before every start. Use SAE 10W-30.",
          "3. Turn the fuel valve ON.",
          "4. Move the choke to START (cold engine).",
          "5. Pull the recoil starter firmly until the engine fires.",
          "6. After warm-up, move choke to RUN.",
          "",
          "FIRST-TIME LOAD",
          "- Plug appliances into the covered outlets only.",
          "- Start with the largest load first, then add smaller loads.",
          "- Do not exceed 6500 starting watts / 8000 peak watts.",
          "",
          "SHUTDOWN",
          "1. Remove loads.",
          "2. Let the engine idle for 30 seconds.",
          "3. Turn the engine switch OFF, then close the fuel valve.",
        ].join("\n"),
      },
      {
        id: "generac-gp6500-quickstart",
        title: "GP6500 Quick Start Card",
        sourceUrl: "https://example.invalid/manuals/generac-gp6500-qs.pdf",
        content: [
          "GP6500 Quick Start",
          "- Outdoor use only. Never run indoors or in a garage.",
          "- Oil check → fuel ON → choke START → pull cord → choke RUN.",
          "- Ground the frame per local code when used as standby support.",
        ].join("\n"),
      },
    ],
    howtoNotes: [
      "Never operate the generator indoors — carbon monoxide hazard.",
      "Change oil after the first 20–30 hours of use.",
    ],
  },
  {
    id: "carrier-infinity-24",
    matchTerms: ["hvac", "carrier", "infinity", "furnace", "ac unit", "air conditioner"],
    name: "Carrier Infinity 24 Heat Pump",
    category: "hvac",
    manufacturer: "Carrier",
    model: "Infinity 24",
    confidence: 0.88,
    manuals: [
      {
        id: "carrier-infinity-om",
        title: "Infinity 24 Homeowner Guide (excerpt)",
        sourceUrl: "https://example.invalid/manuals/carrier-infinity-24.pdf",
        content: [
          "Carrier Infinity 24 — Homeowner Guide (excerpt)",
          "",
          "FILTER",
          "- Check the return-air filter every 30 days.",
          "- Replace disposable filters when dirty; never run without a filter.",
          "",
          "THERMOSTAT",
          "- Keep the Infinity control powered; do not cycle the breaker weekly.",
          "- For cooling, set fan to AUTO unless continuous air circulation is needed.",
          "",
          "IF NO COOLING",
          "1. Confirm the thermostat mode is COOL and setpoint is below room temp.",
          "2. Check the outdoor disconnect is ON.",
          "3. Clear leaves from the outdoor coil fins (power OFF first).",
        ].join("\n"),
      },
    ],
    howtoNotes: [
      "Schedule professional coil cleaning yearly for coastal or dusty sites.",
    ],
  },
  {
    id: "rheem-performance-50",
    matchTerms: ["water heater", "rheem", "performance plus", "tank heater"],
    name: "Rheem Performance Plus 50-Gallon Water Heater",
    category: "water_heater",
    manufacturer: "Rheem",
    model: "Performance Plus 50",
    confidence: 0.9,
    manuals: [
      {
        id: "rheem-50-om",
        title: "Performance Plus 50 Use & Care (excerpt)",
        sourceUrl: "https://example.invalid/manuals/rheem-pp50.pdf",
        content: [
          "Rheem Performance Plus 50 — Use & Care (excerpt)",
          "",
          "TEMPERATURE",
          "- Factory setpoint is often ~120°F. Adjust at the gas control / thermostat.",
          "- Higher settings increase scald risk — use mixing valves at fixtures if needed.",
          "",
          "DRAIN / FLUSH (annual)",
          "1. Turn gas / power OFF and close the cold inlet.",
          "2. Attach a hose to the drain valve; open a hot faucet upstairs.",
          "3. Open the drain valve until water runs clear; close and refill.",
          "",
          "T&P VALVE",
          "- Lift the T&P lever briefly once a year to confirm it moves freely.",
          "- If it drips constantly, call a licensed plumber — do not plug the valve.",
        ].join("\n"),
      },
    ],
    howtoNotes: [
      "Keep the area around a gas water heater clear of stored chemicals.",
    ],
  },
];

/** Match catalog products from free text (hint, filename, mock vision label). */
export function matchCatalogProducts(query: string): CatalogProduct[] {
  const q = query.toLowerCase();
  const scored = PRODUCT_CATALOG.map((product) => {
    let hits = 0;
    for (const term of product.matchTerms) {
      if (q.includes(term.toLowerCase())) hits += 1;
    }
    return { product, hits };
  })
    .filter((row) => row.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.product.confidence - a.product.confidence);

  if (scored.length > 0) return scored.map((s) => s.product);

  // Default demo product when the photo has no useful text — still a draft only.
  return [PRODUCT_CATALOG[0]!];
}

export function getCatalogProduct(id: string): CatalogProduct | undefined {
  return PRODUCT_CATALOG.find((p) => p.id === id);
}

export function getCatalogManual(
  productId: string,
  manualId: string,
): CatalogManual | undefined {
  return getCatalogProduct(productId)?.manuals.find((m) => m.id === manualId);
}
