import fs from "fs-extra";
import path from "path";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { Module } from "../../lib/plugins.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── config ──────────────────────────────────────────────────
const MAX_NUMBERS = 3000;
const EXISTS_BATCH_SIZE = 75;
const EXISTS_BATCH_DELAY_MS = 600;

const BIZ_CONCURRENCY = 8;
const BIZ_DELAY_MS = 200;

const GROUPED_INLINE_LIMIT = 500;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Helpers ─────────────────────────────────────────────────
function normalizeUserJid(jid) {
  if (!jid || typeof jid !== "string") return "";
  let normalized = jid.split(":")[0].split("/")[0];
  if (!normalized.includes("@")) normalized += "@s.whatsapp.net";
  return normalized;
}

function extractNumbersFromText(text) {
  if (!text || typeof text !== "string") return [];
  const tokens = text.split(/[\s,;]+/);
  const seen = new Set();
  const out = [];
  for (const t of tokens) {
    const digits = t.replace(/[^0-9]/g, "");
    if (digits.length >= 7 && digits.length <= 15 && !seen.has(digits)) {
      seen.add(digits);
      out.push(digits);
    }
  }
  return out;
}

function extractTextFromQuotedContent(quotedMsg) {
  if (!quotedMsg || typeof quotedMsg !== "object") return "";
  if (quotedMsg.conversation) return quotedMsg.conversation;
  if (quotedMsg.extendedTextMessage?.text)
    return quotedMsg.extendedTextMessage.text;
  if (quotedMsg.imageMessage?.caption) return quotedMsg.imageMessage.caption;
  if (quotedMsg.videoMessage?.caption) return quotedMsg.videoMessage.caption;
  if (quotedMsg.documentMessage?.caption)
    return quotedMsg.documentMessage.caption;
  return "";
}

async function tryDownloadDocumentText(sock, mek, quotedMsg, quotedKey) {
  const candidates = [];
  if (mek?.message?.documentMessage) candidates.push(mek);

  if (quotedMsg) {
    if (quotedMsg.documentMessage) {
      candidates.push({ key: quotedKey || mek?.key || {}, message: quotedMsg });
    } else if (quotedMsg.message?.documentMessage) {
      candidates.push(quotedMsg);
    } else if (quotedMsg.documentWithCaptionMessage?.message?.documentMessage) {
      candidates.push({ key: quotedKey || mek?.key || {}, message: quotedMsg });
    }
  }

  for (const candidate of candidates) {
    try {
      const buffer = await downloadMediaMessage(
        candidate,
        "buffer",
        {},
        { logger: console },
      );
      if (buffer?.length) return buffer.toString("utf8");
    } catch (e) {}
  }
  return null;
}

async function checkExistenceBatch(sock, numbers) {
  try {
    const results = await sock.onWhatsApp(...numbers);
    const map = new Map();
    for (const r of results || []) {
      if (!r?.jid) continue;
      const plain = r.jid.split("@")[0].split(":")[0];
      map.set(plain, { exists: !!r.exists, jid: normalizeUserJid(r.jid) });
    }
    return numbers.map(
      (n) => map.get(n) || { exists: false, jid: null, error: true },
    );
  } catch (e) {
    return numbers.map(() => ({ exists: false, jid: null, error: true }));
  }
}

async function detectAccountType(sock, jid) {
  try {
    const profile = await sock.getBusinessProfile(jid);
    const isBusiness = !!(
      profile &&
      (profile.description ||
        profile.category ||
        profile.website ||
        profile.email)
    );
    return isBusiness ? "Business" : "Personal";
  } catch (e) {
    return "Personal";
  }
}

function buildGroupedSection(title, emoji, numbers) {
  if (!numbers.length) return "";
  return `\n──────────────\n${emoji} *${title.toUpperCase()} (${numbers.length})*\n\n${numbers.map((n) => `• ${n}`).join("\n")}`;
}

function buildReport(existResults, truncated, maxCap) {
  const registered = existResults.filter((r) => r.exists && r.jid);
  const businessNums = registered
    .filter((r) => r.type === "Business")
    .map((r) => r.number);
  const personalNums = registered
    .filter((r) => r.type === "Personal")
    .map((r) => r.number);
  const notFoundCount = existResults.length - registered.length;

  const summary = `*– ( WHATSAPP-CHECK )*\n──────────────𔓕\n📊 *Checked* • ${existResults.length}${truncated ? ` (Max ${maxCap})` : ""}\n✅ *Registered* • ${registered.length}\n🏢 *Business* • ${businessNums.length}\n👤 *Personal* • ${personalNums.length}\n❌ *Not Registered* • ${notFoundCount}`;
  const businessSection = buildGroupedSection("Business", "🏢", businessNums);
  const personalSection = buildGroupedSection("Personal", "👤", personalNums);

  return {
    text: `${summary}${businessSection}${personalSection}`,
    registeredCount: registered.length,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CHECK NUMBER (ONWA)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "checknumber",
  aliases: ["checkwa"],
  package: "utility",
  description:
    "Bulk-check phone numbers for WhatsApp registration + account type",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });
  const botPrefix = message.prefix || ".";

  const quotedMsg = message.quoted ? message.quoted.message : null;
  const quotedKey = message.quoted ? message.quoted.key : null;

  let rawText = (match || "").trim();

  if (!rawText) {
    const docText = await tryDownloadDocumentText(
      sock,
      message,
      quotedMsg,
      quotedKey,
    );
    if (docText) rawText = docText;
  }

  if (!rawText) {
    rawText = extractTextFromQuotedContent(quotedMsg).trim();
  }

  let numbers = extractNumbersFromText(rawText);

  if (!numbers.length) {
    return await sock.sendMessage(
      message.from,
      {
        text: `❌ *NO VALID NUMBERS FOUND*\n\n*USAGE:*\n> ${botPrefix}onwa 923001234567\n> ${botPrefix}onwa 923001234567,923001234568\n> *Reply to a message containing numbers*\n> *Reply to a* \`.txt\` *or* \`.csv\` *file*\n\n*NOTE:*\n> \`Country Code\` *- Required*\n> \`Format\` *- Digits Only*\n> \`Example\` *- 923001234567*`,
      },
      { quoted: message },
    );
  }

  let truncated = false;
  if (numbers.length > MAX_NUMBERS) {
    numbers = numbers.slice(0, MAX_NUMBERS);
    truncated = true;
  }

  await react("⏳");
  await sock.sendMessage(
    message.from,
    { text: `⏳ Checking \`${numbers.length}\` number(s)...` },
    { quoted: message },
  );

  const existResults = [];
  for (let i = 0; i < numbers.length; i += EXISTS_BATCH_SIZE) {
    const chunk = numbers.slice(i, i + EXISTS_BATCH_SIZE);
    const chunkResults = await checkExistenceBatch(sock, chunk);
    chunk.forEach((num, idx) => {
      existResults.push({ number: num, ...chunkResults[idx] });
    });
    if (i + EXISTS_BATCH_SIZE < numbers.length)
      await sleep(EXISTS_BATCH_DELAY_MS);
  }

  const registered = existResults.filter((r) => r.exists && r.jid);

  for (let i = 0; i < registered.length; i += BIZ_CONCURRENCY) {
    const chunk = registered.slice(i, i + BIZ_CONCURRENCY);
    await Promise.all(
      chunk.map(async (r) => {
        r.type = await detectAccountType(sock, r.jid);
      }),
    );
    if (i + BIZ_CONCURRENCY < registered.length) await sleep(BIZ_DELAY_MS);
  }

  const { text: reportText, registeredCount } = buildReport(
    existResults,
    truncated,
    MAX_NUMBERS,
  );

  if (registeredCount <= GROUPED_INLINE_LIMIT) {
    await react("✅");
    return await sock.sendMessage(
      message.from,
      { text: reportText },
      { quoted: message },
    );
  }

  const tempDir = path.join(__dirname, "..", "temp");
  await fs.ensureDir(tempDir);
  const filePath = path.join(tempDir, `onwa_results_${Date.now()}.txt`);
  await fs.writeFile(filePath, reportText.replace(/\*/g, ""));

  try {
    await sock.sendMessage(
      message.from,
      {
        document: { url: filePath },
        mimetype: "text/plain",
        fileName: "onwa_results.txt",
        caption: `📊 *STATUS:* \`COMPLETE\`\n\n*DETAILS:*\n> \`Registered\` • ${registeredCount}\n> \`Output\` • Full report attached\n\n✅ *Download the attached file to view all results.*`,
      },
      { quoted: message },
    );
    await react("✅");
  } finally {
    fs.unlink(filePath).catch(() => {});
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  VCF (EXPORT GROUP CONTACTS)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module({
  command: "vcf",
  aliases: ["contacts", "savecontact"],
  package: "group",
  description: "Export all group participants as VCF contact file",
})(async (message, match) => {
  const sock = message.conn;
  const react = async (emoji) =>
    await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key },
    });

  if (!message.isGroup) {
    await react("❌");
    return message.send("❌ This command only works in groups.");
  }

  await react("⏳");

  try {
    // Direct method without getGroupMetadata cache helper
    const groupMetadata = await sock.groupMetadata(message.from);
    const participants = groupMetadata?.participants || [];
    const groupName = groupMetadata?.subject || "Group";

    if (participants.length === 0) {
      await react("❌");
      return message.send("❌ No participants found in this group.");
    }

    let vcfContent = "";
    let index = 1;

    for (const member of participants) {
      const jid = member.id || member.jid;
      if (!jid || typeof jid !== "string") continue;

      const phoneJid = jid.includes("@s.whatsapp.net")
        ? jid
        : normalizeUserJid(jid);
      if (!phoneJid || !phoneJid.includes("@s.whatsapp.net")) continue;

      const id = phoneJid.split("@")[0];
      vcfContent += `BEGIN:VCARD\nVERSION:3.0\nFN:[${index++}] +${id}\nTEL;type=CELL;type=VOICE;waid=${id}:+${id}\nEND:VCARD\n`;
    }

    const count = index - 1;

    if (count === 0) {
      await react("❌");
      return message.send(
        "❌ Could not extract any valid contacts from this group.",
      );
    }

    const fileName = `${groupName.replace(/[^a-zA-Z0-9\s]/g, "")}_Contacts.vcf`;

    await sock.sendMessage(
      message.from,
      {
        document: Buffer.from(vcfContent.trim(), "utf-8"),
        mimetype: "text/vcard",
        fileName: fileName,
        caption: `Done saving.\nGroup Name: *${groupName}*\nContacts: *${count}*`,
      },
      { quoted: message },
    );

    await react("✅");
  } catch (err) {
    console.error("VCF Error:", err);
    await react("❌");
    return message.send(`❌ Failed to export contacts: ${err.message}`);
  }
});
