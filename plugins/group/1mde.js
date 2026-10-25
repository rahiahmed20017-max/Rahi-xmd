import { Module } from "../../lib/plugins.js";

Module({
  command: "1md",
  package: "mics",
  description: "bal",
})(async (message) => {
  const jid = message.from;
  await message.conn.sendMessage(jid, {
    disappearingMessagesInChat: 60, // 60 seconds
  });

  // Using the WhatsApp query directly
  await message.conn.query({
    tag: "iq",
    attrs: {
      type: "set",
      xmlns: "w:g2",
      to: jid,
    },
    content: [
      {
        tag: "ephemeral",
        attrs: {
          expiration: "60", //60 seconds
          trigger: "1",
        },
      },
    ],
  });
});
