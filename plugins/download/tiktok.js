import axios from "axios";
import { Module } from "../../lib/plugins.js";
import cache from "../../lib/cache/cache-remote.js";

function extractUrl(text) {
  const match = (text || "").match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

Module({
  command: "tiktok",
  aliases: ["tt", "ttdl"],
  package: "downloader",
  description: "Download TikTok videos (no watermark)",
})(async (message, match) => {
  let url = (match || "").trim();

  if (!url) {
    const quoted =
      message.raw.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
      const text =
        quoted.conversation ||
        quoted.extendedTextMessage?.text ||
        quoted.imageMessage?.caption ||
        quoted.videoMessage?.caption ||
        quoted.documentMessage?.caption ||
        "";
      url = extractUrl(text);
    }
  } else {
    url = extractUrl(url) || url;
  }

  if (!url || !url.startsWith("http")) {
    return message.send(
      "❌ Example:\n.tt https://vt.tiktok.com/xxxxx\n\nor reply to a TikTok link with .tt",
    );
  }

  try {
    await message.react("⏳");

    const key = cache.cacheKey(url);

    const { data: videoBuffer, meta } = await cache.getOrFetch(
      key,
      async () => {
        const apis = [
          `https://kiraxmd-api.vercel.app/api/tiktok?url=${encodeURIComponent(url)}`,
          `https://api-aswin-sparky.koyeb.app/api/downloader/tiktok?url=${encodeURIComponent(url)}`,
          `https://jerrycoder.oggyapi.workers.dev/down/tiktok?url=${encodeURIComponent(url)}`,
          `https://jerrycoder.oggyapi.workers.dev/down/tiktok-v1?url=${encodeURIComponent(url)}`,
        ];

        let data = null;
        for (const api of apis) {
          try {
            const res = await axios.get(api, { timeout: 20_000 });
            if (res.data) {
              data = res.data;
              break;
            }
          } catch {
            console.log("TIKTOK API FAILED:", api);
          }
        }
        if (!data)
          throw new Error("All APIs failed to fetch the TikTok video.");

        const postCaption =
          data?.result?.title ||
          data?.result?.caption ||
          data?.result?.desc ||
          data?.data?.title ||
          data?.data?.caption ||
          data?.data?.desc ||
          data?.title ||
          data?.caption ||
          "";

        const video =
          data?.result?.no_watermark ||
          data?.result?.nowm ||
          data?.data?.no_watermark ||
          data?.data?.nowm ||
          data?.data?.play ||
          data?.result?.video ||
          data?.result?.download ||
          data?.result?.url ||
          data?.data?.video ||
          data?.data?.download ||
          data?.data?.url ||
          data?.video ||
          data?.url;

        if (!video) throw new Error("No video found in the API response.");

        const videoRes = await axios.get(video, {
          responseType: "arraybuffer",
          timeout: 60_000,
        });

        return {
          data: Buffer.from(videoRes.data),
          meta: {
            ext: "mp4",
            mimetype: "video/mp4",
            url,
            caption: postCaption,
          },
        };
      },
    );

    await message.conn.sendMessage(
      message.from,
      { video: videoBuffer, caption: meta?.caption || "" },
      { quoted: message.raw },
    );

    await message.react("✅");
  } catch (e) {
    console.log("TIKTOK ERROR:", e);
    await message.send(
      `❌ Download Failed\n\n⚠️ ${e.message || "Unknown Error"}`,
    );
    await message.react("❌");
  }
});
