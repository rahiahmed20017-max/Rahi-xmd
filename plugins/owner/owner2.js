import { Module } from "../../lib/plugins.js";
import config from "../../config.js";
import { S_WHATSAPP_NET } from "@whiskeysockets/baileys";
import { Jimp } from "jimp";
import moment from "moment-timezone";

// ─── Owner ────────────────────────────────────────────────────────────────────

Module({
  command: "owner",
  package: "owner",
  description: "Get Bot Owners",
})(async (message) => {
  try {
    const owners = [
      {
        number: " 8801889294014",
        name: "ᴍᴏʜᴀᴍᴍᴀᴅ ʀᴀʜɪ",
      },
      {
        number: "8801711209381",
        name: "Rᴀʜɪ ʙʜᴀɪ",
      },
    ];

    const contacts = owners.map(({ number, name }) => ({
      vcard:
        "BEGIN:VCARD\n" +
        "VERSION:3.0\n" +
        `FN:${name}\n` +
        `ORG:Rᴀʜɪ_xᴍᴅ;\n` +
        `TEL;type=CELL;type=VOICE;waid=${number}:${number}\n` +
        "END:VCARD",
    }));

    await message.conn.sendMessage(
      message.from,
      {
        contacts: {
          displayName: "Bot Owners",
          contacts,
        },
      },
      { quoted: message.raw },
    );
  } catch (error) {
    await message.send(`❌ Failed: ${error.message}`);
  }
});

// ─── Set group profile picture (full, no crop) ────────────────────────────────

Module({
  command: "fullgcpp",
  aliases: ["setgcpp", "gcfullpp", "gpp"],
  package: "group",
  description: "Set group full profile picture without cropping",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) {
      return message.send("Wrong place. This command works in groups only! 🍀");
    }
    if (!message.isAdmin) {
      return message.send("This command is only for group admins! 🍉");
    }

    const isImage = message.quoted?.type === "imageMessage";
    if (!isImage) {
      await message.react("❌");
      return message.send("Please quote an image");
    }

    const buffer = await message.quoted.download();
    const image = await Jimp.read(buffer);
    image.crop({ x: 0, y: 0, w: image.width, h: image.height });
    image.scaleToFit({ w: 720, h: 720 });
    const imageBuffer = await image.getBuffer("image/jpeg");

    const iqNode = {
      tag: "iq",
      attrs: {
        to: S_WHATSAPP_NET,
        type: "set",
        xmlns: "w:profile:picture",
        target: message.from,
      },
      content: [
        { tag: "picture", attrs: { type: "image" }, content: imageBuffer },
      ],
    };

    await message.conn.query(iqNode);
    await message.send(
      "✅ Group Profile picture updated successfully (full image)!",
    );
  } catch (error) {
    console.error("Error updating group profile picture:", error);
    await message.react("❌");

    if (
      error.message?.includes("not-authorized") ||
      error.message?.includes("forbidden")
    ) {
      await message.send(
        "❌ I need to be an admin to update group profile picture!",
      );
    } else {
      await message.send(
        `❌ Failed to update group profile picture: ${error.message}`,
      );
    }
  }
});

// ─── Set bot's own profile picture (full, no crop) ────────────────────────────

Module({
  command: "fullpp",
  aliases: ["setfullpp"],
  package: "owner",
  description: "Set bot's full profile picture without cropping",
})(async (message) => {
  try {
    if (!message.isfromMe) {
      return message.send("This area is reserved for the bot owner only. 🕷️");
    }

    const isImage = message.quoted?.type === "imageMessage";
    if (!isImage) return message.send("Please quote an image");

    const buffer = await message.quoted.download();
    const image = await Jimp.read(buffer);
    image.crop({ x: 0, y: 0, w: image.width, h: image.height });
    image.scaleToFit({ w: 720, h: 720 });
    const imageBuffer = await image.getBuffer("image/jpeg");

    const iqNode = {
      tag: "iq",
      attrs: { to: S_WHATSAPP_NET, type: "set", xmlns: "w:profile:picture" },
      content: [
        { tag: "picture", attrs: { type: "image" }, content: imageBuffer },
      ],
    };

    await message.conn.query(iqNode);
    await message.send("✅ Profile picture updated successfully (full image)!");
  } catch (error) {
    console.error("Error updating profile picture:", error);
    await message.react("❌");
    await message.send(`❌ Failed to update profile picture: ${error.message}`);
  }
});

// ─── Whois ────────────────────────────────────────────────────────────────────

Module({
  command: "whois",
  aliases: ["profile"],
  package: "owner",
  description: "Get someone's full profile details",
})(async (message) => {
  try {
    if (!message.isfromMe) {
      return message.send("This area is reserved for the bot owner only. 🕷️");
    }

    await message.loadGroupInfo().catch(() => {});

    let targetUser =
      message.quoted?.participant || message.quoted?.sender || null;
    if (!targetUser) {
      return message.send("Reply to a user/message!");
    }

    // Convert LID to JID if needed
    if (
      message.isGroup &&
      targetUser &&
      !targetUser.endsWith("@s.whatsapp.net")
    ) {
      try {
        const jid = await message.conn.getJidFromLid(targetUser);
        if (jid) targetUser = jid;
      } catch {}
    }

    let profilePictureUrl = null;
    let statusText = "Not Found";
    let setAt = null;

    try {
      profilePictureUrl = await message.conn.profilePictureUrl(
        targetUser,
        "image",
      );
    } catch {}

    try {
      const statusData = await message.conn.fetchStatus(targetUser);
      if (statusData && statusData.length > 0 && statusData[0].status) {
        statusText = statusData[0].status.status || "Not Found";
        const rawSetAt = statusData[0].status.setAt;
        if (rawSetAt) {
          setAt =
            rawSetAt instanceof Date
              ? rawSetAt.getTime()
              : typeof rawSetAt === "number"
                ? rawSetAt < 1e12
                  ? rawSetAt * 1000
                  : rawSetAt
                : new Date(rawSetAt).getTime();
        }
      }
    } catch {}

    let formattedDate = "Not Available";
    if (setAt) {
      try {
        const tz = config.TIME_ZONE || "Africa/Nairobi";
        formattedDate = moment(setAt)
          .tz(tz)
          .format("dddd, MMMM Do YYYY, h:mm A z");
      } catch {}
    }

    const number = targetUser.replace(/@s\.whatsapp\.net$/, "");

    const text = `*👤 User Profile Information*

*• User:* @${number}
*• Number:* ${number}
*• Jid:* ${targetUser}
*• About:* ${statusText}
*• Last Updated:* ${formattedDate}`;

    if (profilePictureUrl) {
      await message.conn.sendMessage(
        message.from,
        {
          image: { url: profilePictureUrl },
          caption: text,
          mentions: [targetUser],
        },
        { quoted: message.raw },
      );
    } else {
      await message.conn.sendMessage(
        message.from,
        { text, mentions: [targetUser] },
        { quoted: message.raw },
      );
    }
  } catch (error) {
    console.error("Error in whois command:", error);
    await message.react("❌");
    return message.send(`❌ Error fetching profile info.\n${error.message}`);
  }
});

//─── Set profile picture (standard, cropped) ──────────────────────────────────

Module({
  command: "pp",
  aliases: ["setpp"],
  package: "owner",
  description: "Set new profile picture",
})(async (message) => {
  try {
    if (!message.isfromMe) {
      return message.send("This area is reserved for the bot owner only. 🕷️");
    }

    const isImage = message.quoted?.type === "imageMessage";
    if (!isImage) return message.send("Please quote an image");

    const buffer = await message.quoted.download();

    try {
      await message.conn.updateProfilePicture(message.conn.user.id, buffer);
      await message.send("Profile picture updated successfully!");
    } catch (modernError) {
      console.log("Modern method failed, trying legacy method...");

      const iq = {
        tag: "iq",
        attrs: { to: S_WHATSAPP_NET, type: "set", xmlns: "w:profile:picture" },
        content: [{ tag: "picture", attrs: { type: "image" }, content: buffer }],
      };

      await message.conn.query(iq);
      await message.send("Profile picture update requested (legacy method)");
    }
  } catch (error) {
    console.error("Error updating profile picture:", error);
    await message.react("❌");
    await message.send(`❌ An error occurred: ${error.message}`);
  }
});

// ─── Steal a user's profile picture ────────────────────────────────────────────

Module({
  command: "getpp",
  aliases: ["stealpp", "snatchpp", "gp"],
  package: "owner",
  description: "Download someone's profile picture",
})(async (message) => {
  try {
    if (!message.isfromMe) {
      return message.send("This area is reserved for the bot owner only. 🕷️");
    }

    const quoted = message.quoted;
    if (!quoted) {
      return message.send("Please reply to/quote a user to get their profile picture!");
    }

    const quotedUser = quoted.participant || quoted.sender;

    let profilePictureUrl;
    try {
      profilePictureUrl = await message.conn.profilePictureUrl(quotedUser, "image");
    } catch (error) {
      await message.react("❌");
      return message.send("User does not have profile picture or they have set it to private!");
    }

    await message.conn.sendMessage(
      message.from,
      {
        image: { url: profilePictureUrl },
        caption: "🖼️ *Here is the Profile Picture*",
        contextInfo: {
          mentionedJid: [quotedUser],
          forwardingScore: 5,
          isForwarded: false,
          forwardedNewsletterMessageInfo: {
            newsletterJid: config.NEWSLETTER_JID,
            newsletterName: config.BOT_NAME,
            serverMessageId: 143,
          },
        },
      },
      { quoted: message.raw }
    );
  } catch (error) {
    console.error("Error processing profile picture:", error);
    await message.react("❌");
    await message.send("❌ An error occurred while fetching the profile picture.");
  }
});
*/
// ─── Get group's profile picture ───────────────────────────────────────────────

Module({
  command: "getgcpp",
  aliases: ["stealgcpp", "snatchgcpp", "gcgp"],
  package: "group",
  description: "Download group profile picture",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) {
      return message.send("❌ This command only works in groups!");
    }

    let profilePictureUrl;
    try {
      profilePictureUrl = await message.conn.profilePictureUrl(
        message.from,
        "image",
      );
    } catch (error) {
      return message.send("❌ This group has no profile picture set!");
    }

    await message.conn.sendMessage(
      message.from,
      {
        image: { url: profilePictureUrl },
        caption: "🖼️ *Group Profile Picture*",
        contextInfo: {
          forwardingScore: 5,
          isForwarded: false,
          forwardedNewsletterMessageInfo: {
            newsletterJid: config.NEWSLETTER_JID,
            newsletterName: config.BOT_NAME,
            serverMessageId: 143,
          },
        },
      },
      { quoted: message.raw },
    );
  } catch (error) {
    console.error("getgcpp error:", error);
    await message.react("❌");
    await message.send(`❌ Failed to get group picture: ${error.message}`);
  }
});
