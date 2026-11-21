/**
 * In-app Settings copy: How to use, Privacy, and Security.
 *
 * Agents: when you ship a user-facing feature, update HOW_TO_USE_SECTIONS
 * (and Privacy/Security sections if the change affects those promises). See
 * `.cursorrules` / `AGENTS.md` — keep this in sync with the product.
 *
 * Product UI: keep screens clean — put explanations here, not as in-app
 * commentary on feature screens. Use `lib/theme.ts` colors everywhere.
 * Home CTAs: Ask HomeAsset → View Assets → Add or Update an Asset →
 * Contractors → Notifications → Settings.
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
    body: "Shows your current address and six actions, top to bottom: Ask HomeAsset, View Assets, Add or Update an Asset, Contractors, Notifications, and Settings. Switch homes here when you have more than one. From any other screen, tap Home (orange, top right) to return here.",
  },
  {
    title: "Homes",
    body: "Add your first home from Home when you have none. Add another from Settings → Add another home. Each address keeps its own record.",
  },
  {
    title: "Ask HomeAsset",
    body: "Talk or Text — type what you need or attach a voice note. Ask HomeAsset answers home and ledger questions (equipment, manuals, maintenance reminders and schedule from what you saved, recalls). Reminder questions list this home’s upcoming reminders and related service fields — they do not invent tasks or open manuals. How-to / manual questions still use your saved manuals. It is not a general coding or chat assistant. Fair-use limits apply: about 10 asks per minute and 40 per day per signed-in account, enforced on the server. Asking never writes the ledger.",
  },
  {
    title: "View Assets",
    body: "See equipment and installs for this home. Search by name, category, model, and more. Tap a category chip (for example HVAC) to show only those assets, or turn on Group by category to section the list. Use + to add by hand, or open Add or Update an Asset from Home. Tap an asset to open its record — Documents (photos, files, Find manuals) stay on that screen in both view and Edit. On Installer / vendor you can pick a past pro or type a new name; saving keeps Past contractors in sync. On each record you can set Last serviced and, when a pro certified the work, Confirmed by contractor with their name (home-sale / report confidence). Approving an invite-link draft can fill those from the submission — still only after you approve. Recalls and reminders are on the record too. Categories and document types are your own words for this home — type what fits; once you use a value, it stays available to reuse here (not a fixed pre-list).",
  },
  {
    title: "Add or Update an Asset",
    body: "From Home: Scan a picture (camera or photo library), Upload a PDF (invoice or paperwork), or Free text (describe the item and tap Format with Ask HomeAsset). Photos of labels and nameplates are read for brand, model, serial, and capacity when visible. Installer / vendor lets you pick from Past contractors or add a new name — it lands in your searchable directory when you save. After Save / Confirm with make and model, Ask HomeAsset can suggest manuals and spec sheets for you to approve — it does not silently add them, and you do not need to photograph manuals separately for that step.",
  },
  {
    title: "Notifications",
    body: "One place for upcoming reminders and recent notices (due items, safety recalls, and contractor submissions). Add reminders here. Tap a contractor notice to review the draft. Use Check safety recalls anytime to match your assets to public lists — HomeAsset also runs an automatic monthly scan of your logged equipment so new matches can show up without tapping Check. Push and in-app delivery are under Settings → Push & in-app — turn on Safety recall alerts, Contractor submissions, and Push, then Register this phone for push if you want lock-screen alerts.",
  },
  {
    title: "Contractors",
    body: "From Home → Contractors: Invite a contractor (share a submission link), Review contractor submissions (approve before official), and View past contractors (searchable directory of contact info, work done for this home, and other services they offer). HomeAsset is for homeowners only — pros use LightLift or your invite link in a browser (no HomeAsset contractor login). Invite submitters can add optional phone, email, and services; those land in your directory only after you approve. When you approve an invite draft, selected assets can get Installer / vendor linked to that pro, plus Last serviced and Confirmed by contractor from the pro’s name and work date — you can edit those anytime on the asset. Saving an asset with a new installer name also adds them to Past contractors. You can also add a past pro by hand from the directory.",
  },
  {
    title: "Settings",
    body: "Add another home, How to use, Privacy, Security (including app lock), push & in-app delivery prefs, and sign out. Contractor invite and review live under Home → Contractors.",
  },
  {
    title: "App lock",
    body: "Under Settings → Security, turn on Lock when idle or away. After a quiet stretch (1–5 minutes, your choice) or when you leave the app for a short while, HomeAsset hides the ledger until you unlock with Face ID / fingerprint (when your phone supports it) or your password. Your sign-in session stays on the phone; we never store your biometrics.",
  },
  {
    title: "Privacy and security",
    body: "You own the record; approve before anything becomes official. Details are under Settings → Privacy and Security.",
  },
];

export const PRIVACY_SECTIONS: ContentSection[] = [
  {
    title: "You own the record",
    body: "HomeAsset is homeowner-only. You own what is official on each home. Contractors may send work through LightLift or a submission link you share; they do not silently write your ledger.",
  },
  {
    title: "Approve before official",
    body: "Ask HomeAsset drafts (scan a picture, PDF upload, free-text format, photo/email/invoice intake, suggested manuals/spec sheets, and similar helpers) wait for your review. Contractor invite-link submissions — voice, photos, and text that Ask HomeAsset formats — also wait for your approve / edit / decline. Contact details a pro adds on the invite form enter your Past contractors directory only after you approve. Nothing is auto-added as official without your confirm.",
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
    title: "Safety recalls",
    body: "Matching uses assets you already logged (manufacturer and model), including the automatic monthly whole-home scan. It creates alerts and notices only — it never invents assets or documents. You can turn Safety recall alerts and Push off under Settings → Push & in-app. Lock-screen push uses a server sender; the Expo credential never lives on the phone. Acknowledge or dismiss stays on the asset.",
  },
  {
    title: "Biometrics stay on the phone",
    body: "App lock may ask for Face ID or fingerprint through the phone’s own unlock. HomeAsset never copies or stores those biometrics — only a yes/no from the operating system.",
  },
  {
    title: "AI and your data",
    body: "How-to answers use manuals and facts already on the home when possible. Asset intake and scans create drafts only. When you attach a photo or PDF for Add or update, that file is sent to the server AI helper so it can read the label — it is not auto-saved as an official document. AI keys live on the server, never on the phone. Asking how-to does not write the ledger; add/update and scan wait for your confirm. Ask HomeAsset stays on home help (ledger, equipment, manuals, maintenance, recalls, intake) — not coding projects or unrelated chat.",
  },
  {
    title: "Ask HomeAsset limits",
    body: "To keep costs fair and the feature focused, each signed-in account has server-side caps (about 10 asks per minute and 40 per day). Limits reset the next day (UTC). Hitting a limit or an off-topic ask shows a plain message — nothing silent happens to your ledger.",
  },
];

export const SECURITY_SECTIONS: ContentSection[] = [
  {
    title: "Account is yours only",
    body: "After sign-up or sign-in, the app asks the server to create or refresh only your own profile. One user cannot create or take over another person’s account record.",
  },
  {
    title: "Server rules, not phone trust",
    body: "Cloud data is protected so each signed-in user only reaches their own homes and ledger rows. The phone never holds a privileged “admin” key. Official writes are checked on the server. Ask HomeAsset rate and topic rules are enforced on the server too — the phone cannot bypass them.",
  },
  {
    title: "Session on the device",
    body: "Your sign-in session is kept in the phone’s secure storage, not in plain app files, so a casual glance at storage is not enough to steal it. App lock hides the ledger after idle or when you leave the app; unlocking does not replace that secure session.",
  },
  {
    title: "App lock and biometrics",
    body: "When Lock when idle or away is on, the ledger stays covered until you unlock. Face ID / fingerprint run through the phone OS only — HomeAsset never stores biometric data. If biometrics are missing or fail, re-enter your account password (or sign out).",
  },
  {
    title: "Secrets stay off the phone",
    body: "AI keys, Expo push credentials, and other service secrets stay on the edge or API. They are never bundled into the app as public Expo variables.",
  },
  {
    title: "What you can do",
    body: "Keep app lock on for shared or borrowed phones, pick an idle time that fits you, use a strong password, sign out from Settings when needed, and only confirm drafts you trust. Report anything that looks wrong — we treat privacy and security as product requirements, not afterthoughts.",
  },
];
