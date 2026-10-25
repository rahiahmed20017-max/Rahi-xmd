import yts from "yt-search";
import axios from "axios";
import { Module } from "../../lib/plugins.js";

// yt-search sometimes throws "title.trim is not a function" internally when
// YouTube returns a result card with no normal title (a Mix, a livestream,
// an age-restricted/private video, etc.) — it's a bug in the library's own
// result parsing, not something we can prevent on our side. We just need to
// catch it and treat it the same as "no results", instead of letting it
// blow up the whole command with a confusing raw error.
async function safeYts(query, opts) {
  try {
    return await yts(query, opts);
  } catch (err) {
    if (err?.message?.includes("trim is not a function")) {
      return null; // treated as "no usable results" below
    }
    throw err;
  }
}

async function resolveAudioUrl(ytUrl) {
  const apis = [
    `https://jerrycoder.oggyapi.workers.dev/down/ytmp3-v1?url=${encodeURIComponent(ytUrl)}`,
    `https://jerrycoder.oggyapi.workers.dev/down/ytmp3?url=${encodeURIComponent(ytUrl)}`,
    `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(ytUrl)}`,
    `https://eliteprotech-apis.zone.id/ytdown?format=mp3&url=${encodeURIComponent(ytUrl)}`,
  ];

  const axiosConfig = {
    timeout: 15_000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
    },
  };

  for (const api of apis) {
    try {
      const res = await axios.get(api, axiosConfig);
      const data = res.data;

      const tempUrl =
        data.data?.dl ||
        data.url ||
        data.result?.download_url ||
        data.result?.url ||
        data.result?.audio ||
        data.result;

      if (
        tempUrl &&
        typeof tempUrl === "string" &&
        tempUrl.startsWith("http")
      ) {
        const check = await axios
          .head(tempUrl, { timeout: 5000 })
          .catch(() => null);
        if (check && check.status === 200) {
          return tempUrl;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

Module({
  command: "spotify",
  aliases: ["sp", "spotifydl"],
  package: "downloader",
  description: "Download audio from Spotify link or song name",
})(async (message, match) => {
  const query = (match || "").trim();

  if (!query) {
    return message.send(
      "*_What Spotify song do you want?_*\n\n_Example: .spotify Past Lives_",
    );
  }

  await message.react("🔍");

  try {
    let searchTarget = query;
    const isSpotifyUrl = query.match(
      /(https?:\/\/open\.spotify\.com\/(track|playlist|album)\/[a-zA-Z0-9]+)/gi,
    );

    if (isSpotifyUrl) {
      const url = isSpotifyUrl[0];
      const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;

      try {
        const oembedRes = await axios.get(oembedUrl, { timeout: 10_000 });
        if (oembedRes.data && oembedRes.data.title) {
          searchTarget =
            `${oembedRes.data.title} ${oembedRes.data.author_name || ""}`.trim();
        }
      } catch {
        console.log("Spotify metadata fetch failed, searching as text...");
      }
    }

    const searchResults = await safeYts(searchTarget);
    const video = searchResults?.videos
      ? searchResults.videos.find((v) => v.url)
      : null;

    if (!video || !video.url) {
      await message.react("❌");
      return message.send(
        "❌ No matching audio stream found. Try a different song name.",
      );
    }

    const ytUrl = video.url;
    await message.react("📥");

    const fileName = `${searchTarget.replace(/[^a-zA-Z0-9 ]/g, "")}.mp3`;

    const audioUrl = await resolveAudioUrl(ytUrl);
    if (!audioUrl) throw new Error("All audio servers are currently busy.");

    await message.conn.sendMessage(
      message.from,
      {
        audio: { url: audioUrl },
        mimetype: "audio/mpeg",
        fileName,
      },
      { quoted: message.raw },
    );

    await message.react("🎧");
  } catch (err) {
    console.error("Spotify Error:", err.message);
    await message.react("❌");
    await message.send(
      `❌ _*Download Failed*_ : \n\n⚠️ ${err?.message || "An unexpected error occurred."}`,
    );
  }
});
