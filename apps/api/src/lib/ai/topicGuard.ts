/**
 * Soft topic guard for HomeAsset entry — keep asks on home / ledger scope.
 * Mirrors supabase/functions/_shared/topicGuard.ts (keep in sync).
 */

export const OFF_TOPIC_MESSAGE =
  "HomeAsset stays on home help: your ledger, equipment, manuals, maintenance, recalls, and intake. It can't help with coding projects or general chat unrelated to your home.";

export const HOME_SCOPE_SYSTEM_BLURB =
  "Help the homeowner with their HomeAsset home ledger only — no AI persona name. " +
  "Help with home equipment, manuals, maintenance, recalls, warranties, contractor work notes, and asset intake. " +
  "Refuse coding projects, software engineering, homework, and general chat unrelated to the home. " +
  "If the request is off-topic, reply with a short refusal that HomeAsset is for home help only.";

const CODING_PATTERNS: RegExp[] = [
  /\b(write|generate|create|debug|fix|refactor|implement)\b.{0,40}\b(code|function|class|script|program|api|endpoint|sql query)\b/i,
  /\b(python|javascript|typescript|java|golang|rust|c\+\+|react native|node\.?js|kotlin|swift)\b.{0,30}\b(code|function|app|project|script|component)\b/i,
  /\b(leetcode|hackerrank|coding interview|unit test|pull request|github actions)\b/i,
  /\b(how (do|can) i)\b.{0,20}\b(build|code|program|develop)\b.{0,40}\b(app|website|api|software|saas|mobile app)\b/i,
  /\b(compile|stack trace|null pointer|segmentation fault|npm install|pip install|cargo build)\b/i,
  /\b(act as|you are)\b.{0,40}\b(software|coding|programming|fullstack|full-stack)\b.{0,20}\b(assistant|engineer|developer|tutor)\b/i,
];

const GENERAL_CHAT_PATTERNS: RegExp[] = [
  /\b(write (me )?(a |an )?(essay|poem|story|song|cover letter|resume|linkedin))\b/i,
  /\b(what('s| is) the (meaning of life|capital of|weather))\b/i,
  /\b(tell me a joke|chat with me|be my (girlfriend|boyfriend|therapist))\b/i,
  /\b(crypto|stock tip|dating advice|medical diagnos)\b/i,
];

const HOME_POSITIVE =
  /\b(home|house|hvac|furnace|roof|generator|appliance|water heater|plumbing|electrical|warranty|manual|recall|maintenance|reminder|reminders|schedule|due|filter|thermostat|contractor|invoice|permit|asset|serial|install|garage|basement|attic|leak|breaker|outlet|smoke detector|carbon monoxide|kids? gear|vehicle|sump|septic|well pump)\b/i;

export type TopicGuardResult =
  | { allowed: true }
  | { allowed: false; code: "off_topic"; message: string };

export function assessAskHomeAssetTopic(
  text: string | null | undefined,
): TopicGuardResult {
  const raw = (text ?? "").trim();
  if (raw.length < 8) return { allowed: true };

  const looksHome = HOME_POSITIVE.test(raw);
  for (const pattern of CODING_PATTERNS) {
    if (pattern.test(raw) && !looksHome) {
      return {
        allowed: false,
        code: "off_topic",
        message: OFF_TOPIC_MESSAGE,
      };
    }
  }
  for (const pattern of GENERAL_CHAT_PATTERNS) {
    if (pattern.test(raw) && !looksHome) {
      return {
        allowed: false,
        code: "off_topic",
        message: OFF_TOPIC_MESSAGE,
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
      message: OFF_TOPIC_MESSAGE,
    };
  }

  return { allowed: true };
}
