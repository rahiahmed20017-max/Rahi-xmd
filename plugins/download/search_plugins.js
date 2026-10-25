import fs from "fs/promises";
import fss from "fs";
import os from "os";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import axios from "axios";
import stream from "stream";
import { promisify } from "util";
import FormData from "form-data";
import {
  generateWAMessageContent,
  generateWAMessageFromContent,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import { StickerTypes } from "wa-sticker-formatter";
import { Module } from "../../lib/plugins.js";

import pkg from "gifted-btns";
import { getTheme } from "../../Themes/themes.js";
const theme = getTheme();
const { sendButtons } = pkg;

// Credentials used by the Gifted API client.
const GIFTED_API = "https://api.gifted.co.ke";
const GIFTED_KEY = "gifted";

// Utility Functions
const pipeline = promisify(stream.pipeline);

async function gmdBuffer(url) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  return Buffer.from(res.data, "utf-8");
}

async function getMediaBuffer(msg, type) {
  return await downloadMediaMessage(
    { message: { [`${type}Message`]: msg } },
    "buffer",
    {},
    { logger: console },
  );
}

async function uploadToCatbox(buffer, filename = "file.mp4") {
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("fileToUpload", buffer, filename);
  const res = await axios.post("https://catbox.moe/user/api.php", formData, {
    headers: formData.getHeaders(),
  });
  return { url: res.data };
}

function extractButtonId(msg) {
  if (!msg) return null;
  if (msg.templateButtonReplyMessage?.selectedId)
    return msg.templateButtonReplyMessage.selectedId;
  if (msg.buttonsResponseMessage?.selectedButtonId)
    return msg.buttonsResponseMessage.selectedButtonId;
  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId)
    return msg.listResponseMessage.singleSelectReply.selectedRowId;
  if (msg.interactiveResponseMessage) {
    const nf = msg.interactiveResponseMessage.nativeFlowResponseMessage;
    if (nf?.paramsJson) {
      try {
        const p = JSON.parse(nf.paramsJson);
        if (p.id) return p.id;
      } catch {}
    }
    return msg.interactiveResponseMessage.buttonId || null;
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  YOUTUBE SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "ytsearch",
  aliases: ["yt-search"],
  package: "search",
  description: "perform youtube search",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botFooter = message.botFooter || "SEARCH MODULE";

  if (!match) {
    await react("❌");
    return message.send("Please provide a search query");
  }

  try {
    const apiUrl = `https://yts.gifted.co.ke/?q=${encodeURIComponent(match)}`;
    const res = await axios.get(apiUrl, { timeout: 100000 });
    const results = res.data?.videos;

    if (!Array.isArray(results) || results.length === 0) return;

    const videos = results.slice(0, 5);
    const cards = await Promise.all(
      videos.map(async (vid) => ({
        header: {
          title: `🎬 *${vid.name}*`,
          hasMediaAttachment: true,
          imageMessage: (
            await generateWAMessageContent(
              { image: { url: vid.thumbnail } },
              { upload: sock.waUploadToServer },
            )
          ).imageMessage,
        },
        body: {
          text: `📺 Duration: ${vid.duration}\n👁️ Views: ${vid.views}${vid.published ? `\n📅 Published: ${vid.published}` : ""}`,
        },
        footer: { text: `> *${botFooter}*` },
        nativeFlowMessage: {
          buttons: [
            {
              name: "cta_copy",
              buttonParamsJson: JSON.stringify({
                display_text: "Copy Link",
                copy_code: vid.url,
              }),
            },
            {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: "Watch on YouTube",
                url: vid.url,
              }),
            },
          ],
        },
      })),
    );

    const msg = generateWAMessageFromContent(
      message.from,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: {
              body: { text: `🔍 YouTube Results for: *${match}*` },
              footer: { text: `📂 Displaying first *${videos.length}* videos` },
              carouselMessage: { cards },
            },
          },
        },
      },
      { quoted: message },
    );

    await sock.relayMessage(message.from, msg.message, {
      messageId: msg.key.id,
    });
    await react("✅");
  } catch (error) {
    console.error("YTS search error:", error);
    await react("❌");
    return message.send("Oops! Something went wrong. Please try again.");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SHAZAM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "whatsong",
  aliases: ["whatmusic"],
  package: "search",
  description: "Identify music from audio or video messages",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";
  const botFooter = message.botFooter || "SHAZAM";
  const botPic =
    "https://files.gifted.co.ke/image/ZAwgoogle-images-1548419288.jpg";

  const isUrl = (s) => /^https?:\/\//i.test(s?.trim());
  const quoted = message.quoted ? message.quoted.message : null;

  if (!match?.trim() && !quoted) {
    await react("❌");
    return message.send(
      `Please reply to an audio/video message or provide a URL\n\nUsage: ${botPrefix}shazam <audio/video url>`,
    );
  }

  const quotedAudio = quoted?.audioMessage;
  const quotedVideo = quoted?.videoMessage;

  if (!isUrl(match) && !quotedAudio && !quotedVideo) {
    await react("❌");
    return message.send(
      "The quoted message doesn't contain any audio or video",
    );
  }

  try {
    let fileUrl;
    await react("⏳");

    if (isUrl(match)) {
      fileUrl = match.trim();
    } else {
      const mediaMsg = quotedAudio || quotedVideo;
      const isAudio = !!quotedAudio;
      const durationSecs = mediaMsg?.seconds || mediaMsg?.duration || 0;
      let buffer = await getMediaBuffer(mediaMsg, isAudio ? "audio" : "video");
      const ext = isAudio ? "mp3" : "mp4";

      if (durationSecs > 20) {
        const tmpIn = path.join(os.tmpdir(), `shazam_in_${Date.now()}.${ext}`);
        const tmpOut = path.join(
          os.tmpdir(),
          `shazam_out_${Date.now()}.${ext}`,
        );
        fss.writeFileSync(tmpIn, buffer);
        await new Promise((resolve, reject) => {
          ffmpeg.setFfmpegPath(ffmpegPath);
          ffmpeg(tmpIn)
            .outputOptions(["-t", "20", "-c", "copy"])
            .on("end", resolve)
            .on("error", reject)
            .save(tmpOut);
        });
        buffer = fss.readFileSync(tmpOut);
        fss.unlinkSync(tmpIn);
        fss.unlinkSync(tmpOut);
      }

      const uploadResult = await uploadToCatbox(buffer, `audio.${ext}`);
      fileUrl = uploadResult.url;
    }

    const apiUrl = `${GIFTED_API}/api/search/shazam?apikey=${GIFTED_KEY}&url=${encodeURIComponent(fileUrl)}`;
    const res = await axios.get(apiUrl, { timeout: 60000 });

    if (!res.data?.success || !res.data?.result) {
      await react("❌");
      return message.send(
        "❌ Could not identify the music. Please try a clearer audio clip.",
      );
    }

    const r = res.data.result;
    let txt = `*– ( SHAZAM ) –*\n\n🎵 *Title:* ${r.title || r.track?.title || "Unknown"}\n`;
    if (r.artist || r.track?.subtitle || r.artists)
      txt += `🎤 *Artist:* ${r.artist || r.track?.subtitle || r.artists}\n`;
    if (r.album) txt += `💿 *Album:* ${r.album}\n`;
    if (r.genres || r.track?.genres?.primary)
      txt += `🎼 *Genre:* ${r.genres || r.track?.genres?.primary}\n`;
    if (r.releasedate || r.release_date)
      txt += `📅 *Released:* ${r.releasedate || r.release_date}\n`;
    txt += `\n> *${botFooter}*`;

    const coverart =
      r.coverart ||
      r.track?.images?.coverarthq ||
      r.track?.images?.coverart ||
      botPic;

    await sock.sendMessage(
      message.from,
      { image: { url: coverart }, caption: txt },
      { quoted: message },
    );
    await react("✅");
  } catch (e) {
    console.error("Shazam error:", e);
    await react("❌");
    message.send(`❌ Error identifying music: ${e.message}`);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GOOGLE SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "google",
  aliases: ["ggle"],
  package: "search",
  description: "Search Google and display first 5 results",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botFooter = message.botFooter || "GOOGLE";

  if (!match) {
    await react("❌");
    return message.send("Please provide a search query");
  }

  try {
    await react("🔍");
    const apiUrl = `${GIFTED_API}/api/search/google?apikey=${GIFTED_KEY}&query=${encodeURIComponent(match)}`;
    const res = await axios.get(apiUrl, { timeout: 60000 });

    if (
      !res.data?.success ||
      !res.data?.results ||
      res.data.results.length === 0
    ) {
      await react("❌");
      return message.send("No results found. Please try a different query.");
    }

    const results = res.data.results.slice(0, 5);
    const defaultImg =
      "https://files.gifted.co.ke/image/ZAwgoogle-images-1548419288.jpg";

    const cards = await Promise.all(
      results.map(async (result) => ({
        header: {
          title: `🔍 *${result.title}*`,
          hasMediaAttachment: true,
          imageMessage: (
            await generateWAMessageContent(
              { image: { url: defaultImg } },
              { upload: sock.waUploadToServer },
            )
          ).imageMessage,
        },
        body: { text: `📝 ${result.description || "No description"}` },
        footer: { text: `> *${botFooter}*` },
        nativeFlowMessage: {
          buttons: [
            {
              name: "cta_copy",
              buttonParamsJson: JSON.stringify({
                display_text: "Copy Link",
                copy_code: result.link,
              }),
            },
            {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: "Open Link",
                url: result.link,
              }),
            },
          ],
        },
      })),
    );

    const msg = generateWAMessageFromContent(
      message.from,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: {
              body: { text: `🔍 Google Results for: *${match}*` },
              footer: {
                text: `📂 Displaying first *${results.length}* results`,
              },
              carouselMessage: { cards },
            },
          },
        },
      },
      { quoted: message },
    );

    await sock.relayMessage(message.from, msg.message, {
      messageId: msg.key.id,
    });
    await react("✅");
  } catch (error) {
    console.error("Google search error:", error);
    await react("❌");
    return message.send("Failed to perform Google search. Please try again.");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LYRICS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "lyrics",
  aliases: ["songlyrics", "getlyrics"],
  package: "search",
  description: "Get song lyrics with copy button",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botFooter = message.botFooter || "LYRICS";

  if (!match) {
    await react("❌");
    return message.send("Please provide a song name");
  }

  try {
    await react("🎵");
    const apiUrl = `${GIFTED_API}/api/search/lyricsv2?apikey=${GIFTED_KEY}&query=${encodeURIComponent(match)}`;
    const res = await axios.get(apiUrl, { timeout: 60000 });

    if (!res.data?.success || !res.data?.result) {
      await react("❌");
      return message.send("No lyrics found. Please try a different song.");
    }

    const { artist, title, lyrics } = res.data.result;
    let txt = `*– ( LYRICS ) –*\n\n🎤 *Artist:* ${artist || "Unknown"}\n🎵 *Title:* ${title || "Unknown"}\n\n${lyrics}\n\n`;

    // If sendButtons is unsupported, replace this call with message.send().
    await sendButtons(sock, message.from, {
      title: "",
      text: txt,
      footer: botFooter,
      buttons: [
        {
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: "📋 Copy Lyrics",
            copy_code: lyrics,
          }),
        },
      ],
    });
    await react("✅");
  } catch (error) {
    console.error("Lyrics search error:", error);
    await react("❌");
    return message.send("Failed to get lyrics. Please try again.");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  HAPPYMOD & APKMIRROR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "happymod",
  aliases: ["modapks", "apkmod"],
  package: "search",
  description: "Search HappyMod for modded APKs",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  if (!match) return message.send("Please provide an app name to search");

  try {
    await react("📱");
    const res = await axios.get(
      `${GIFTED_API}/api/search/happymod?apikey=${GIFTED_KEY}&query=${encodeURIComponent(match)}`,
      { timeout: 60000 },
    );
    if (!res.data?.success || !res.data?.results?.data)
      return message.send("No results found.");

    const results = res.data.results.data.slice(0, 5);
    const cards = await Promise.all(
      results.map(async (app) => ({
        header: {
          title: `📱 *${app.name}*`,
          hasMediaAttachment: true,
          imageMessage: (
            await generateWAMessageContent(
              { image: { url: app.icon } },
              { upload: sock.waUploadToServer },
            )
          ).imageMessage,
        },
        body: {
          text: `📝 ${app.summary || "No description"}\n📦 Source: ${app.source || "Unknown"}`,
        },
        footer: { text: `> HAPPYMOD` },
        nativeFlowMessage: {
          buttons: [
            {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: "Download",
                url: app.url,
              }),
            },
          ],
        },
      })),
    );

    const msg = generateWAMessageFromContent(
      message.from,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: {
              body: { text: `📱 HappyMod Results for: *${match}*` },
              carouselMessage: { cards },
            },
          },
        },
      },
      { quoted: message },
    );

    await sock.relayMessage(message.from, msg.message, {
      messageId: msg.key.id,
    });
    await react("✅");
  } catch (e) {
    console.error(e);
    await react("❌");
    message.send("Failed to search HappyMod.");
  }
});

Module({
  command: "apkmirror",
  aliases: ["apkmir"],
  package: "search",
  description: "Search APK Mirror for apps",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  if (!match) return message.send("Please provide an app name to search");

  try {
    await react("📦");
    const res = await axios.get(
      `${GIFTED_API}/api/search/apkmirror?apikey=${GIFTED_KEY}&query=${encodeURIComponent(match)}`,
      { timeout: 60000 },
    );
    if (!res.data?.success || !res.data?.results?.data)
      return message.send("No results found.");

    const results = res.data.results.data.slice(0, 5);
    const cards = await Promise.all(
      results.map(async (app) => ({
        header: {
          title: `📦 *${app.name}*`,
          hasMediaAttachment: true,
          imageMessage: (
            await generateWAMessageContent(
              { image: { url: app.icon } },
              { upload: sock.waUploadToServer },
            )
          ).imageMessage,
        },
        body: { text: `📦 Source: ${app.source || "APK Mirror"}` },
        footer: { text: `> APKMIRROR` },
        nativeFlowMessage: {
          buttons: [
            {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: "Download",
                url: app.url,
              }),
            },
          ],
        },
      })),
    );

    const msg = generateWAMessageFromContent(
      message.from,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: {
              body: { text: `📦 APK Mirror Results for: *${match}*` },
              carouselMessage: { cards },
            },
          },
        },
      },
      { quoted: message },
    );

    await sock.relayMessage(message.from, msg.message, {
      messageId: msg.key.id,
    });
    await react("✅");
  } catch (e) {
    console.error(e);
    await react("❌");
    message.send("Failed to search APK Mirror.");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GOOGLE IMAGE, UNSPLASH & WALLPAPERS (LOOP SENDER)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "googleimage",
  aliases: ["gimg", "gimage"],
  package: "search",
  description: "Search Google Images and send first 10 images",
})(async (message, match) => {
  const sock = message.conn;
  if (!match) return message.send("Please provide a search query for images");

  try {
    const res = await axios.get(
      `${GIFTED_API}/api/search/googleimage?apikey=${GIFTED_KEY}&query=${encodeURIComponent(match)}`,
    );
    if (!res.data?.success || !res.data?.results)
      return message.send("No images found.");

    const images = res.data.results.slice(0, 10);
    await message.send(
      `Found ${images.length} images for: *${match}*\nSending...`,
    );

    for (let i = 0; i < images.length; i++) {
      try {
        await sock.sendMessage(
          message.from,
          {
            image: { url: images[i] },
            caption: `🖼️ Image ${i + 1}/${images.length}`,
          },
          { quoted: message },
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (e) {}
    }
  } catch (e) {
    message.send("Failed to search images.");
  }
});

Module({
  command: "unsplash",
  aliases: ["unsplashphotos"],
  package: "search",
  description: "Search Unsplash and send first 10 photos",
})(async (message, match) => {
  const sock = message.conn;
  if (!match) return message.send("Please provide a search query for photos");

  try {
    const res = await axios.get(
      `${GIFTED_API}/api/search/unsplash?apikey=${GIFTED_KEY}&query=${encodeURIComponent(match)}`,
    );
    if (!res.data?.success || !res.data?.results)
      return message.send("No photos found.");

    const photos = res.data.results.slice(0, 10);
    await message.send(
      `Found ${photos.length} Unsplash photos for: *${match}*\nSending...`,
    );

    for (let i = 0; i < photos.length; i++) {
      try {
        await sock.sendMessage(
          message.from,
          {
            image: { url: photos[i] },
            caption: `📷 Photo ${i + 1}/${photos.length}`,
          },
          { quoted: message },
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (e) {}
    }
  } catch (e) {
    message.send("Failed to search Unsplash.");
  }
});

Module({
  command: "wallpapers",
  package: "search",
  description: "Search HD wallpapers by category",
})(async (message, match) => {
  const sock = message.conn;
  if (!match) return message.send("Please provide a wallpaper category");

  try {
    const res = await axios.get(
      `${GIFTED_API}/api/search/wallpaper?apikey=${GIFTED_KEY}&query=${encodeURIComponent(match)}`,
    );
    if (!res.data?.success || !res.data?.results)
      return message.send("No wallpapers found.");

    const wallpapers = res.data.results.slice(0, 10);
    await message.send(
      `Found ${wallpapers.length} wallpapers for: *${match}*\nSending...`,
    );

    for (let i = 0; i < wallpapers.length; i++) {
      try {
        const imgUrl = Array.isArray(wallpapers[i].image)
          ? wallpapers[i].image[0]
          : wallpapers[i].image;
        await sock.sendMessage(
          message.from,
          {
            image: { url: imgUrl },
            caption: `🖼️ Wallpaper ${i + 1}/${wallpapers.length}`,
          },
          { quoted: message },
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (e) {}
    }
  } catch (e) {
    message.send("Failed to search wallpapers.");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  WEATHER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "weathersearch",
  package: "search",
  description: "Get weather information for a location",
})(async (message, match) => {
  if (!match) return message.send("Please provide a location name");

  try {
    const res = await axios.get(
      `${GIFTED_API}/api/search/weather?apikey=${GIFTED_KEY}&location=${encodeURIComponent(match)}`,
    );
    if (!res.data?.success || !res.data?.result)
      return message.send("Could not get weather for that location.");

    const w = res.data.result;
    const icon =
      { Clear: "☀️", Clouds: "☁️", Rain: "🌧️", Thunderstorm: "⛈️", Snow: "❄️" }[
        w.weather?.main
      ] || "🌡️";

    let txt = `*– ( WEATHER ) –*\n\n${icon} *Location:* ${w.location}, ${w.sys?.country || ""}\n\n`;
    txt += `🌡️ *Temperature:* ${w.main?.temp}°C\n🤒 *Feels Like:* ${w.main?.feels_like}°C\n`;
    txt += `☁️ *Weather:* ${w.weather?.main} (${w.weather?.description})\n💧 *Humidity:* ${w.main?.humidity}%\n🌬️ *Wind Speed:* ${w.wind?.speed} m/s\n`;

    await message.send(txt);
  } catch (e) {
    message.send("Failed to get weather data.");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  NPM SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "npm",
  aliases: ["npmsearch", "npmpack"],
  package: "search",
  description: "Search NPM packages",
})(async (message, match) => {
  const sock = message.conn;
  if (!match) return message.send("Please provide a package name");

  try {
    const res = await axios.get(
      `${GIFTED_API}/api/search/npmsearch?apikey=${GIFTED_KEY}&packagename=${encodeURIComponent(match)}`,
    );
    if (!res.data?.success || !res.data?.result)
      return message.send("Package not found.");

    const pkg = res.data.result;
    let txt = `*– ( NPM PACKAGE ) –*\n\n📦 *Name:* ${pkg.name}\n📝 *Description:* ${pkg.description}\n🏷️ *Version:* ${pkg.version}\n`;

    if (pkg.downloadLink) {
      const dateNow = Date.now();
      await sendButtons(sock, message.from, {
        title: "",
        text: txt,
        footer: "NPM SEARCH",
        buttons: [{ id: `npm_dl_${dateNow}`, text: "📥 Download Package" }],
      });

      const handleResponse = async (event) => {
        const msgData = event.messages[0];
        if (!msgData?.message) return;
        const btnId = extractButtonId(msgData.message);
        if (
          btnId === `npm_dl_${dateNow}` &&
          msgData.key?.remoteJid === message.from
        ) {
          await sock.sendMessage(
            message.from,
            {
              document: { url: pkg.downloadLink },
              fileName: `${pkg.name}-${pkg.version}.tgz`,
              mimetype: "application/gzip",
            },
            { quoted: msgData },
          );
        }
      };

      sock.ev.on("messages.upsert", handleResponse);
      setTimeout(() => sock.ev.off("messages.upsert", handleResponse), 300000);
    } else {
      await message.send(txt);
    }
  } catch (e) {
    message.send("Failed to search NPM.");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  WATTPAD SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "wattpad",
  aliases: ["watt", "wattsearch"],
  package: "search",
  description: "Search Wattpad stories",
})(async (message, match) => {
  const sock = message.conn;
  if (!match) return message.send("Please provide a search query");

  try {
    const res = await axios.get(
      `${GIFTED_API}/api/search/wattpad?apikey=${GIFTED_KEY}&query=${encodeURIComponent(match)}`,
    );
    if (!res.data?.success || !res.data?.results)
      return message.send("No stories found.");

    const stories = res.data.results.slice(0, 5);
    const cards = await Promise.all(
      stories.map(async (story) => ({
        header: {
          title: `📚 *${story.tittle}*`,
          hasMediaAttachment: true,
          imageMessage: (
            await generateWAMessageContent(
              { image: { url: story.thumbnail } },
              { upload: sock.waUploadToServer },
            )
          ).imageMessage,
        },
        body: { text: `👁️ Reads: ${story.reads}\n❤️ Likes: ${story.likes}` },
        footer: { text: `> WATTPAD` },
        nativeFlowMessage: {
          buttons: [
            {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: "Read Story",
                url: story.link,
              }),
            },
          ],
        },
      })),
    );

    const msg = generateWAMessageFromContent(
      message.from,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2,
            },
            interactiveMessage: {
              body: { text: `📚 Wattpad Results for: *${match}*` },
              carouselMessage: { cards },
            },
          },
        },
      },
      { quoted: message },
    );

    await sock.relayMessage(message.from, msg.message, {
      messageId: msg.key.id,
    });
  } catch (e) {
    message.send("Failed to search Wattpad.");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SPOTIFY SEARCH (BUG FIXED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "spotifysearch",
  aliases: ["spsearch", "sps"],
  package: "search",
  description: "Search Spotify for tracks",
})(async (message, match) => {
  const sock = message.conn;
  const botPrefix = message.prefix || ".";

  if (!match)
    return message.send("Please provide a song or artist name to search");

  try {
    const res = await axios.get(
      `${GIFTED_API}/api/search/spotifysearch?apikey=${GIFTED_KEY}&query=${encodeURIComponent(match)}`,
    );
    if (!res.data?.success || !res.data?.results?.length)
      return message.send("No tracks found.");

    const tracks = res.data.results.slice(0, 5);
    const dateNow = Date.now();

    let txt = `*– ( SPOTIFY SEARCH ) –*\n\n🔍 *Query:* ${match}\n\n`;
    tracks.forEach((track, i) => {
      txt += `*${i + 1}. ${track.title}*\n🎤 Artist: ${track.artist}\n⏱️ Duration: ${track.duration}\n\n`;
    });

    // BUG FIXED: id must match the listener checks!
    const buttons = tracks.map((track, i) => ({
      id: `spotify_${dateNow}_${i}`,
      text: `${i + 1}. ${track.title.substring(0, 30)}`,
    }));

    await sendButtons(sock, message.from, {
      title: "",
      text: txt,
      footer: "SPOTIFY SEARCH",
      buttons,
    });

    const handleResponse = async (event) => {
      const msgData = event.messages[0];
      if (!msgData?.message) return;

      const btnId = extractButtonId(msgData.message);
      if (!btnId || !btnId.startsWith(`spotify_${dateNow}_`)) return;

      if (msgData.key?.remoteJid === message.from) {
        const trackIndex = parseInt(btnId.split("_").pop());
        const selectedTrack = tracks[trackIndex];
        if (selectedTrack) {
          await sock.sendMessage(
            message.from,
            { text: `${botPrefix}spotify ${selectedTrack.url}` },
            { quoted: msgData },
          );
        }
      }
    };

    sock.ev.on("messages.upsert", handleResponse);
    setTimeout(() => sock.ev.off("messages.upsert", handleResponse), 300000);
  } catch (e) {
    message.send("Failed to search Spotify.");
  }
});
