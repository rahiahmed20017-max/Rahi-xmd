import { Module } from "../../lib/plugins.js";
import gifted from "gifted-btns";

Module({
  command: "checkid",
  aliases: ["cekid", "getid", "id"],
  package: "info",
  description: "Get WhatsApp Group or Channel ID from invite link",
})(async (message, match) => {
  try {
    const { sendButtons } = gifted;
    if (!match) {
      return message.send(
        "❌ Send wp channel/group link 🔗 \n\nExample:\n.checkid https://chat.whatsapp.com/xxxx",
      );
    }
    await message.react("⌛");
    const linkMatch = match.match(
      /https?:\/\/(chat\.whatsapp\.com|whatsapp\.com\/channel)\/[^\s]+/i,
    );

    if (!linkMatch) {
      await message.react("❌");
      return message.send("❌ send WhatsApp group / channel link");
    }
    const link = linkMatch[0];
    const url = new URL(link);
    // Resolve a safe target JID once, use everywhere below
    const targetJid = message.jid || message.key?.remoteJid || message.chat;
    console.log("Resolved targetJid:", targetJid);
    if (!targetJid) {
      await message.react("❌");
      return message.send("⚠️ Could not resolve chat JID (check console log)");
    }

    // ================= GROUP =================
    if (url.hostname === "chat.whatsapp.com") {
      const code = url.pathname.replace("/", "");
      const res = await message.client.groupGetInviteInfo(code);
      const id = res.id;
      await message.react("✅");
      return await sendButtons(message.client, targetJid, {
        title: "📊 Group Link Analysis",
        text: `🔗 *Link:* ${link}\n🆔 *Group ID:*\n\`${id}\``,
        footer: "Powered by Rᴀʜɪ 🤧❤️‍🩹",
        buttons: [
          {
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
              display_text: "📋 Copy Group ID",
              copy_code: id,
            }),
          },
          {
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
              display_text: "🔗 Open Group Link",
              url: link,
            }),
          },
        ],
      });
    }

    // ================= CHANNEL =================
    if (url.pathname.startsWith("/channel/")) {
      const code = url.pathname.split("/channel/")[1];
      console.log("Channel invite code:", code);
      const res = await message.client.newsletterMetadata(
        "invite",
        code,
        "GUEST",
      );
      const id = res.id;
      await message.react("✅");
      return await sendButtons(message.client, targetJid, {
        title: "📢 Channel Link Analysis",
        text: `🔗 *Link:* ${link}\n🆔 *Channel ID:*\n\`${id}\``,
        footer: "Powered by Rᴀʜɪ 🤧❤️‍🩹",
        buttons: [
          {
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
              display_text: "📋 Copy Channel ID",
              copy_code: id,
            }),
          },
          {
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
              display_text: "🔗 Open Channel Link",
              url: link,
            }),
          },
        ],
      });
    }

    await message.react("❌");
    message.send("❌ Unsupported WhatsApp link");
  } catch (err) {
    console.error("========== [CKID FULL ERROR] ==========");
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    console.error("========================================");
    await message.react("❌");
    message.send("⚠️ Link invalid — check console for full debug log");
  }
});
