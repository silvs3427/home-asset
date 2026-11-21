/**
 * HomeAsset mobile color tokens — use these everywhere; no one-off palette drifts.
 * Sage ledger look: soft mint ground, deep forest brand, muted copy.
 */
export const colors = {
  bg: "#F3F6F4",
  surface: "#FFFFFF",
  brand: "#1B3A2F",
  brandMuted: "#2F5B4A",
  ink: "#14241D",
  copy: "#3D5349",
  muted: "#5A6E64",
  border: "#C5D2CB",
  borderSoft: "#E2EAE5",
  placeholder: "#8AA094",
  danger: "#8B2E2E",
  onBrand: "#F3F6F4",
} as const;

export type ThemeColor = keyof typeof colors;
