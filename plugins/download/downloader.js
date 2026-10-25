import axios from "axios";
import https from "https";
import { Module } from "../../lib/plugins.js";

const MAX_MEDIA_SIZE = 100 * 1024 * 1024; // 100MB

const agent = new https.Agent({
  rejectUnauthorized: true,
  maxVersion: "TLSv1.3",
  minVersion: "TLSv1.2",
});

async function getPinCookies() {
  try {
    const response = await axios.get("https://www.pinterest.com/csrf_error/", {
      httpsAgent: agent,
    });
    const setCookieHeaders = response.headers["set-cookie"];
    if (setCookieHeaders) {
      return setCookieHeaders.map((c) => c.split(";")[0].trim()).join("; ");
    }
    return null;
  } catch {
    return null;
  }
}

async function pinterestSearch(query) {
  try {
    const cookies = await getPinCookies();
    if (!cookies) return [];

    const url = "https://www.pinterest.com/resource/BaseSearchResource/get/";
    const params = {
      source_url: `/search/pins/?q=${query}`,
      data: JSON.stringify({
        options: {
          isPrefetch: false,
          query,
          scope: "pins",
          no_fetch_context_on_resource: false,
        },
        context: {},
      }),
      _: Date.now(),
    };

    const headers = {
      accept: "application/json, text/javascript, */*, q=0.01",
      "accept-language": "en-US,en;q=0.9",
      cookie: cookies,
      dnt: "1",
      referer: "https://www.pinterest.com/",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0",
      "x-app-version": "c056fb7",
      "x-pinterest-appstate": "active",
      "x-pinterest-pws-handler": "www/[username]/[slug].js",
      "x-pinterest-source-url": "/search/pins/",
      "x-requested-with": "XMLHttpRequest",
    };

    const { data } = await axios.get(url, {
      httpsAgent: agent,
      headers,
      params,
      timeout: 20000,
    });

    return data.resource_response.data.results
      .filter((v) => v.images?.orig)
      .map((result) => ({
        upload_by: result.pinner?.username,
        fullname: result.pinner?.full_name,
        caption: result.grid_title,
        image: result.images.orig.url,
        source: "https://id.pinterest.com/pin/" + result.id,
      }));
  } catch {
    return [];
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PINTEREST SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "pinsearch",
  aliases: ["pinfoto", "pins"],
  package: "downloader",
  description: "Search and send Pinterest images by keyword",
})(async (message, match) => {
  const react = async (emoji) =>
    await message.conn.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  if (!match) {
    await react("❌");
    return message.send(
      `❌ *MISSING QUERY*\n*USAGE:*\n>${botPrefix}pinsearch anime 3*\n\n*INFO:*\n> Add a number at the end to set image count (max 10, default 5)`,
    );
  }

  let query = match;
  let imgCount = 5;
  const parts = match.split(" ").filter(Boolean);
  const lastWord = parts[parts.length - 1];

  if (parts.length > 1 && lastWord && !isNaN(lastWord)) {
    imgCount = Math.max(1, Math.min(parseInt(lastWord), 10));
    query = parts.slice(0, -1).join(" ");
  }

  if (!query) {
    await react("❌");
    return message.send(
      `❌ *MISSING QUERY*\n*INFO:* Please provide a search keyword before the count`,
    );
  }

  try {
    await react("🔍");
    const results = await pinterestSearch(query);

    if (results.length === 0) {
      await react("❌");
      return message.send(
        `❌ *NO RESULTS*\n*INFO:* No results found for "${query}". Try another search term.`,
      );
    }

    const imagesToSend = Math.min(results.length, imgCount);
    await react("⬇️");

    let sentCount = 0;
    for (let i = 0; i < imagesToSend; i++) {
      try {
        await message.conn.sendMessage(message.from, {
          image: { url: results[i].image },
          caption: results[i].caption ? `📌 ${results[i].caption}` : undefined,
        });
        sentCount++;
      } catch (imgErr) {
        console.error("Pinterest image send error:", imgErr.message);
      }
    }

    if (sentCount === 0) {
      await react("❌");
      return message.send(
        `❌ *SEND FAILED*\n*INFO:* Found results but failed to send any images. Try again later.`,
      );
    }

    await react("✅");
  } catch (error) {
    console.error("Pinterest search error:", error);
    await react("❌");
    return message.send(
      `❌ *ERROR:* Error occurred while fetching Pinterest images. Please try again later.`,
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PINTEREST DOWNLOADER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "pindown",
  aliases: ["pinterest", "pindl"],
  package: "downloader",
  description: "Download Pinterest image or video",
})(async (message, match) => {
  const react = async (emoji) =>
    await message.conn.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  if (!match) {
    await react("❌");
    return message.send(
      `❌ *MISSING URL*\n*USAGE:*\n>${botPrefix}pindown https://pin.it/2xc4pVU2g*`,
    );
  }

  if (!match.includes("pinterest.com") && !match.includes("pin.it")) {
    await react("❌");
    return message.send(
      `❌ *INVALID URL*\n*INFO:* Please provide a valid Pinterest URL`,
    );
  }

  try {
    await react("⏳");
    const apiUrl = `https://api.azbry.com/api/download/pinterest?url=${encodeURIComponent(match)}`;
    const { data } = await axios.get(apiUrl, { timeout: 30000 });

    if (!data?.status || !data?.result) {
      await react("❌");
      return message.send(
        `❌ *FETCH FAILED*\n*INFO:* Failed to fetch Pinterest data. Please check the URL and try again.`,
      );
    }

    const res = data.result;
    const caption = `*– ( PINTEREST )*\n──────────────𔓕\n📝 *Title:* ${res.title || "(no title)"}\n👤 *User:* ${res.user?.fullName || "-"}\n🏷 *Username:* ${res.user?.username || "-"}\n❤️ *Likes:* ${res.stats?.likes || 0}\n🔁 *Shares:* ${res.stats?.shares || 0}\n💬 *Comments:* ${res.stats?.comments || 0}\n🎬 *Type:* ${res.type || "-"}`;

    if (res.type === "video" && res.download) {
      const videoUrl = String(res.download).replace(/\\\//g, "/").trim();
      await react("⬇️");

      try {
        const videoResponse = await axios.get(videoUrl, {
          responseType: "arraybuffer",
        });
        const videoBuffer = Buffer.from(videoResponse.data, "utf-8");

        if (videoBuffer.length > MAX_MEDIA_SIZE) {
          await message.conn.sendMessage(message.from, {
            document: videoBuffer,
            fileName: `${(res.title || "pinterest_video").replace(/[^\w\s.-]/gi, "")}.mp4`,
            mimetype: "video/mp4",
            caption,
          });
        } else {
          await message.conn.sendMessage(message.from, {
            video: videoBuffer,
            mimetype: "video/mp4",
            caption,
          });
        }
      } catch {
        await message.conn.sendMessage(message.from, {
          video: { url: videoUrl },
          mimetype: "video/mp4",
          caption,
        });
      }
    } else if (res.images && res.images.length > 0) {
      const imageUrl = String(res.images[0]).replace(/\\\//g, "/").trim();
      await react("⬇️");
      await message.conn.sendMessage(message.from, {
        image: { url: imageUrl },
        caption,
      });
    } else if (res.thumbnail) {
      const thumbUrl = String(res.thumbnail).replace(/\\\//g, "/").trim();
      await react("⬇️");
      await message.conn.sendMessage(message.from, {
        image: { url: thumbUrl },
        caption,
      });
    } else {
      await react("❌");
      return message.send(
        `❌ *NO MEDIA*\n*INFO:* No media found for this Pinterest link.`,
      );
    }

    await react("✅");
  } catch (error) {
    console.error("Pinterest API error:", error?.response?.data || error);
    await react("❌");
    return message.send(
      `❌ *ERROR:* Failed to download.\n*INFO:* ${error?.response?.data?.message || error.message}`,
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SPOTIFY PLAY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "spotifyplay",
  aliases: ["splay"],
  package: "downloader",
  description: "Search and play a song from Spotify",
})(async (message, match) => {
  const react = async (emoji) =>
    await message.conn.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  if (!match) {
    await react("❌");
    return message.send(
      `❌ *MISSING QUERY*\n*USAGE:*\n>${botPrefix}spotify sesi potret*`,
    );
  }

  try {
    await react("🔍");
    const apiUrl = `https://api.nexray.eu.cc/downloader/spotifyplay?q=${encodeURIComponent(match)}`;
    const { data } = await axios.get(apiUrl, { timeout: 30000 });

    if (!data?.status || !data?.result) {
      await react("❌");
      return message.send(`❌ *NOT FOUND*\n*INFO:* Song not found.`);
    }

    const res = data.result;
    const caption = `*– ( SPOTIFY-PLAY )*\n──────────────𔓕\n*🐊 Title:* ${res.title}\n*🎤 Artist:* ${res.artist}\n*🍉 Album:* ${res.album}\n*⏱ Duration:* ${res.duration}\n*⭐ Popularity:* ${res.popularity}\n*📅 Release:* ${res.release_at}\n\n*🔗 Spotify:*\n${res.url}`;

    await message.conn.sendMessage(message.from, {
      image: { url: res.thumbnail },
      caption,
    });
    await react("⬇️");

    await message.conn.sendMessage(message.from, {
      audio: { url: res.download_url },
      mimetype: "audio/mpeg",
      fileName: `${res.title}.mp3`,
      ptt: false,
      contextInfo: {
        externalAdReply: {
          title: res.title,
          body: res.artist || "Spotify",
          mediaType: 2,
          thumbnailUrl: res.thumbnail,
          sourceUrl: res.url,
          renderLargerThumbnail: false,
          showAdAttribution: true,
        },
      },
    });

    await react("✅");
  } catch (error) {
    console.error("Spotify Play error:", error);
    await react("❌");
    return message.send(
      `❌ *ERROR:* An error occurred while fetching the Spotify track.`,
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TIKTOK STALK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "tiktokstalk",
  aliases: ["ttstalk", "stalktt"],
  package: "tools",
  description: "Get TikTok profile info by username",
})(async (message, match) => {
  const react = async (emoji) =>
    await message.conn.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  if (!match) {
    await react("❌");
    return message.send(
      `❌ *MISSING USERNAME*\n*USAGE:*\n>${botPrefix}tiktokstalk saylviee*`,
    );
  }

  try {
    await react("⏳");
    const apiUrl = `https://api.azbry.com/api/stalk/tiktok?username=${encodeURIComponent(match)}`;
    const { data } = await axios.get(apiUrl, { timeout: 30000 });

    if (!data?.status) {
      await react("❌");
      return message.send(
        `❌ *NOT FOUND*\n*INFO:* Username not found or the API is currently unavailable.`,
      );
    }

    const res = data.result;
    const caption = `*– ( TIKTOK-STALK )*\n──────────────𔓕\n🏷️ *Nickname:* ${res.nickname}\n👤 *Username:* @${res.username}\n🌍 *Region:* ${res.region || "-"}\n✅ *Verified:* ${res.verified ? "Yes" : "No"}\n🔒 *Private:* ${res.private ? "Yes" : "No"}\n\n*– ( STATISTICS )*\n──────────────𔓕\n👥 *Followers:* ${Number(res.followers || 0).toLocaleString()}\n🍉 *Following:* ${Number(res.following || 0).toLocaleString()}\n❤️ *Likes:* ${Number(res.hearts || 0).toLocaleString()}\n🎬 *Videos:* ${Number(res.videos || 0).toLocaleString()}\n📝 *Bio*\n${res.signature || "-"}`;

    if (res.avatar) {
      await message.conn.sendMessage(message.from, {
        image: { url: res.avatar },
        caption,
      });
    } else {
      await message.conn.sendMessage(message.from, { text: caption });
    }

    await react("✅");
  } catch (error) {
    console.error("TikTok Stalk error:", error?.response?.data || error);
    await react("❌");
    return message.send(`❌ *ERROR:* ${error.message}`);
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  INSTAGRAM STALK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "instastalk",
  aliases: ["igstalk", "stalkig"],
  package: "tools",
  description: "Get Instagram profile info by username",
})(async (message, match) => {
  const react = async (emoji) =>
    await message.conn.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  if (!match) {
    await react("❌");
    return message.send(
      `❌ *MISSING USERNAME*\n*USAGE:*\n>${botPrefix}instastalk timothyronaldd*`,
    );
  }

  try {
    await react("⏳");
    const apiUrl = `https://api.synoxcloud.xyz/stalker/instagram?username=${encodeURIComponent(match)}`;
    const { data } = await axios.get(apiUrl, { timeout: 30000 });

    if (!data?.status) {
      await react("❌");
      return message.send(
        `❌ *NOT FOUND*\n*INFO:* Username not found or failed to fetch data.`,
      );
    }

    const meta = data.result?.metadata || {};
    const user = data.result?.stories?.data?.user || {};

    const caption = `*– ( INSTA-STALK )*\n──────────────𔓕\n👤 *Username:* ${user.username || match}\n🏷️ *Name:* ${user.full_name || "-"}\n🆔 *ID:* ${user.id || "-"}\n🌍 *Country:* ${data.result?.stories?.data?.country || "-"}\n✔️ *Verified:* ${user.is_verified ? "Yes" : "No"}\n🔒 *Private:* ${user.is_private ? "Yes" : "No"}\n📂 *Category:* ${user.category_name || "-"}\n💼 *Business:* ${user.business_category_name || "-"}\n👥 *Followers:* ${meta.followers || user.edge_followed_by || 0}\n🍉 *Following:* ${meta.following || user.edge_follow || 0}\n🖼️ *Posts:* ${meta.posts || user.edges_count || 0}\n🔗 *Website:* ${user.external_url || "-"}\n📝 *Bio:* ${user.biography || "-"}\n`;
    const avatarUrl = meta.avatar || user.profile_pic_url;

    if (avatarUrl) {
      await message.conn.sendMessage(message.from, {
        image: { url: avatarUrl },
        caption,
      });
    } else {
      await message.conn.sendMessage(message.from, { text: caption });
    }

    await react("✅");
  } catch (error) {
    console.error("IG Stalk error:", error?.response?.data || error);
    await react("❌");
    return message.send(
      `❌ *ERROR:* ${error?.response?.data?.message || error.message}`,
    );
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TELEGRAM STALK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "tgstalk",
  aliases: ["stalktg"],
  package: "tools",
  description: "Get Telegram username/channel/group info",
})(async (message, match) => {
  const react = async (emoji) =>
    await message.conn.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  if (!match) {
    await react("❌");
    return message.send(
      `❌ *MISSING USERNAME*\n*USAGE:*\n>${botPrefix}tgstalk durov*`,
    );
  }

  try {
    await react("⏳");
    const username = match.replace(/^@/, "").trim();
    const apiUrl = `https://api.synoxcloud.xyz/stalker/telegram?username=${encodeURIComponent(username)}`;
    const { data } = await axios.get(apiUrl, { timeout: 30000 });

    if (!data?.status || !data?.result) {
      await react("❌");
      return message.send(
        `❌ *NOT FOUND*\n*INFO:* Username not found or the API is currently unavailable.`,
      );
    }

    const res = data.result;
    const caption = `*– ( TELEGRAM-STALK )*\n──────────────𔓕\n👤 *Name:* ${res.name || "-"}\n🏷️ *Username:* ${res.username || "-"}\n📂 *Type:* ${res.type || "-"}\n👥 *Subscribers:* ${res.extra || res.subscribers || "-"}\n🔗 *Link:* ${res.profile_url || "-"}\n\n📝 *Bio:*\n${res.bio || "-"}`;

    if (res.photo) {
      await message.conn.sendMessage(message.from, {
        image: { url: res.photo },
        caption,
      });
    } else {
      await message.conn.sendMessage(message.from, { text: caption });
    }

    await react("✅");
  } catch (error) {
    console.error("Telegram Stalk error:", error?.response?.data || error);
    await react("❌");
    return message.send(`❌ *ERROR:* ${error.message}`);
  }
});
