
import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs-extra";
import getPort from "get-port";
import { fileURLToPath } from "url";
import { forceLoadPlugins, getPluginInfo } from "./lib/plugins.js";
import { manager } from "./lib/manager.js";
import { db, pluginQueueStats, attachManagerEvents } from "./lib/client.js";
import initializeTelegramBot from "./tele/telebot.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UNCAUGHT_STORM_WINDOW_MS = 60_000;
const UNCAUGHT_STORM_THRESHOLD = 5;
let _uncaughtTimestamps = [];

function handleFatalIsolated(kind, err) {
  console.error(
    `[app] ⚠️ ${kind} (isolated — server keeps running):`,
    err?.stack || err?.message || err,
  );

  const now = Date.now();
  _uncaughtTimestamps.push(now);
  _uncaughtTimestamps = _uncaughtTimestamps.filter(
    (t) => now - t <= UNCAUGHT_STORM_WINDOW_MS,
  );

  if (_uncaughtTimestamps.length >= UNCAUGHT_STORM_THRESHOLD) {
    console.error(
      `[app] 🔴 ${_uncaughtTimestamps.length} uncaught errors in the last ` +
        `${UNCAUGHT_STORM_WINDOW_MS}ms — process looks unstable, not just a ` +
        `single isolated fault. Shutting down gracefully so a process ` +
        `manager can restart clean, instead of continuing to run in a ` +
        `possibly-corrupted state.`,
    );
    gracefulShutdown(`${kind}-storm`).catch(() => process.exit(1));
  }
}

process.on("uncaughtException", (err) =>
  handleFatalIsolated("uncaughtException", err),
);
process.on("unhandledRejection", (reason) =>
  handleFatalIsolated("unhandledRejection", reason),
);

// ── Express setup ──────────────────────────────────────────────────────────────

const app = express();
// limit body size to 1mb
app.use(bodyParser.json({ limit: "1mb" }));

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Format a pairing code as AAAA-BBBB-CCCC-DDDD */
function fmtCode(raw) {
  if (!raw) return raw;
  const s = String(raw).replace(/\s+/g, "");
  return s.match(/.{1,4}/g)?.join("-") || s;
}

/**
 * sanitize session IDs — only alphanumeric + _ . - @
 */
function sanitizeSid(sid) {
  if (typeof sid !== "string") return null;
  const safe = sid.trim().replace(/[^A-Za-z0-9_.\-@]/g, "");
  return safe.length > 0 ? safe : null;
}

/** validate a bare phone number: E.164 digits, no + */
function validPhone(phone) {
  return /^[1-9][0-9]{6,14}$/.test(phone);
}

/**
 * Generate a temporary sessionId for a fresh pairing attempt:
 * `${phoneNumber}_${randomId}`. This id is only ever "promoted" to a
 * permanent, DB-persisted session once pairing actually succeeds — see
 * manager.awaitPairingOutcome(). Until then it's just a scratch id that
 * gets thrown away (creds deleted) on failure/disconnect/timeout.
 */
function makeTempSessionId(phone) {
  const randomId = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit numeric
  return `${phone}_${randomId}`;
}

/**
 * wait for a session to reach "open" state via manager events,
 * not by attaching directly to sock.ev (which bypasses SessionManager).
 * NOTE: only useful when creds already exist (e.g. /start route on an
 * already-registered session). Do NOT use this before requestPairingCode —
 * a fresh session can never reach "open" until the code is entered on the
 * phone, so waiting here first just burns the whole timeout for nothing.
 */
function waitForSessionOpen(sessionId, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    // If already connected, resolve immediately
    if (manager.isRunning(sessionId)) return resolve();

    const timer = setTimeout(() => {
      manager.removeListener("connected", onConnected);
      manager.removeListener("session.deleted", onDeleted);
      reject(new Error(`Timed out waiting for ${sessionId} to connect`));
    }, timeoutMs);

    function onConnected(sid) {
      if (sid !== sessionId) return;
      cleanup();
      resolve();
    }
    function onDeleted(sid) {
      if (sid !== sessionId) return;
      cleanup();
      reject(new Error(`Session ${sessionId} was deleted before connecting`));
    }
    function cleanup() {
      clearTimeout(timer);
      manager.removeListener("connected", onConnected);
      manager.removeListener("session.deleted", onDeleted);
    }

    manager.on("connected", onConnected);
    manager.on("session.deleted", onDeleted);
  });
}

/**
 * FIX #3: clean up a stale/stuck session entry before a fresh pairing attempt.
 * If a previous /pair attempt died mid-flight, manager.sessions may still hold
 * an entry stuck in "starting"/"reconnecting"/"connecting" (or a dead socket),
 * which makes manager.start() return null on the next attempt (FIX #2 below
 * handles that case too, but clearing stale state up front avoids the wait).
 */
async function cleanupStaleSession(sid) {
  const entry = manager.sessions.get(sid);
  if (!entry) return;

  const stuckStatus = ["starting", "reconnecting", "connecting"].includes(
    entry.status,
  );
  const deadSocket = entry.sock && manager.isRunning?.(sid) === false;

  if (stuckStatus || deadSocket) {
    try {
      await manager.stop(sid);
    } catch {
      /* ignore — best effort */
    }
  }
}

/**
 * FIX #2 (caller-side safety net): manager.start() can legitimately return
 * null if a start was already in-flight for this session. Poll briefly for
 * the socket to appear instead of treating null as a hard failure.
 */
async function startWithRetry(
  sid,
  { attempts = 5, delayMs = 300, priority = false } = {},
) {
  let sock = await manager.start(sid, { priority });
  for (let i = 0; !sock && i < attempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    sock =
      manager.sessions.get(sid)?.sock ||
      (await manager.start(sid, { priority }));
  }
  return sock;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

/** Pairing website (public/index.html) */
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/** Simple per-IP rate limit for /pair (max 5 requests / minute) */
const _pairHits = new Map();
function pairRateLimit(req, res, next) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
  const now = Date.now();
  const hits = (_pairHits.get(ip) || []).filter((t) => now - t < 60_000);
  if (hits.length >= 5) {
    return res
      .status(429)
      .json({ ok: false, error: "Onek beshi request — ekto pore abar try korun" });
  }
  hits.push(now);
  _pairHits.set(ip, hits);
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, ts] of _pairHits) {
    if (!ts.some((t) => now - t < 60_000)) _pairHits.delete(ip);
  }
}, 120_000).unref();

/** Health check */
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    status: "Baileys Multi-Session Bot",
    sessions: manager.list().length,
    plugins: getPluginInfo().total,
    queue: pluginQueueStats(),
  });
});

/** List all known sessions */
app.get("/sessions", (_req, res) => {
  res.json({ ok: true, sessions: manager.list() });
});

/**
 * Start / wake a session for a given phone number (non-blocking — socket
 * may still be connecting).
 *
 * User only supplies the phone number here — never the sessionId. We look
 * up the permanent `${phone}_${randomId}` sessionId that was saved the
 * last time this phone number completed pairing successfully. If none is
 * found, the caller needs to /pair first.
 */
app.get("/start/:phone", async (req, res) => {
  const phone = String(req.params.phone || "").replace(/\D/g, "");
  if (!validPhone(phone)) {
    return res.status(400).json({ ok: false, error: "Invalid phone number" });
  }

  try {
    const sid = await manager.findSessionIdByPhone(phone);
    if (!sid) {
      return res.status(404).json({
        ok: false,
        error:
          "No paired session found for this phone number — pair first via /pair/:num",
      });
    }

    await startWithRetry(sid);
    res.json({ ok: true, sessionId: sid, running: manager.isRunning(sid) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get("/pair/:num", pairRateLimit, async (req, res) => {
  const phone = String(req.params.num || "").replace(/\D/g, "");

  if (!validPhone(phone)) {
    return res.status(400).json({
      ok: false,
      error: "phone must be digits only (E.164 without +), e.g. 919812345678",
    });
  }

  const sid = makeTempSessionId(phone);
  if (!manager.reservePhonePairing(phone, sid)) {
    return res.status(409).json({
      ok: false,
      error: "A pairing attempt is already in progress for this phone number",
    });
  }

  try {
    // Check and clean up only after reserving the phone number, so two
    // concurrent requests cannot delete each other's in-progress session.
    const connectedSid = await manager.findConnectedSessionIdByPhone(phone);
    if (connectedSid) {
      manager.releasePhonePairing(sid);
      return res.status(409).json({
        ok: false,
        error: "This phone number already has a connected, paired session",
        sessionId: connectedSid,
      });
    }

    await manager.cleanupPhoneSessions(phone);
    await cleanupStaleSession(sid);

    const rawCode = await manager.requestPairingCode(sid, phone, {
      timeoutMs: 30_000,
    });
    const code = fmtCode(rawCode);

    manager
      .awaitPairingOutcome(sid, { timeoutMs: 180_000 })
      .then(({ success }) => {
        if (success) {
          console.log(`[app] Pairing ${sid} completed — session saved`);
        } else {
          console.log(
            `[app] Pairing ${sid} did not complete — temp session discarded`,
          );
        }
      })
      .catch((e) => {
        console.error(
          `[app] awaitPairingOutcome error for ${sid}:`,
          e?.message || e,
        );
      });

    return res.json({ ok: true, sessionId: sid, phone, code });
  } catch (e) {
    manager.releasePhonePairing(sid);
    manager.logout(sid).catch(() => {});
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/** Stop a session (graceful — keeps credentials) */
app.post("/stop/:sessionId", async (req, res) => {
  const sid = sanitizeSid(req.params.sessionId);
  if (!sid)
    return res.status(400).json({ ok: false, error: "Invalid sessionId" });

  try {
    const ok = await manager.stop(sid);
    res.json({ ok, sessionId: sid });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/** Logout (permanent — deletes credentials) */
app.post("/logout/:sessionId", async (req, res) => {
  const sid = sanitizeSid(req.params.sessionId);
  if (!sid)
    return res.status(400).json({ ok: false, error: "Invalid sessionId" });

  try {
    const ok = await manager.logout(sid);
    res.json({ ok, sessionId: sid });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/** Session detail */
app.get("/session/:sessionId", (req, res) => {
  const sid = sanitizeSid(req.params.sessionId);
  if (!sid)
    return res.status(400).json({ ok: false, error: "Invalid sessionId" });

  const entry = manager.sessions.get(sid);
  if (!entry)
    return res.status(404).json({ ok: false, error: "Session not found" });

  res.json({
    ok: true,
    sessionId: sid,
    status: entry.status,
    running: manager.isRunning(sid),
    reconnectAttempts: entry.reconnectAttempts || 0,
  });
});

/** Plugin info endpoint */
app.get("/plugins", (_req, res) => {
  res.json({ ok: true, ...getPluginInfo() });
});

let server = null;
let _shuttingDown = false;

async function gracefulShutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;

  console.log(`\n[app] Received ${signal} — shutting down...`);
  const timeout = setTimeout(() => {
    console.error("[app] Shutdown timed out — forcing exit");
    process.exit(1);
  }, 15_000);
  if (timeout?.unref) timeout.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }

    await manager.stopAll();

    await db.flush();
    await db.close();
    console.log("[app] Clean shutdown complete");
  } catch (e) {
    console.error("[app] Shutdown error:", e?.message || e);
  } finally {
    clearTimeout(timeout);
    process.exit(0);
  }
}

process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

// ── Startup ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || (await getPort({ port: 3000 }));

(async function init() {
  try {
    console.log("[app] Initializing...");
    await Promise.all([forceLoadPlugins(), db.ready()]);
    attachManagerEvents();
    await manager.loadSavedSessions();
    try {
      if (!process.env.OFFTELEBOT || process.env.OFFTELEBOT === "false") {
        await initializeTelegramBot(manager);
      }
    } catch (error) {
      console.error(error);
    }
    console.log("[app] DB ready, plugins loaded, sessions started");

    server = app.listen(PORT, () => {
      console.log(`[app] 🚀 Server listening on port ${PORT}`);
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`[app] ❌ Port ${PORT} is already in use`);
      } else {
        console.error("[app] Server error:", err.message);
      }
      process.exit(1);
    });
  } catch (err) {
    console.error("[app] Fatal initialization error:", err?.message || err);
    process.exit(1);
  }
})();
