/**
 * In-app Settings copy: How to use, Privacy, and Security.
 *
 * Agents: when you ship a user-facing feature, update HOW_TO_USE_SECTIONS
 * (and Privacy/Security sections if the change affects those promises). See
 * `.cursorrules` / `AGENTS.md` — keep this in sync with the product.
 *
 * Product UI: keep screens clean — put explanations here, not as in-app
 * commentary on feature screens. Use `lib/theme.ts` colors everywhere.
 * Home CTAs: Ask HomeAsset → View Assets → Notifications → Settings.
 * Suggest-from-permits is not a primary CTA.
 */

export type ContentSection = {
  title: string;
  body: string;
};

/** Plain-language guide of what the phone app can do today. */
export const HOW_TO_USE_SECTIONS: ContentSection[] = [
  {
    title: "Home",
    body: "Shows your current address and four actions, top to bottom: Ask HomeAsset, View Assets, Notifications, and Settings. Switch homes here when you have more than one.",
  },
  {
    title: "Homes",
    body: "Add your first home from Home when you have none. Add another from Settings → Add another home. Each address keeps its own record.",
  },
  {
    title: "Ask HomeAsset",
    body: "The AI feature. From Home, open Ask HomeAsset to: Add or update asset (drop in a photo of a label, contractor email, invoice, or notes — AI drafts one asset, asks Add or Update, fills what it knows, and prompts only for gaps; nothing saves until you confirm), Scan a picture (identify a product and manuals; confirm before save), or Ask how-to (answers from manuals and facts on this home; asking never writes the ledger).",
  },
  {
    title: "View Assets",
    body: "See equipment and installs for this home. Use + to add an asset; tap Edit on a row to change it. Documents and recalls for an asset live on that asset’s record.",
  },
  {
    title: "Notifications",
    body: "One place for upcoming reminders and recent notices (due items, safety recalls, and later contractor submissions). Add reminders here. Use Check safety recalls to match your assets to public lists. Push and in-app delivery are under Settings → Push & in-app — turn on Safety recall alerts and Push, then Register this phone for push if you want lock-screen alerts when a match is found.",
  },
  {
    title: "Settings",
    body: "Add another home, How to use, Privacy, Security, push & in-app delivery prefs, face switch, and sign out.",
  },
  {
    title: "Contractor face",
    body: "Switch faces in Settings. Ask HomeAsset can format notes. Submitting into a homeowner ledger with their approval comes later.",
  },
  {
    title: "Privacy and security",
    body: "You own the record; approve before anything becomes official. Details are under Settings → Privacy and Security.",
  },
];

export const PRIVACY_SECTIONS: ContentSection[] = [
  {
    title: "You own the record",
    body: "Homeowners own what is official on each home. Contractors may help prepare drafts later; they do not silently write your ledger.",
  },
  {
    title: "Approve before official",
    body: "Ask HomeAsset drafts (add/update from photo, email, or invoice; scans; and similar helpers) wait for your review. Nothing is auto-added as official without your confirm.",
  },
  {
    title: "Signed-in and home-scoped",
    body: "You must be signed in. Assets, documents, reminders, and most tools stay on the home you selected — they do not mix with other addresses.",
  },
  {
    title: "Least data shared",
    body: "We avoid broad sharing by default. Exports and shares happen when you choose them. Notification delivery preferences are under your control; there is no marketing channel in the app.",
  },
  {
    title: "Safety recalls",
    body: "Matching uses assets you already logged (manufacturer and model). It creates alerts and notices only — it never invents assets or documents. You can turn Safety recall alerts and Push off under Settings → Push & in-app. Lock-screen push uses a server sender; the Expo credential never lives on the phone.",
  },
  {
    title: "AI and your data",
    body: "How-to answers use manuals and facts already on the home when possible. Asset intake and scans create drafts only. AI keys live on the server, never on the phone. Asking how-to does not write the ledger; add/update and scan wait for your confirm.",
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
    body: "AI keys, Expo push credentials, and other service secrets stay on the edge or API. They are never bundled into the app as public Expo variables.",
  },
  {
    title: "What you can do",
    body: "Use a strong password, sign out on shared devices from Settings, and only confirm drafts you trust. Report anything that looks wrong — we treat privacy and security as product requirements, not afterthoughts.",
  },
];
