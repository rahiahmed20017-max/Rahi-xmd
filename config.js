const isTrue = (x) => x === "true" || x === true;

export default {
  // General Config
  GROUP_LINKS: [],
  prefix: ".",
  DATABASE_URL: process.env.DATABASE_URL || "",
  BOT_NAME: process.env.BOT_NAME || "Rahi",
  packname: process.env.PACKNAME || "bot",
  author: process.env.AUTHOR || "Rᴀʜɪ xᴍᴅ",
  THEME: process.env.THEME || "t",
  giftname: "miku",
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || "",
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || "",
  // Telegram Group Config
  ALLOWED_GROUP_ID: Number(process.env.TG_GROUP_ID) || 
  GROUP_INVITE_LINK: process.env.TG_GROUP_LINK || "",
  // WhatsApp Channel Config
  WA_CHANNEL_LINK:
    process.env.WA_CHANNEL_LINK ||
    "https://whatsapp.com/channel/0029Vb9QiA32975HD6Oq4y17",
  // Pairing Config
  PAIR_COOLDOWN_MS: 30_000,
  // Telegram Bot Token
  BOT_TOKEN: process.env.BOT_TOKEN || "",
};
