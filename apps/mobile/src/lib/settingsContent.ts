/**
 * In-app Settings copy: How to use, Privacy, and Security.
 *
 * Agents: when you ship a user-facing feature, update HOW_TO_USE_SECTIONS
 * (and Privacy/Security sections if the change affects those promises). See
 * `.cursorrules` / `AGENTS.md` — keep this in sync with the product.
 *
 * Product UI: keep screens clean — put explanations here, not as in-app
 * commentary on feature screens. AI scan / how-to open from the persistent
 * FAB (`/ai/help`), not Home buttons. Suggest-from-permits is not a primary CTA.
 */

export type ContentSection = {
  title: string;
  body: string;
};

/** Plain-language guide of what the phone app can do today. */
export const HOW_TO_USE_SECTIONS: ContentSection[] = [
  {
    title: "Home",
    body: "Shows your current address and three next steps: Assets, Documents, and Alerts. Switch homes here when you have more than one. Settings is in the header.",
  },
  {
    title: "Homes",
    body: "Add your first home from Home when you have none. Add another from Settings → Add another home. Each address keeps its own record.",
  },
  {
    title: "Assets and documents",
    body: "Assets track equipment and installs for this home. Documents hold photos and files; you can export a home packet when you need one.",
  },
  {
    title: "Alerts",
    body: "One place for upcoming reminders and recent notices (due items, safety recalls, and later contractor submissions). Add reminders here. Push and in-app delivery are under Settings → Push & in-app — not a second competing feature on Home.",
  },
  {
    title: "AI help",
    body: "Use the floating AI button on any signed-in screen. Choose Scan a picture (identify a product and manuals; confirm before save) or Ask how-to (answers from manuals and facts on this home; asking never writes the ledger).",
  },
  {
    title: "Contractor face",
    body: "Switch faces in Settings. Format notes from Home or AI help. Submitting into a homeowner ledger with their approval comes later.",
  },
  {
    title: "Privacy and security",
    body: "Settings opens How to use, Privacy, and Security. You own the record; approve before anything becomes official. Sign out is in Settings.",
  },
];

export const PRIVACY_SECTIONS: ContentSection[] = [
  {
    title: "You own the record",
    body: "Homeowners own what is official on each home. Contractors may help prepare drafts later; they do not silently write your ledger.",
  },
  {
    title: "Approve before official",
    body: "AI scans and similar helpers create drafts for you to review. Nothing is auto-added as official without your confirm.",
  },
  {
    title: "Signed-in and home-scoped",
    body: "You must be signed in. Assets, documents, reminders, and most tools stay on the home you selected — they do not mix with other addresses.",
  },
  {
    title: "Least data shared",
    body: "We avoid broad sharing by default. Exports and shares happen when you choose them. Alert delivery preferences are under your control; there is no marketing channel in the app.",
  },
  {
    title: "AI and your data",
    body: "How-to answers use manuals and facts already on the home when possible. AI keys live on the server, never on the phone. Asking how-to does not write the ledger; scan waits for your confirm.",
  },
];

export const SECURITY_SECTIONS: ContentSection[] = [
  {
    title: "Account is yours only",
    body: "After sign-up or sign-in, the app asks the server to create or refresh only your own profile. One user cannot create or take over another person’s account record.",
  },
  {
    title: "Server rules, not phone trust",
    body: "Cloud data is protected so each signed-in user only reaches their own homes and ledger rows. The phone never holds a privileged “admin” key. Official writes are checked on the server.",
  },
  {
    title: "Session on the device",
    body: "Your sign-in session is kept in the phone’s secure storage, not in plain app files, so a casual glance at storage is not enough to steal it.",
  },
  {
    title: "Secrets stay off the phone",
    body: "AI and other service secrets stay on the edge or API. They are never bundled into the app as public Expo variables.",
  },
  {
    title: "What you can do",
    body: "Use a strong password, sign out on shared devices from Settings, and only confirm drafts you trust. Report anything that looks wrong — we treat privacy and security as product requirements, not afterthoughts.",
  },
];
