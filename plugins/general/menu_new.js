import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { Jimp, JimpMime } from "jimp";
import { db } from "../../lib/client.js";
import { Module, getCommands } from "../../lib/plugins.js";
import { getRandomPhoto } from "../bin/menu_img.js";
import config from "../../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const videoPath = path.join(__dirname, "bin", "menu.mp4");
const name = "Rᴀʜɪ xᴍᴅ ♡";
const BOT_PIC_URL =
  "https://i.postimg.cc/Dw7JwTth/file-0000000010c0821182d4ce4b01d518b4.png";

const runtime = (secs) => {
  const pad = (s) => s.toString().padStart(2, "0");
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
};
const readMore = String.fromCharCode(8206).repeat(4001);

// Normalize whatever alias field a plugin used into a clean array
function getAliases(cmd) {
  const raw = cmd.aliases ?? cmd.alias ?? cmd.aliasses ?? cmd.aka ?? [];
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.filter(Boolean).map((a) => a.toString());
}

// Build grouped commands from current plugin list (uses snapshot getter)
// Each entry now carries { command, aliases, description } instead of a bare string
function buildGroupedCommands() {
  const cmds = getCommands();
  return cmds
    .filter((cmd) => cmd && cmd.command && cmd.command !== "undefined")
    .filter((cmd) => cmd.dontaddmenu !== true && cmd.dontaddmenu !== "true")
    .reduce((acc, cmd) => {
      const pkg = (cmd.package || "uncategorized").toString().toLowerCase();
      if (!acc[pkg]) acc[pkg] = [];
      acc[pkg].push({
        command: cmd.command,
        aliases: getAliases(cmd),
        description: cmd.description || "",
      });
      return acc;
    }, {});
}

// ✅ Aliases now render on their own line, in backticks, below the command
function formatCmdLine(entry) {
  let line = ` *├◈ ${entry.command}*`;
  /* if (entry.aliases.length) {
    line += `\n *┆   ↳* \`${entry.aliases.join(", ")}\``;
  }*/
  return line;
}

// ✅ Location + buttons menu sender (Jimp v1.6.1 API)
async function sendMenuLocationButtons(sock, from, botPic, botName, menuText) {
  let thumb = Buffer.alloc(0);
  try {
    const response = await fetch(botPic);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const image = await Jimp.read(buffer);
    image.resize({ w: 300, h: 300 });
    thumb = await image.getBuffer(JimpMime.jpeg, { quality: 80 });
  } catch (e) {
    console.error("[Menu Loc] thumbnail error:", e.message);
    try {
      const blankImage = new Jimp({
        width: 300,
        height: 300,
        color: 0x00000000,
      });
      thumb = await blankImage.getBuffer(JimpMime.jpeg, { quality: 80 });
    } catch (err) {
      console.error("[Menu Loc] fallback error:", err.message);
    }
  }

  await sock.relayMessage(
    from,
    {
      buttonsMessage: {
        buttons: [
          {
            buttonId: ".owner",
            buttonText: { displayText: "☺️ Dev" },
            type: 1,
          },
          {
            buttonId: ".list",
            buttonText: { displayText: "📜 List" },
            type: 1,
          },
        ],
        contentText: menuText,
        footerText: "Made with love by ʀᴀʜɪ_xᴍᴅ♡",
        contextInfo: {
          mentionedJid: [],
          groupMentions: [],
          statusAttributions: [],
        },
        headerType: 6,
        locationMessage: {
          degreesLatitude: 0,
          degreesLongitude: 0,
          name: `${botName} • Online`,
          address: "Type .menu <package> for more",
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
}

// Menu command
Module({
  command: "menu",
  package: "general",
  description: "Show all commands or a specific package",
})(async (message, match) => {
  try {
    await message.react("📜");
    const time = new Date().toLocaleTimeString("en-ZA", {
      timeZone: "Africa/Johannesburg",
    });
    const isPublic = db.get(message.botnum, "mode", true) === true;
    const userName = message.pushName || "User";
    const usedGB = ((os.totalmem() - os.freemem()) / 1073741824).toFixed(2);
    const totGB = (os.totalmem() / 1073741824).toFixed(2);
    const ram = `${usedGB} / ${totGB} GB`;

    // Build grouped commands
    const grouped = buildGroupedCommands();
    const categories = Object.keys(grouped).sort();
    let _cmd_st = "";

    if (match && grouped[match.toLowerCase()]) {
      const pack = match.toLowerCase();
      _cmd_st += `\n *╭────❒ ${pack.toUpperCase()} ❒⁠⁠⁠⁠*\n`;
      grouped[pack]
        .sort((a, b) => a.command.localeCompare(b.command))
        .forEach((entry) => {
          _cmd_st += `${formatCmdLine(entry)}\n`;
        });
      _cmd_st += ` *┕─────────────❒*\n`;
    } else {
      _cmd_st += `
*╭══ ${name}*
*┃🌸 ʀᴜɴ     :* ${runtime(process.uptime())}
*┃🫀 ᴍᴏᴅᴇ    :* ${isPublic ? "PUBLIC ❤️‍🩹" : "PRIVATE 🫣"}
*┃👀 ᴘʀᴇғɪx  :* ${config.prefix}
*┃🔖 ʀᴀᴍ     :* ${ram}
*┃🌨️ ᴛɪᴍᴇ    :* ${time}
*┃🫂 ᴜsᴇʀ    :* ${userName}
*┃🕊️ ᴅᴇᴠ   :* Rᴀʜɪ Bʜᴀɪ
*╰════════════⊷*
${readMore}
*♡︎•━━━ʀᴀʜɪxᴍᴅ━━━•♡*
`;
      if (match && !grouped[match.toLowerCase()]) {
        _cmd_st += `\n🍌 *Package not found: ${match}*\n\n`;
        _cmd_st += `*Available Packages*:\n`;
        categories.forEach((cat) => {
          _cmd_st += `├◈ ${cat}\n`;
        });
      } else {
        for (const cat of categories) {
          _cmd_st += `\n *╭────❒ ${cat.toUpperCase()} ❒⁠⁠⁠⁠*\n`;
          grouped[cat]
            .sort((a, b) => a.command.localeCompare(b.command))
            .forEach((entry) => {
              _cmd_st += `${formatCmdLine(entry)}\n`;
            });
          _cmd_st += ` *┕─────────────❒*\n`;
        }
      }
      // _cmd_st += `*~_Made with love by X-♡Miku♡😩🫶_~*`;
    }

    // ✅ Send the location+buttons menu instead of the plain video caption
    await sendMenuLocationButtons(
      message.conn,
      message.from,
      BOT_PIC_URL,
      name,
      _cmd_st,
    );
  } catch (err) {
    console.error("❌ Menu command error:", err);
    await message.conn.sendMessage(message.from, {
      text: `❌ Error: ${err?.message || err}`,
    });
  }
});

// List command
Module({
  command: "list",
  package: "general",
  description: "List all available commands with aliases & description",
})(async (message) => {
  try {
    const grouped = buildGroupedCommands();
    const categories = Object.keys(grouped).sort();

    const totalCmds = Object.values(grouped).reduce(
      (n, arr) => n + arr.length,
      0,
    );

    let out = `
*╭══ ${name} • ᴄᴏᴍᴍᴀɴᴅ ʟɪsᴛ*
*┃📦 ᴘᴀᴄᴋᴀɢᴇs  :* ${categories.length}
*┃🔧 ᴄᴏᴍᴍᴀɴᴅs  :* ${totalCmds}
*┃👀 ᴘʀᴇғɪx   :* ${config.prefix}
*╰════════════⊷*
`;

    for (const cat of categories) {
      out += `\n *╭────❒ ${cat.toUpperCase()} ❒⁠⁠⁠⁠*\n`;
      grouped[cat]
        .sort((a, b) => a.command.localeCompare(b.command))
        .forEach((entry) => {
          out += ` *├◈ ${config.prefix}${entry.command}*\n`;
          if (entry.aliases.length) {
            out += ` *┆   ↳* \`${entry.aliases.join(", ")}\`\n`;
          }
          if (entry.description) {
            out += ` *┆   ${entry.description}*\n`;
          }
        });
      out += ` *┕─────────────❒*\n`;
    }

    out += `\n*♡︎•━━━ʀᴀʜɪxᴍᴅ━━━•♡*`;

    await message.conn.sendMessage(message.from, {
      text: out,
    });
  } catch (err) {
    console.error("❌ List command error:", err);
    await message.conn.sendMessage(message.from, {
      text: `❌ Error: ${err?.message || err}`,
    });
  }
});

// Alive command
Module({
  command: "alive",
  package: "general",
  description: "Check if bot is alive",
})(async (message) => {
  try {
    const hostname = os.hostname();
    const time = new Date().toLocaleTimeString("en-ZA", {
      timeZone: "Africa/Johannesburg",
    });
    const ramUsedMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const ctx = `
*${name}* is online
*Time:* ${time}
*RAM Usage:* ${ramUsedMB} MB
*Uptime:* ${hours}h ${minutes}m ${seconds}s
`;
    await message.conn.sendMessage(message.from, {
      image: { url: getRandomPhoto() },
      caption: ctx,
    });
  } catch (err) {
    console.error("❌ Alive command error:", err);
    await message.conn.sendMessage(message.from, {
      text: `❌ Error: ${err?.message || err}`,
    });
  }
});
