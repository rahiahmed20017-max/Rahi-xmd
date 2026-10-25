import axios from "axios";
import { Module } from "../../lib/plugins.js";

Module({
  command: "webzip",
  aliases: ["sitezip", "dlsite"],
  package: "downloader",
  description: "Download a website as a ZIP archive",
})(async (message, match) => {
  let url = (match || "").trim();

  if (!url) {
    const quoted =
      message.raw.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
      const text =
        quoted.conversation || quoted.extendedTextMessage?.text || "";
      const m = text.match(/https?:\/\/[^\s]+/);
      if (m) url = m[0];
    }
  }

  if (!url || !url.startsWith("http")) {
    return message.send(
      "❌ *Provide a website URL*\n➤ Example: .webzip https://example.com",
    );
  }

  await message.react("⏳");

  try {
    const apiUrl = `https://jerrycoder.oggyapi.workers.dev/tool/web2zip?url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl, {
      responseType: "arraybuffer",
      timeout: 60_000,
    });
    const zipBuffer = Buffer.from(response.data);

    const fileName = `website_${new URL(url).hostname}.zip`;

    await message.conn.sendMessage(
      message.from,
      {
        document: zipBuffer,
        mimetype: "application/zip",
        fileName,
        caption: `📦 *Website Source Code*\n🌐 ${url}`,
      },
      { quoted: message.raw },
    );

    await message.react("✅");
  } catch (err) {
    console.error("WEBZIP ERROR:", err.message);
    await message.react("❌");
    await message.send(
      "❌ *Failed to download website. Please try again later.*",
    );
  }
});
