import { Jimp, JimpMime } from "jimp";
import { Module } from "../../lib/plugins.js";
import { detectPlatformName } from "../../lib/handier.js";

async function makeThumb(logger, sessionId) {
  try {
    const res = await fetch("https://files.catbox.moe/3n6es2.jpg");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const image = await Jimp.read(Buffer.from(await res.arrayBuffer()));
    image.resize({ w: 300, h: 300 });
    return await image.getBuffer(JimpMime.jpeg, { quality: 80 });
  } catch (e) {
    logger.debug({ sessionId }, `Welcome thumb error: ${e?.message}`);
    try {
      const blank = new Jimp({ width: 300, height: 300, color: 0x00000000 });
      return await blank.getBuffer(JimpMime.jpeg, { quality: 80 });
    } catch {
      return Buffer.alloc(0);
    }
  }
}

// One-time welcome (only first login)
Module({ on: "connected", name: "welcome" })(async (ctx) => {
  const { db, toBool, sessionId, sock, botjid, botNumber, config, logger } =
    ctx;

  if (toBool(db.get(sessionId, "login", false))) return;
  db.setHot(sessionId, "login", true);

  try {
    const prefix = config.prefix || ".";
    const start_msg = [
      `*╭━〔💫 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃〕━✦*`,
      `*┃🕊️ 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃 : ${botNumber}*`,
      `*┃💗 𝐏𝐑𝐄𝐅𝐈𝐗        : ${prefix}*`,
      `*┃🛡️ 𝐌𝐎𝐃𝐄        : public*`,
      `*┃✨ 𝐏𝐋𝐀𝐓𝐅𝐎𝐑𝐌    : ${detectPlatformName({ emoji: true })}*`,
      `*┃🌸 𝐕𝐄𝐑𝐒𝐈𝐎𝐍      : 2.1.3*`,
      `*╰━━━━━━━━━━━╯*`,
      ``,
      `*╭━〔🛠️ 𝗧𝗜𝗣𝗦〕━━━✦*`,
      `*┃✧ 𝐓𝐘𝐏𝐄 .menu 𝐓𝐎 𝐕𝐈𝐄𝐖 𝐀𝐋𝐋*`,
      `*┃✧ 𝐈𝐍𝐂𝐋𝐔𝐃𝐄𝐒 𝐅𝐔𝐍, 𝐆𝐀𝐌𝐄, 𝐒𝐓𝐘𝐋𝐄*`,
      `*╰━━━━━━━━━━╯*`,
      ``,
      `*╭━〔📞 𝗖𝗢𝗡𝗧𝗔𝗖𝗧〕━✦*`,
      `*┃🌚 𝐒𝐔𝐏𝐏𝐎𝐑𝐓    :* https://t.me/xmiku_chat`,
      `*╰━━━━━━━━━━━╯*`,
    ].join("\n");

    const thumb = await makeThumb(logger, sessionId);

    await sock.relayMessage(
      botjid,
      {
        buttonsMessage: {
          buttons: [
            {
              buttonId: ".public",
              buttonText: { displayText: "❤️‍🩹PUBLIC" },
              type: 1,
            },
            {
              buttonId: ".private",
              buttonText: { displayText: "🫣PRIVATE" },
              type: 1,
            },
          ],
          contentText: start_msg,
          footerText: "𝐓𝐇𝐀𝐍𝐊𝐒 𝐅𝐎𝐑 ♡ Miku 𝐂𝐇𝐎𝐎𝐒𝐈𝐍𝐆",
          contextInfo: {
            mentionedJid: [],
            groupMentions: [],
            statusAttributions: [],
          },
          headerType: 6,
          locationMessage: {
            degreesLatitude: 0,
            degreesLongitude: 0,
            name: `${botNumber} • Connected`,
            address: `• Type .menu see all command`,
            jpegThumbnail: thumb,
          },
          viewOnce: true,
        },
      },
      {
        additionalNodes: [
          {
            tag: "biz",
            attrs: {},
            content: [
              {
                tag: "interactive",
                attrs: { type: "native_flow", v: "1" },
                content: [
                  { tag: "native_flow", attrs: { v: "9", name: "mixed" } },
                ],
              },
            ],
          },
        ],
      },
    );
  } catch (e) {
    logger.debug({ sessionId }, `Welcome failed: ${e?.message}`);
  }
});

// Reset the login flag so the welcome message can be sent again after session deletion.
Module({ on: "session.deleted", name: "welcome-reset" })(async (ctx) => {
  try {
    ctx.db.setHot(ctx.sessionId, "login", false);
  } catch {}
});
