import pino from "pino";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { ensurePlugins } from "./plugins.js";
import Serializer, {
  getGroupMetadata,
  invalidateGroupMetadata,
  clearSessionGroupCache,
} from "./serialize.js";
import config from "../config.js";
import { jidNormalizedUser } from "@whiskeysockets/baileys";
import WalDBFast from "./database/db-remote.js";
import { manager } from "./manager.js";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

/*
 * Plugin execution signatures use an optional final AbortSignal, which is aborted on timeout:
 *   command : exec(msg, args, ctx, signal)
 *   text    : exec(msg, ctx, signal)
 *   message : exec(msg, ctx, signal)
 *   event   : exec(ctx, signal)
 *   group-participants.update : exec(null, data, sock, signal)
 *
 * Priority: COMMAND > EVENT > MESSAGE/TEXT. Under load, MESSAGE/TEXT tasks may be dropped; commands are preserved.
 */

// ── Constants ──────────────────────────────────────────────────────────────────
const num = (k, d) => {
  const n = Number(process.env[k]);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const CMD_TIMEOUT_MS = num("CMD_TASK_TIMEOUT_MS", 60_000);
const TEXT_TIMEOUT_MS = num("TEXT_TASK_TIMEOUT_MS", 15_000);
const EVENT_TIMEOUT_MS = num("EVENT_TASK_TIMEOUT_MS", 120_000);
const CONNECTED_TIMEOUT_MS = num("CONNECTED_TASK_TIMEOUT_MS", 300_000);

const PER_SESSION_CONCURRENCY = num("PLUGIN_CONCURRENCY", 8); // A lower cap prevents one session from monopolizing the scheduler.
const PER_SESSION_QUEUE_LIMIT = num("PLUGIN_QUEUE_LIMIT", 200);
const GLOBAL_PLUGIN_CONCURRENCY = num("GLOBAL_PLUGIN_CONCURRENCY", 150);
const EVENT_GLOBAL_CONCURRENCY = num("EVENT_GLOBAL_CONCURRENCY", 40); // Prevents reconnect events from starving command tasks.

// Drop jobs that wait longer than these limits to prevent unbounded backlog growth.
const CMD_MAX_WAIT_MS = num("CMD_MAX_WAIT_MS", 30_000);
const MSG_MAX_WAIT_MS = num("MSG_MAX_WAIT_MS", 10_000);

const MSG_MAX_AGE_MS = num("MSG_MAX_AGE_MS", 120_000); // Ignore stale messages redelivered after a reconnect.
const DEDUPE_MAX = num("MSG_DEDUPE_MAX", 300);

const CMD_RATE_MAX = num("CMD_RATE_MAX", 6); // per sender, per window
const CMD_RATE_WINDOW_MS = num("CMD_RATE_WINDOW_MS", 10_000);

const LAG_SHED_MS = num("LAG_SHED_MS", 400); // Shed low-priority work when p99 event-loop lag exceeds this limit.
const HEALTH_LOG_MS = num("HEALTH_LOG_MS", 60_000);

// Lower values have higher priority.
const P_CMD = 0;
const P_EVENT = 1;
const P_MSG = 2;
const MAX_WAIT = [CMD_MAX_WAIT_MS, CONNECTED_TIMEOUT_MS, MSG_MAX_WAIT_MS];

const noop = () => {};

// ── DB ─────────────────────────────────────────────────────────────────────────
export const db = new WalDBFast({
  cloudUrl: config.TURSO_DATABASE_URL,
  cloudAuthToken: config.TURSO_AUTH_TOKEN,
});

export const toBool = (v) =>
  v === true ||
  v === 1 ||
  ["true", "on", "yes", "1", "enable", "enabled", "public"].includes(
    String(v).toLowerCase(),
  );

// ── Stats ──────────────────────────────────────────────────────────────────────
const stats = {
  timeouts: 0,
  zombies: 0, // Tasks that timed out but are still running in the background.
  dropped: { queueFull: 0, expired: 0, shed: 0, rateLimited: 0 },
};

function dropped(reason) {
  const e = new Error(`task dropped: ${reason}`);
  e.code = "DROPPED";
  return e;
}

function logTaskError(sessionId, label, err) {
  if (err?.code === "DROPPED") return; // Dropped-task counts are reported in health logs.
  logger.error({ sessionId, err: err?.message }, `[client] ${label} error`);
}

// ── Global concurrency gate (priority + per-class cap) ────────────────────────
const gate = {
  active: 0,
  queues: [[], [], []],
  classActive: [0, 0, 0],
  caps: [Infinity, EVENT_GLOBAL_CONCURRENCY, Infinity],
};

function gatePump() {
  while (gate.active < GLOBAL_PLUGIN_CONCURRENCY) {
    let p = -1;
    for (let i = 0; i < 3; i++) {
      if (gate.queues[i].length && gate.classActive[i] < gate.caps[i]) {
        p = i;
        break;
      }
    }
    if (p === -1) return;
    gate.active++;
    gate.classActive[p]++;
    gate.queues[p].shift()();
  }
}

function globalAcquire(prio) {
  return new Promise((resolve) => {
    gate.queues[prio].push(() => {
      let done = false;
      resolve(() => {
        if (done) return;
        done = true;
        gate.active--;
        gate.classActive[prio]--;
        gatePump();
      });
    });
    gatePump();
  });
}

export function globalQueueStats() {
  return {
    active: gate.active,
    queued:
      gate.queues[0].length + gate.queues[1].length + gate.queues[2].length,
    byClass: {
      command: gate.classActive[0],
      event: gate.classActive[1],
      message: gate.classActive[2],
    },
    zombies: stats.zombies,
    timeouts: stats.timeouts,
    dropped: { ...stats.dropped },
  };
}

// ── Per-session scheduler ──────────────────────────────────────────────────────
const _sessions = new Map(); // sessionId → { active, queues:[[],[],[]] }

function getSq(sessionId) {
  let sq = _sessions.get(sessionId);
  if (!sq) {
    sq = { active: 0, queues: [[], [], []] };
    _sessions.set(sessionId, sq);
  }
  return sq;
}

const queuedCount = (sq) =>
  sq.queues[0].length + sq.queues[1].length + sq.queues[2].length;

function dropJob(job, reason) {
  stats.dropped[reason]++;
  job.reject(dropped(reason));
}

/**
 * Reserve a slot synchronously so a burst of messages cannot all pass the
 * concurrency check before setImmediate runs.
 */
function pumpSession(sessionId, sq) {
  while (sq.active < PER_SESSION_CONCURRENCY) {
    const job =
      sq.queues[0].shift() || sq.queues[1].shift() || sq.queues[2].shift();
    if (!job) return;
    sq.active++;
    setImmediate(runJob, sessionId, sq, job);
  }
}

async function runJob(sessionId, sq, job) {
  let release = null;
  let timer = null;
  try {
    release = await globalAcquire(job.prio);

    if (Date.now() - job.at > job.maxWaitMs) {
      stats.dropped.expired++;
      throw dropped("expired");
    }

    const ac = new AbortController();
    let timedOut = false;

    const result = await new Promise((res, rej) => {
      timer = setTimeout(() => {
        timedOut = true;
        stats.timeouts++;
        stats.zombies++;
        try {
          ac.abort();
        } catch {
          /* ignore */
        }
        rej(new Error(`task timeout ${job.timeoutMs}ms`));
      }, job.timeoutMs);

      Promise.resolve()
        .then(() => job.fn(ac.signal))
        .then(
          (v) => {
            if (timedOut) stats.zombies--;
            res(v);
          },
          (e) => {
            if (timedOut) stats.zombies--;
            rej(e);
          },
        );
    });

    job.resolve(result);
  } catch (err) {
    job.reject(err);
  } finally {
    if (timer) clearTimeout(timer);
    if (release) release();
    sq.active--;
    pumpSession(sessionId, sq);
  }
}

function enqueueTask(
  sessionId,
  fn,
  { prio = P_MSG, timeoutMs = CMD_TIMEOUT_MS, maxWaitMs } = {},
) {
  if (prio === P_MSG && _overloaded) {
    stats.dropped.shed++;
    return Promise.reject(dropped("shed"));
  }

  const sq = getSq(sessionId);

  return new Promise((resolve, reject) => {
    const job = {
      fn,
      resolve,
      reject,
      prio,
      timeoutMs,
      maxWaitMs: maxWaitMs || MAX_WAIT[prio],
      at: Date.now(),
    };

    if (queuedCount(sq) >= PER_SESSION_QUEUE_LIMIT) {
      // Queue full: high-priority kaj ashle sobcheye low-priority purano job ta fele dao
      let evicted = false;
      for (let i = 2; i > prio; i--) {
        const victim = sq.queues[i].shift();
        if (victim) {
          dropJob(victim, "queueFull");
          evicted = true;
          break;
        }
      }
      if (!evicted) {
        dropJob(job, "queueFull");
        return;
      }
    }

    sq.queues[prio].push(job);
    pumpSession(sessionId, sq);
  });
}

export function pluginQueueStats(sessionId) {
  if (sessionId) {
    const sq = _sessions.get(sessionId);
    return sq
      ? { active: sq.active, queued: queuedCount(sq) }
      : { active: 0, queued: 0 };
  }
  const out = {};
  for (const [sid, sq] of _sessions)
    out[sid] = { active: sq.active, queued: queuedCount(sq) };
  return out;
}

// ── Health monitor + load shedding ────────────────────────────────────────────
const lagHist = monitorEventLoopDelay({ resolution: 20 });
let _overloaded = false;
let _lastLagMs = 0;
let _healthTimer = null;

export function getHealth() {
  const m = process.memoryUsage();
  return {
    lagP99Ms: Math.round(_lastLagMs),
    overloaded: _overloaded,
    heapMB: Math.round(m.heapUsed / 1048576),
    rssMB: Math.round(m.rss / 1048576),
    sessionsWithQueues: _sessions.size,
    ...globalQueueStats(),
  };
}

function startHealthMonitor() {
  if (_healthTimer) return;
  lagHist.enable();
  let tick = 0;
  const everyLog = Math.max(1, Math.round(HEALTH_LOG_MS / 5_000));

  _healthTimer = setInterval(() => {
    tick++;
    const lag = lagHist.percentile(99) / 1e6;
    lagHist.reset();
    _lastLagMs = Number.isFinite(lag) ? lag : 0;

    // hysteresis: LAG_SHED_MS e on, er adhek e off
    const was = _overloaded;
    _overloaded = _overloaded
      ? _lastLagMs > LAG_SHED_MS / 2
      : _lastLagMs > LAG_SHED_MS;
    if (_overloaded !== was) {
      logger.warn(
        { lagP99Ms: Math.round(_lastLagMs) },
        _overloaded
          ? "[client] event loop overloaded — shedding message/text plugins"
          : "[client] load recovered",
      );
    }

    // expired rate-limit entries saf
    const now = Date.now();
    for (const [k, r] of _rate) if (r.reset <= now) _rate.delete(k);

    if (tick % everyLog === 0 || _lastLagMs > 100) {
      const h = getHealth();
      const d = stats.dropped;
      const lvl = _overloaded || h.zombies > 20 ? "warn" : "info";
      logger[lvl](h, "[client] health");
      if (d.queueFull || d.expired || d.shed || d.rateLimited) {
        logger.warn({ ...d }, "[client] tasks dropped since last report");
        d.queueFull = d.expired = d.shed = d.rateLimited = 0;
      }
    }
  }, 5_000);
  if (_healthTimer.unref) _healthTimer.unref();
}

// ── Plugin context ─────────────────────────────────────────────────────────────
// Plugins get everything via ctx — no need to import client.js (no circular imports).
function makeCtx(sessionId, event, data, extra = {}) {
  const sock = manager.sessions.get(sessionId)?.sock;
  return {
    sessionId,
    sock,
    event,
    data,
    db,
    toBool,
    config,
    logger,
    manager,
    ...extra,
  };
}

// ── Event dispatcher ───────────────────────────────────────────────────────────
// Runs every plugin registered for `name`. Never throws.
function emit(name, sessionId, data, extra = {}) {
  const list = ensurePlugins().events?.get(name);
  if (!list?.length) return;

  const ctx = makeCtx(sessionId, name, data, extra);
  const timeoutMs =
    name === "connected" ? CONNECTED_TIMEOUT_MS : EVENT_TIMEOUT_MS;

  for (const p of list) {
    // legacy signature for group plugins: exec(null, event, sock)
    const call =
      name === "group-participants.update"
        ? (signal) => p.exec(null, data, ctx.sock, signal)
        : (signal) => p.exec(ctx, signal);

    enqueueTask(sessionId, call, {
      prio: P_EVENT,
      timeoutMs,
      maxWaitMs: timeoutMs,
    }).catch((err) =>
      logTaskError(sessionId, `event "${name}" plugin ${p.name || ""}`, err),
    );
  }
}

// ── onConnected ────────────────────────────────────────────────────────────────
function onConnected(sessionId) {
  try {
    const entry = manager.sessions.get(sessionId);
    if (!entry?.sock) return;
    const sock = entry.sock;

    try {
      entry.serializer = new Serializer(sock, sessionId);
    } catch (e) {
      logger.warn({ sessionId, err: e?.message }, "[client] Serializer failed");
      entry.serializer = null;
    }

    sock.sessionId = sessionId;
    const botjid = jidNormalizedUser(sock.user?.id || "");
    const botNumber = botjid.split("@")[0];
    logger.info({ sessionId, botNumber }, "✅ Connected");

    // welcome / follow / auto-join etc. are all plugins on "connected"
    emit("connected", sessionId, null, { botjid, botNumber });
  } catch (err) {
    logger.error(
      { sessionId, err: err?.message || err },
      "[client] onConnected error",
    );
  }
}

// ── Message helpers ────────────────────────────────────────────────────────────

// Baileys redelivery / retry e same message duibar ashte pare
const _seen = new Map(); // sessionId → Set<messageId>
function seenBefore(sessionId, id) {
  if (!id) return false;
  let s = _seen.get(sessionId);
  if (!s) _seen.set(sessionId, (s = new Set()));
  if (s.has(id)) return true;
  s.add(id);
  if (s.size > DEDUPE_MAX) s.delete(s.values().next().value);
  return false;
}

function msgAgeMs(raw) {
  const t = raw?.messageTimestamp;
  const s = typeof t === "number" ? t : Number(t?.toString?.() ?? t);
  return Number.isFinite(s) && s > 0 ? Date.now() - s * 1000 : 0;
}

// per-sender command rate limit
const _rate = new Map(); // `${sessionId}:${sender}` → { n, reset }
function rateLimited(key) {
  const now = Date.now();
  let r = _rate.get(key);
  if (!r || r.reset <= now) {
    r = { n: 0, reset: now + CMD_RATE_WINDOW_MS };
    _rate.set(key, r);
  }
  return ++r.n > CMD_RATE_MAX;
}

function matches(plugin, msg) {
  const m = plugin._match;
  if (!m) return true;
  try {
    return !!m(msg);
  } catch {
    return false;
  }
}

/**
 * Pin the message while it is queued so its raw payload is not removed before
 * a plugin calls getRaw(). Release the pin on success, failure, or timeout.
 */
function submitMsgTask(sessionId, msg, fn, opts, label) {
  const release = typeof msg.pin === "function" ? msg.pin() : noop;
  enqueueTask(
    sessionId,
    async (signal) => {
      try {
        return await fn(signal);
      } finally {
        release();
      }
    },
    opts,
  ).catch((err) => {
    release(); // Idempotent; also releases the pin when a task is dropped or expires.
    logTaskError(sessionId, label, err);
  });
}

function dispatchMsgPlugins(sessionId, msg, getCtx, heavy, light, label) {
  const opts = { prio: P_MSG, timeoutMs: TEXT_TIMEOUT_MS };

  // Heavy plugins run as separate tasks; unmatched plugins are not enqueued.
  if (heavy?.length) {
    for (const p of heavy) {
      if (!matches(p, msg)) continue;
      submitMsgTask(
        sessionId,
        msg,
        (signal) => p.exec(msg, getCtx(), signal),
        opts,
        `${label} plugin ${p.name || ""}`,
      );
    }
  }

  // Light plugins for one message share a task and run through Promise.allSettled.
  if (light?.length) {
    const hits = [];
    for (const p of light) if (matches(p, msg)) hits.push(p);
    if (hits.length) {
      submitMsgTask(
        sessionId,
        msg,
        async (signal) => {
          const ctx = getCtx();
          const results = await Promise.allSettled(
            hits.map((p) => (async () => p.exec(msg, ctx, signal))()),
          );
          results.forEach((r, i) => {
            if (r.status === "rejected") {
              logger.error(
                { sessionId, err: r.reason?.message },
                `[client] light ${label} plugin ${hits[i].name || ""} error`,
              );
            }
          });
        },
        opts,
        `${label} light bundle`,
      );
    }
  }
}

// ── attachManagerEvents ────────────────────────────────────────────────────────
let _eventsAttached = false;

export function attachManagerEvents() {
  if (_eventsAttached) return;
  _eventsAttached = true;

  startHealthMonitor();

  manager.on("connected", onConnected);

  manager.on("session.deleted", (sessionId) => {
    emit("session.deleted", sessionId, null);

    const sq = _sessions.get(sessionId);
    if (sq) {
      // Clear command and message jobs, but allow session.deleted event jobs to run.
      for (const i of [P_CMD, P_MSG]) {
        for (const job of sq.queues[i]) job.reject(dropped("sessionDeleted"));
        sq.queues[i].length = 0;
      }
      _sessions.delete(sessionId);
    }
    _seen.delete(sessionId);
    clearSessionGroupCache(sessionId);
    logger.info({ sessionId }, "[client] session deleted");
  });

  manager.on("connection.update", (sessionId, update) => {
    logger.debug({ sessionId, update }, "[client] connection.update");
    emit("connection.update", sessionId, update);

    if (update?.connection === "open") emit("open", sessionId, update);
    if (update?.connection === "close") {
      const statusCode = update?.lastDisconnect?.error?.output?.statusCode;
      emit("close", sessionId, update, { statusCode });
    }
  });

  manager.on("qr", (sessionId, qr) => {
    logger.info({ sessionId }, "[client] QR ready");
    emit("qr", sessionId, qr);
  });

  manager.on("call", (sessionId, callData) => {
    emit("call", sessionId, Array.isArray(callData) ? callData : [callData]);
  });

  // Invalidate cached metadata when the manager emits a groups.update event.
  manager.on("groups.update", (sessionId, updates) => {
    for (const u of Array.isArray(updates) ? updates : [updates]) {
      if (u?.id) invalidateGroupMetadata(sessionId, u.id);
    }
    emit("groups.update", sessionId, updates);
  });

  manager.on("group-participants.update", async (sessionId, event) => {
    try {
      const sock = manager.sessions.get(sessionId)?.sock;
      if (!sock) return;
      const groupJid = event?.id || event?.groupJid || "";
      if (!groupJid) return;

      // Refresh metadata after participant changes; concurrent fetches share the same request.
      invalidateGroupMetadata(sessionId, groupJid);
      const md =
        (await getGroupMetadata(sock, sessionId, groupJid, { force: true })) ||
        {};

      const incoming = (event.participants || [])
        .map((p) => (typeof p === "string" ? p : p?.id || p?.jid || ""))
        .filter(Boolean);

      emit("group-participants.update", sessionId, {
        ...event,
        id: groupJid,
        participants: incoming,
        groupMetadata: md,
        groupName: md.subject || "",
        groupSize: Array.isArray(md.participants) ? md.participants.length : 0,
        action: event.action || "",
        sessionId,
      });
    } catch (err) {
      logger.error(
        { sessionId, err: err?.message || err },
        "[client] group-participants.update error",
      );
    }
  });

  manager.on("messages.upsert", (sessionId, upsert) => {
    emit("messages.upsert", sessionId, upsert);

    // "append" contains history sync and the bot's own messages, not new commands.
    if (upsert?.type !== "notify") return;
    const list = upsert.messages;
    if (!list?.length) return;

    const entry = manager.sessions.get(sessionId);
    if (!entry?.sock) return;

    // Process every message in the batch instead of only the first one.
    for (const raw of list) {
      if (!raw?.message) continue;
      if (msgAgeMs(raw) > MSG_MAX_AGE_MS) continue;
      if (seenBefore(sessionId, raw.key?.id)) continue;

      _handleMessage(sessionId, entry, raw).catch((err) => {
        logger.error(
          { sessionId, err: err?.message || err },
          "[client] message handler crash",
        );
      });
    }
  });
}

// ── _handleMessage ──────────────────────────────────────────────────────────
async function _handleMessage(sessionId, entry, raw) {
  // Recreate the serializer when reconnecting replaces its socket.
  let serializer = entry.serializer;
  if (!serializer || serializer.conn !== entry.sock) {
    try {
      serializer = entry.serializer = new Serializer(entry.sock, sessionId);
    } catch (e) {
      logger.warn(
        { sessionId, err: e?.message },
        "[client] Serializer create failed",
      );
      return;
    }
  }

  let msg;
  try {
    msg = serializer.serializeSync(raw);
  } catch (e) {
    logger.warn({ sessionId, err: e?.message }, "[client] serialize failed");
    return;
  }
  if (!msg) return;

  // Newsletter & status → their own events (plugins decide what to do)
  if (msg.from?.endsWith("@newsletter")) {
    emit("newsletter", sessionId, msg, { raw });
    return;
  }
  if (msg.from === "status@broadcast") {
    emit("status", sessionId, msg, { raw });
    return;
  }

  const plugins = ensurePlugins();
  let ctx = null;
  const getCtx = () => (ctx ??= makeCtx(sessionId, "message", msg, { raw }));

  const body = msg.body || "";

  // ── Commands (highest priority) ──
  const prefix = config.prefix || ".";
  if (body.startsWith(prefix)) {
    // Read mode only for commands rather than for every incoming message.
    let modeVal = db.get(sessionId, "mode", undefined);
    if (modeVal === undefined) {
      const botJid = jidNormalizedUser(entry.sock.user?.id || "");
      modeVal = botJid ? db.get(botJid, "mode", true) : true;
    }
    if (modeVal && typeof modeVal.then === "function") modeVal = await modeVal; // Support asynchronous database adapters.

    if (toBool(modeVal) || msg.isFromMe) {
      const trimmed = body.slice(prefix.length).trim();
      const ws = /\s/.exec(trimmed); // space / newline / tab
      const cmd = ws ? trimmed.slice(0, ws.index) : trimmed;
      const args = ws ? trimmed.slice(ws.index + 1) : "";

      if (cmd) {
        const plugin =
          plugins.commands.get(cmd) || plugins.commands.get(cmd.toLowerCase());
        if (plugin) {
          if (!msg.isFromMe && rateLimited(`${sessionId}:${msg.sender}`)) {
            stats.dropped.rateLimited++;
          } else {
            submitMsgTask(
              sessionId,
              msg,
              (signal) => plugin.exec(msg, args, getCtx(), signal),
              { prio: P_CMD, timeoutMs: CMD_TIMEOUT_MS },
              `cmd "${cmd}"`,
            );
          }
        }
      }
    }
  }

  // ── autoread / autotyping / autorecord / autoreact … ──
  dispatchMsgPlugins(
    sessionId,
    msg,
    getCtx,
    plugins.messageHeavy,
    plugins.messageLight,
    "message",
  );

  // ── text plugins ──
  if (body) {
    dispatchMsgPlugins(
      sessionId,
      msg,
      getCtx,
      plugins.textHeavy,
      plugins.textLight,
      "text",
    );
  }
}
