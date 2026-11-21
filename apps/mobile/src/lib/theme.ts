/**
 * HomeAsset mobile color tokens — use these everywhere; no one-off palette drifts.
 * Mets-inspired brand: royal blue primary, orange accents, cool light ground.
 * Official-ish Mets blues/oranges tuned for readable UI contrast (not purple/indigo).
 */
export const colors = {
  bg: "#F2F5FA",
  surface: "#FFFFFF",
  brand: "#002D72",
  brandMuted: "#1E4D96",
  accent: "#FF5910",
  ink: "#0B1B33",
  copy: "#3D4F66",
  muted: "#5C6E84",
  border: "#C5D0DE",
  borderSoft: "#E6EBF3",
  placeholder: "#8A9BB0",
  danger: "#B42318",
  onBrand: "#FFFFFF",
  onAccent: "#FFFFFF",
} as const;

export type ThemeColor = keyof typeof colors;
