export const DEFAULT_CUSTOM_EMOJI_ID = "6231089190977673116";

export function customEmoji(id, fallback = "✨") {
  const safeId = String(id || "");
  if (!/^\d+$/.test(safeId)) return fallback;
  return `<tg-emoji emoji-id="${safeId}">${fallback}</tg-emoji>`;
}

export function withCustomEmoji(text) {
  const value = String(text ?? "");
  if (/<tg-emoji\b/i.test(value)) return value;
  return `${customEmoji(DEFAULT_CUSTOM_EMOJI_ID)} ${value}`;
}

export function withoutCustomEmoji(text) {
  return String(text ?? "").replace(
    /<tg-emoji\b[^>]*>([\s\S]*?)<\/tg-emoji>/gi,
    "$1",
  );
}

export function isCustomEmojiError(error) {
  return /custom emoji|tg-emoji|unsupported start tag|can't parse entities|cannot parse entities/i.test(
    String(error?.message || error || ""),
  );
}
