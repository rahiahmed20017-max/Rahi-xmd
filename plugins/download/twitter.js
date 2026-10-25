import axios from "axios";
import { Module } from "../../lib/plugins.js";
import cache from "../../lib/cache/cache-remote.js";

Module({
  command: "twitter",
  aliases: ["tw", "twdl", "x"],
  package: "downloader",
  description: "Download Twitter (X) videos/photos in HD",
})(async (message, match) => {
  const url = (match || "").trim().split(/\s+/)[0];

  if (!url || (!url.includes("twitter.com") && !url.includes("x.com"))) {
    return message.send(
      "❌ *Invalid URL*\n\n➤ Example: .twitter https://x.com/...",
    );
  }

  await message.react("⏳");

  try {
    const key = cache.cacheKey(url);

    const { data: mediaBuffer, meta } = await cache.getOrFetch(
      key,
      async () => {
        const apiUrl = `https://www.movanest.xyz/v2/ssstwitter?url=${encodeURIComponent(url)}`;
        const res = await axios.get(apiUrl, { timeout: 20_000 });

        const resultData = res.data?.data || res.data?.result || res.data;
        if (!resultData) throw new Error("No data received from API");

        let mediaUrl =
          resultData?.video_hd ||
          resultData?.hd ||
          resultData?.video_sd ||
          resultData?.sd ||
          resultData?.video ||
          resultData?.url;

        if (
          !mediaUrl &&
          Array.isArray(resultData?.media) &&
          resultData.media.length > 0
        ) {
          mediaUrl = resultData.media[0]?.url || resultData.media[0];
        }

        if (!mediaUrl) throw new Error("Could not extract media link.");

        const tweetText =
          resultData?.desc ||
          resultData?.title ||
          resultData?.text ||
          resultData?.description ||
          resultData?.caption ||
          "";

        const isVideo =
          mediaUrl.includes(".mp4") ||
          resultData?.video ||
          resultData?.video_hd ||
          resultData?.hd;

        const fileRes = await axios.get(mediaUrl, {
          responseType: "arraybuffer",
          headers: { "User-Agent": "Mozilla/5.0" },
        });

        return {
          data: Buffer.from(fileRes.data),
          meta: {
            ext: isVideo ? "mp4" : "jpg",
            mimetype: isVideo ? "video/mp4" : "image/jpeg",
            url,
            caption: tweetText,
            isVideo,
          },
        };
      },
    );

    await message.conn.sendMessage(
      message.from,
      meta?.isVideo
        ? { video: mediaBuffer, caption: meta?.caption || "" }
        : { image: mediaBuffer, caption: meta?.caption || "" },
      { quoted: message.raw },
    );

    await message.react("✅");
  } catch (err) {
    console.error("Twitter DL Error:", err.message);
    await message.send(
      "❌ *Download Failed!*\nEnsure the tweet contains a valid media or try again later.",
    );
    await message.react("❌");
  }
});
