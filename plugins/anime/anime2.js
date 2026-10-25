import axios from "axios";
import { Module } from "../../lib/plugins.js";

// ─── Shared smart media fetcher ───────────────────────────────────────────────
async function fetchMedia(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 25_000,
  });
  const contentType = res.headers["content-type"] || "";

  if (contentType.includes("application/json")) {
    const json = JSON.parse(res.data.toString("utf-8"));
    if (url.includes("couplepp")) return json.result || json.data || json;

    const mediaUrl =
      json.url || json.image || json.video || json.result || json.data?.url;
    if (!mediaUrl) throw new Error("Could not extract media URL.");

    const mediaRes = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      timeout: 25_000,
    });
    return mediaRes.data;
  }
  return res.data;
}

// ─── Waifu (kept here since it's the same 'anime' category) ──────────────────

Module({
  command: "waifu",
  aliases: ["animegirl"],
  package: "anime",
  description: "Random Waifu Image",
})(async (message) => {
  try {
    const api = "https://jerrycoder.oggyapi.workers.dev/anime/waifu?json=false";
    await message.conn.sendMessage(
      message.from,
      { image: { url: api }, caption: "💖 Random Waifu" },
      { quoted: message.raw },
    );
  } catch (err) {
    console.log(err);
    await message.send("❌ Failed to fetch waifu.");
  }
});

// ─── Anime status video ────────────────────────────────────────────────────────

Module({
  command: "astatus",
  aliases: ["animestatus"],
  package: "anime",
  description: "Anime status video",
})(async (message) => {
  await message.react("⏳");
  try {
    const buffer = await fetchMedia(
      "https://abhi-api.vercel.app/api/anime/astatus",
    );
    await message.conn.sendMessage(
      message.from,
      { video: buffer, caption: "⛩️ *Anime Status*" },
      { quoted: message.raw },
    );
    await message.react("✅");
  } catch (e) {
    await message.react("❌");
    await message.send("❌ Something went wrong, please try again later.");
  }
});

// ─── Couple profile pictures ───────────────────────────────────────────────────

Module({
  command: "couplepp",
  aliases: ["couple"],
  package: "anime",
  description: "Matching anime couple DPs",
})(async (message) => {
  await message.react("⏳");
  try {
    const data = await fetchMedia(
      "https://abhi-api.vercel.app/api/anime/couplepp",
    );
    const maleUrl = data.male || data.boy || data.m || data.result?.male;
    const femaleUrl = data.female || data.girl || data.f || data.result?.female;

    const maleBuffer = await axios.get(maleUrl, {
      responseType: "arraybuffer",
    });
    const femaleBuffer = await axios.get(femaleUrl, {
      responseType: "arraybuffer",
    });

    await message.conn.sendMessage(
      message.from,
      { image: maleBuffer.data, caption: "👦 *Boy DP*" },
      { quoted: message.raw },
    );
    await message.conn.sendMessage(
      message.from,
      { image: femaleBuffer.data, caption: "👧 *Girl DP*" },
      { quoted: message.raw },
    );

    await message.react("✅");
  } catch (e) {
    await message.react("❌");
    await message.send("❌ Something went wrong, please try again later.");
  }
});

// ─── Single-image anime characters (shared handler) ───────────────────────────

const SIMPLE_ANIME_IMAGES = [
  { command: "itachi", caption: "⛩️ *Itachi Uchiha*" },
  { command: "naruto", caption: "⛩️ *Naruto Uzumaki*" },
  { command: "nezuko", caption: "⛩️ *Nezuko Kamado*" },
  { command: "miku", caption: "⛩️ *Hatsune Miku*" },
  { command: "itori", aliases: ["itadori"], caption: "⛩️ *Itori*" },
  { command: "loli", caption: "⛩️ *Anime Loli*" },
];

for (const { command, aliases, caption } of SIMPLE_ANIME_IMAGES) {
  Module({
    command,
    aliases,
    package: "anime",
    description: `Random ${command} image`,
  })(async (message) => {
    await message.react("⏳");
    try {
      const buffer = await fetchMedia(
        `https://abhi-api.vercel.app/api/anime/${command}`,
      );
      await message.conn.sendMessage(
        message.from,
        { image: buffer, caption },
        { quoted: message.raw },
      );
      await message.react("✅");
    } catch (e) {
      await message.react("❌");
      await message.send("❌ Something went wrong, please try again later.");
    }
  });
}
