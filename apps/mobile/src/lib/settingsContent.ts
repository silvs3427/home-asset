/**
 * In-app Settings copy: How to use, Privacy, and Security.
 *
 * Agents: when you ship a user-facing feature, update HOW_TO_USE_SECTIONS
 * (and Privacy/Security if the change affects those promises). See
 * `.cursorrules` / `AGENTS.md` — keep this in sync with the product.
 */

export type ContentSection = {
  title: string;
  body: string;
};

/** Plain-language guide of what the phone app can do today. */
export const HOW_TO_USE_SECTIONS: ContentSection[] = [
  {
    title: "Sign in and your face",
    body: "Create an account or sign in with email and password. One login can use a homeowner face (your homes and ledger) or a contractor face (format notes before a future handoff). Switch faces anytime from Home — same account.",
  },
  {
    title: "Home screen",
    body: "Home shows your current address and the main next steps: assets, documents, and reminders. Switch between homes there when you have more than one. Everything else lives under Settings so Home stays calm.",
  },
  {
    title: "Homes",
    body: "Add your first home from Home when you have none yet. Add another home from Settings. Everything you store is scoped to the home you selected; lists never mix addresses.",
  },
  {
    title: "Assets, documents, reminders",
    body: "From Home: track equipment and installs; attach photos and files (and export a home packet); set upcoming maintenance and mark items done. Open an asset for details and AI how-to when useful.",
  },
  {
    title: "Notifications and AI tools",
    body: "Under Settings → More for this home: notification center, scan product, ask how-to, paste contractor email, and suggest from permits. AI and intake paths create drafts — nothing becomes official until you confirm. How-to asking is read-only.",
  },
  {
    title: "Alert preferences",
    body: "In Settings, choose what and when (lead days) and whether push is allowed. No marketing or SMS. Push needs a real phone build and server config; the in-app center works either way.",
  },
  {
    title: "Contractor face",
    body: "Switch faces in Settings. On the contractor face, Home offers format notes (AI). Full submit into a homeowner ledger (with their approval) is a later step.",
  },
  {
    title: "Privacy and security",
    body: "Settings also opens this How to use guide plus Privacy and Security. Sign out is in Settings too.",
  },
];

export const PRIVACY_SECTIONS: ContentSection[] = [
  {
    title: "You own the record",
    body: "Homeowners own what is official on each home. Contractors may help prepare drafts later; they do not silently write your ledger.",
  },
  {
    title: "Approve before official",
    body: "AI scans, email intake, permit suggestions, and similar helpers create drafts for you to review. Nothing is auto-added as official without your confirm.",
  },
  {
    title: "Signed-in and home-scoped",
    body: "You must be signed in. Assets, documents, reminders, and most tools stay on the home you selected — they do not mix with other addresses.",
  },
  {
    title: "Least data shared",
    body: "We avoid broad sharing by default. Exports and shares happen when you choose them. Notification preferences are under your control; there is no marketing channel in the app.",
  },
  {
    title: "AI and your data",
    body: "How-to answers use manuals and facts already on the home when possible. AI keys live on the server, never on the phone. Asking how-to does not write the ledger; scan and intake paths wait for your confirm.",
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
