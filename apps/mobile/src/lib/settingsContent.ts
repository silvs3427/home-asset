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
 * HomeAsset is homeowner-only — no contractor face in the app.
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
    body: "One place for upcoming reminders and recent notices (due items, safety recalls, and later contractor submissions). Add reminders here. Push and in-app delivery are under Settings → Push & in-app — delivery only, not a second competing home feature.",
  },
  {
    title: "Settings",
    body: "Add another home, How to use, Privacy, Security, push & in-app delivery prefs, and sign out.",
  },
  {
    title: "Contractors (coming soon)",
    body: "HomeAsset is for homeowners only. Pros who use LightLift can push finished work into your home for you to approve. Pros without LightLift: you will be able to send a submission link; they type notes, record voice, and upload photos. Ask HomeAsset ingests that voice, photos, and text into a draft; nothing becomes official until you approve. That invite link is not in the app yet.",
  },
  {
    title: "Privacy and security",
    body: "You own the record; approve before anything becomes official. Details are under Settings → Privacy and Security.",
  },
];

export const PRIVACY_SECTIONS: ContentSection[] = [
  {
    title: "You own the record",
    body: "HomeAsset is homeowner-only. You own what is official on each home. Contractors may send work through LightLift or a future submission link you share; they do not silently write your ledger.",
  },
  {
    title: "Approve before official",
    body: "Ask HomeAsset drafts (add/update from photo, email, or invoice; scans; and similar helpers) wait for your review. Future contractor submissions — including invite-link voice, photos, and text that Ask HomeAsset formats — also wait for your approve / edit / decline. Nothing is auto-added as official without your confirm.",
  },
  {
    title: "Signed-in and home-scoped",
    body: "You must be signed in. Assets, documents, reminders, and most tools stay on the home you selected — they do not mix with other addresses.",
  },
  {
    title: "Least data shared",
    body: "We avoid broad sharing by default. Pros do not browse your full home ledger. Exports and shares happen when you choose them. Notification delivery preferences are under your control; there is no marketing channel in the app.",
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
    body: "AI and other service secrets stay on the edge or API. They are never bundled into the app as public Expo variables.",
  },
  {
    title: "What you can do",
    body: "Use a strong password, sign out on shared devices from Settings, and only confirm drafts you trust. Report anything that looks wrong — we treat privacy and security as product requirements, not afterthoughts.",
  },
];
