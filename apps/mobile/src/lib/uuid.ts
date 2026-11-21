/**
 * UUIDv4 for ledger ids on React Native.
 *
 * Do not use global `crypto.randomUUID()` (missing on RN) or `expo-crypto`
 * (native module — needs a new preview APK). This is JS-only so existing
 * preview installs can pick it up via EAS Update / Metro reload.
 */
export function newUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const nibble = (Math.random() * 16) | 0;
    const value = ch === "x" ? nibble : (nibble & 0x3) | 0x8;
    return value.toString(16);
  });
}
