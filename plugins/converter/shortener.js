import axios from "axios";
import { Module } from "../../lib/plugins.js";
import pkg from "gifted-btns";
const { sendButtons } = pkg;

// Configure the URL-shortener API endpoint and key here.
const GIFTED_API = "https://api.gifted.co.ke";
const GIFTED_KEY = "gifted";

const shorteners = [
  {
    pattern: "tinyurl",
    aliases: ["tiny"],
    name: "TinyURL",
    endpoint: "tinyurl",
  },
  {
    pattern: "cleanuri",
    aliases: ["cleanurl", "clean"],
    name: "CleanURI",
    endpoint: "cleanuri",
  },
  { pattern: "vgd", aliases: ["vgdurl"], name: "v.gd", endpoint: "vgd" },
  {
    pattern: "rebrandly",
    aliases: ["rebrand"],
    name: "Rebrandly",
    endpoint: "rebrandly",
  },
  { pattern: "vurl", aliases: ["vurlshort"], name: "vURL", endpoint: "vurl" },
  {
    pattern: "adfoc",
    aliases: ["adfocus"],
    name: "AdFoc.us",
    endpoint: "adfoc",
  },
  { pattern: "ssur", aliases: ["shorte"], name: "Shorte.st", endpoint: "ssur" },
];

// Register one command for each configured URL shortener.
shorteners.forEach((shortener) => {
  Module({
    command: shortener.pattern,
    aliases: shortener.aliases,
    package: "tools",
    description: `Shorten a URL using ${shortener.name}`,
  })(async (message, match) => {
    const sock = message.conn;
    const react = async (emoji) =>
      await sock.sendMessage(message.from, {
        react: { text: emoji, key: message.key },
      });
    const botPrefix = message.prefix || ".";
    const botFooter = message.botFooter || "URL SHORTENER";

    if (!match || match.trim() === "") {
      return message.send(
        `❌ Please provide a URL to shorten.\n\n*Usage:* ${botPrefix}${shortener.pattern} <url>\n*Example:* ${botPrefix}${shortener.pattern} https://example.com`,
      );
    }

    const url = match.trim();

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      await react("❌");
      return message.send(
        `❌ Invalid URL. Please provide a valid URL starting with http:// or https://`,
      );
    }

    await react("⏳");

    try {
      const res = await axios.get(
        `${GIFTED_API}/api/tools/${shortener.endpoint}`,
        {
          params: {
            apikey: GIFTED_KEY,
            url: url,
          },
          timeout: 30000,
        },
      );

      if (!res.data?.success || !res.data?.result) {
        await react("❌");
        return message.send(
          `❌ Failed to shorten URL using ${shortener.name}. Try again later.`,
        );
      }

      const shortUrl = res.data.result;

      await sendButtons(sock, message.from, {
        title: "",
        text: `🔗 *URL SHORTENER*\n\n📎 *Original:* ${url}\n✂️ *Shortened:* ${shortUrl}`,
        footer: botFooter,
        buttons: [
          {
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
              display_text: "📋 Copy Short URL",
              copy_code: shortUrl,
            }),
          },
        ],
      });

      await react("🔗");
    } catch (e) {
      await react("❌");
      return message.send(`❌ Failed to shorten URL: ${e.message}`);
    }
  });
});

// Register the help command that lists all available shorteners.
Module({
  command: "shortener",
  aliases: ["shorteners", "shortenhelp", "urlshort"],
  package: "tools",
  description: "Show all available URL shorteners",
})(async (message, match) => {
  const botPrefix = message.prefix || ".";

  const helpText = `🔗 *URL SHORTENER COMMANDS*

Available shorteners:

*${botPrefix}tinyurl* / *${botPrefix}tiny* - TinyURL
*${botPrefix}cleanuri* / *${botPrefix}clean* - CleanURI
*${botPrefix}vgd* - v.gd
*${botPrefix}rebrandly* / *${botPrefix}rebrand* - Rebrandly
*${botPrefix}vurl* - vURL
*${botPrefix}adfoc* - AdFoc.us
*${botPrefix}ssur* - Shorte.st

*Usage:* ${botPrefix}<command> <url>
*Example:* ${botPrefix}tinyurl https://example.com`;

  return message.send(helpText);
});
