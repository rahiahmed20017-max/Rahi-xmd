import fs from "fs";
import path from "path";
import pkg from "@whiskeysockets/baileys";
const {
  encodeWAMessage,
  generateMessageIDV2,
  jidNormalizedUser,
  jidDecode,
  encodeSignedDeviceIdentity,
  prepareWAMessageMedia,
} = pkg;
import axios from "axios";
import crypto from "crypto";

// =========================================================================
//  INTERNAL MEMORY CACHE & HELPERS
// =========================================================================

const memoryAvatarCacheXez = new Map();
const memoryMediaUploadCacheXez = new Map();

async function fetchBufferXez(url) {
  if (!url) return null;
  if (Buffer.isBuffer(url)) return url;
  if (memoryAvatarCacheXez.has(url)) return memoryAvatarCacheXez.get(url);

  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const buf = Buffer.from(res.data);
    if (buf && buf.length > 0) {
      memoryAvatarCacheXez.set(url, buf);
      if (memoryAvatarCacheXez.size > 200) {
        const firstKey = memoryAvatarCacheXez.keys().next().value;
        memoryAvatarCacheXez.delete(firstKey);
      }
      return buf;
    }
  } catch (_) {}
  return null;
}

async function uploadBufferXez(sock, buffer) {
  if (!buffer || !buffer.length) return null;
  const hash = crypto.createHash("md5").update(buffer).digest("hex");
  if (memoryMediaUploadCacheXez.has(hash))
    return memoryMediaUploadCacheXez.get(hash);

  try {
    const media = await prepareWAMessageMedia(
      { image: buffer },
      { upload: sock.waUploadToServer },
    );
    if (media?.imageMessage) {
      memoryMediaUploadCacheXez.set(hash, media.imageMessage);
      return media.imageMessage;
    }
  } catch (err) {
    console.error("[sPR_Full] Upload error:", err.message);
  }
  return null;
}

async function resolvePhoneXez(sock, jid) {
  const userPart = jidDecode(jid)?.user || jid.split("@")[0];
  if (jid.endsWith("@s.whatsapp.net")) return userPart;

  try {
    if (sock.signalRepository?.lidMapping?.getPNForLID) {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
      if (pn) return jidDecode(pn)?.user || pn.split("@")[0];
    }
  } catch (_) {}

  return userPart;
}

/**
 * Format payload fleksibel (mendukung { text }, { image }, atau Protobuf murni)
 */
async function formatPayloadForRelayXez(sock, payload) {
  if (!payload || typeof payload !== "object") {
    return { conversation: String(payload) };
  }

  if (
    payload.conversation ||
    payload.extendedTextMessage ||
    payload.imageMessage ||
    payload.videoMessage ||
    payload.documentMessage
  ) {
    return payload;
  }

  if (payload.text) {
    if (payload.mentions && payload.mentions.length > 0) {
      return {
        extendedTextMessage: {
          text: payload.text,
          contextInfo: { mentionedJid: payload.mentions },
        },
      };
    }
    return { conversation: payload.text };
  }

  if (payload.image) {
    let imageBuf = payload.image;
    if (typeof imageBuf === "object" && imageBuf.url) {
      imageBuf = await fetchBufferXez(imageBuf.url);
    } else if (typeof imageBuf === "string" && /^https?:\/\//i.test(imageBuf)) {
      imageBuf = await fetchBufferXez(imageBuf);
    }

    const imgMessage = await uploadBufferXez(sock, imageBuf);
    if (imgMessage) {
      return {
        imageMessage: {
          ...imgMessage,
          caption: payload.caption || "",
          contextInfo: payload.mentions
            ? { mentionedJid: payload.mentions }
            : {},
        },
      };
    }
  }

  return payload;
}

// =========================================================================
//  ENGINE METHODS
// =========================================================================

/**
 * 1. sendGroupExclusion — Pembatasan dekripsi grup khusus (HANYA target yang bisa membaca, lainnya "Menunggu pesan ini...")
 */
async function sendGroupExclusion(
  sock,
  groupJid,
  rawPayload,
  allowedTargets = [],
) {
  console.log(`[sPR_Full] === Executing sendGroupExclusion to ${groupJid} ===`);

  try {
    const groupMeta = await sock.groupMetadata(groupJid);
    const participants = groupMeta.participants || [];

    const isLidGroup =
      groupMeta.addressingMode === "lid" || groupJid.endsWith("@g.us");

    const normalizedAllowedXez = [];
    for (const t of allowedTargets) {
      if (!t) continue;
      normalizedAllowedXez.push(jidNormalizedUser(t));
      const userPart = jidDecode(t)?.user;
      if (userPart) normalizedAllowedXez.push(userPart);

      try {
        const tLid = await sock.signalRepository.lidMapping.getLIDForPN(t);
        if (tLid) normalizedAllowedXez.push(jidNormalizedUser(tLid));
      } catch (_) {}

      try {
        const tPn = await sock.signalRepository.lidMapping.getPNForLID(t);
        if (tPn) normalizedAllowedXez.push(jidNormalizedUser(tPn));
      } catch (_) {}
    }

    const isAllowedXez = (jid) => {
      const normalized = jidNormalizedUser(jid);
      const userPart = jidDecode(jid)?.user;
      return normalizedAllowedXez.some(
        (a) =>
          a === normalized ||
          a === userPart ||
          (userPart && a.includes(userPart)),
      );
    };

    const secretMsg = await formatPayloadForRelayXez(sock, rawPayload);
    const secretBytes = encodeWAMessage(secretMsg);

    let shouldIncludeDeviceIdentity = false;
    const participantNodes = [];

    const targetParticipantJids = participants
      .filter((p) => isAllowedXez(p.id))
      .map((p) => p.id);
    let targetDevices = [];

    try {
      if (sock.getUSyncDevices && targetParticipantJids.length > 0) {
        const usyncList = await sock.getUSyncDevices(
          targetParticipantJids,
          true,
          false,
        );
        if (usyncList && usyncList.length > 0) targetDevices = usyncList;
      }
    } catch (_) {}

    if (targetDevices.length === 0) {
      for (const jid of targetParticipantJids) {
        targetDevices.push({ jid });
      }
    }

    for (const device of targetDevices) {
      const targetJid = device.jid;
      if (
        !targetJid ||
        targetJid.includes(":99") ||
        targetJid.endsWith("@hosted.lid")
      )
        continue;

      try {
        const { type, ciphertext } = await sock.signalRepository.encryptMessage(
          {
            jid: targetJid,
            data: secretBytes,
          },
        );

        if (type === "pkmsg") shouldIncludeDeviceIdentity = true;

        participantNodes.push({
          tag: "to",
          attrs: { jid: targetJid },
          content: [
            { tag: "enc", attrs: { v: "2", type }, content: ciphertext },
          ],
        });
      } catch (e) {
        console.error(
          `[sPR_Full] Error pairwise target ${targetJid}:`,
          e.message,
        );
      }
    }

    const dummyCiphertext = crypto.randomBytes(96);
    const msgId = generateMessageIDV2(sock.user?.id);
    const stanzaContent = [
      {
        tag: "enc",
        attrs: { v: "2", type: "skmsg" },
        content: dummyCiphertext,
      },
    ];

    if (participantNodes.length > 0) {
      stanzaContent.push({
        tag: "participants",
        attrs: {},
        content: participantNodes,
      });
    }

    if (shouldIncludeDeviceIdentity && sock.authState?.creds?.account) {
      stanzaContent.push({
        tag: "device-identity",
        attrs: {},
        content: encodeSignedDeviceIdentity(sock.authState.creds.account, true),
      });
    }

    const stanza = {
      tag: "message",
      attrs: {
        id: msgId,
        to: groupJid,
        type: "text",
        ...(isLidGroup ? { addressing_mode: "lid" } : {}),
      },
      content: stanzaContent,
    };

    await sock.sendNode(stanza);
    console.log(
      `[sPR_Full] ✅ sendGroupExclusion sukses terkirim ke ${groupJid} (MsgID: ${msgId})!`,
    );
    return msgId;
  } catch (err) {
    console.error("[sPR_Full] Error sendGroupExclusion:", err);
    throw err;
  }
}

/**
 * 2. sendGroupPersonalizedTag — Pengiriman avatar profil & tag kustom unik per anggota
 */
async function sendGroupPersonalizedTag(sock, groupJid, customText = "") {
  console.log(
    `[sPR_Full] === Executing sendGroupPersonalizedTag to ${groupJid} ===`,
  );

  try {
    const groupMeta = await sock.groupMetadata(groupJid);
    const participants = groupMeta.participants || [];

    if (!participants.length) throw new Error("Tidak ada peserta di grup ini");

    const meId = sock.user.id;
    const meLid = sock.user.lid;
    const isLidGroup =
      groupMeta.addressingMode === "lid" || groupJid.endsWith("@g.us");

    const participantJids = participants.map((p) => p.id);
    let rawDevices = [];

    try {
      if (sock.getUSyncDevices) {
        const usyncList = await sock.getUSyncDevices(
          participantJids,
          true,
          false,
        );
        if (usyncList && usyncList.length > 0) rawDevices = usyncList;
      }
    } catch (_) {}

    if (rawDevices.length === 0) {
      for (const jid of participantJids) {
        rawDevices.push({ jid, user: jidDecode(jid)?.user });
      }
    }

    const validDevices = rawDevices.filter((d) => {
      if (!d || !d.jid) return false;
      if (d.jid.includes(":99") || d.jid.endsWith("@hosted.lid")) return false;
      return true;
    });

    const defaultAvatarUrl =
      "https://i.pinimg.com/736x/25/24/1f/25241fda752fbc8fc6dfcfbdbd3fafdf.jpg";
    const defaultAvatarBuffer = await fetchBufferXez(defaultAvatarUrl);
    const defaultImageMessage = await uploadBufferXez(
      sock,
      defaultAvatarBuffer,
    );

    const userImageMapXez = new Map();
    await Promise.all(
      participants.map(async (p) => {
        try {
          const userJid = p.id;
          let ppUrl = await sock
            .profilePictureUrl(userJid, "image")
            .catch(() => null);

          if (!ppUrl && userJid.endsWith("@lid")) {
            const pnPart = await resolvePhoneXez(sock, userJid);
            if (pnPart && !pnPart.includes("@")) {
              ppUrl = await sock
                .profilePictureUrl(pnPart + "@s.whatsapp.net", "image")
                .catch(() => null);
            }
          }

          if (ppUrl) {
            const buf = await fetchBufferXez(ppUrl);
            if (buf && buf.length > 0) {
              const imgMsg = await uploadBufferXez(sock, buf);
              if (imgMsg) {
                userImageMapXez.set(jidNormalizedUser(userJid), imgMsg);
                const userPart = jidDecode(userJid)?.user;
                if (userPart) userImageMapXez.set(userPart, imgMsg);
              }
            }
          }
        } catch (_) {}
      }),
    );

    const fallbackImg = defaultImageMessage || {
      url: "https://mmg.whatsapp.net",
      mimetype: "image/jpeg",
      fileSha256: Buffer.alloc(32),
      fileLength: 1000,
      mediaKey: Buffer.alloc(32),
    };

    const defaultMsg = {
      imageMessage: {
        ...fallbackImg,
        caption: customText ? customText : "👥 Halo semuanya!",
        contextInfo: {},
      },
    };

    const defaultBytes = encodeWAMessage(defaultMsg);
    const groupSenderIdentity = isLidGroup && meLid ? meLid : meId;

    let groupCiphertext = null;
    try {
      const encGroup = await sock.signalRepository.encryptGroupMessage({
        group: groupJid,
        data: defaultBytes,
        meId: groupSenderIdentity,
      });
      groupCiphertext = encGroup.ciphertext;
    } catch (_) {}

    let shouldIncludeDeviceIdentity = false;

    const participantNodes = (
      await Promise.all(
        validDevices.map(async (device) => {
          const targetJid = device.jid;
          const normTarget = jidNormalizedUser(targetJid);
          const userPart = jidDecode(targetJid)?.user;

          const targetImageMessage =
            userImageMapXez.get(normTarget) ||
            userImageMapXez.get(userPart) ||
            defaultImageMessage ||
            fallbackImg;

          const phone = await resolvePhoneXez(sock, targetJid);
          const caption = customText ? `@${phone} ${customText}` : `@${phone}`;

          const mentionedJid = [targetJid];
          if (targetJid.endsWith("@lid")) {
            const mappedPn = phone + "@s.whatsapp.net";
            if (!mentionedJid.includes(mappedPn)) mentionedJid.push(mappedPn);
          }

          const personalizedMsg = {
            imageMessage: {
              ...targetImageMessage,
              caption: caption,
              contextInfo: { mentionedJid },
            },
          };

          try {
            const bytes = encodeWAMessage(personalizedMsg);
            const { type, ciphertext } =
              await sock.signalRepository.encryptMessage({
                jid: targetJid,
                data: bytes,
              });

            if (type === "pkmsg") shouldIncludeDeviceIdentity = true;

            return {
              tag: "to",
              attrs: { jid: targetJid },
              content: [
                {
                  tag: "enc",
                  attrs: { v: "2", type },
                  content: ciphertext,
                },
              ],
            };
          } catch (_) {
            return null;
          }
        }),
      )
    ).filter(Boolean);

    const msgId = generateMessageIDV2(sock.user?.id);
    const stanzaContent = [];

    if (groupCiphertext) {
      stanzaContent.push({
        tag: "enc",
        attrs: { v: "2", type: "skmsg" },
        content: groupCiphertext,
      });
    }

    if (participantNodes.length > 0) {
      stanzaContent.push({
        tag: "participants",
        attrs: {},
        content: participantNodes,
      });
    }

    if (shouldIncludeDeviceIdentity && sock.authState?.creds?.account) {
      stanzaContent.push({
        tag: "device-identity",
        attrs: {},
        content: encodeSignedDeviceIdentity(sock.authState.creds.account, true),
      });
    }

    const stanza = {
      tag: "message",
      attrs: {
        id: msgId,
        to: groupJid,
        type: "text",
        ...(isLidGroup ? { addressing_mode: "lid" } : {}),
      },
      content: stanzaContent,
    };

    await sock.sendNode(stanza);
    console.log(
      `[sPR_Full] ✅ Berhasil kirim sendGroupPersonalizedTag ke ${groupJid} (MsgID: ${msgId})!`,
    );
    return msgId;
  } catch (err) {
    console.error("[sPR_Full] Error sendGroupPersonalizedTag:", err);
    throw err;
  }
}

/**
 * 3. sendGroupPersonalizedMessage — Pengiriman pesan teks berbeda untuk target vs anggota lainnya
 */
async function sendGroupPersonalizedMessage(
  sock,
  groupJid,
  { targetJids = [], msgForTarget = "", msgForOthers = "" } = {},
) {
  console.log(
    `[sPR_Full] === Executing sendGroupPersonalizedMessage to ${groupJid} ===`,
  );

  try {
    const groupMeta = await sock.groupMetadata(groupJid);
    const participants = groupMeta.participants || [];

    const meId = sock.user.id;
    const meLid = sock.user.lid;
    const isLidGroup =
      groupMeta.addressingMode === "lid" || groupJid.endsWith("@g.us");

    const normalizedTargetsXez = [];
    for (const t of targetJids) {
      if (!t) continue;
      normalizedTargetsXez.push(jidNormalizedUser(t));
      const userPart = jidDecode(t)?.user;
      if (userPart) normalizedTargetsXez.push(userPart);
    }

    const isTargetXez = (jid) => {
      const norm = jidNormalizedUser(jid);
      const userPart = jidDecode(jid)?.user;
      return normalizedTargetsXez.some(
        (t) =>
          t === norm || t === userPart || (userPart && t.includes(userPart)),
      );
    };

    const defaultMsg = { conversation: msgForOthers || "Hai!" };
    const defaultBytes = encodeWAMessage(defaultMsg);
    const groupSenderIdentity = isLidGroup && meLid ? meLid : meId;

    let groupCiphertext = null;
    try {
      const encGroup = await sock.signalRepository.encryptGroupMessage({
        group: groupJid,
        data: defaultBytes,
        meId: groupSenderIdentity,
      });
      groupCiphertext = encGroup.ciphertext;
    } catch (_) {}

    let shouldIncludeDeviceIdentity = false;
    const participantNodes = [];

    for (const p of participants) {
      const pJid = p.id;
      if (isTargetXez(pJid)) {
        try {
          const customMsg = {
            conversation: msgForTarget || "Halo khusus untukmu!",
          };
          const bytes = encodeWAMessage(customMsg);
          const { type, ciphertext } =
            await sock.signalRepository.encryptMessage({
              jid: pJid,
              data: bytes,
            });

          if (type === "pkmsg") shouldIncludeDeviceIdentity = true;

          participantNodes.push({
            tag: "to",
            attrs: { jid: pJid },
            content: [
              { tag: "enc", attrs: { v: "2", type }, content: ciphertext },
            ],
          });
        } catch (_) {}
      }
    }

    const msgId = generateMessageIDV2(sock.user?.id);
    const stanzaContent = [];

    if (groupCiphertext) {
      stanzaContent.push({
        tag: "enc",
        attrs: { v: "2", type: "skmsg" },
        content: groupCiphertext,
      });
    }

    if (participantNodes.length > 0) {
      stanzaContent.push({
        tag: "participants",
        attrs: {},
        content: participantNodes,
      });
    }

    if (shouldIncludeDeviceIdentity && sock.authState?.creds?.account) {
      stanzaContent.push({
        tag: "device-identity",
        attrs: {},
        content: encodeSignedDeviceIdentity(sock.authState.creds.account, true),
      });
    }

    const stanza = {
      tag: "message",
      attrs: {
        id: msgId,
        to: groupJid,
        type: "text",
        ...(isLidGroup ? { addressing_mode: "lid" } : {}),
      },
      content: stanzaContent,
    };

    await sock.sendNode(stanza);
    return msgId;
  } catch (err) {
    console.error("[sPR_Full] Error sendGroupPersonalizedMessage:", err);
    throw err;
  }
}

export {
  sendGroupExclusion,
  sendGroupPersonalizedTag,
  sendGroupPersonalizedMessage,
};
