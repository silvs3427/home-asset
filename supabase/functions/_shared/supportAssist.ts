/**
 * AI customer support — product / account help for signed-in homeowners.
 * Distinct from HomeAsset ledger entry (equipment Q&A).
 * Keep in sync with apps/api/src/lib/ai/supportAssist.ts.
 */

export const SUPPORT_OFF_TOPIC_MESSAGE =
  "Support helps with the HomeAsset app and your account — sign-in, Settings, notifications, privacy, and getting unstuck. " +
  "It can't help with coding projects or general chat. For equipment manuals and home ledger questions, use HomeAsset from Home.";

export const SUPPORT_SYSTEM_BLURB =
  "You are HomeAsset Support — a warm, clear customer-support assistant for homeowners using the HomeAsset phone app. " +
  "Make people feel heard: briefly acknowledge frustration when they are stuck or upset, then give plain next steps. " +
  "Stay privacy-first: never invent account facts, balances, emails on file, billing status, or ledger contents you were not given. " +
  "You may use only the product knowledge below plus any home label the request includes. " +
  "If the question is about equipment manuals, maintenance schedules, recalls, or what's on their home ledger, " +
  "politely point them to Home → HomeAsset (that is the ledger helper). " +
  "Refuse coding projects, homework, and unrelated general chat. " +
  "When you cannot solve it with in-app steps, set escalate to true and say a human can help — " +
  "ask them to leave a short note in Support and check Settings → Security for security concerns. " +
  "Reply with JSON only: " +
  '{"answer":"warm plain-language reply","escalate":false,"nextSteps":["short actionable step", "..."]}';

/** Grounding copy — mirrors Settings → How to use / Privacy (no account-specific inventing). */
export const SUPPORT_PRODUCT_KNOWLEDGE = `
HomeAsset is homeowner-only (no contractor login face). Brand: Mets blue + orange.

Home screen actions (top→bottom): HomeAsset → View Assets → Add or Update an Asset → Notifications → Settings. Contractors live under Settings.
From other screens, Home (orange, top right) returns to Home.

HomeAsset (Home): Talk or Text for what the homeowner wants to do (equipment, manuals, maintenance reminders you already saved, recalls). Steering wheel for the ledger — not a help FAQ or AI persona. Caps ~10/min and ~40/day. Never writes the ledger by asking.
Support (Settings → Support): app/account help — distinct from HomeAsset entry. Separate fair-use caps.

View Assets: search/filter equipment; categories and document types are homeowner-defined words.
Add or Update: Scan a picture, Upload a PDF, or Free text → Format with HomeAsset; approve-before-official.
Contractors (Settings → Contractors): Invite (browser link for pros), Review submissions (approve before official), Past contractors directory.
Notifications: reminders + notices; Check safety recalls; monthly automatic recall scan also runs. Push prefs under Settings → Push & in-app.
Settings: Add another home, Contractors, How to use, Privacy, Security (app lock / Face ID), Support, Push & in-app, sign out.
App lock: Settings → Security — idle lock; biometrics stay on the phone OS.
Privacy: homeowner owns the record; approve-before-official; AI keys stay on the server; no silent ledger adds.
Sign out: Settings → Sign out.
If stuck after clear steps: escalate for human follow-up; security concerns → Settings → Security guidance.
`.trim();

const CODING_PATTERNS: RegExp[] = [
  /\b(write|generate|create|debug|fix|refactor|implement)\b.{0,40}\b(code|function|class|script|program|api|endpoint|sql query)\b/i,
  /\b(python|javascript|typescript|java|golang|rust|c\+\+|react native|node\.?js|kotlin|swift)\b.{0,30}\b(code|function|app|project|script|component)\b/i,
  /\b(leetcode|hackerrank|coding interview|unit test|pull request|github actions)\b/i,
  /\b(compile|stack trace|null pointer|segmentation fault|npm install|pip install|cargo build)\b/i,
  /\b(act as|you are)\b.{0,40}\b(software|coding|programming|fullstack|full-stack)\b.{0,20}\b(assistant|engineer|developer|tutor)\b/i,
];

const GENERAL_CHAT_PATTERNS: RegExp[] = [
  /\b(write (me )?(a |an )?(essay|poem|story|song|cover letter|resume|linkedin))\b/i,
  /\b(what('s| is) the (meaning of life|capital of|weather))\b/i,
  /\b(tell me a joke|chat with me|be my (girlfriend|boyfriend|therapist))\b/i,
  /\b(crypto|stock tip|dating advice|medical diagnos)\b/i,
];

const PRODUCT_POSITIVE =
  /\b(homeasset|sign ?in|sign ?out|log ?in|log ?out|password|account|settings|privacy|security|app lock|face ?id|fingerprint|biometric|notification|push|register|support|how to use|invite|contractor|submission|approve|draft|ota|update|crash|bug|stuck|frustrated|help|home screen|ask homeasset)\b/i;

const LEDGER_ONLY =
  /\b(manual|spec sheet|filter size|serial number|warranty end|what (model|brand)|maintenance schedule|when (is|was) .{0,20} (due|serviced)|recall (match|list)|oil change|choke|thermostat wiring)\b/i;

export type SupportTopicResult =
  | { allowed: true; redirectToAsk?: boolean }
  | { allowed: false; code: "off_topic"; message: string };

export type SupportAssistReply = {
  mode: "mock" | "live";
  answer: string;
  escalate: boolean;
  nextSteps: string[];
  refused?: boolean;
  code?: string;
  privacy: { writes: false; note: string };
};

export function assessSupportTopic(
  text: string | null | undefined,
): SupportTopicResult {
  const raw = (text ?? "").trim();
  if (raw.length < 8) return { allowed: true };

  const looksProduct = PRODUCT_POSITIVE.test(raw);
  for (const pattern of CODING_PATTERNS) {
    if (pattern.test(raw) && !looksProduct) {
      return {
        allowed: false,
        code: "off_topic",
        message: SUPPORT_OFF_TOPIC_MESSAGE,
      };
    }
  }
  for (const pattern of GENERAL_CHAT_PATTERNS) {
    if (pattern.test(raw) && !looksProduct) {
      return {
        allowed: false,
        code: "off_topic",
        message: SUPPORT_OFF_TOPIC_MESSAGE,
      };
    }
  }
  if (
    /\b(write|generate|debug)\b.{0,20}\b(python|javascript|typescript|react|node)\b/i.test(
      raw,
    ) &&
    /\b(code|function|script|component|api)\b/i.test(raw)
  ) {
    return {
      allowed: false,
      code: "off_topic",
      message: SUPPORT_OFF_TOPIC_MESSAGE,
    };
  }

  // Clear ledger/equipment asks → soft redirect (still allowed; answer points to Ask).
  if (LEDGER_ONLY.test(raw) && !looksProduct) {
    return { allowed: true, redirectToAsk: true };
  }

  return { allowed: true };
}

export function buildSupportUserPrompt(input: {
  question: string;
  homeLabel?: string | null;
}): string {
  const home = input.homeLabel?.trim()
    ? `Active home label (do not invent more about it): ${input.homeLabel.trim()}`
    : "No home label provided — do not invent a home address or ledger facts.";
  return (
    `${SUPPORT_PRODUCT_KNOWLEDGE}\n\n${home}\n\n` +
    `Homeowner message:\n${input.question.trim()}`
  );
}

export function mockSupportAnswer(
  question: string,
  opts?: { redirectToAsk?: boolean; mode?: "mock" | "live" },
): SupportAssistReply {
  const q = question.toLowerCase();
  const mode = opts?.mode ?? "mock";

  if (opts?.redirectToAsk || LEDGER_ONLY.test(question)) {
    return {
      mode,
      escalate: false,
      nextSteps: [
        "Open Home → HomeAsset",
        "Ask your equipment or ledger question there",
      ],
      answer:
        "That sounds like a home or equipment question — I hear you wanting a clear answer from your record. " +
        "Support stays on the app and account. Open Home → HomeAsset (Talk or Text) for manuals, maintenance, recalls, and what’s saved on this home. " +
        "Asking never writes your ledger.",
      privacy: supportPrivacy(),
    };
  }

  if (/\b(sign ?out|log ?out)\b/.test(q)) {
    return {
      mode,
      escalate: false,
      nextSteps: ["Open Settings", "Tap Sign out at the bottom"],
      answer:
        "Of course — you can leave anytime. Open Settings, scroll to Account, and tap Sign out. " +
        "That ends the session on this phone.",
      privacy: supportPrivacy(),
    };
  }

  if (/\b(app lock|face ?id|fingerprint|biometric|unlock)\b/.test(q)) {
    return {
      mode,
      escalate: false,
      nextSteps: [
        "Settings → Security",
        "Turn on Lock when idle or away",
        "Pick an idle time that fits you",
      ],
      answer:
        "App lock is under Settings → Security. Turn on Lock when idle or away, pick 1–5 minutes, " +
        "and unlock with Face ID / fingerprint when your phone supports it (or your password). " +
        "We never store your biometrics — only a yes/no from the phone.",
      privacy: supportPrivacy(),
    };
  }

  if (/\b(push|notification|lock.?screen|register)\b/.test(q)) {
    return {
      mode,
      escalate: false,
      nextSteps: [
        "Settings → Push & in-app",
        "Turn on the alerts you want",
        "Register this phone for push if offered",
      ],
      answer:
        "Notifications live in one place on Home → Notifications. Delivery prefs are Settings → Push & in-app — " +
        "turn on Safety recall alerts, Contractor submissions, and Push, then Register this phone if you want lock-screen alerts. " +
        "If Register fails softly, the rest of the app still works.",
      privacy: supportPrivacy(),
    };
  }

  if (/\b(ask homeasset|manual|ledger|equipment)\b/.test(q)) {
    return {
      mode,
      escalate: false,
      nextSteps: [
        "Home → HomeAsset for ledger help",
        "Settings → Support for app/account help",
      ],
      answer:
        "HomeAsset (from Home) answers home and ledger questions. " +
        "This Support screen is for the app itself — sign-in, Settings, notifications, privacy, and getting unstuck. " +
        "Use whichever matches what you need; neither writes your ledger without your confirm.",
      privacy: supportPrivacy(),
    };
  }

  if (/\b(invite|contractor|submission|approve)\b/.test(q)) {
    return {
      mode,
      escalate: false,
      nextSteps: [
        "Home → Contractors → Invite a contractor",
        "Share the link",
        "Review under Review contractor submissions — approve before official",
      ],
      answer:
        "Pros don’t get a contractor face in HomeAsset. From Home → Contractors, invite with a link they open in a browser. " +
        "Their notes wait as a draft until you approve, edit, or decline — nothing silent lands on your ledger.",
      privacy: supportPrivacy(),
    };
  }

  if (/\b(frustrat|angry|upset|stuck|broken|crash|bug|not work)\b/.test(q)) {
    return {
      mode,
      escalate: true,
      nextSteps: [
        "Say what screen you were on and what you expected",
        "Try Settings → How to use for the feature",
        "If still stuck, leave that detail here so a human can follow up",
      ],
      answer:
        "I’m sorry this has been frustrating — that matters, and you shouldn’t have to fight the app. " +
        "Tell me which screen you were on and what you expected to happen; I’ll give the clearest next step I can. " +
        "If we still can’t fix it here, leave that short note in Support so a person can look — " +
        "and for anything that feels like a security issue, check Settings → Security.",
      privacy: supportPrivacy(),
    };
  }

  return {
    mode,
    escalate: false,
    nextSteps: [
      "Settings → How to use for the full guide",
      "Home → HomeAsset for ledger/equipment questions",
      "Reply here with the screen you’re on if you’re stuck",
    ],
    answer:
      "Thanks for reaching out — I’m here to help with the HomeAsset app and your account. " +
      "Tell me what you’re trying to do (for example sign out, push alerts, app lock, or an invite link), " +
      "and I’ll give plain steps. For equipment manuals or what’s on your home record, use Home → HomeAsset instead.",
    privacy: supportPrivacy(),
  };
}

export function parseSupportModelJson(
  content: string | null | undefined,
  fallbackQuestion: string,
  mode: "mock" | "live",
): SupportAssistReply {
  if (!content?.trim()) {
    return mockSupportAnswer(fallbackQuestion, { mode });
  }
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        mode,
        answer: content.trim().slice(0, 2000),
        escalate: /human|escalate|still stuck/i.test(content),
        nextSteps: [],
        privacy: supportPrivacy(),
      };
    }
    const parsed = JSON.parse(jsonMatch[0]) as {
      answer?: unknown;
      escalate?: unknown;
      nextSteps?: unknown;
    };
    const answer =
      typeof parsed.answer === "string" && parsed.answer.trim()
        ? parsed.answer.trim().slice(0, 2000)
        : content.trim().slice(0, 2000);
    const nextSteps = Array.isArray(parsed.nextSteps)
      ? parsed.nextSteps
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .map((s) => s.trim().slice(0, 200))
          .slice(0, 6)
      : [];
    return {
      mode,
      answer,
      escalate: parsed.escalate === true,
      nextSteps,
      privacy: supportPrivacy(),
    };
  } catch {
    return mockSupportAnswer(fallbackQuestion, { mode });
  }
}

function supportPrivacy(): { writes: false; note: string } {
  return {
    writes: false,
    note: "Support replies never change your ledger or account settings.",
  };
}
