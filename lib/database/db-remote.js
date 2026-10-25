import fs from "fs";
import path from "path";
import SessionTTL from "@x-kira/ttl";

const DEFAULTS = {
  flushDelayMs: 25,
  cloudTimeoutMs: 15_000,
  syncIntervalMs: 30_000,
  reconnectBaseMs: 15_000,
  reconnectMaxMs: 5 * 60_000,
  syncChunk: 400,
  memPendingCap: 100_000,
  ttlMs: 10 * 60_000,
  ttlSweepMs: 60_000,
};

const UPSERT_SQL = `INSERT INTO settings (session_id, key, value) VALUES (?, ?, ?)
                    ON CONFLICT(session_id, key) DO UPDATE SET value = excluded.value`;
const BLOCK_SQL = `INSERT INTO blocked_sessions (session_id, blocked_at) VALUES (?, ?)
                   ON CONFLICT(session_id) DO UPDATE SET blocked_at = excluded.blocked_at`;

const ser = (v) => JSON.stringify(v === undefined ? null : v);
const deser = (raw) => {
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

// ─── Minimal Turso HTTP client (no native deps) ─────────────────────────────
const encArg = (v) => {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? { type: "integer", value: String(v) }
      : { type: "float", value: v };
  }
  return { type: "text", value: String(v) };
};
const decCell = (c) => {
  if (!c || c.type === "null") return null;
  if (c.type === "integer") return Number(c.value);
  if (c.type === "float") return Number(c.value);
  return c.value;
};

class TursoHttp {
  constructor(url, token, timeoutMs) {
    this.base = String(url)
      .replace(/^libsql:\/\//, "https://")
      .replace(/^wss?:\/\//, "https://")
      .replace(/\/+$/, "");
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  async _pipeline(req) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.base + "/v2/pipeline", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests: [req, { type: "close" }] }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 200);
        throw new Error(`turso HTTP ${res.status}: ${body}`);
      }
      const data = await res.json();
      const r = data.results?.[0];
      if (!r) throw new Error("turso: empty response");
      if (r.type === "error")
        throw new Error(r.error?.message || "turso error");
      return r.response;
    } catch (e) {
      if (e?.name === "AbortError")
        throw new Error(`turso timeout ${this.timeoutMs}ms`);
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  async execute(sql, args = []) {
    const r = await this._pipeline({
      type: "execute",
      stmt: { sql, args: args.map(encArg) },
    });
    const cols = (r.result?.cols || []).map((c) => c.name);
    const rows = (r.result?.rows || []).map((row) => {
      const o = {};
      row.forEach((cell, i) => (o[cols[i]] = decCell(cell)));
      return o;
    });
    return { rows };
  }

  /** Atomic batch: BEGIN, stmts (each only if previous ok), COMMIT / ROLLBACK. */
  async batch(stmts) {
    if (!stmts.length) return;
    const steps = [{ stmt: { sql: "BEGIN" } }];
    for (const s of stmts) {
      steps.push({
        stmt: { sql: s.sql, args: (s.args || []).map(encArg) },
        condition: { type: "ok", step: steps.length - 1 },
      });
    }
    steps.push({
      stmt: { sql: "COMMIT" },
      condition: { type: "ok", step: steps.length - 1 },
    });
    steps.push({
      stmt: { sql: "ROLLBACK" },
      condition: { type: "not", cond: { type: "ok", step: steps.length - 1 } },
    });
    const r = await this._pipeline({ type: "batch", batch: { steps } });
    const errs = r.result?.step_errors || [];
    const bad = errs.find((e) => e);
    if (bad) throw new Error(bad.message || "turso batch error");
  }
}

class WalDBFast {
  constructor(options = {}) {
    this.dir = options.dir
      ? String(options.dir)
      : path.join(process.cwd(), "data");
    this.dbFile = options.dbFile || "settings.sqlite";
    this.compactIntervalMs =
      typeof options.compactIntervalMs === "number"
        ? options.compactIntervalMs
        : 30_000;

    this.flushDelayMs =
      options.flushBatchDelayMs ??
      options.flushDelayMs ??
      DEFAULTS.flushDelayMs;
    this.cloudTimeoutMs = options.cloudTimeoutMs ?? DEFAULTS.cloudTimeoutMs;
    this.syncIntervalMs =
      options.cloudSyncIntervalMs ?? DEFAULTS.syncIntervalMs;
    this.reconnectBaseMs = options.reconnectBaseMs ?? DEFAULTS.reconnectBaseMs;
    this.reconnectMaxMs = options.reconnectMaxMs ?? DEFAULTS.reconnectMaxMs;
    this.pullOnStart = !!options.pullOnStart; // default: NO Turso reads on startup
    this.unblockOnRead = !!options.unblockOnRead;

    // TTL options
    //   ttlMs      : Idle time before evicting a session from memory (0 disables eviction).
    //   ttlSweepMs : Interval between eviction checks.
    //   lazyStart  : Defer loading session data until its first read or write.
    this.lazyStart = !!options.lazyStart;

    this.cloudUrl = options.cloudUrl || process.env.TURSO_DATABASE_URL || null;
    this.cloudAuthToken =
      options.cloudAuthToken || process.env.TURSO_AUTH_TOKEN || null;
    this.cloudEnabled =
      options.cloudSync !== false && !!this.cloudUrl && !!this.cloudAuthToken;

    this.cache = new Map();
    this._blocked = new Set();
    this._ops = [];
    this._opIndex = new Map();
    this._flushScheduled = false;
    this._flushTimer = null;
    this._chain = Promise.resolve();
    this._memPending = []; // only used if local sqlite is unavailable
    this._memId = 0;
    this._syncTimer = null;
    this._syncAttempt = 0;
    this._handshook = false;
    this._maintTimer = null;

    this.mode = "init"; // "init" | "hybrid" (local + Turso OK) | "local"
    this.cloud = null;
    this.local = null;
    this._ls = null;
    this._closing = false;
    this._closed = false;

    this._stats = {
      gets: 0,
      sets: 0,
      dels: 0,
      flushes: 0,
      flushFailures: 0,
      cloudPushes: 0,
      cloudOpsPushed: 0,
      cloudSyncFailures: 0,
      cloudPulls: 0,
      cloudRowsLoaded: 0,
      logouts: 0,
      autoUnblocks: 0,
    };

    // ── TTL (idle session eviction) ──
    this.ttl = new SessionTTL({
      ttlMs: options.ttlMs ?? DEFAULTS.ttlMs,
      sweepMs: options.ttlSweepMs ?? DEFAULTS.ttlSweepMs,
      getSessions: () => this.cache.keys(),
      getBusy: () => this._busySessions(),
      onEvict: (sid) => this.cache.delete(sid),
      onReload: (sid) => this._reloadSession(sid),
    });

    this._initPromise = this._init().catch((e) => {
      console.error(
        "[WalDBFast] init crashed (running memory-only)",
        e?.message || e,
      );
      if (this.mode === "init") this.mode = "local";
    });
  }

  ready() {
    return this._initPromise;
  }

  // ─── Init ────────────────────────────────────────────────────────────────

  async _init() {
    await fs.promises.mkdir(this.dir, { recursive: true }).catch(() => {});
    this.dbPath = path.join(this.dir, this.dbFile);

    await this._openLocal();
    let localEmpty = true;
    if (this.local) {
      this._loadFromLocal();
      localEmpty =
        Number(this._ls.countSettings.get().n) === 0 &&
        Number(this._ls.countBlocked.get().n) === 0;
    }

    if (this.cloudEnabled) {
      this.cloud = new TursoHttp(
        this.cloudUrl,
        this.cloudAuthToken,
        this.cloudTimeoutMs,
      );
      try {
        await this._cloudHandshake();
        if (this.pullOnStart || localEmpty) await this._pullFromCloud();
        this.mode = "hybrid";
        console.log(
          `[WalDBFast] mode=hybrid (local SQLite primary, Turso sync every ${this.syncIntervalMs / 1000}s)`,
        );
      } catch (e) {
        this.mode = "local";
        this._syncAttempt++;
        console.error(
          `[WalDBFast] Turso unavailable (${e?.message || e}) — local only, will retry`,
        );
      }
      if (this._pendingCount() > 0)
        this._scheduleSync(this.mode === "hybrid" ? 1000 : undefined);
    } else {
      this.mode = "local";
      console.warn(
        "[WalDBFast] Turso URL/token not set — using local SQLite only",
      );
    }

    if (this.compactIntervalMs > 0 && this.local) {
      this._maintTimer = setInterval(() => {
        try {
          this.local?.exec("PRAGMA wal_checkpoint(PASSIVE); PRAGMA optimize;");
        } catch {
          /* ignore */
        }
      }, this.compactIntervalMs);
      if (this._maintTimer.unref) this._maintTimer.unref();
    }

    // Run TTL eviction only with local SQLite available; otherwise eviction would lose data.
    if (this.ttl.enabled && this.local) {
      this.ttl.start();
      console.log(
        `[WalDBFast] TTL on: idle ${this.ttl.ttlMs / 1000}s → evict from RAM (sweep every ${this.ttl.sweepMs / 1000}s)`,
      );
    }

    if (this._ops.length) this._scheduleFlush();
  }

  // ─── Local SQLite (node:sqlite, built into Node 22.5+/24) ────────────────

  async _openLocal() {
    if (this.local) return this.local;
    try {
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(this.dbPath);
      db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS settings (
          session_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
          PRIMARY KEY (session_id, key));
        CREATE TABLE IF NOT EXISTS blocked_sessions (
          session_id TEXT PRIMARY KEY, blocked_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS pending_ops (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          op TEXT NOT NULL, sid TEXT NOT NULL, key TEXT, value TEXT, ts INTEGER NOT NULL);
      `);
      this._ls = {
        upsert: db.prepare(UPSERT_SQL),
        delKey: db.prepare(
          "DELETE FROM settings WHERE session_id = ? AND key = ?",
        ),
        delSession: db.prepare("DELETE FROM settings WHERE session_id = ?"),
        delAll: db.prepare("DELETE FROM settings"),
        delAllBlocked: db.prepare("DELETE FROM blocked_sessions"),
        all: db.prepare("SELECT session_id, key, value FROM settings"),
        loadSession: db.prepare(
          "SELECT key, value FROM settings WHERE session_id = ?",
        ),
        sessionIds: db.prepare("SELECT DISTINCT session_id FROM settings"),
        blockedAll: db.prepare("SELECT session_id FROM blocked_sessions"),
        insertBlocked: db.prepare(BLOCK_SQL),
        deleteBlocked: db.prepare(
          "DELETE FROM blocked_sessions WHERE session_id = ?",
        ),
        addPending: db.prepare(
          "INSERT INTO pending_ops (op, sid, key, value, ts) VALUES (?, ?, ?, ?, ?)",
        ),
        listPending: db.prepare(
          "SELECT id, op, sid, key, value FROM pending_ops ORDER BY id",
        ),
        delPending: db.prepare("DELETE FROM pending_ops WHERE id = ?"),
        countPending: db.prepare("SELECT COUNT(*) AS n FROM pending_ops"),
        countSettings: db.prepare("SELECT COUNT(*) AS n FROM settings"),
        countBlocked: db.prepare("SELECT COUNT(*) AS n FROM blocked_sessions"),
      };
      this.local = db;
    } catch (e) {
      console.error(
        "[WalDBFast] node:sqlite unavailable (need Node >= 22.5) — memory-only fallback:",
        e?.message || e,
      );
      this.local = null;
      this._ls = null;
    }
    return this.local;
  }

  _tx(fn) {
    this.local.exec("BEGIN");
    try {
      fn();
      this.local.exec("COMMIT");
    } catch (e) {
      try {
        this.local.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  _closeLocal() {
    if (!this.local) return;
    try {
      this.local.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      /* ignore */
    }
    try {
      this.local.close();
    } catch {
      /* ignore */
    }
    this.local = null;
    this._ls = null;
  }

  _loadFromLocal() {
    if (this.lazyStart && this.ttl.enabled) {
      // Mark session IDs as evicted and load their data on first access.
      for (const row of this._ls.sessionIds.all())
        this.ttl.markEvicted(String(row.session_id));
    } else {
      for (const row of this._ls.all.all()) {
        const sid = String(row.session_id);
        let m = this.cache.get(sid);
        if (!m) this.cache.set(sid, (m = new Map()));
        m.set(String(row.key), deser(row.value));
      }
    }
    for (const row of this._ls.blockedAll.all())
      this._blocked.add(String(row.session_id));
  }

  // ─── TTL helpers ─────────────────────────────────────────────────────────

  /** Return sessions with pending writes that must not be evicted. */
  _busySessions() {
    const busy = new Set();
    for (const o of this._ops) if (!o.dead) busy.add(o.sid);
    return busy;
  }

  /** Synchronously load one session from local SQLite into memory. */
  _reloadSession(sid) {
    if (!this._ls) return;
    const m = new Map();
    for (const row of this._ls.loadSession.all(sid))
      m.set(String(row.key), deser(row.value));
    this.cache.set(sid, m);
  }

  // ─── Turso helpers ───────────────────────────────────────────────────────

  async _cloudHandshake() {
    if (this._handshook) return;
    await this.cloud.batch([
      {
        sql: `CREATE TABLE IF NOT EXISTS settings (
                session_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
                PRIMARY KEY (session_id, key))`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS blocked_sessions (
                session_id TEXT PRIMARY KEY, blocked_at INTEGER NOT NULL)`,
      },
    ]);
    this._handshook = true;
  }

  /** Reads the whole Turso dataset. Used only on fresh install or forcePullFromCloud(). */
  async _pullFromCloud({ replace = false } = {}) {
    const rs = await this.cloud.execute(
      "SELECT session_id, key, value FROM settings",
    );
    const b = await this.cloud.execute(
      "SELECT session_id FROM blocked_sessions",
    );

    if (replace) {
      this.cache = new Map();
      this._blocked = new Set();
      this.ttl.reset();
    }
    let n = 0;
    for (const row of rs.rows) {
      const sid = String(row.session_id);
      const k = String(row.key);
      if (!replace && this._opIndex.has(sid + "\0" + k)) continue;
      if (!replace) this.ttl.ensureLoaded(sid); // Reload evicted local data before merging cloud values.
      let m = this.cache.get(sid);
      if (!m) this.cache.set(sid, (m = new Map()));
      if (replace || !m.has(k)) {
        m.set(k, deser(row.value));
        n++;
      }
    }
    for (const row of b.rows) this._blocked.add(String(row.session_id));

    if (this.local) {
      this._tx(() => {
        if (replace) {
          this._ls.delAll.run();
          this._ls.delAllBlocked.run();
        }
        for (const row of rs.rows)
          this._ls.upsert.run(
            String(row.session_id),
            String(row.key),
            row.value,
          );
        for (const row of b.rows)
          this._ls.insertBlocked.run(String(row.session_id), Date.now());
      });
    }
    this._stats.cloudPulls++;
    this._stats.cloudRowsLoaded += n;
  }

  // ─── Pending queue (local table, or RAM if no local DB) ──────────────────

  _pendingCount() {
    if (this._ls) return Number(this._ls.countPending.get().n);
    return this._memPending.length;
  }

  _readPending() {
    if (this._ls) {
      return this._ls.listPending.all().map((r) => ({
        id: r.id,
        t: r.op,
        sid: r.sid,
        key: r.key,
        value: r.value == null ? undefined : deser(r.value),
      }));
    }
    return this._memPending.slice();
  }

  _ackPending(ids) {
    if (!ids.length) return;
    if (this._ls) {
      this._tx(() => {
        for (const id of ids) this._ls.delPending.run(id);
      });
    } else {
      const s = new Set(ids);
      this._memPending = this._memPending.filter((o) => !s.has(o.id));
    }
  }

  /** Merge pending ops: only the last write per (session,key) is pushed. */
  _coalesce(items) {
    const list = [];
    const idx = new Map();
    const push = (key, item) => {
      const prev = idx.get(key);
      const ids = prev ? prev.ids : [];
      if (prev) prev.dead = true;
      ids.push(item.id);
      const op = { ...item, ids };
      idx.set(key, op);
      list.push(op);
    };
    for (const it of items) {
      if (it.t === "set" || it.t === "del") {
        push(it.sid + "\0" + it.key, it);
      } else if (it.t === "block" || it.t === "unblock") {
        push("b\0" + it.sid, it);
      } else if (it.t === "clear") {
        const ids = [];
        for (const [k, o] of idx) {
          if (o.sid === it.sid && (o.t === "set" || o.t === "del")) {
            o.dead = true;
            ids.push(...o.ids);
            idx.delete(k);
          }
        }
        ids.push(it.id);
        const op = { ...it, ids };
        list.push(op);
      }
    }
    return list.filter((o) => !o.dead);
  }

  // ─── Sync to Turso ───────────────────────────────────────────────────────

  _scheduleSync(delay) {
    if (!this.cloudEnabled || this._syncTimer || this._closing || this._closed)
      return;
    const d =
      delay ??
      (this._syncAttempt > 0
        ? Math.min(
            this.reconnectBaseMs * 2 ** Math.min(this._syncAttempt - 1, 10),
            this.reconnectMaxMs,
          )
        : this.syncIntervalMs);
    this._syncTimer = setTimeout(async () => {
      this._syncTimer = null;
      await this._exclusive(() => this._syncLocked()).catch(() => {});
      if (this._pendingCount() > 0) this._scheduleSync();
    }, d);
    if (this._syncTimer.unref) this._syncTimer.unref();
  }

  async _syncLocked() {
    if (!this.cloudEnabled || !this.cloud) return false;
    try {
      const items = this._readPending();
      if (items.length) {
        await this._cloudHandshake();
        const list = this._coalesce(items);
        for (let i = 0; i < list.length; i += DEFAULTS.syncChunk) {
          const chunk = list.slice(i, i + DEFAULTS.syncChunk);
          const stmts = chunk.map((o) => this._opToStmt(o)).filter(Boolean);
          await this.cloud.batch(stmts);
          this._ackPending(chunk.flatMap((o) => o.ids));
          this._stats.cloudPushes++;
          this._stats.cloudOpsPushed += stmts.length;
        }
      }
      if (this.mode !== "hybrid")
        console.log("[WalDBFast] Turso sync OK — mode=hybrid");
      this.mode = "hybrid";
      this._syncAttempt = 0;
      return true;
    } catch (e) {
      this._stats.cloudSyncFailures++;
      this._syncAttempt++;
      if (this.mode !== "local")
        console.warn(
          `[WalDBFast] Turso sync failed (${e?.message || e}) — local only, will retry`,
        );
      this.mode = "local";
      return false;
    }
  }

  _opToStmt(o) {
    switch (o.t) {
      case "set":
        return { sql: UPSERT_SQL, args: [o.sid, o.key, ser(o.value)] };
      case "del":
        return {
          sql: "DELETE FROM settings WHERE session_id = ? AND key = ?",
          args: [o.sid, o.key],
        };
      case "clear":
        return {
          sql: "DELETE FROM settings WHERE session_id = ?",
          args: [o.sid],
        };
      case "block":
        return { sql: BLOCK_SQL, args: [o.sid, o.ts || Date.now()] };
      case "unblock":
        return {
          sql: "DELETE FROM blocked_sessions WHERE session_id = ?",
          args: [o.sid],
        };
      default:
        return null;
    }
  }

  // ─── In-memory op queue (coalesces within flush window) ──────────────────

  _enqueue(op) {
    if (op.t === "set" || op.t === "del") {
      const ik = op.sid + "\0" + op.key;
      const ex = this._opIndex.get(ik);
      if (ex) {
        ex.t = op.t;
        ex.value = op.value;
        return ex;
      }
      this._opIndex.set(ik, op);
    } else if (op.t === "clear") {
      for (const [ik, o] of this._opIndex) {
        if (o.sid === op.sid) {
          op.resolvers.push(...o.resolvers);
          o.dead = true;
          this._opIndex.delete(ik);
        }
      }
    }
    this._ops.push(op);
    return op;
  }

  _scheduleFlush() {
    if (this._flushScheduled || this._closed) return;
    this._flushScheduled = true;
    this._flushTimer = setTimeout(() => {
      this._flushScheduled = false;
      this._flushTimer = null;
      this._flushNow().catch(() => {});
    }, this.flushDelayMs);
    if (this._flushTimer.unref) this._flushTimer.unref();
  }

  _exclusive(fn) {
    const p = this._chain.then(fn);
    this._chain = p.catch(() => {});
    return p;
  }

  _flushNow() {
    return this._exclusive(() => this._flushLocked());
  }

  _settle(ops, err) {
    for (const o of ops) {
      for (const r of o.resolvers) err ? r.rej(err) : r.res();
    }
  }

  async _flushLocked() {
    await this._initPromise;
    if (this._ops.length === 0) return;

    const all = this._ops;
    this._ops = [];
    this._opIndex = new Map();
    const ops = all.filter((o) => !o.dead);
    this._stats.flushes++;

    try {
      this._applyLocal(ops);
      this._settle(all);
      if (this.cloudEnabled && ops.length) this._scheduleSync();
    } catch (e) {
      this._stats.flushFailures++;
      console.error("[WalDBFast] local write failed", e);
      this._settle(all, e);
    }
  }

  /** One local transaction: apply to settings + add to the Turso sync queue. */
  _applyLocal(ops) {
    const keepPending = this.cloudEnabled;
    if (!this.local) {
      if (keepPending) {
        for (const o of ops) {
          this._memPending.push({
            id: ++this._memId,
            t: o.t,
            sid: o.sid,
            key: o.key,
            value: o.value,
            ts: o.ts,
          });
        }
        if (this._memPending.length > DEFAULTS.memPendingCap) {
          this._memPending.splice(
            0,
            this._memPending.length - DEFAULTS.memPendingCap,
          );
        }
      }
      return;
    }
    const L = this._ls;
    this._tx(() => {
      for (const o of ops) {
        switch (o.t) {
          case "set":
            L.upsert.run(o.sid, o.key, ser(o.value));
            break;
          case "del":
            L.delKey.run(o.sid, o.key);
            break;
          case "clear":
            L.delSession.run(o.sid);
            break;
          case "block":
            L.insertBlocked.run(o.sid, o.ts || Date.now());
            break;
          case "unblock":
            L.deleteBlocked.run(o.sid);
            break;
        }
        if (keepPending) {
          L.addPending.run(
            o.t,
            o.sid,
            o.key ?? null,
            o.t === "set" ? ser(o.value) : null,
            Date.now(),
          );
        }
      }
    });
  }

  // ─── Blocked sessions ────────────────────────────────────────────────────

  _touchWrite(sid) {
    if (!this._blocked.has(sid)) return;
    this._blocked.delete(sid);
    this._stats.autoUnblocks++;
    this._enqueue({ t: "unblock", sid, resolvers: [], ts: Date.now() });
  }

  isBlocked(sessionId) {
    return this._blocked.has(String(sessionId));
  }

  listBlockedSessions() {
    return Array.from(this._blocked);
  }

  // ─── Reads (memory; evicted sessions reload synchronously from SQLite) ────

  get(sessionId, key, defaultValue = undefined) {
    this._stats.gets++;
    const sid = String(sessionId);
    if (this.unblockOnRead) this._touchWrite(sid);
    this.ttl.ensureLoaded(sid);
    this.ttl.touch(sid);
    const s = this.cache.get(sid);
    if (!s) return defaultValue;
    const v = s.get(String(key));
    return v === undefined ? defaultValue : v;
  }

  getMany(sessionId, keys, defaultValue = undefined) {
    const sid = String(sessionId);
    if (this.unblockOnRead) this._touchWrite(sid);
    this.ttl.ensureLoaded(sid);
    this.ttl.touch(sid);
    const s = this.cache.get(sid);
    const out = Object.create(null);
    for (const key of keys) {
      const k = String(key);
      const v = s ? s.get(k) : undefined;
      out[k] = v === undefined ? defaultValue : v;
    }
    return out;
  }

  async getAsync(sessionId, key, defaultValue = undefined) {
    return this.get(sessionId, key, defaultValue);
  }

  // ─── Writes ──────────────────────────────────────────────────────────────

  _sess(sid) {
    this.ttl.ensureLoaded(sid); // Reload evicted data before applying changes.
    this.ttl.touch(sid);
    let s = this.cache.get(sid);
    if (!s) this.cache.set(sid, (s = new Map()));
    return s;
  }

  _write(sid, k, value) {
    this._touchWrite(sid);
    if (value === undefined) value = null;
    this._sess(sid).set(k, value);
    const op = this._enqueue({ t: "set", sid, key: k, value, resolvers: [] });
    this._scheduleFlush();
    return op;
  }

  set(sessionId, key, value) {
    this._stats.sets++;
    const op = this._write(String(sessionId), String(key), value);
    return new Promise((res, rej) => op.resolvers.push({ res, rej }));
  }

  async setMany(sessionId, kvObj) {
    const sid = String(sessionId);
    const ps = [];
    for (const [key, value] of Object.entries(kvObj)) {
      this._stats.sets++;
      const op = this._write(sid, String(key), value);
      ps.push(new Promise((res, rej) => op.resolvers.push({ res, rej })));
    }
    await Promise.all(ps);
  }

  setHot(sessionId, key, value) {
    this._stats.sets++;
    const sid = String(sessionId);
    const k = String(key);
    const op = this._write(sid, k, value);
    op.resolvers.push({
      res() {},
      rej: (e) =>
        console.error(
          `[WalDBFast] setHot failed (${sid}/${k})`,
          e?.message || e,
        ),
    });
  }

  del(sessionId, key) {
    this._stats.dels++;
    const op = this._delOp(String(sessionId), String(key));
    return new Promise((res, rej) => op.resolvers.push({ res, rej }));
  }

  delHot(sessionId, key) {
    const sid = String(sessionId);
    const k = String(key);
    const op = this._delOp(sid, k);
    op.resolvers.push({
      res() {},
      rej: (e) =>
        console.error(
          `[WalDBFast] delHot failed (${sid}/${k})`,
          e?.message || e,
        ),
    });
  }

  _delOp(sid, k) {
    this._touchWrite(sid);
    this.ttl.ensureLoaded(sid);
    this.ttl.touch(sid);
    this.cache.get(sid)?.delete(k);
    const op = this._enqueue({ t: "del", sid, key: k, resolvers: [] });
    this._scheduleFlush();
    return op;
  }

  clearSession(sessionId) {
    const sid = String(sessionId);
    this.cache.delete(sid);
    this.ttl.forget(sid);
    const op = this._enqueue({ t: "clear", sid, resolvers: [] });
    op.resolvers.push({
      res() {},
      rej: (e) =>
        console.error(
          `[WalDBFast] clearSession failed (${sid})`,
          e?.message || e,
        ),
    });
    this._scheduleFlush();
  }

  async logout(sessionId) {
    this._stats.logouts++;
    const sid = String(sessionId);
    this._blocked.add(sid);
    this._enqueue({ t: "block", sid, resolvers: [], ts: Date.now() });
    await this.flush();
  }

  // ─── Flush / sync / close ────────────────────────────────────────────────

  async flush() {
    if (this._closed) return;
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    this._flushScheduled = false;
    await this._flushNow();
  }

  /** Flush + push pending to Turso right now. Returns true if Turso is in sync. */
  async forceCloudSync() {
    if (!this.cloudEnabled) return false;
    await this.flush();
    return this._exclusive(() => this._syncLocked());
  }

  /** Re-pull everything from Turso and replace local + cache (costs Turso reads). */
  async forcePullFromCloud() {
    if (!this.cloudEnabled || !this.cloud) return false;
    if (!(await this.forceCloudSync())) return false;
    await this._exclusive(() => this._pullFromCloud({ replace: true }));
    return true;
  }

  /** Queue the entire local dataset for upload (use once to seed an empty Turso). */
  async pushAllToCloud() {
    if (!this.cloudEnabled) return false;
    await this.flush();
    // Include evicted sessions by loading them into memory before upload.
    for (const sid of Array.from(this.ttl.evicted)) this.ttl.ensureLoaded(sid);
    for (const [sid, m] of this.cache)
      for (const [k, v] of m) this._write(sid, k, v);
    for (const sid of this._blocked)
      this._enqueue({ t: "block", sid, resolvers: [], ts: Date.now() });
    await this.flush();
    return this.forceCloudSync();
  }

  async close() {
    if (this._closed) return;
    this._closing = true;
    if (this._maintTimer) clearInterval(this._maintTimer);
    if (this._syncTimer) clearTimeout(this._syncTimer);
    this.ttl.stop();

    try {
      await this.flush();
      if (this.cloudEnabled) await this._exclusive(() => this._syncLocked());
    } catch (e) {
      console.warn("[WalDBFast] flush on close failed", e?.message || e);
    }

    this._closeLocal();
    this._closed = true;
  }

  // ─── Stats & utils ───────────────────────────────────────────────────────

  getMode() {
    return this.mode;
  }

  stats() {
    let keys = 0;
    for (const m of this.cache.values()) keys += m.size;
    return {
      ...this._stats,
      ...this.ttl.stats(),
      mode: this.mode,
      cloudEnabled: this.cloudEnabled,
      cachedSessions: this.cache.size,
      cachedKeys: keys,
      pendingOps: this._ops.length,
      pendingCloudSync: this._pendingCount(),
      blockedSessions: this._blocked.size,
      closed: this._closed,
    };
  }

  isClosed() {
    return this._closed;
  }

  /** Export sessions currently in memory; use sessions() and exportSession() for all data. */
  export() {
    const out = Object.create(null);
    for (const [sid, map] of this.cache) {
      out[sid] = Object.create(null);
      for (const [k, v] of map) out[sid][k] = v;
    }
    return out;
  }

  exportSession(sessionId) {
    const sid = String(sessionId);
    this.ttl.ensureLoaded(sid);
    const out = Object.create(null);
    const s = this.cache.get(sid);
    if (s) for (const [k, v] of s) out[k] = v;
    return out;
  }

  /** RAM + evicted, session id. */
  sessions() {
    return this.ttl.allSessions(this.cache.keys());
  }
}

export default WalDBFast;
