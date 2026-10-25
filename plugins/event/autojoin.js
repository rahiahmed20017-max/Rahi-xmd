import { Module } from "../../lib/plugins.js";

Module({ on: "connected", name: "autojoin" })(async (ctx) => {
  const { sock, sessionId, config } = ctx;
  const links = Array.isArray(config.GROUP_LINKS) ? config.GROUP_LINKS : [];

  for (const link of links) {
    try {
      const code = link
        ?.trim()
        ?.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/)?.[1];
      if (!code) {
        console.log(`❌ [${sessionId}] Invalid group link: ${link}`);
        continue;
      }
      await sock.groupAcceptInvite(code);
      console.log(`✅ [${sessionId}] Group joined: ${link}`);
      await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      const m = String(e?.message || "").toLowerCase();
      if (
        m.includes("already") ||
        m.includes("conflict") ||
        m.includes("409")
      ) {
        console.log(`ℹ️ [${sessionId}] Already in group: ${link}`);
        continue;
      }
      console.log(
        `❌ [${sessionId}] Group join failed: ${link} | ${e?.message}`,
      );
    }
  }
});
