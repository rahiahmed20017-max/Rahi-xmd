/*import axios from "axios";
import { Module } from "../../lib/plugins.js";

// ─── Blackpink Style Logo ─────────────────────────────────────────────────────

Module({
  command: "blackpink",
  aliases: ["blackpinklogo", "bplogo"],
  package: "logo",
  description: "Generate Blackpink Style Logo",
})(async (message, match) => {
  const text = (match || "").trim();

  if (!text) {
    return message.send("❌ Give some text.\n\nExample:\n.blackpink Kira");
  }

  try {
    await message.react("🎀");

    const { data } = await axios.get(
      `https://jerrycoder.oggyapi.workers.dev/ephoto/blackpinklogo?text=${encodeURIComponent(text)}`
    );

    const imageUrl = data.result || data.url || data.image;
    if (!imageUrl) throw new Error("No image URL returned");

    await message.conn.sendMessage(
      message.from,
      { image: { url: imageUrl }, caption: `🎀 *BLACKPINK LOGO*\n\n📝 Text: ${text}` },
      { quoted: message.raw }
    );

    await message.react("✅");
  } catch (err) {
    console.log("BLACKPINK ERROR:", err);
    await message.react("❌");
    await message.send("❌ Failed to generate Blackpink logo.");
  }
});

// ─── 1917 Style Logo ──────────────────────────────────────────────────────────

Module({
  command: "1917",
  aliases: ["1917style"],
  package: "logo",
  description: "Generate 1917 Style Logo",
})(async (message, match) => {
  const text = (match || "").trim();

  if (!text) {
    return message.send("Example:\n.1917 KIRA-X");
  }

  try {
    await message.react("🎨");

    const { data } = await axios.get(
      `https://jerrycoder.oggyapi.workers.dev/ephoto/1917style?text=${encodeURIComponent(text)}`
    );

    const imageUrl = data.result || data.url || data.image;
    if (!imageUrl) throw new Error("No image URL returned");

    await message.conn.sendMessage(
      message.from,
      { image: { url: imageUrl }, caption: `✨ 1917 Style\n📝 ${text}` },
      { quoted: message.raw }
    );
  } catch (err) {
    console.log("1917 ERROR:", err);
    await message.send("❌ Failed to generate logo.");
  }
});

// ─── Water Color Text Logo ────────────────────────────────────────────────────

Module({
  command: "watercolor",
  aliases: ["wcolor"],
  package: "logo",
  description: "Water Color Text Logo",
})(async (message, match) => {
  const text = (match || "").trim();

  if (!text) {
    return message.send("❌ Please provide text.\n\nExample:\n.watercolor KIRA");
  }

  try {
    await message.react("🎨");

    let imageUrl = null;
    let retries = 3;

    while (retries > 0) {
      try {
        const { data } = await axios.get(
          `https://jerrycoder.oggyapi.workers.dev/ephoto/watercolortext?text=${encodeURIComponent(text)}`,
          { timeout: 15_000 }
        );

        imageUrl = data.result || data.url || data.image;
        if (imageUrl) break;
      } catch (err) {
        console.log(`Watercolor Retry left: ${retries - 1} - Error: ${err.message}`);
      }

      retries--;
      if (retries > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (!imageUrl) throw new Error("Failed after 3 retries");

    await message.conn.sendMessage(
      message.from,
      { image: { url: imageUrl }, caption: `🎨 *WATER COLOR*\n\n📝 Text: ${text}` },
      { quoted: message.raw }
    );

    await message.react("✅");
  } catch (e) {
    console.log("WATERCOLOR ERROR:", e.message);
    await message.react("❌");
    await message.send("❌ Something went wrong, please try again later.");
  }
});

*/

import axios from "axios";
import FormData from "form-data";
import * as cheerio from "cheerio";
import { Module } from "../../lib/plugins.js";
import config from "../../config.js";

const EFFECT_URLS = {
  glitchtext:
    "https://en.ephoto360.com/create-digital-glitch-text-effects-online-767.html",
  writetext: "https://en.ephoto360.com/write-text-on-wet-glass-online-589.html",
  advancedglow: "https://en.ephoto360.com/advanced-glow-effects-74.html",
  typographytext:
    "https://en.ephoto360.com/create-typography-text-effect-on-pavement-online-774.html",
  pixelglitch:
    "https://en.ephoto360.com/create-pixel-glitch-text-effect-online-769.html",
  neonglitch:
    "https://en.ephoto360.com/create-impressive-neon-glitch-text-effects-online-768.html",
  flagtext:
    "https://en.ephoto360.com/nigeria-3d-flag-text-effect-online-free-753.html",
  flag3dtext:
    "https://en.ephoto360.com/free-online-american-flag-3d-text-effect-generator-725.html",
  deletingtext:
    "https://en.ephoto360.com/create-eraser-deleting-text-effect-online-717.html",
  blackpinkstyle:
    "https://en.ephoto360.com/online-blackpink-style-logo-maker-effect-711.html",
  glowingtext:
    "https://en.ephoto360.com/create-glowing-text-effects-online-706.html",
  underwatertext:
    "https://en.ephoto360.com/3d-underwater-text-effect-online-682.html",
  logomaker: "https://en.ephoto360.com/free-bear-logo-maker-online-673.html",
  cartoonstyle:
    "https://en.ephoto360.com/create-a-cartoon-style-graffiti-text-effect-online-668.html",
  papercutstyle:
    "https://en.ephoto360.com/multicolor-3d-paper-cut-style-text-effect-658.html",
  watercolortext:
    "https://en.ephoto360.com/create-a-watercolor-text-effect-online-655.html",
  effectclouds:
    "https://en.ephoto360.com/write-text-effect-clouds-in-the-sky-online-619.html",
  blackpinklogo:
    "https://en.ephoto360.com/create-blackpink-logo-online-free-607.html",
  gradienttext:
    "https://en.ephoto360.com/create-3d-gradient-text-effect-online-600.html",
  summerbeach:
    "https://en.ephoto360.com/write-in-sand-summer-beach-online-free-595.html",
  luxurygold:
    "https://en.ephoto360.com/create-a-luxury-gold-text-effect-online-594.html",
  multicoloredneon:
    "https://en.ephoto360.com/create-multicolored-neon-light-signatures-591.html",
  sandsummer:
    "https://en.ephoto360.com/write-in-sand-summer-beach-online-576.html",
  galaxywallpaper:
    "https://en.ephoto360.com/create-galaxy-wallpaper-mobile-online-528.html",
  "1917style": "https://en.ephoto360.com/1917-style-text-effect-523.html",
  makingneon:
    "https://en.ephoto360.com/making-neon-light-text-effect-with-galaxy-style-521.html",
  royaltext: "https://en.ephoto360.com/royal-text-effect-online-free-471.html",
  freecreate:
    "https://en.ephoto360.com/free-create-a-3d-hologram-text-effect-441.html",
  galaxystyle:
    "https://en.ephoto360.com/create-galaxy-style-free-name-logo-438.html",
  amongustext:
    "https://en.ephoto360.com/create-a-cover-image-for-the-game-among-us-online-762.html",
  rainytext: "https://en.ephoto360.com/foggy-rainy-text-effect-75.html",
  lighteffects: "https://en.ephoto360.com/light-effects-74.html",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36";

async function ephoto(url, textInput) {
  const formData = new FormData();

  const initialResponse = await axios.get(url, {
    headers: { "user-agent": UA },
  });

  const $ = cheerio.load(initialResponse.data);

  const token = $("input[name=token]").val();
  const buildServer = $("input[name=build_server]").val();
  const buildServerId = $("input[name=build_server_id]").val();

  formData.append("text[]", textInput);
  formData.append("token", token);
  formData.append("build_server", buildServer);
  formData.append("build_server_id", buildServerId);

  const postResponse = await axios({
    url,
    method: "POST",
    data: formData,
    headers: {
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "user-agent": UA,
      cookie: initialResponse.headers["set-cookie"]?.join("; "),
      ...formData.getHeaders(),
    },
  });

  const $$ = cheerio.load(postResponse.data);
  const formValueInput = JSON.parse($$("input[name=form_value_input]").val());
  formValueInput["text[]"] = formValueInput.text;
  delete formValueInput.text;

  const { data: finalResponseData } = await axios.post(
    "https://en.ephoto360.com/effect/create-image",
    new URLSearchParams(formValueInput),
    {
      headers: {
        "user-agent": UA,
        cookie: initialResponse.headers["set-cookie"].join("; "),
      },
    },
  );

  return buildServer + finalResponseData.image;
}

// Main "ephoto" command — lists all available effects
Module({
  command: "ephoto",
  package: "ephoto",
  description: "List all available ephoto text-effect commands",
})(async (message) => {
  try {
    const effectList = Object.keys(EFFECT_URLS)
      .map((e) => `• \`${config.prefix}${e}\``)
      .join("\n");

    await message.conn.sendMessage(message.from, {
      text:
        `🎨 *ᴇᴘʜᴏᴛᴏ ᴇꜰꜰᴇᴄᴛs*\n\n` +
        `> Create cool text effects!\n\n` +
        `╭┈┈⬡「 📋 *ᴇꜰꜰᴇᴄᴛ ʟɪsᴛ* 」\n${effectList}\n╰┈┈┈┈┈┈┈┈⬡\n\n` +
        `> *Example:* ${config.prefix}glitchtext miku`,
    });
  } catch (err) {
    console.error("❌ Ephoto list error:", err);
    await message.conn.sendMessage(message.from, {
      text: `❌ Error: ${err?.message || err}`,
    });
  }
});

// One Module() registration per effect command (glitchtext, writetext, ...)
for (const [effectName, effectUrl] of Object.entries(EFFECT_URLS)) {
  Module({
    command: effectName,
    package: "ephoto",
    description: `Create a "${effectName}" text effect (usage: ${config.prefix}${effectName} <text>)`,
  })(async (message, match) => {
    const text = match?.trim();

    if (!text) {
      return message.conn.sendMessage(message.from, {
        text: `❌ *ᴇʀʀᴏʀ*\n\n> Please enter text!\n> *Example:* ${config.prefix}${effectName} miku`,
      });
    }

    await message.react("🕕");

    try {
      const imageUrl = await ephoto(effectUrl, text);

      await message.conn.sendMessage(message.from, {
        image: { url: imageUrl },
        caption: `✅ *${effectName}*`,
      });

      await message.react("✅");
    } catch (err) {
      await message.react("☢");
      console.error(`❌ Ephoto (${effectName}) error:`, err);
      await message.conn.sendMessage(message.from, {
        text: `❌ Error: ${err?.message || err}`,
      });
    }
  });
}
