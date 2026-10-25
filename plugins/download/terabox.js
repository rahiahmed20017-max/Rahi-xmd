import axios from "axios";
import { Module } from "../../lib/plugins.js";
import config from "../../config.js";
import cache from "../../lib/cache/cache-remote.js";

Module({
  command: "terabox",
  aliases: ["tera", "teradl", "tb"],
  package: "downloader",
  description: "Terabox Downloader",
})(async (message, match) => {
  const url = (match || "").trim();

  if (!url) {
    return message.send(
      "❌ Example:\n.terabox https://1024terabox.com/s/xxxxx",
    );
  }

  try {
    await message.react("⏳");

    const key = cache.cacheKey(url);

    const { data: fileBuffer, meta } = await cache.getOrFetch(key, async () => {
      const apis = [
        `https://jerrycoder.oggyapi.workers.dev/down/terabx?url=${encodeURIComponent(url)}`,
        `https://jerrycoder.oggyapi.workers.dev/down/terabx-v1?url=${encodeURIComponent(url)}`,
      ];

      let data = null;
      for (const api of apis) {
        try {
          const res = await axios.get(api, { timeout: 30_000 });
          if (res.data) {
            data = res.data;
            break;
          }
        } catch {
          console.log("TERABOX API FAILED:", api);
        }
      }
      if (!data) throw new Error("All APIs failed");

      const file =
        data?.result?.download ||
        data?.result?.url ||
        data?.result?.dlink ||
        data?.data?.download ||
        data?.data?.url ||
        data?.data?.dlink ||
        data?.url;

      const title =
        data?.result?.title ||
        data?.data?.title ||
        data?.title ||
        "📦 Terabox File";

      if (!file) throw new Error("No download link");

      const fileRes = await axios.get(file, {
        responseType: "arraybuffer",
        timeout: 60_000,
      });

      return {
        data: Buffer.from(fileRes.data),
        meta: { ext: "mp4", mimetype: "application/octet-stream", url, title },
      };
    });

    const title = meta?.title || "📦 Terabox File";

    await message.conn.sendMessage(
      message.from,
      {
        document: fileBuffer,
        mimetype: "application/octet-stream",
        fileName: `${title}.mp4`,
        caption: `${title}\n\n> *Downloaded by ${config.BOT_NAME || "Bot"}*`,
      },
      { quoted: message.raw },
    );

    await message.react("✅");
  } catch (e) {
    console.log("TERABOX ERROR:", e);
    await message.send("❌ Download Failed");
    await message.react("❌");
  }
});
