/**
 * In-app Settings copy: How to use, Privacy, and Security.
 *
 * Agents: when you ship a user-facing feature, update HOW_TO_USE_SECTIONS
 * (and Privacy/Security sections if the change affects those promises). See
 * `.cursorrules` / `AGENTS.md` — keep this in sync with the product.
 *
 * Product UI: keep screens clean — put explanations here, not as in-app
 * commentary on feature screens. Use `lib/theme.ts` colors everywhere.
 * Home CTAs: HomeAsset → View Assets → Add or Update an Asset →
 * Notifications → Settings. Contractors live under Settings.
 * Suggest-from-permits is not a primary CTA.
 * HomeAsset is homeowner-only — no contractor face in the app.
 * Entry label is HomeAsset (not Ask); empty prompt “What do you want to do?”
 */

export type ContentSection = {
  title: string;
  body: string;
};

/** Plain-language guide of what the phone app can do today. */
export const HOW_TO_USE_SECTIONS: ContentSection[] = [
  {
    title: "Home",
    body: "Shows your current home name and five actions: HomeAsset (primary), View Assets, Add or Update an Asset, Notifications, and Settings. Switch homes by tapping the home name when you have more than one. Contractors are under Settings. From any other screen, tap Home (orange, top right) to return here.",
  },
  {
    title: "Homes",
    body: "Add your first home from Home when you have none. Add another from Settings → Add another home. Each address keeps its own record.",
  },
  {
    title: "HomeAsset",
    body: "Talk or Text — type what you want to do or attach a voice note. HomeAsset is the steering wheel for this home’s ledger (do, find, draft): equipment, manuals, maintenance reminders and schedule from what you saved, recalls. Reminder questions list this home’s upcoming reminders and related service fields — they do not invent tasks or open manuals. How-to / manual questions still use your saved manuals. To draft an asset from a phone photo, retailer purchase screenshot, order email, or invoice PDF, use Draft from photo or screenshot / Draft from order email or PDF here, or Add or Update an Asset on Home — HomeAsset formats the draft and waits for your confirm. It is not a general coding or chat assistant and has no AI persona name. Fair-use limits apply: about 10 asks per minute and 40 per day per signed-in account, enforced on the server. Asking never writes the ledger. Product how-to lives in Settings → How to use. For app or account help (sign-in, Settings, notifications, getting unstuck), use Settings → Support instead.",
  },
  {
    title: "Support",
    body: "Settings → Support. Warm help for the HomeAsset app and your account — acknowledge what’s frustrating, give clear next steps, and offer a path for a person when you’re still stuck. Separate from the HomeAsset ledger entry. Signed-in only; fair-use caps about 8 messages per minute and 25 per day (server-enforced, separate from HomeAsset). Support never invents account facts or changes your ledger.",
  },
  {
    title: "View Assets",
    body: "See equipment and installs for this home. Search by name, category, model, and more. Tap a category chip (for example HVAC) to show only those assets, or turn on Group by category to section the list — each category is a dropdown you tap to expand or collapse (first group opens by default). Long-press a category chip to rename it for this whole home (updates every asset that used the old name — only after you save the new name). Use + to add by hand, or open Add or Update an Asset from Home. Tap an asset to open its record — Documents (photos, files, Find manuals & warranty) stay on that screen in both view and Edit. On the asset, tap the category line to open Edit and change it, or long-press a category chip while editing to rename it across the home. On Installer / vendor you can pick a past pro or type a new name; saving keeps Past contractors in sync. On each record you can set Last serviced and, when a pro certified the work, Confirmed by contractor with their name (home-sale / report confidence). Approving an invite-link draft can fill those from the submission — still only after you approve. Recalls and reminders are on the record too. Categories and document types are your own words for this home — type what fits; once you use a value, it stays available to reuse here (not a fixed pre-list).",
  },
  {
    title: "Add or Update an Asset",
    body: "From Home: Scan a picture (camera or photo library), Order email or PDF (paste an Amazon/retailer order email and/or attach a purchase invoice PDF), Upload a PDF (invoice or paperwork), or Free text (describe the item and tap Format with HomeAsset). Photos, retailer purchase screenshots, order emails, and invoice PDFs are sent so HomeAsset can draft brand, model, category, purchase date, and price notes when visible — if it is unsure, fields stay blank for you to fill instead of guessing a wrong product. On confirm you can attach the source email or PDF to the asset as a receipt (default on) — nothing is stored until you confirm. There is no Amazon account link in this slice; paste or attach on the phone. Installer / vendor lets you pick from Past contractors or add a new name — it lands in your searchable directory when you save. After Save / Confirm with make and model, HomeAsset can suggest manuals, spec sheets, and warranty PDFs or a public warranty-term hint for you to approve — it does not silently add them, and you do not need to photograph manuals separately for that step. When you approve a suggestion, HomeAsset downloads a real PDF into this home’s documents when the manufacturer source allows it; if the source is only a web page, or the manufacturer blocks the download, you get a clear message and nothing fake is stored — try another suggestion or upload the PDF yourself. Warranty term hints land on the asset only if you keep that checkbox on confirm.",
  },
  {
    title: "Notifications",
    body: "One place for upcoming reminders and recent notices (due items, safety recalls, and contractor submissions). Add reminders here. Tap a contractor notice to review the draft. Use Check safety recalls anytime to match your assets to public lists — HomeAsset also runs an automatic monthly scan of your logged equipment so new matches can show up without tapping Check. Push and in-app delivery are under Settings → Push & in-app — turn on Safety recall alerts, Contractor submissions, and Push, then Register this phone for push if you want lock-screen alerts.",
  },
  {
    title: "Contractors",
    body: "From Settings → Contractors: Invite a contractor (share a submission link), Review contractor submissions (approve before official), and View past contractors (searchable directory of contact info, work done for this home, and other services they offer). HomeAsset is for homeowners only — pros use LightLift or your invite link in a browser (no HomeAsset contractor login). Invite submitters can add optional phone, email, and services; those land in your directory only after you approve. When you approve an invite draft, selected assets can get Installer / vendor linked to that pro, plus Last serviced and Confirmed by contractor from the pro’s name and work date — you can edit those anytime on the asset. Saving an asset with a new installer name also adds them to Past contractors. You can also add a past pro by hand from the directory.",
  },
  {
    title: "Settings",
    body: "Add another home, Contractors, How to use, Support, Privacy, Security (including app lock), push & in-app delivery prefs, and sign out.",
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
    body: "HomeAsset drafts (scan a picture, order email / PDF purchase intake, PDF upload, free-text format, photo/email/invoice intake, suggested manuals/spec sheets/warranty docs, and similar helpers) wait for your review. When you confirm a purchase draft, the source email or PDF can be stored on that asset as a receipt — only after you confirm. Approved suggested manuals and warranty PDFs are stored as real files in this home’s vault when the source is downloadable — web pages that are not files, and manufacturer sites that block the download, are refused with a clear message (not saved as nested links). Warranty-term hints from search also wait for your confirm before writing the asset. Renaming a category updates that name across this home only after you save the new name. Contractor invite-link submissions — voice, photos, and text that HomeAsset formats — also wait for your approve / edit / decline. Contact details a pro adds on the invite form enter your Past contractors directory only after you approve. Nothing is auto-added as official without your confirm.",
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
    body: "How-to answers use manuals and facts already on the home when possible. Asset intake and scans create drafts only. When you attach a photo, retailer purchase screenshot, order email text, or PDF for Add or update, that content is sent to the server AI helper so it can read product and purchase fields — it is not auto-saved as an official document until you confirm (you can choose to attach the source as a receipt then). AI keys live on the server, never on the phone. Asking how-to does not write the ledger; add/update and scan wait for your confirm. HomeAsset stays on home help (ledger, equipment, manuals, maintenance, recalls, intake) — not coding projects or unrelated chat. Support (Settings → Support) uses the same server AI keys for app/account help only — it does not invent account facts or change settings or the ledger.",
  },
  {
    title: "HomeAsset limits",
    body: "To keep costs fair and the feature focused, each signed-in account has server-side caps (about 10 asks per minute and 40 per day). Limits reset the next day (UTC). Hitting a limit or an off-topic ask shows a plain message — nothing silent happens to your ledger.",
  },
  {
    title: "Support limits",
    body: "Support has its own server-side caps (about 8 messages per minute and 25 per day) so it does not use up HomeAsset’s home-help budget. Limits reset the next day (UTC). Off-topic or rate-limit replies are plain messages — Support never silently changes your account or ledger.",
  },
];

export const SECURITY_SECTIONS: ContentSection[] = [
  {
    title: "Account is yours only",
    body: "After sign-up or sign-in, the app asks the server to create or refresh only your own profile. One user cannot create or take over another person’s account record.",
  },
  {
    title: "Server rules, not phone trust",
    body: "Cloud data is protected so each signed-in user only reaches their own homes and ledger rows. The phone never holds a privileged “admin” key. Official writes are checked on the server. HomeAsset and Support rate and topic rules are enforced on the server too — the phone cannot bypass them.",
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
    body: "Keep app lock on for shared or borrowed phones, pick an idle time that fits you, use a strong password, sign out from Settings when needed, and only confirm drafts you trust. For app trouble, use Settings → Support. Report anything that looks wrong — we treat privacy and security as product requirements, not afterthoughts.",
  },
];
