import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import {
  getContentType,
  downloadContentFromMessage,
  jidNormalizedUser,
  extractMessageContent,
} from "@whiskeysockets/baileys";
import config from "../config.js";

// ── Config constants ──────────────────────────────────────────────────────────
const num = (k, d) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

const CLEANUP_MS = num("SERIALIZER_RAW_TTL_MS", 65_000); // 0 = disable
const MAX_BODY_LENGTH = num("SERIALIZER_MAX_BODY_LEN", 2_000);
const METADATA_TTL = num("SERIALIZER_METADATA_TTL_MS", 60_000);
const METADATA_NEG_TTL = 5_000; // Cache failed metadata lookups briefly to avoid repeated requests.
const MAX_METADATA_CACHE_ENTRIES = num("SERIALIZER_METADATA_CACHE_MAX", 3_000);
const META_FETCH_CONCURRENCY = Math.max(
  1,
  num("SERIALIZER_META_CONCURRENCY", 10),
);
const MAX_DOWNLOAD_BYTES = num(
  "SERIALIZER_MAX_DOWNLOAD_BYTES",
  50 * 1024 * 1024,
); // 0 = no limit
const IMG_CONCURRENCY = Math.max(1, num("SERIALIZER_IMG_CONCURRENCY", 2));
const GIFT_NAME = config.giftname || "x-miku";

// ── Tiny semaphore (slot hand-off, no over-admit race) ────────────────────────
class Semaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.q = [];
  }
  async run(fn) {
    if (this.active >= this.max) await new Promise((r) => this.q.push(r));
    else this.active++;
    try {
      return await fn();
    } finally {
      const next = this.q.shift();
      if (next)
        next(); // Hand the released slot directly to the next waiter.
      else this.active--;
    }
  }
}

// ── JID helpers (decode-free, fast) ───────────────────────────────────────────

/** "1234:12@s.whatsapp.net" / "1234_1:3@lid" → "1234" */
function userPart(jid) {
  if (!jid || typeof jid !== "string") return "";
  const at = jid.indexOf("@");
  const left = at === -1 ? jid : jid.slice(0, at);
  return left.split(":")[0].split("_")[0];
}

function sameUser(a, b) {
  const x = userPart(a);
  return !!x && x === userPart(b);
}

/** Safe jidNormalizedUser — never throws on empty/null input. */
function safeJid(jid) {
  try {
    return jid ? jidNormalizedUser(jid) : "";
  } catch {
    return "";
  }
}

// ── Gift (fake quoted contact) — per-phone cache ──────────────────────────────

function phoneFromConn(conn) {
  return (conn?.user?.id || "").split("@")[0].split(":")[0];
}

function makeGift(phone, name = GIFT_NAME) {
  return Object.freeze({
    key: {
      fromMe: false,
      participant: `${phone}@s.whatsapp.net`,
      remoteJid: "status@broadcast",
    },
    message: {
      contactMessage: {
        displayName: name,
        vcard: [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `N:;${name};;`,
          `FN:${name}`,
          `item1.TEL;waid=${phone}:${phone}`,
          "item1.X-ABLabel:WhatsApp",
          "END:VCARD",
        ].join("\n"),
      },
    },
  });
}

const _giftCache = new Map(); // phone → frozen gift
function getGift(phone) {
  let g = _giftCache.get(phone);
  if (!g) {
    g = makeGift(phone);
    _giftCache.set(phone, g);
  }
  return g;
}

// Legacy static export; in multi-session mode it reflects the most recently serialized session.
// Prefer `m.gift` in plugins, which returns a cached value without rebuilding it on each access.
let _legacyPhone = "";
const gift = new Proxy(
  {},
  {
    get: (_, prop) => getGift(_legacyPhone)[prop],
    has: (_, prop) => prop in getGift(_legacyPhone),
    ownKeys: () => Reflect.ownKeys(getGift(_legacyPhone)),
    getOwnPropertyDescriptor: (_, prop) => {
      const d = Object.getOwnPropertyDescriptor(getGift(_legacyPhone), prop);
      if (d) d.configurable = true;
      return d;
    },
  },
);

// ── Group metadata cache ──────────────────────────────────────────────────────
// key = `${sessionId}:${groupJid}`
//  • In-flight deduplication: concurrent calls for one group share a network request.
//  • Semaphore: limits concurrent group lookups to reduce WhatsApp rate-limit risk.
//  • Negative caching: failed lookups are not retried for five seconds.
//  • Derived data such as admins is computed once and shared by callers.

const EMPTY_DERIVED = Object.freeze({
  participants: Object.freeze([]),
  admins: Object.freeze([]),
  adminUsers: new Set(),
  owner: null,
  ownerPn: null,
  participantUsers: null,
});

const metaCache = new Map(); // key → { md, derived, expires }
const metaInflight = new Map(); // key → Promise<entry>
const metaSem = new Semaphore(META_FETCH_CONCURRENCY);

function deriveGroupInfo(md) {
  let participants = [];
  if (Array.isArray(md?.participants)) participants = md.participants;
  else if (Array.isArray(md?.adminIds))
    participants = md.adminIds.map((id) => ({ id, isAdmin: true }));

  const admins = [];
  const adminUsers = new Set();
  for (const p of participants) {
    if (!p) continue;
    const isAdm =
      p.isAdmin === true || p.admin === "admin" || p.admin === "superadmin";
    if (!isAdm) continue;
    const id = typeof p === "string" ? p : p.id;
    const primary = safeJid(id);
    if (primary) admins.push(primary);
    // Keep both LID and phone-number identities exposed by newer Baileys participant records.
    for (const v of [id, p.jid, p.lid, p.phoneNumber]) {
      const u = userPart(v);
      if (u) adminUsers.add(u);
    }
  }

  const owner = md?.owner ? safeJid(md.owner) : admins[0] || null;
  const ownerPn = md?.ownerPn ? safeJid(md.ownerPn) : null; // Baileys v7 exposes the phone number here when the owner is a LID.
  return {
    participants,
    admins: Object.freeze(admins),
    adminUsers,
    owner,
    ownerPn,
    participantUsers: null,
  };
}

function makeEntry(md) {
  return {
    md,
    derived: md ? deriveGroupInfo(md) : EMPTY_DERIVED,
    expires: Date.now() + (md ? METADATA_TTL : METADATA_NEG_TTL),
  };
}

function putCache(key, entry) {
  metaCache.delete(key); // re-insert → insertion order = recency
  metaCache.set(key, entry);
  while (metaCache.size > MAX_METADATA_CACHE_ENTRIES) {
    metaCache.delete(metaCache.keys().next().value);
  }
}

async function getGroupEntry(conn, sessionId, jid, { force = false } = {}) {
  if (!jid || typeof conn?.groupMetadata !== "function") return null;
  const key = `${sessionId}:${jid}`;

  if (!force) {
    const c = metaCache.get(key);
    if (c && c.expires > Date.now()) return c;
  }

  const existing = metaInflight.get(key);
  if (existing) return existing;

  const p = metaSem
    .run(() => conn.groupMetadata(jid))
    .then(
      (md) => makeEntry(md || null),
      () => makeEntry(null),
    )
    .then((entry) => {
      // Do not cache a stale result if this in-flight lookup was invalidated.
      if (metaInflight.get(key) === p) putCache(key, entry);
      return entry;
    })
    .finally(() => {
      if (metaInflight.get(key) === p) metaInflight.delete(key);
    });

  metaInflight.set(key, p);
  return p;
}

/** Return shared cached group metadata; client.js uses this helper as well. */
export async function getGroupMetadata(conn, sessionId, jid, opts) {
  return (await getGroupEntry(conn, sessionId, jid, opts))?.md || null;
}

/** Invalidate cached metadata after group settings or participant changes. */
export function invalidateGroupMetadata(sessionId, jid) {
  const key = `${sessionId}:${jid}`;
  metaCache.delete(key);
  metaInflight.delete(key);
}

/** Clear every cached group entry belonging to a deleted session. */
export function clearSessionGroupCache(sessionId) {
  const prefix = `${sessionId}:`;
  for (const k of metaCache.keys())
    if (k.startsWith(prefix)) metaCache.delete(k);
  for (const k of metaInflight.keys())
    if (k.startsWith(prefix)) metaInflight.delete(k);
}

const _metaSweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of metaCache) if (v.expires <= now) metaCache.delete(k);
}, 30_000);
if (_metaSweeper?.unref) _metaSweeper.unref();

// ── Raw cleanup: one shared sweeper instead of a timer for every message ──────
// A single FIFO queue and interval replace thousands of per-message timers at high throughput.
const _cleanupQueue = [];
let _cleanupHead = 0;

function _sweepRaw() {
  const now = Date.now();
  while (_cleanupHead < _cleanupQueue.length) {
    const w = _cleanupQueue[_cleanupHead];
    if (now - w._createdAt < CLEANUP_MS) break;
    _cleanupQueue[_cleanupHead++] = undefined;
    try {
      w.discardRaw();
    } catch {
      /* ignore */
    }
  }
  if (_cleanupHead > 2048 && _cleanupHead * 2 > _cleanupQueue.length) {
    _cleanupQueue.splice(0, _cleanupHead);
    _cleanupHead = 0;
  }
}

if (CLEANUP_MS > 0) {
  const t = setInterval(
    _sweepRaw,
    Math.min(5_000, Math.max(1_000, Math.floor(CLEANUP_MS / 4))),
  );
  if (t?.unref) t.unref();
}

// ── Body extraction ───────────────────────────────────────────────────────────

function extractBody(type, content) {
  if (!content) return "";
  switch (type) {
    case "conversation":
      return typeof content === "string" ? content : "";
    case "extendedTextMessage":
      return content.text || "";
    case "imageMessage":
    case "videoMessage":
    case "documentMessage":
      return content.caption || "";
    case "templateButtonReplyMessage":
      return content.selectedDisplayText || "";
    case "buttonsResponseMessage":
      return content.selectedButtonId || "";
    case "listResponseMessage":
      return content.singleSelectReply?.selectedRowId || "";
    case "interactiveResponseMessage":
      try {
        return (
          JSON.parse(content.nativeFlowResponseMessage?.paramsJson || "{}")
            .id || ""
        );
      } catch {
        return "";
      }
    default:
      return "";
  }
}

// ── Media download (size-limited) ─────────────────────────────────────────────

const MEDIA_TYPES = {
  imageMessage: "image",
  videoMessage: "video",
  ptvMessage: "video",
  audioMessage: "audio",
  stickerMessage: "sticker",
  documentMessage: "document",
};

function _declaredSize(content) {
  const n = Number(content?.fileLength); // Long.toString() → number
  return Number.isFinite(n) ? n : 0;
}

/**
 * Download media into a buffer, returning null when it exceeds maxBytes
 * (50 MB by default; configurable with SERIALIZER_MAX_DOWNLOAD_BYTES).
 * Use downloadToFile() for larger media.
 */
async function _downloadMedia(content, type, maxBytes = MAX_DOWNLOAD_BYTES) {
  const mediaType = MEDIA_TYPES[type];
  if (!content || !mediaType) return null;

  if (maxBytes > 0 && _declaredSize(content) > maxBytes) {
    console.warn(
      `[serialize] download skipped: ${_declaredSize(content)} > ${maxBytes} bytes`,
    );
    return null;
  }

  try {
    const stream = await downloadContentFromMessage(content, mediaType);
    const chunks = [];
    let total = 0;
    for await (const chunk of stream) {
      total += chunk.length;
      if (maxBytes > 0 && total > maxBytes) {
        stream.destroy?.();
        console.warn("[serialize] download aborted: size limit exceeded");
        return null;
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
  } catch (e) {
    console.error("[serialize] download error:", e?.message || e);
    return null;
  }
}

/** Stream media directly to disk; return filePath on success or null on failure. */
async function _downloadMediaToFile(content, type, filePath) {
  const mediaType = MEDIA_TYPES[type];
  if (!content || !mediaType || !filePath) return null;
  try {
    const stream = await downloadContentFromMessage(content, mediaType);
    await pipeline(stream, createWriteStream(filePath));
    return filePath;
  } catch (e) {
    console.error("[serialize] downloadToFile error:", e?.message || e);
    await rm(filePath, { force: true }).catch(() => {});
    return null;
  }
}

// ── Profile picture (sharp preferred, Jimp fallback) ──────────────────────────
// Jimp is pure JavaScript and can block message handling across sessions. Sharp
// uses libuv's thread pool, keeping the main event loop responsive.

let _sharp;
async function _loadSharp() {
  if (_sharp !== undefined) return _sharp;
  try {
    _sharp = (await import("sharp")).default;
  } catch {
    _sharp = null;
  }
  return _sharp;
}

const imgSem = new Semaphore(IMG_CONCURRENCY);

export async function makePp(buf) {
  return imgSem.run(async () => {
    const sharp = await _loadSharp();
    if (sharp) {
      const [img, prev] = await Promise.all([
        sharp(buf)
          .rotate()
          .resize(324, 324, { fit: "cover", position: "centre" })
          .jpeg()
          .toBuffer(),
        sharp(buf)
          .rotate()
          .resize(96, 96, { fit: "cover", position: "centre" })
          .normalise()
          .jpeg()
          .toBuffer(),
      ]);
      return { img, prev };
    }

    // Fallback: Jimp (lazy import — startup RAM bachhe)
    const { Jimp } = await import("jimp");
    const image = await Jimp.read(buf);
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    const size = Math.min(w, h);
    const x = Math.floor((w - size) / 2);
    const y = Math.floor((h - size) / 2);
    const cropped = image.clone().crop({ x, y, w: size, h: size });

    const img = await cropped
      .clone()
      .scaleToFit({ w: 324, h: 324 })
      .getBuffer("image/jpeg");
    const prev = await cropped
      .clone()
      .normalize()
      .resize({ w: 96, h: 96 })
      .getBuffer("image/jpeg");
    return { img, prev };
  });
}

// ── Sender number cache (LID → phone number), bounded ────────────────────────
const PN_CACHE_MAX = 5_000;
const _pnCache = new Map(); // `${sessionId}:${jid}` → number | null

function _pnCachePut(key, val) {
  _pnCache.delete(key);
  _pnCache.set(key, val);
  while (_pnCache.size > PN_CACHE_MAX)
    _pnCache.delete(_pnCache.keys().next().value);
}

// ── Payload builder (send / reply share this) ─────────────────────────────────

function buildContent(payload, options = {}) {
  let c;
  if (typeof payload === "string") c = { text: payload };
  else if (payload?.video)
    c = {
      ...payload,
      caption: payload.caption || "",
      mimetype: payload.mimetype || "video/mp4",
    };
  else if (payload?.image) c = { ...payload, caption: payload.caption || "" };
  else if (payload?.audio)
    c = {
      ...payload,
      mimetype: payload.mimetype || "audio/mp4",
      ptt: payload.ptt || false,
    };
  else c = { ...payload }; // copy — caller er object mutate korbo na

  if (options.mentions) c.mentions = options.mentions;
  if (options.edit) c.edit = options.edit;
  return c;
}

// ── MsgWrapper ────────────────────────────────────────────────────────────────

export class MsgWrapper {
  constructor({
    raw,
    conn,
    sessionId,
    key,
    from,
    fromMe,
    isFromMe,
    sender,
    senderAlt,
    isGroup,
    pushName,
    type,
    body,
    content,
    quoted,
    mentions,
    gift: giftObj,
    botJid,
    botLid,
  }) {
    // Core references
    this.raw = raw;
    this.mek = raw; // alias kept for plugin compat
    this.conn = conn;
    this.client = conn; // alias kept for plugin compat
    this._sessionId = sessionId;
    this._rawGone = false;
    this._pinCount = 0; // plugin queue/exec er somoy raw ke bachiye rakhe
    this._pendingDiscard = false;
    this._derived = null;

    // Message identity
    this.key = key;
    this.id = key.id;
    this.from = from;
    this.fromMe = fromMe;
    this.isFromMe = isFromMe;
    this.isfromMe = isFromMe; // typo alias kept for plugin compat
    this.sender = sender;
    this.senderAlt = senderAlt || ""; // LID ↔ PN er onno ta
    this.isGroup = isGroup;
    this.pushName = pushName;

    // Content
    this.type = type;
    this.body = body;
    this.content = content;
    this.quoted = quoted;
    this.mentions = mentions || [];
    this.bot = botJid;
    this.botJid = botJid;
    this.botLid = botLid;
    this.botnum = botJid.split("@")[0];
    this.isMentioned = this.mentions.some(
      (m) => sameUser(m, botJid) || (botLid && sameUser(m, botLid)),
    );

    // Group info (populated by loadGroupInfo())
    this.groupMetadata = null;
    this.groupParticipants = [];
    this.groupAdmins = [];
    this.groupOwner = null;
    this.groupOwnerPn = null;
    this.isAdmin = false;
    this.isBotAdmin = false;
    this.joinApprovalMode = false;
    this.memberAddMode = false;
    this.announce = false;
    this.restrict = false;
    this.gift = giftObj;

    this._createdAt = Date.now();
    if (CLEANUP_MS > 0) _cleanupQueue.push(this); // The shared sweeper avoids per-message timers.
  }

  // Prototype methods avoid allocating new closures for every message.
  mentionsBot() {
    return this.isMentioned;
  }
  mentioned(jid) {
    return this.mentions.some((m) => sameUser(m, jid));
  }

  // ── Pin / unpin ────────────────────────────────────────────────────────────
  /**
   * Call before work that needs `raw` or `mek`; client.js pins queued tasks automatically.
   * Returns an idempotent release function.
   */
  pin() {
    this._pinCount++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.unpin();
    };
  }

  unpin() {
    if (this._pinCount > 0) this._pinCount--;
    if (this._pinCount === 0 && this._pendingDiscard) {
      this._pendingDiscard = false;
      this._doDiscard();
    }
  }

  async _safe(label, fn) {
    try {
      return await fn();
    } catch (e) {
      console.error(`[serialize] ${label}:`, e?.message || e);
      return null;
    }
  }

  // ── Group info ─────────────────────────────────────────────────────────────

  /** Load group metadata before reading isAdmin, isBotAdmin, groupAdmins, or related fields. */
  async loadGroupInfo() {
    if (!this.isGroup) return this;
    try {
      const entry = await getGroupEntry(this.conn, this._sessionId, this.from);
      const md = entry?.md || null;
      const d = entry?.derived || EMPTY_DERIVED;
      this._derived = d;

      this.groupMetadata = md || {};
      this.groupParticipants = d.participants;
      this.groupAdmins = d.admins; // Shared frozen cache; do not mutate.
      this.groupOwner = d.owner;
      this.groupOwnerPn = d.ownerPn;

      this.joinApprovalMode = md?.joinApprovalMode || false;
      this.memberAddMode = md?.memberAddMode || false;
      this.announce = md?.announce || false;
      this.restrict = md?.restrict || false;

      const su = userPart(this.sender);
      const sau = userPart(this.senderAlt);
      this.isAdmin =
        (!!su && d.adminUsers.has(su)) || (!!sau && d.adminUsers.has(sau));

      const bu = userPart(this.botJid);
      const blu = userPart(this.botLid);
      this.isBotAdmin =
        (!!bu && d.adminUsers.has(bu)) || (!!blu && d.adminUsers.has(blu));
    } catch (err) {
      console.error("[serialize] loadGroupInfo error:", err?.message || err);
    }
    return this;
  }

  async _refreshCache() {
    invalidateGroupMetadata(this._sessionId, this.from);
    try {
      await this.loadGroupInfo();
    } catch {
      /* ignore */
    }
  }

  // ── Group action helpers ───────────────────────────────────────────────────

  async _groupAction(jid, action) {
    const normalized = (Array.isArray(jid) ? jid : [jid])
      .map(safeJid)
      .filter(Boolean);
    const res = await this.conn.groupParticipantsUpdate(
      this.from,
      normalized,
      action,
    );
    await this._refreshCache();
    return res;
  }

  _groupSetting(label, fn) {
    return this._safe(label, async () => {
      const res = await fn();
      await this._refreshCache();
      return res;
    });
  }

  muteGroup() {
    return this._groupSetting("muteGroup", () =>
      this.conn.groupSettingUpdate(this.from, "announcement"),
    );
  }
  unmuteGroup() {
    return this._groupSetting("unmuteGroup", () =>
      this.conn.groupSettingUpdate(this.from, "not_announcement"),
    );
  }
  setSubject(text) {
    return this._groupSetting("setSubject", () =>
      this.conn.groupUpdateSubject(this.from, text),
    );
  }
  setDescription(text) {
    return this._groupSetting("setDescription", () =>
      this.conn.groupUpdateDescription(this.from, text),
    );
  }
  addParticipant(jid) {
    return this._safe("addParticipant", () => this._groupAction(jid, "add"));
  }
  removeParticipant(jid) {
    return this._safe("removeParticipant", () =>
      this._groupAction(jid, "remove"),
    );
  }
  promoteParticipant(jid) {
    return this._safe("promoteParticipant", () =>
      this._groupAction(jid, "promote"),
    );
  }
  demoteParticipant(jid) {
    return this._safe("demoteParticipant", () =>
      this._groupAction(jid, "demote"),
    );
  }
  leaveGroup() {
    return this._safe("leaveGroup", async () => {
      const res = await this.conn.groupLeave(this.from);
      invalidateGroupMetadata(this._sessionId, this.from);
      return res;
    });
  }
  inviteCode() {
    return this._safe("inviteCode", () => this.conn.groupInviteCode(this.from));
  }
  revokeInvite() {
    return this._groupSetting("revokeInvite", () =>
      this.conn.groupRevokeInvite(this.from),
    );
  }
  getInviteInfo(code) {
    return this._safe("getInviteInfo", () =>
      this.conn.groupGetInviteInfo(code),
    );
  }
  joinViaInvite(code) {
    return this._safe("joinViaInvite", () => this.conn.groupAcceptInvite(code));
  }
  getJoinRequests() {
    return this._safe("getJoinRequests", () =>
      this.conn.groupRequestParticipantsList(this.from),
    );
  }
  updateJoinRequests(jids, action = "approve") {
    return this._groupSetting("updateJoinRequests", () =>
      this.conn.groupRequestParticipantsUpdate(
        this.from,
        (Array.isArray(jids) ? jids : [jids]).map(safeJid),
        action,
      ),
    );
  }

  /**
   * When enabled, all members can add participants ("all_member_add").
   * When disabled, only admins can add participants ("admin_add").
   * Announcement mode is a separate setting and is not used as a fallback.
   */
  setMemberAddMode(enable = true) {
    return this._groupSetting("setMemberAddMode", () => {
      if (typeof this.conn.groupMemberAddMode !== "function") {
        throw new Error(
          "groupMemberAddMode not supported by this Baileys version",
        );
      }
      return this.conn.groupMemberAddMode(
        this.from,
        enable ? "all_member_add" : "admin_add",
      );
    });
  }

  // ── Participant helpers ─────────────────────────────────────────────────────

  getParticipants() {
    return this.groupParticipants || [];
  }

  isParticipant(jid) {
    const u = userPart(jid);
    const d = this._derived;
    if (!u || !d) return false;
    if (!d.participantUsers) {
      // Build the participant set on demand to avoid duplicating memory for every group.
      const s = new Set();
      for (const p of d.participants) {
        if (typeof p === "string") {
          s.add(userPart(p));
          continue;
        }
        for (const v of [p?.id, p?.jid, p?.lid, p?.phoneNumber]) {
          const x = userPart(v);
          if (x) s.add(x);
        }
      }
      d.participantUsers = s;
    }
    return d.participantUsers.has(u);
  }

  // ── Status / profile / block ───────────────────────────────────────────────

  fetchStatus(jid) {
    return this._safe("fetchStatus", () => this.conn.fetchStatus(safeJid(jid)));
  }
  profilePictureUrl(jid, type = "image") {
    return this._safe("profilePictureUrl", () =>
      this.conn.profilePictureUrl(safeJid(jid), type),
    );
  }
  blockUser(jid) {
    return this._safe("blockUser", () =>
      this.conn.updateBlockStatus(safeJid(jid), "block"),
    );
  }
  unblockUser(jid) {
    return this._safe("unblockUser", () =>
      this.conn.updateBlockStatus(safeJid(jid), "unblock"),
    );
  }

  // ── LID helpers ────────────────────────────────────────────────────────────

  getLID(phoneNumber) {
    return this._safe("getLID", async () => {
      const m = this.conn.signalRepository?.lidMapping;
      return m ? await m.getLIDForPN(phoneNumber) : null;
    });
  }
  getPN(lid) {
    return this._safe("getPN", async () => {
      const m = this.conn.signalRepository?.lidMapping;
      return m ? await m.getPNForLID(lid) : null;
    });
  }
  /**
   * Return the sender's phone number as digits, resolving LIDs through senderAlt
   * or the cached lidMapping. Use this value to compare phone-number-based lists.
   */
  async getSenderNumber() {
    const s = this.sender;
    if (!s) return null;
    if (!s.endsWith("@lid")) return userPart(s) || null;

    const key = `${this._sessionId}:${s}`;
    if (_pnCache.has(key)) {
      const v = _pnCache.get(key);
      _pnCachePut(key, v); // recency refresh
      return v;
    }

    let pn =
      this.senderAlt && !this.senderAlt.endsWith("@lid")
        ? this.senderAlt
        : null;
    if (!pn) pn = await this.getPN(s);
    const n = pn ? userPart(pn) : null;
    if (n) _pnCachePut(key, n); // Do not cache null; the mapping may become available later.
    return n;
  }

  isPnUser(jid) {
    return !!jid?.includes("@s.whatsapp.net");
  }
  isLidUser(jid) {
    return !!jid?.includes("@lid");
  }
  areJidsSame(a, b) {
    return sameUser(safeJid(a), safeJid(b));
  }

  // ── Profile picture ────────────────────────────────────────────────────────

  async setPp(jid, buf) {
    try {
      if (typeof this.conn.updateProfilePicture !== "function") {
        console.error(
          "[serialize] setPp: updateProfilePicture not supported by this socket",
        );
        return false;
      }
      const { img } = await makePp(buf);
      // Pass the Buffer directly; Baileys getStream does not accept `{ url: Buffer }`.
      await this.conn.updateProfilePicture(safeJid(jid), img);
      if (this.isGroup && safeJid(jid) === this.from)
        await this._refreshCache();
      return true;
    } catch (e) {
      console.error("[serialize] setPp:", e?.message);
      return false;
    }
  }

  // ── Media download ─────────────────────────────────────────────────────────

  /** Buffer (default max 50MB). Boro file e downloadToFile(path). */
  download(maxBytes) {
    return _downloadMedia(this.content, this.type, maxBytes);
  }
  downloadToFile(filePath) {
    return _downloadMediaToFile(this.content, this.type, filePath);
  }

  // ── Send / reply ───────────────────────────────────────────────────────────

  async send(payload, options = {}) {
    try {
      if (payload?.delete)
        return await this.conn.sendMessage(this.from, {
          delete: payload.delete,
        });
      return await this.conn.sendMessage(
        this.from,
        buildContent(payload, options),
        {
          quoted: options.quoted || this.gift,
        },
      );
    } catch (e) {
      console.error("Error sending message:", e);
      return null;
    }
  }

  async replyMethod(payload, options = {}) {
    try {
      if (payload?.delete)
        return await this.conn.sendMessage(this.from, {
          delete: payload.delete,
        });
      const quotedRaw = options.quoted || this.getRaw() || undefined;
      return await this.conn.sendMessage(
        this.from,
        buildContent(payload, options),
        { quoted: quotedRaw },
      );
    } catch (e) {
      console.error("Error sending reply:", e);
      return null;
    }
  }

  // Aliases kept for full plugin backward-compatibility
  sendreply(payload, options = {}) {
    return this.replyMethod(payload, options);
  }
  sendReply(payload, options = {}) {
    return this.replyMethod(payload, options);
  }
  reply(payload, options = {}) {
    return this.replyMethod(payload, options);
  }

  react(emoji) {
    return this._safe("react", () =>
      this.conn.sendMessage(this.from, {
        react: { text: emoji, key: this.key },
      }),
    );
  }

  // ── Raw cleanup ────────────────────────────────────────────────────────────

  /** Defer raw-payload cleanup until all active pins have been released. */
  discardRaw() {
    if (this._pinCount > 0) {
      this._pendingDiscard = true;
      return;
    }
    this._doDiscard();
  }

  _doDiscard() {
    this._rawGone = true;
    try {
      if (this.raw) delete this.raw;
    } catch {
      /* ignore */
    }
    try {
      if (this.mek) delete this.mek;
    } catch {
      /* ignore */
    }
    try {
      if (this.quoted?.msg) delete this.quoted.msg;
    } catch {
      /* ignore */
    }
  }

  /** Return null after cleanup rather than undefined. */
  getRaw() {
    return this._rawGone ? null : this.raw || null;
  }
}

// ── Serializer ────────────────────────────────────────────────────────────────

function buildQuoted(contextInfo, from, botJid, botLid) {
  const quotedMsg = contextInfo?.quotedMessage;
  if (!quotedMsg) return null;

  // ephemeral / viewOnce / caption wrapper unwrap
  const inner = extractMessageContent(quotedMsg) || quotedMsg;
  const qt = getContentType(inner) || "";
  const qContent = inner[qt];
  const qBody = extractBody(qt, qContent);

  const participant = safeJid(
    contextInfo?.participant || contextInfo?.participantAlt || "",
  );
  const isQuotedFromMe =
    (!!botJid && sameUser(participant, botJid)) ||
    (!!botLid && sameUser(participant, botLid));

  return {
    type: qt,
    msg: typeof qContent === "object" && qContent ? { ...qContent } : qContent,
    body: typeof qBody === "string" ? qBody.slice(0, MAX_BODY_LENGTH) : "",
    fromMe: isQuotedFromMe,
    participant,
    id: contextInfo?.stanzaId,
    key: {
      remoteJid: from,
      fromMe: isQuotedFromMe,
      id: contextInfo?.stanzaId,
      participant,
    },
    // Lazy media download for quoted message
    download: (maxBytes) => _downloadMedia(qContent, qt, maxBytes),
    downloadToFile: (filePath) => _downloadMediaToFile(qContent, qt, filePath),
  };
}

export default class Serializer {
  constructor(conn, sessionId) {
    this.conn = conn;
    this.sessionId = sessionId;
  }

  /**
   * Sync: raw Baileys message → MsgWrapper. Group metadata / media download async methods e deferred.
   */
  serializeSync(msg) {
    const conn = this.conn;
    const key = msg.key || {};

    const from = key.remoteJid || "";
    const fromMe = key.fromMe || false;
    const isGroup = from.endsWith("@g.us");

    const sender = safeJid(
      isGroup ? key.participant || key.participantAlt || from : from,
    );
    const senderAlt = safeJid(isGroup ? key.participantAlt : key.remoteJidAlt);

    const pushName = msg.pushName || "Unknown";

    const msgContent = extractMessageContent(msg.message);
    const type = getContentType(msgContent || msg.message) || "";
    const content = msgContent?.[type] ?? msg.message?.[type] ?? null;

    const botJid = conn?.user?.id ? safeJid(conn.user.id) : "";
    const botLid = conn?.user?.lid ? safeJid(conn.user.lid) : "";
    const isFromMe =
      fromMe ||
      (!!botJid &&
        (sameUser(sender, botJid) ||
          (!!senderAlt && sameUser(senderAlt, botJid)))) ||
      (!!botLid &&
        (sameUser(sender, botLid) ||
          (!!senderAlt && sameUser(senderAlt, botLid))));

    const rawBody = extractBody(type, content);
    const body =
      typeof rawBody === "string" ? rawBody.slice(0, MAX_BODY_LENGTH) : "";

    // contextInfo ekbar-i
    const contextInfo =
      content?.contextInfo ||
      msg.message?.extendedTextMessage?.contextInfo ||
      null;
    const quoted = buildQuoted(contextInfo, from, botJid, botLid);
    const mentions = contextInfo?.mentionedJid || [];

    const phone = phoneFromConn(conn);
    if (phone) _legacyPhone = phone;

    return new MsgWrapper({
      raw: msg,
      conn,
      sessionId: this.sessionId,
      key,
      from,
      fromMe,
      isFromMe,
      sender,
      senderAlt,
      isGroup,
      pushName,
      type,
      body,
      content,
      quoted,
      mentions,
      gift: getGift(phone),
      botJid,
      botLid,
    });
  }
}
