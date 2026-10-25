import fs from "fs/promises";
import axios from "axios";
import {
  downloadMediaMessage,
  downloadContentFromMessage,
} from "@whiskeysockets/baileys";
import FormData from "form-data";
import { Module } from "../../lib/plugins.js";
import pkg from "gifted-btns";
import { getTheme } from "../../Themes/themes.js";
const theme = getTheme();
const { sendButtons } = pkg;

const GIFTED_API = "https://api.gifted.co.ke";
const GIFTED_KEY = "gifted";
const IMGBB_API_KEY = "eb4e5ba8f0edfa3bd69659b43ed4e1e4"; // ImgBB API Key
async function getMediaBuffer(msg, type) {
  return await downloadMediaMessage(
    { message: { [`${type}Message`]: msg } },
    "buffer",
    {},
    { logger: console },
  );
}

// ImgBB Uploader Helper for readqr
async function uploadToImgBB(buffer) {
  try {
    const formData = new FormData();
    formData.append("image", buffer.toString("base64"));
    const res = await axios.post(
      `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
      formData,
      {
        headers: formData.getHeaders(),
      },
    );
    return { url: res.data.data.url };
  } catch (error) {
    throw new Error("ImgBB Upload Failed");
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SCREENSHOT: PHONE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "ssphone",
  aliases: ["ssmobile"],
  package: "tools",
  description: "Take a screenshot of a website (mobile view)",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  const url = match?.trim();
  if (!url)
    return message.send(
      `Please provide a URL\n\nUsage: ${botPrefix}ssphone https://google.com`,
    );

  try {
    await react("⏳");
    const res = await axios.get(`${GIFTED_API}/api/tools/ssphone`, {
      params: { apikey: GIFTED_KEY, url: url },
      responseType: "arraybuffer",
    });

    // FIX: was sock.sendMessage(..., { quoted: message }) — `message` is
    // the MsgWrapper, not the raw {key, message} shape Baileys expects
    // for `quoted`, so generateWAMessageFromContent crashed trying to
    // read `quoted.message`. message.send() already builds `quoted`
    // correctly (falls back to a valid stub) — see serialize.js.
    await message.send({
      image: Buffer.from(res.data),
      caption: `*SCREENSHOT*\n\n🌐 ${url}\n📱 Mobile View`,
    });
    await react("✅");
  } catch (e) {
    await react("❌");
    message.send("Failed to capture screenshot: " + e.message);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SCREENSHOT: TABLET
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "sstab",
  aliases: ["sstablet"],
  package: "tools",
  description: "Take a screenshot of a website (tablet view)",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  const url = match?.trim();
  if (!url)
    return message.send(
      `Please provide a URL\n\nUsage: ${botPrefix}sstab https://google.com`,
    );

  try {
    await react("⏳");
    const res = await axios.get(`${GIFTED_API}/api/tools/sstab`, {
      params: { apikey: GIFTED_KEY, url: url },
      responseType: "arraybuffer",
    });

    // FIX: same quoted-shape bug as ssphone above — use message.send().
    await message.send({
      image: Buffer.from(res.data),
      caption: `*SCREENSHOT*\n\n🌐 ${url}\n📱 Tablet View`,
    });
    await react("✅");
  } catch (e) {
    await react("❌");
    message.send("Failed to capture screenshot: " + e.message);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SCREENSHOT: PC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "sspc",
  aliases: ["pcss"],
  package: "tools",
  description: "Take a screenshot of a website (PC view)",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  const url = match?.trim();
  if (!url)
    return message.send(
      `Please provide a URL\n\nUsage: ${botPrefix}sspc https://google.com`,
    );

  try {
    await react("⏳");
    const res = await axios.get(`${GIFTED_API}/api/tools/sspc`, {
      params: { apikey: GIFTED_KEY, url: url },
      responseType: "arraybuffer",
    });

    // FIX: same quoted-shape bug as ssphone above — use message.send().
    await message.send({
      image: Buffer.from(res.data),
      caption: `*SCREENSHOT*\n\n🌐 ${url}\n🖥️ Desktop View`,
    });
    await react("✅");
  } catch (e) {
    await react("❌");
    message.send("Failed to capture screenshot: " + e.message);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CREATE QR CODE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "createqr",
  aliases: ["qrcode", "makeqr"],
  package: "tools",
  description: "Create a QR code from text or link",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  // FIX: message.quoted IS the quoted object itself (see serialize.js) —
  // there is no `.message` on it. It already exposes a pre-extracted
  // `.body` string, so no need to dig into contextInfo shapes here.
  const quoted = message.quoted || null;
  let content = match?.trim();

  if (!content && quoted) {
    content = quoted.body || "";
  }

  if (!content)
    return message.send(
      `Please provide text or a link\n\nUsage: ${botPrefix}createqr Hello World\nOr quote a message`,
    );

  try {
    await react("⏳");
    const res = await axios.get(`${GIFTED_API}/api/tools/createqr`, {
      params: { apikey: GIFTED_KEY, query: content },
      responseType: "arraybuffer",
    });

    // FIX: same quoted-shape bug as ssphone above — use message.send().
    await message.send({
      image: Buffer.from(res.data),
      caption: `*QR CODE*\n\n📝 Content: ${content.substring(0, 100)}${content.length > 100 ? "..." : ""}`,
    });
    await react("✅");
  } catch (e) {
    await react("❌");
    message.send("Failed to create QR code: " + e.message);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  READ QR CODE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "readqr",
  aliases: ["decodeqr", "scanqr"],
  package: "tools",
  description: "Read/decode a QR code from an image",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  let imageUrl = match?.trim();
  // FIX: same as createqr — use message.quoted directly, and use its
  // `.type`/`.download()` instead of trying to read `quoted.message.imageMessage`.
  const quoted = message.quoted || null;

  try {
    await react("⏳");

    if (!imageUrl && quoted?.type === "imageMessage") {
      const buffer = await quoted.download(); // lazy download built into serialize.js
      if (buffer) {
        const upload = await uploadToImgBB(buffer);
        imageUrl = upload.url;
      }
    }

    if (!imageUrl) {
      await react("❌");
      return message.send(
        `Please provide a QR code image URL or quote an image\n\nUsage: ${botPrefix}readqr <url>\nOr quote an image`,
      );
    }

    const res = await axios.get(`${GIFTED_API}/api/tools/readqr`, {
      params: { apikey: GIFTED_KEY, url: imageUrl },
    });

    if (!res.data?.success) {
      await react("❌");
      return message.send(
        "Failed to read QR code or no QR code found in image",
      );
    }

    const rawResult = res.data.result || res.data.data;
    const qrContent =
      typeof rawResult === "object"
        ? rawResult.qrcode_data || rawResult.data || JSON.stringify(rawResult)
        : rawResult;

    await sendButtons(sock, message.from, {
      title: `QR READER`,
      text: `📱 *QR Code Content:*\n\n${qrContent}`,
      footer: "TOOLS",
      buttons: [
        {
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: "📋 Copy Content",
            copy_code: qrContent,
          }),
        },
      ],
    });
    await react("✅");
  } catch (e) {
    await react("❌");
    message.send("Failed to read QR code: " + e.message);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TEXT TO PICTURE (TTP)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "ttp",
  aliases: ["textpic"],
  package: "tools",
  description: "Convert text to picture sticker",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  const text = match?.trim();
  if (!text)
    return message.send(
      `Please provide text\n\nUsage: ${botPrefix}ttp Hello World`,
    );

  try {
    await react("⏳");
    const res = await axios.get(`${GIFTED_API}/api/tools/ttp`, {
      params: { apikey: GIFTED_KEY, query: text },
    });

    if (!res.data?.success || !res.data?.image_url) {
      await react("❌");
      return message.send("Failed to create text image");
    }

    const imgRes = await axios.get(res.data.image_url, {
      responseType: "arraybuffer",
    });

    // FIX: same quoted-shape bug as ssphone above — use message.send().
    await message.send({
      sticker: Buffer.from(imgRes.data),
      packname: "x-miku",
      author: "BOT 🤍",
    });
    await react("✅");
  } catch (e) {
    await react("❌");
    message.send("Failed to create sticker: " + e.message);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DICTIONARY / DEFINE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "define",
  aliases: ["meaning"],
  package: "tools",
  description: "Get the meaning/definition of a word",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  const term = match?.trim();
  if (!term)
    return message.send(
      `Please provide a word to define\n\nUsage: ${botPrefix}define hello`,
    );

  try {
    await react("⏳");
    const res = await axios.get(`${GIFTED_API}/api/tools/define`, {
      params: { apikey: GIFTED_KEY, term: term },
    });

    if (!res.data?.success || !res.data?.results?.length) {
      await react("❌");
      return message.send("No definitions found for: " + term);
    }

    const definitions = res.data.results.slice(0, 5);
    let txt = `*DICTIONARY*\n\n📖 *Word:* ${term}\n\n`;

    definitions.forEach((def, i) => {
      const cleanDef = def.definition.replace(/\[([^\]]+)\]/g, "$1");
      const cleanExample = def.example?.replace(/\[([^\]]+)\]/g, "$1");
      txt += `*${i + 1}. ${def.word}*\n📝 ${cleanDef}\n`;
      if (cleanExample) txt += `💬 _"${cleanExample}"_\n`;
      txt += `👤 by ${def.author}\n\n`;
    });

    await message.send(txt);
    await react("✅");
  } catch (e) {
    await react("❌");
    message.send("Failed to get definition: " + e.message);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  WEB TO ZIP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "webzip2",
  aliases: ["webtozip", "webdl"],
  package: "tools",
  description: "Download a website as a ZIP file",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  const url = match?.trim();
  if (!url)
    return message.send(
      `Please provide a URL\n\nUsage: ${botPrefix}web2zip https://example.com`,
    );

  try {
    await react("⏳");
    const res = await axios.get(`${GIFTED_API}/api/tools/web2zip`, {
      params: { apikey: GIFTED_KEY, url: url },
      responseType: "arraybuffer",
    });

    let domain;
    try {
      domain = new URL(url).hostname.replace(/[^a-z0-9]/gi, "_");
    } catch {
      domain = "website";
    }

    // FIX: same quoted-shape bug as ssphone above — use message.send().
    await message.send({
      document: Buffer.from(res.data),
      mimetype: "application/zip",
      fileName: `${domain}.zip`,
      caption: `*WEB2ZIP*\n\n🌐 ${url}`,
    });
    await react("✅");
  } catch (e) {
    await react("❌");
    message.send("Failed to download website: " + e.message);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  EMOJI MIX
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "emojimix",
  aliases: ["emomix", "mixemoji"],
  package: "tools",
  description: "Mix two emojis together",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  const input = match?.trim();
  if (!input)
    return message.send(
      `Please provide two emojis\n\nUsage: ${botPrefix}emojimix 😂:🙄\nOr: ${botPrefix}emojimix 😂🙄`,
    );

  let emoji1, emoji2;
  if (input.includes(":")) {
    const parts = input.split(":");
    emoji1 = parts[0].trim();
    emoji2 = parts[1].trim();
  } else {
    const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu;
    const emojis = input.match(emojiRegex);
    if (emojis && emojis.length >= 2) {
      emoji1 = emojis[0];
      emoji2 = emojis[1];
    }
  }

  if (!emoji1 || !emoji2)
    return message.send(
      `Please provide two valid emojis\n\nUsage: ${botPrefix}emojimix 😂:🙄`,
    );

  try {
    await react("⏳");
    const res = await axios.get(`${GIFTED_API}/api/tools/emojimix`, {
      params: { apikey: GIFTED_KEY, emoji1: emoji1, emoji2: emoji2 },
      responseType: "arraybuffer",
    });

    // FIX: same quoted-shape bug as ssphone above — use message.send().
    await message.send({
      image: Buffer.from(res.data),
      caption: `*EMOJI MIX*\n\n${emoji1} + ${emoji2}`,
    });
    await react("✅");
  } catch (e) {
    await react("❌");
    message.send(
      "Failed to mix emojis. Make sure both are valid and supported.",
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  RENAME FILE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "rename",
  aliases: ["newname", "rn"],
  package: "tools",
  description: "Rename a quoted document/file with a new name",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  // FIX: message.quoted is the object itself; `.msg` holds the raw
  // imageMessage/documentMessage/etc payload, and `.type` tells us which
  // one it is. The old code read `message.quoted.message` (undefined)
  // and then poked at `quoted.documentMessage` etc, which always failed
  // since `quoted` was always null.
  const quoted = message.quoted || null;
  if (!quoted)
    return message.send(
      `Please quote/reply to a document or media file\n\nUsage: ${botPrefix}rename <new filename>`,
    );

  const newName = match?.trim();
  if (!newName)
    return message.send(
      `Please provide a new filename\n\nUsage: ${botPrefix}rename <new filename>\nExample: ${botPrefix}rename my_video.mp4`,
    );

  try {
    await react("⏳");
    const mediaMsg = quoted.msg;
    let mediaType = null;
    let originalMime = null;
    let originalExt = "";

    switch (quoted.type) {
      case "documentMessage":
        mediaType = "document";
        originalMime = mediaMsg.mimetype || "application/octet-stream";
        if (mediaMsg.fileName) {
          const parts = mediaMsg.fileName.split(".");
          if (parts.length > 1) originalExt = "." + parts.pop();
        }
        break;
      case "imageMessage":
        mediaType = "image";
        originalMime = mediaMsg.mimetype || "image/jpeg";
        originalExt = originalMime.includes("png")
          ? ".png"
          : originalMime.includes("gif")
            ? ".gif"
            : originalMime.includes("webp")
              ? ".webp"
              : ".jpg";
        break;
      case "videoMessage":
        mediaType = "video";
        originalMime = mediaMsg.mimetype || "video/mp4";
        originalExt = ".mp4";
        break;
      case "audioMessage":
        mediaType = "audio";
        originalMime = mediaMsg.mimetype || "audio/mpeg";
        originalExt = originalMime.includes("ogg")
          ? ".ogg"
          : originalMime.includes("wav")
            ? ".wav"
            : ".mp3";
        break;
      case "stickerMessage":
        mediaType = "sticker";
        originalMime = "image/webp";
        originalExt = ".webp";
        break;
      default:
        await react("❌");
        return message.send(
          "❌ Please quote a document, image, video, audio, or sticker file.",
        );
    }
    const buffer = await quoted.download();
    if (!buffer) {
      await react("❌");
      return message.send("❌ Failed to download the quoted media.");
    }

    let finalName = newName.includes(".") ? newName : newName + originalExt;

    // FIX: same quoted-shape bug as ssphone above — use message.send().
    await message.send({
      document: buffer,
      fileName: finalName,
      mimetype: originalMime,
    });
    await react("✅");
  } catch (e) {
    await react("❌");
    message.send("Failed to rename file: " + e.message);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  REMOVE BACKGROUND
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "rmbg",
  package: "tools",
  description: "Remove background from an image (reply to image)",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const quoted = message.quoted || null;
  if (!quoted || !["imageMessage", "documentMessage"].includes(quoted.type)) {
    return message.send("❌ Please reply to an image");
  }

  await react("⏳");

  try {
    const buffer = await quoted.download();
    if (!buffer) {
      await react("❌");
      return message.send("❌ Failed to download the quoted image");
    }

    const form = new FormData();
    form.append("image_file", buffer, {
      filename: "image.png",
      contentType: "image/png",
    });

    const API_KEY = process.env.REMOVE_BG_API || "";

    const res = await axios.post("https://api.remove.bg/v1.0/removebg", form, {
      headers: {
        ...form.getHeaders(),
        "X-Api-Key": API_KEY,
      },
      responseType: "arraybuffer",
    });

    const outputBuffer = Buffer.from(res.data, "binary");
    await message.send({
      image: outputBuffer,
      caption: "✅ Background removed",
    });

    await react("🧠");
  } catch (err) {
    console.error(err);
    await react("❌");
    message.send("❌ Failed to remove background");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  WASTED
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "wasted",
  package: "owner",
  description: "Make someone look WASTED 💀",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  let userToWaste;
  if (message.mentions && message.mentions.length > 0) {
    userToWaste = message.mentions[0];
  } else if (message.quoted) {
    userToWaste = message.quoted.participant;
  }
  if (!userToWaste) {
    return message.send("⚠️ Mention or reply to a user to use .wasted");
  }
  await react("⏳");
  let profilePic =
    "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";
  try {
    const url = await sock.profilePictureUrl(userToWaste, "image");
    if (url) profilePic = url;
  } catch (e) {
    console.error("[wasted] profilePictureUrl failed:", e?.message);
  }
  try {
    const res = await axios.get(
      `https://some-random-api.com/canvas/overlay/wasted?avatar=${encodeURIComponent(profilePic)}`,
      { responseType: "arraybuffer" },
    );
    await react("💀");
    await message.send(
      {
        image: Buffer.from(res.data),
        caption: `⚰️ *Wasted* : @${userToWaste.split("@")[0]} 💀\nRest in pieces!`,
      },
      { mentions: [userToWaste] },
    );
  } catch (err) {
    console.error(err);
    await react("❌");
    message.send("❌ Failed to generate wasted image");
  }
});

// 1. Triggered Plugin
Module({
  command: "triggered",
  package: "owner",
  description: "Make someone look TRIGGERED 😡",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  let userToTarget;
  if (message.mentions && message.mentions.length > 0) {
    userToTarget = message.mentions[0];
  } else if (message.quoted) {
    userToTarget = message.quoted.participant;
  }
  if (!userToTarget) {
    return message.send("⚠️ Mention or reply to a user to use .triggered");
  }
  await react("⏳");

  let profilePic =
    "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";
  try {
    const url = await sock.profilePictureUrl(userToTarget, "image");
    if (url) profilePic = url;
  } catch (e) {
    console.error("[triggered] profilePictureUrl failed:", e?.message);
  }

  try {
    const res = await axios.get(
      `https://api.some-random-api.com/canvas/overlay/triggered?avatar=${encodeURIComponent(profilePic)}`,
      { responseType: "arraybuffer" },
    );
    await react("😡");
    await message.send(
      {
        image: Buffer.from(res.data),
        caption: `😡 *Triggered* : @${userToTarget.split("@")[0]} 💢`,
      },
      { mentions: [userToTarget] },
    );
  } catch (err) {
    console.error(err);
    await react("❌");
    message.send("❌ Failed to generate triggered image");
  }
});

// 2. Passed Plugin
Module({
  command: "passed",
  package: "owner",
  description: "Mission Passed Respect + ✅",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  let userToTarget;
  if (message.mentions && message.mentions.length > 0) {
    userToTarget = message.mentions[0];
  } else if (message.quoted) {
    userToTarget = message.quoted.participant;
  }
  if (!userToTarget) {
    return message.send("⚠️ Mention or reply to a user to use .passed");
  }
  await react("⏳");

  let profilePic =
    "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";
  try {
    const url = await sock.profilePictureUrl(userToTarget, "image");
    if (url) profilePic = url;
  } catch (e) {
    console.error("[passed] profilePictureUrl failed:", e?.message);
  }

  try {
    const res = await axios.get(
      `https://api.some-random-api.com/canvas/overlay/passed?avatar=${encodeURIComponent(profilePic)}`,
      { responseType: "arraybuffer" },
    );
    await react("😎");
    await message.send(
      {
        image: Buffer.from(res.data),
        caption: `😎 *Mission Passed* : @${userToTarget.split("@")[0]} \nRespect +`,
      },
      { mentions: [userToTarget] },
    );
  } catch (err) {
    console.error(err);
    await react("❌");
    message.send("❌ Failed to generate passed image");
  }
});

// 3. Jail Plugin
Module({
  command: "jail",
  package: "owner",
  description: "Send someone to JAIL 🔗",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  let userToTarget;
  if (message.mentions && message.mentions.length > 0) {
    userToTarget = message.mentions[0];
  } else if (message.quoted) {
    userToTarget = message.quoted.participant;
  }
  if (!userToTarget) {
    return message.send("⚠️ Mention or reply to a user to use .jail");
  }
  await react("⏳");

  let profilePic =
    "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";
  try {
    const url = await sock.profilePictureUrl(userToTarget, "image");
    if (url) profilePic = url;
  } catch (e) {
    console.error("[jail] profilePictureUrl failed:", e?.message);
  }

  try {
    const res = await axios.get(
      `https://api.some-random-api.com/canvas/overlay/jail?avatar=${encodeURIComponent(profilePic)}`,
      { responseType: "arraybuffer" },
    );
    await react("😼");
    await message.send(
      {
        image: Buffer.from(res.data),
        caption: `😼 *Jailed* : @${userToTarget.split("@")[0]} 🚔`,
      },
      { mentions: [userToTarget] },
    );
  } catch (err) {
    console.error(err);
    await react("❌");
    message.send("❌ Failed to generate jail image");
  }
});

// 4. Gay Plugin
Module({
  command: "gay",
  package: "owner",
  description: "Add a rainbow filter 🌈",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  let userToTarget;
  if (message.mentions && message.mentions.length > 0) {
    userToTarget = message.mentions[0];
  } else if (message.quoted) {
    userToTarget = message.quoted.participant;
  }
  if (!userToTarget) {
    return message.send("⚠️ Mention or reply to a user to use .gay");
  }
  await react("⏳");

  let profilePic =
    "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png";
  try {
    const url = await sock.profilePictureUrl(userToTarget, "image");
    if (url) profilePic = url;
  } catch (e) {
    console.error("[gay] profilePictureUrl failed:", e?.message);
  }

  try {
    const res = await axios.get(
      `https://api.some-random-api.com/canvas/overlay/gay?avatar=${encodeURIComponent(profilePic)}`,
      { responseType: "arraybuffer" },
    );
    await react("😂");
    await message.send(
      {
        image: Buffer.from(res.data),
        caption: `🌈 *Gay* : @${userToTarget.split("@")[0]} ✨`,
      },
      { mentions: [userToTarget] },
    );
  } catch (err) {
    console.error(err);
    await react("❌");
    message.send("❌ Failed to generate image");
  }
});
