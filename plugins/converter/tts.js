import { Module } from "../../lib/plugins.js";

Module({
  command: "tts",
  alias: ["say", "voice"],
  package: "utility",
  description: "Text To Speech",
})(async (message, match) => {
  let text = (match || "").trim();

  // Quoted text support
  if (!text) {
    const quoted =
      message.raw.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    text = quoted?.conversation || quoted?.extendedTextMessage?.text || "";
  }

  if (!text) {
    return message.send("❌ *Give text*\n\nExample:\n.tts Hello Bro");
  }

  try {
    await message.react("⏳");

    let lang = "en";

    // Malayalam detect
    if (/[\u0D00-\u0D7F]/.test(text)) lang = "ml";

    // Optional language tag: .tts {ja} konnichiwa
    const langMatch = text.match(/\{([a-z]{2})\}/i);
    if (langMatch) {
      lang = langMatch[1];
      text = text.replace(langMatch[0], "").trim();
    }

    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    if (!audioBuffer || audioBuffer.length < 1000) {
      throw new Error("Invalid audio received");
    }

    await message.conn.sendMessage(
      message.from,
      { audio: audioBuffer, mimetype: "audio/mpeg" },
      { quoted: message.raw },
    );

    await message.react("✅");
  } catch (err) {
    console.log("TTS ERROR:", err?.message || err);
    await message.react("❌");
    await message.send("❌ TTS Failed");
  }
});
