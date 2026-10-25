import axios from "axios";
import { Module } from "../../lib/plugins.js";

// ─── Giphy GIF search ─────────────────────────────────────────────────────────

Module({
  command: "gifsearch",
  aliases: ["searchgif", "giphy"],
  package: "search",
  description: "Search for GIFs using Giphy API",
})(async (message, match) => {
  const query = (match || "").trim();

  if (!query) {
    return message.send(
      "❌ *What GIF do you want to search?*\nExample: .gifsearch iron man",
    );
  }

  try {
    await message.react("🔍");

    const apiKey = "myagxm9fUMzQKZYIyjX3qu48X3Abrxqc";
    const res = await axios.get(
      `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=5`,
      { timeout: 15_000 },
    );

    if (!res.data || !res.data.data || res.data.data.length === 0) {
      await message.react("❌");
      return message.send(`❌ *No GIFs found for "${query}"*`);
    }

    let gifUrl = "";
    let isMp4 = false;

    for (const item of res.data.data) {
      const imgs = item.images;
      if (imgs) {
        const mp4Link =
          imgs.original?.mp4 ||
          imgs.downsized_small?.mp4 ||
          imgs.fixed_height?.mp4;
        if (mp4Link) {
          gifUrl = mp4Link;
          isMp4 = true;
          break;
        }
      }
    }

    if (!gifUrl && res.data.data[0]?.images?.original?.url) {
      gifUrl = res.data.data[0].images.original.url;
    }

    if (!gifUrl)
      throw new Error("Could not find any playable media for this search.");

    if (isMp4) {
      await message.conn.sendMessage(
        message.from,
        {
          video: { url: gifUrl },
          gifPlayback: true,
          caption: `*GIPHY:* ${query}`,
        },
        { quoted: message.raw },
      );
    } else {
      await message.conn.sendMessage(
        message.from,
        {
          image: { url: gifUrl },
          caption: `*GIPHY:* ${query}\n_(MP4 format not available for this GIF)_`,
        },
        { quoted: message.raw },
      );
    }

    await message.react("✅");
  } catch (err) {
    console.error("Giphy Search Error:", err.message);
    await message.react("❌");
    await message.send(
      `╭──『 ❌ *ERROR* 』──⊷\n│ Failed to fetch GIF.\n│ ${err.message}\n╰──────────────⊷`,
    );
  }
});

// ─── Google Images search ──────────────────────────────────────────────────────

Module({
  command: "img",
  aliases: ["image"],
  package: "search",
  description: "Search and send top 5 relevant images (Safe Search)",
})(async (message, match) => {
  const query = (match || "").trim();

  if (!query) return message.send("❌ *Search term missing*");

  await message.react("🔍");

  try {
    const apiKey =
      "7b13fc759f637422a4fbad70a966323a4350c6dd8cc16a7cd24f7ab61fa7f9f5";
    const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&safe=active&api_key=${apiKey}`;

    const response = await axios.get(url, { timeout: 15_000 });
    const results = response.data.images_results?.slice(0, 5) || [];

    if (results.length === 0) throw new Error("No images found");

    for (const item of results) {
      const imgUrl = item.original || item.thumbnail;
      await message.conn.sendMessage(message.from, {
        image: { url: imgUrl },
        caption: `✅ *Result for: ${query}*`,
      });
    }

    await message.react("✅");
  } catch (err) {
    console.error("Image search error:", err.message);
    await message.send("❌ Failed to fetch images. Server might be busy.");
    await message.react("❌");
  }
});

// ─── BBC World News ────────────────────────────────────────────────────────────

Module({
  command: "bbc",
  aliases: ["bbcnews", "newsbbc"],
  package: "search",
  description: "Fetch latest BBC World News",
})(async (message, match) => {
  let limit = parseInt((match || "").trim());
  if (isNaN(limit) || limit < 1 || limit > 10) limit = 5;

  await message.react("⏳");

  try {
    const apiUrl = `https://www.movanest.xyz/v2/bbc-news?limit=${limit}`;
    const res = await axios.get(apiUrl, { timeout: 15_000 });

    const results = res.data?.results;
    if (!results || results.length === 0) throw new Error("No news found.");

    let formatMsg = `📰 *BBC WORLD NEWS* 📰\n\n`;

    for (let i = 0; i < results.length; i++) {
      const article = results[i];
      formatMsg += `*${i + 1}. ${article.title}*\n`;
      if (article.description) formatMsg += `📝 ${article.description}\n`;
      if (article.uploadedDate) {
        const date = new Date(article.uploadedDate).toDateString();
        formatMsg += `📅 ${date}\n`;
      }
      if (article.link) formatMsg += `🔗 ${article.link}\n`;
      formatMsg += `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
    }

    const firstThumbnail =
      results[0]?.thumbnail ||
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/BBC_News_2019.svg/1200px-BBC_News_2019.svg.png";

    await message.conn.sendMessage(
      message.from,
      {
        text: formatMsg.trim(),
        contextInfo: {
          externalAdReply: {
            title: "BBC WORLD NEWS",
            body: "Latest updates from around the globe",
            mediaType: 1,
            thumbnailUrl: firstThumbnail,
            sourceUrl: "https://www.bbc.com/news",
            renderLargerThumbnail: true,
          },
        },
      },
      { quoted: message.raw },
    );

    await message.react("✅");
  } catch (err) {
    console.error("BBC News Error:", err.message);
    await message.react("❌");
    await message.send("❌ Something went wrong, please try again later.");
  }
});
