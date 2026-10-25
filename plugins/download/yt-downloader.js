import axios from "axios";
import yts from "yt-search";
import sharp from "sharp";
import fs from "fs";
import os from "os";
import path from "path";
import { File } from "megajs";
import { Module } from "../../lib/plugins.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const UA = { "User-Agent": "Mozilla/5.0" };

async function gmdBuffer(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    maxRedirects: 10,
    timeout: 120_000,
    headers: UA,
  });
  return Buffer.from(res.data);
}

const formatAudio = async (buf) => buf;
const formatVideo = async (buf) => buf;
const isValidBuffer = (buf) => Buffer.isBuffer(buf) && buf.length > 10240;
const isMp4 = (b) =>
  b.length > 12 && b.slice(4, 8).toString("latin1") === "ftyp";
const isValidMedia = (buf, type) =>
  isValidBuffer(buf) && (type !== "video" || isMp4(buf));

const mkReact = (message) => (emoji) =>
  message.conn
    .sendMessage(message.from, { react: { text: emoji, key: message.key } })
    .catch(() => {});

function extractVideoId(input) {
  const short = input.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (short) return short[1];
  const watch = input.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watch) return watch[1];
  const shorts = input.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shorts) return shorts[1];
  return null;
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

// ─── API logic ───────────────────────────────────────────────────────────────

const e = encodeURIComponent;

const APIS = {
  audio: (url) => [
    {
      name: "kirax",
      url: `https://kiraxmd-api.vercel.app/api/play?query=${e(url)}`,
    },
    {
      name: "xeno",
      url: `https://xenoytdl-2.vercel.app/api/youtube?url=${e(url)}`,
    },
    {
      name: "jerry",
      url: `https://jerrycoder.oggyapi.workers.dev/down/ytmp3-v1?url=${e(url)}`,
    },
    {
      name: "siputzx",
      url: `https://api.siputzx.my.id/api/d/ytmp3?url=${e(url)}`,
    },
    {
      name: "elite",
      url: `https://eliteprotech-apis.zone.id/ytdown?format=mp3&url=${e(url)}`,
    },
  ],
  // video endpoints are the mp4 versions of the audio ones (not tested)
  video: (url) => [
    {
      name: "xeno",
      url: `https://xenoytdl-2.vercel.app/api/youtube?url=${e(url)}`,
    },
    {
      name: "jerry",
      url: `https://jerrycoder.oggyapi.workers.dev/down/ytmp4-v1?url=${e(url)}`,
    },
    {
      name: "siputzx",
      url: `https://api.siputzx.my.id/api/d/ytmp4?url=${e(url)}`,
    },
    {
      name: "elite",
      url: `https://eliteprotech-apis.zone.id/ytdown?format=mp4&url=${e(url)}`,
    },
  ],
};

function pickCandidate(data) {
  return (
    data?.result?.mp3 ||
    data?.result?.mp4 ||
    data?.result?.video ||
    data?.data?.dl ||
    data?.data?.download ||
    data?.data?.mp4 ||
    data?.download ||
    data?.url ||
    data?.result?.download_url ||
    data?.result?.audio ||
    data?.result?.url ||
    (typeof data?.result === "string" ? data.result : null)
  );
}

// Returns { success, download_url, endpoint } or { success:false }
async function queryAPI(ytUrl, type, exclude = []) {
  for (const api of APIS[type](ytUrl)) {
    if (exclude.includes(api.name)) continue;
    try {
      const res = await axios.get(api.url, {
        timeout: 40_000,
        validateStatus: () => true,
      });
      const candidate = pickCandidate(res.data);
      if (
        !candidate ||
        typeof candidate !== "string" ||
        !candidate.startsWith("http")
      )
        continue;

      try {
        const test = await axios.get(candidate, {
          responseType: "stream",
          timeout: 15_000,
          maxRedirects: 10,
          validateStatus: () => true,
          headers: UA,
        });
        try {
          test.data.destroy();
        } catch {}
        const ct = String(test.headers["content-type"] || "");
        if (/text|json|html/i.test(ct)) continue;
        if (test.status === 200 || test.status === 206) {
          return { success: true, download_url: candidate, endpoint: api.name };
        }
      } catch {}
    } catch {}
  }
  return { success: false, error: "All endpoints failed" };
}

// Resolve url + download buffer, retrying other endpoints if buffer is bad
async function getMedia(ytUrl, type) {
  const tried = [];
  for (let i = 0; i < APIS[type](ytUrl).length; i++) {
    const r = await queryAPI(ytUrl, type, tried);
    if (!r.success) return null;
    tried.push(r.endpoint);
    try {
      const buf = await gmdBuffer(r.download_url);
      if (isValidMedia(buf, type)) return buf;
      console.log(
        `[${type}] ${r.endpoint} bad file:`,
        buf.slice(0, 12).toString("hex"),
      );
    } catch {}
  }
  return null;
}

// ─── Button message ──────────────────────────────────────────────────────────

async function sendFormatButtons(message, video, title, buttonId) {
  const sock = message.conn;
  const botFooter = message.botFooter || "YOUTUBE";
  const pushName = message.pushName || "User";

  let thumb = Buffer.alloc(0);
  try {
    const res = await axios.get(video.thumbnail, {
      responseType: "arraybuffer",
    });
    thumb = await sharp(Buffer.from(res.data))
      .resize({ width: 300 })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (err) {
    console.error(err);
  }

  await sock.relayMessage(
    message.from,
    {
      buttonsMessage: {
        buttons: [
          {
            buttonId: `audio_${buttonId}`,
            buttonText: { displayText: "Audio" },
            type: 1,
          },
          {
            buttonId: `vid_${buttonId}`,
            buttonText: { displayText: "Video" },
            type: 1,
          },
        ],
        contentText: `*– ( ${title} )*\n──────────────𔓕\n*🍉 Title:* ${video.title}\n*🪀 Channel:* ${video.author?.name || "Unknown"}\n*🍂 Duration:* ${video.timestamp} (${video.seconds}s)\n*🍓 Views:* ${video.views.toLocaleString()}\n*🍼 Uploaded:* ${video.ago}\n*🏝️ Video ID:* ${video.videoId || video.id}\n\n*❄️ Select Download Format*`,
        footerText: botFooter,
        contextInfo: {
          mentionedJid: [],
          groupMentions: [],
          statusAttributions: [],
        },
        headerType: 6,
        locationMessage: {
          degreesLatitude: 0,
          degreesLongitude: 0,
          name: `${pushName}`,
          address: `–${video.author?.name || "Unknown"}`,
          jpegThumbnail: thumb,
        },
        viewOnce: true,
      },
    },
    {
      additionalNodes: [
        {
          tag: "biz",
          attrs: {},
          content: [
            {
              tag: "interactive",
              attrs: { type: "native_flow", v: "1" },
              content: [
                { tag: "native_flow", attrs: { v: "9", name: "mixed" } },
              ],
            },
          ],
        },
      ],
    },
  );
}

async function findVideo(match) {
  const id = extractVideoId(match);
  if (id) {
    const info = await yts({ videoId: id }).catch(() => null);
    if (info)
      return { ...info, url: `https://www.youtube.com/watch?v=${id}`, id };
  }
  const s = await yts(match);
  return s.videos[0] || null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SEND AUDIO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "sendaudio",
  aliases: ["dlmp3", "dlaudio"],
  package: "downloader",
  description: "Download Audio from url",
})(async (message, match) => {
  const sock = message.conn;
  const react = mkReact(message);
  const botFooter = message.botFooter || "DOWNLOADER";

  if (!match) return message.send("Please provide audio url");

  try {
    await react("⏳");
    const buffer = await gmdBuffer(match.trim());
    const converted = await formatAudio(buffer);

    await sock.sendMessage(
      message.from,
      {
        audio: converted,
        mimetype: "audio/mpeg",
        caption: `> *${botFooter}*`,
      },
      { quoted: message },
    );
    await react("✅");
  } catch (error) {
    console.error("Error during download process:", error);
    await react("❌");
    return message.send("Oops! Something went wrong. Please try again.");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SEND VIDEO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "sendvideo",
  aliases: ["dlmp4", "dvideo"],
  package: "downloader",
  description: "Download Video from url",
})(async (message, match) => {
  const sock = message.conn;
  const react = mkReact(message);
  const botFooter = message.botFooter || "DOWNLOADER";

  if (!match) return message.send("Please provide video url");

  try {
    await react("⏳");
    const buffer = await gmdBuffer(match.trim());

    await sock.sendMessage(
      message.from,
      {
        document: buffer,
        fileName: "Video.mp4",
        mimetype: "video/mp4",
        caption: `> *${botFooter}*`,
      },
      { quoted: message },
    );
    await react("✅");
  } catch (error) {
    console.error("Error during download process:", error);
    await react("❌");
    return message.send("Oops! Something went wrong. Please try again.");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  YOUTUBE PLAY (AUDIO)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "play",
  aliases: ["ytmp3", "yta", "song"],
  package: "downloader",
  description: "Download Audio from Youtube",
})(async (message, match) => {
  const sock = message.conn;
  const react = mkReact(message);

  if (!match) return message.send("Please provide a song name or YouTube URL");

  try {
    const firstVideo = await findVideo(match.trim());
    if (!firstVideo) return message.send("No video found for your query.");
    const videoUrl = firstVideo.url;

    await react("🔍");
    const bufferRes = await getMedia(videoUrl, "audio");
    if (!bufferRes) {
      await react("❌");
      return message.send(
        "All download services are currently unavailable. Please try again later.",
      );
    }

    if (bufferRes.length > 60 * 1024 * 1024) {
      await react("📄");
      await sock.sendMessage(
        message.from,
        {
          document: await formatAudio(bufferRes),
          mimetype: "audio/mpeg",
          fileName: `${firstVideo.title}.mp3`.replace(/[^\w\s.-]/gi, ""),
          caption: `🧸 *Title:* ${firstVideo.title}\n❄️ *Duration:* ${firstVideo.timestamp}\n\n_File too large for audio streaming — sent as document_`,
        },
        { quoted: message },
      );
      return;
    }

    const dateNow = Date.now();
    await sendFormatButtons(
      message,
      firstVideo,
      "YOUTUBE PLAY",
      `play_${firstVideo.id}_${dateNow}`,
    );

    const handleResponse = async (event) => {
      const messageData = event.messages[0];
      if (!messageData?.message) return;

      const selectedButtonId = extractButtonId(messageData.message);
      if (!selectedButtonId) return;
      if (
        messageData.key?.remoteJid !== message.from ||
        !selectedButtonId.includes(dateNow.toString())
      )
        return;

      await react("⬇️");
      try {
        if (selectedButtonId.startsWith("audio_")) {
          await sock.sendMessage(
            message.from,
            { audio: await formatAudio(bufferRes), mimetype: "audio/mpeg" },
            { quoted: messageData },
          );
        } else if (selectedButtonId.startsWith("vid_")) {
          await react("🔍");
          const vidBuffer = await getMedia(videoUrl, "video");
          if (!vidBuffer) {
            await react("❌");
            return message.send("Video download failed.");
          }
          await sock.sendMessage(
            message.from,
            {
              video: await formatVideo(vidBuffer),
              mimetype: "video/mp4",
              caption: `${firstVideo.title}`,
            },
            { quoted: messageData },
          );
        }
      } catch (error) {
        console.error("Error sending media:", error);
        await react("❌");
        await sock.sendMessage(
          message.from,
          { text: "Failed to send media. Please try again." },
          { quoted: messageData },
        );
      }
    };

    sock.ev.on("messages.upsert", handleResponse);
    setTimeout(() => {
      sock.ev.off("messages.upsert", handleResponse);
    }, 300000);
  } catch (error) {
    console.error("Error during download process:", error);
    await react("❌");
    return message.send("Oops! Something went wrong. Please try again.");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  YOUTUBE VIDEO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "video",
  aliases: ["mp4", "ytmp4"],
  package: "downloader",
  description: "Download Video from Youtube",
})(async (message, match) => {
  const sock = message.conn;
  const react = mkReact(message);

  if (!match) return message.send("Please provide a video name or YouTube URL");

  try {
    const firstVideo = await findVideo(match.trim());
    if (!firstVideo) return message.send("No video found for your query.");
    const videoUrl = firstVideo.url;

    await react("🔍");
    const buffer = await getMedia(videoUrl, "video");
    if (!buffer) {
      await react("❌");
      return message.send(
        "All download services are currently unavailable. Please try again later.",
      );
    }

    const sizeMB = buffer.length / (1024 * 1024);

    if (sizeMB > 100) {
      await react("📄");
      await sock.sendMessage(
        message.from,
        {
          document: await formatVideo(buffer),
          mimetype: "video/mp4",
          fileName: `${firstVideo.title}.mp4`.replace(/[^\w\s.-]/gi, ""),
          caption: `🏝️ *Title:* ${firstVideo.title}\n🌾 *Duration:* ${firstVideo.timestamp}\n\n_File too large for video streaming — sent as document_`,
        },
        { quoted: message },
      );
      return;
    }

    if (sizeMB > 20)
      await message.send("File is large, processing might take a while...");

    const dateNow = Date.now();
    await sendFormatButtons(
      message,
      firstVideo,
      "YOUTUBE VIDEO",
      `video_${firstVideo.id}_${dateNow}`,
    );

    const handleResponse = async (event) => {
      const messageData = event.messages[0];
      if (!messageData?.message) return;

      const selectedButtonId = extractButtonId(messageData.message);
      if (!selectedButtonId) return;
      if (
        messageData.key?.remoteJid !== message.from ||
        !selectedButtonId.includes(dateNow.toString())
      )
        return;

      await react("⬇️");
      try {
        if (selectedButtonId.startsWith("vid_")) {
          await sock.sendMessage(
            message.from,
            {
              video: await formatVideo(buffer),
              mimetype: "video/mp4",
              fileName: `${firstVideo.title}.mp4`.replace(/[^\w\s.-]/gi, ""),
              caption: `🎥 ${firstVideo.title}`,
            },
            { quoted: messageData },
          );
        } else if (selectedButtonId.startsWith("audio_")) {
          await react("🔍");
          const audBuffer = await getMedia(videoUrl, "audio");
          if (!audBuffer) {
            await react("❌");
            return message.send("Audio download failed.");
          }
          await sock.sendMessage(
            message.from,
            { audio: await formatAudio(audBuffer), mimetype: "audio/mpeg" },
            { quoted: messageData },
          );
        }
      } catch (error) {
        console.error("Error sending media:", error);
        await react("❌");
        await sock.sendMessage(
          message.from,
          { text: "Failed to send media. Please try again." },
          { quoted: messageData },
        );
      }
    };

    sock.ev.on("messages.upsert", handleResponse);
    setTimeout(() => {
      sock.ev.off("messages.upsert", handleResponse);
    }, 300000);
  } catch (error) {
    console.error("Error during download process:", error);
    await react("❌");
    return message.send("Oops! Something went wrong. Please try again.");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  YTS (search)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "yts",
  package: "search",
  description: "Search YouTube videos",
})(async (message, match) => {
  if (!match) return await message.send("Please provide a search query");
  const query = match.trim();

  let results = [];
  try {
    const res = await yts(query, { pages: 1 });
    results = (res?.videos || []).map((v) => ({
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail,
      channel: v.author?.name,
      publishedAt: v.ago,
    }));
  } catch {}

  if (!results.length) return await message.send("❌ No results found");

  let reply = `*YouTube results for "${query}":*\n\n`;
  results.forEach((v, i) => {
    reply += `⬢ ${i + 1}. ${v.title}\n   Channel: ${v.channel || ""}\n   Published: ${v.publishedAt || ""}\n   Link: ${v.url}\n\n`;
  });
  await message.send({ image: { url: results[0].thumbnail }, caption: reply });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GITCLONE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "gitclone",
  package: "downloader",
  description: "Download GitHub repository as zip",
})(async (message, match) => {
  const react = mkReact(message);
  const arg = (match || "").trim();
  if (!arg)
    return message.send(
      "❌ Provide a GitHub link.\n\nExample:\n.gitclone https://github.com/username/repository",
    );

  try {
    const link = arg.split(/\s+/)[0];
    const m = link.match(/github\.com\/([^\/]+)\/([^\/\s#?]+)/i);
    if (!m) return message.send("⚠️ Invalid GitHub repository format.");
    const username = m[1];
    const repo = m[2].replace(/\.git$/i, "");
    const zipUrl = `https://api.github.com/repos/${username}/${repo}/zipball`;

    const head = await fetch(zipUrl, { method: "HEAD" });
    if (!head.ok) return message.send("Repository not found or private.");

    await message.conn.sendMessage(
      message.from,
      {
        document: { url: zipUrl },
        fileName: `${repo}.zip`,
        mimetype: "application/zip",
        caption: `GitHub: ${username}/${repo}`,
      },
      { quoted: message },
    );
    await react("✅");
  } catch (err) {
    console.error("GitClone Error:", err);
    await react("❌");
    return message.send(
      "❌ Failed to download repository. Please try again later.",
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  APK DOWNLOADER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "apk",
  package: "downloader",
  description: "Download APK files using NexOracle API",
})(async (message, match) => {
  const react = mkReact(message);
  const appName = (match || "").trim();
  if (!appName) return message.send("*🏷️ Please provide an app name.*");

  try {
    await react("⏳");
    const res = await axios
      .get("https://api.nexoracle.com/downloader/apk", {
        params: { apikey: "free_key@maher_apis", q: appName },
      })
      .catch(() => null);

    if (!res?.data || res.data.status !== 200 || !res.data.result) {
      await react("❌");
      return message.send("❌ Unable to find the APK. Please try again later.");
    }

    const { name, lastup, package: pkg, size, icon, dllink } = res.data.result;

    await message.conn.sendMessage(
      message.from,
      {
        image: { url: icon },
        caption: `\`「 APK DOWNLOADED 」\`\nName: ${name}\nUpdated: ${lastup}\nPackage: ${pkg}\nSize: ${size}\nSending APK...`,
      },
      { quoted: message },
    );

    const apkRes = await axios
      .get(dllink, { responseType: "arraybuffer" })
      .catch(() => null);
    if (!apkRes?.data) {
      await react("❌");
      return message.send("❌ Failed to download the APK.");
    }

    await message.conn.sendMessage(
      message.from,
      {
        document: Buffer.from(apkRes.data),
        mimetype: "application/vnd.android.package-archive",
        fileName: `${name}.apk`,
        caption: "APK file",
      },
      { quoted: message },
    );
    await react("✅");
  } catch (err) {
    console.error("APK Error:", err);
    await react("❌");
    return message.send("❌ Unable to fetch APK details.");
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MEGA.NZ DOWNLOADER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "mega",
  package: "downloader",
  description: "Download files from Mega.nz",
})(async (message, match) => {
  const react = mkReact(message);
  const q = (match || "").trim();
  if (!q) return message.send("❌ Please provide a Mega.nz link!");

  let savePath;
  try {
    await react("⏳");
    const file = File.fromURL(q);
    await file.loadAttributes();
    const data = await file.downloadBuffer();

    const fileName = file.name || `mega_file_${Date.now()}`;
    savePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(savePath, data);

    await message.conn.sendMessage(
      message.from,
      {
        document: fs.readFileSync(savePath),
        fileName,
        mimetype: "application/octet-stream",
        caption: `Downloaded from Mega.nz: ${fileName}`,
      },
      { quoted: message },
    );
    await react("✅");
  } catch (err) {
    console.error("MegaDL Error:", err);
    await react("❌");
    return message.send("❌ Failed to download from Mega.nz.");
  } finally {
    try {
      if (savePath) fs.unlinkSync(savePath);
    } catch {}
  }
});
