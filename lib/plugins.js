import fs from "fs-extra";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.join(__dirname, "..", "plugins");

// ── Internal registries ────────────────────────────────────────────────────────
const commandMap = new Map(); // command string → plugin
const textPlugins = []; // plugins with on === "text"
const msgPlugins = []; // plugins with on === "message"
const allPlugins = []; // every registered plugin
const eventMap = new Map(); // event name → plugin[]  (connected, group-participants.update, ...)

let _pluginsSnapshot = null;
let _loadingPromise = null;
let _loadingDir = null;
let _loadedDir = null;
let _stage = null;
let _reloading = false;

const liveRegistry = {
  commandMap,
  textPlugins,
  msgPlugins,
  allPlugins,
  eventMap,
};

// ── match compiler ────────────────────────────────────────────────────────────
/**
 * meta.match is a synchronous pre-filter. A non-matching plugin is not
 * enqueued, avoiding unnecessary queue entries, timers, and closures.
 *
 *   match: /^hi\b/i          → msg.body test
 *   match: "http"            → body.startsWith("http")
 *   match: ["hi", "hello"]   → any startsWith
 *   match: (msg) => boolean  → custom
 */
function compileMatcher(m, label) {
  if (m == null) return null;
  if (typeof m === "function") return m;
  if (m instanceof RegExp) {
    // Global and sticky flags make RegExp.test() stateful, so remove them.
    const re = new RegExp(m.source, m.flags.replace(/[gy]/g, ""));
    return (msg) => re.test(msg?.body || "");
  }
  if (typeof m === "string") return (msg) => (msg?.body || "").startsWith(m);
  if (Array.isArray(m)) {
    const arr = m.filter((s) => typeof s === "string");
    return (msg) => {
      const b = msg?.body || "";
      for (const s of arr) if (b.startsWith(s)) return true;
      return false;
    };
  }
  console.warn(`[plugins] invalid "match" on ${label || "plugin"} — ignored`);
  return null;
}

// ── Module decorator ──────────────────────────────────────────────────────────

/**
 * Module(meta)(exec) — register a plugin.
 *
 * meta shape:
 *   command?: string          — command name (e.g. "menu")
 *   aliases?: string[]        — extra command names
 *   on?: string | string[]    — "text" | "message" | any event name
 *                               ("connected", "group-participants.update", "call", ...)
 *   match?: RegExp|string|string[]|fn — sync pre-filter for text/message plugins
 *   light?: boolean           — tiny/fast plugin (autoread, autotyping...). Light plugins
 *                               Light plugins for one message run together in one task.
 *   name?, description?, package?
 *
 * exec signatures (last arg = AbortSignal, optional to use):
 *   command : exec(msg, args, ctx, signal)
 *   text    : exec(msg, ctx, signal)
 *   message : exec(msg, ctx, signal)
 *   event   : exec(ctx, signal)
 *   group-participants.update (legacy): exec(null, data, sock, signal)
 */
export function Module(meta = {}) {
  return (exec) => {
    if (typeof exec !== "function") {
      console.warn(`[plugins] Module registered without exec function:`, meta);
      return;
    }

    const ons = Array.isArray(meta.on) ? meta.on : meta.on ? [meta.on] : [];
    const plugin = Object.freeze({
      ...meta,
      exec,
      _ons: Object.freeze(ons),
      _match: compileMatcher(meta.match, meta.name || meta.command),
    });

    const R = _stage || liveRegistry;

    if (plugin.command) {
      if (R.commandMap.has(plugin.command)) {
        console.warn(
          `[plugins] ⚠️  Duplicate command "${plugin.command}" — overwriting`,
        );
      }
      R.commandMap.set(plugin.command, plugin);
    }

    if (Array.isArray(plugin.aliases)) {
      for (const alias of plugin.aliases) {
        if (R.commandMap.has(alias)) {
          console.warn(
            `[plugins] ⚠️  Duplicate alias "${alias}" — overwriting`,
          );
        }
        R.commandMap.set(alias, plugin);
      }
    }

    for (const o of ons) {
      if (o === "text") R.textPlugins.push(plugin);
      else if (o === "message") R.msgPlugins.push(plugin);
      else {
        let list = R.eventMap.get(o);
        if (!list) R.eventMap.set(o, (list = []));
        list.push(plugin);
      }
    }

    R.allPlugins.push(plugin);
  };
}

// ── Snapshot helper ───────────────────────────────────────────────────────────

function getSnapshot() {
  const events = new Map();
  for (const [k, v] of eventMap) events.set(k, [...v]);

  const text = [...textPlugins];
  const message = [...msgPlugins];

  return {
    commands: new Map(commandMap),
    text,
    message,
    // Heavy plugins run individually; light plugins share one task per message.
    textHeavy: text.filter((p) => !p.light),
    textLight: text.filter((p) => p.light),
    messageHeavy: message.filter((p) => !p.light),
    messageLight: message.filter((p) => p.light),
    events,
    all: [...allPlugins],
  };
}

// ── Recursive file walker ─────────────────────────────────────────────────────
// These directories are skipped at every nesting level.
const SKIP_DIRS = new Set(["node_modules", "bin"]);

/**
 * Recursively find JavaScript files while skipping hidden paths and SKIP_DIRS.
 * Follow symlinks and use a visited set to prevent traversal loops.
 */
async function walkJsFiles(dir, _seen = new Set()) {
  const out = [];

  let real;
  try {
    real = await fs.realpath(dir);
  } catch {
    real = dir;
  }
  if (_seen.has(real)) return out; // Prevent symlink loops.
  _seen.add(real);

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`[plugins] Cannot read ${dir}:`, err?.message || err);
    return out;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);

    let isDir = e.isDirectory();
    let isFile = e.isFile();
    if (e.isSymbolicLink()) {
      try {
        const st = await fs.stat(full);
        isDir = st.isDirectory();
        isFile = st.isFile();
      } catch {
        continue; // Ignore broken symlinks.
      }
    }

    if (isDir) out.push(...(await walkJsFiles(full, _seen)));
    else if (isFile && e.name.endsWith(".js")) out.push(full);
  }
  return out;
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function _loadImpl(resolvedDir) {
  let files = [];
  try {
    await fs.access(resolvedDir);
    files = await walkJsFiles(resolvedDir);
  } catch (err) {
    console.error(
      "[plugins] Failed to read directory:",
      resolvedDir,
      err?.message || err,
    );
    _pluginsSnapshot = getSnapshot();
    return _pluginsSnapshot;
  }

  let failed = 0;
  for (const file of files) {
    const rel = path.relative(resolvedDir, file);
    try {
      await import(pathToFileURL(file).href);
      console.log(`[plugins] ✅ Loaded: ${rel}`);
    } catch (err) {
      console.error(`[plugins] ❌ Error loading ${rel}:`, err?.message || err);
      failed++;
    }
  }

  console.log(
    `[plugins] 📦 Commands: ${commandMap.size} | Text: ${textPlugins.length} | Message: ${msgPlugins.length} | Events: ${eventMap.size} | Total: ${allPlugins.length}` +
      (failed > 0 ? ` | ⚠️  Failed: ${failed}` : ""),
  );

  _loadedDir = resolvedDir;
  _pluginsSnapshot = getSnapshot();
  return _pluginsSnapshot;
}

/**
 * Import every JavaScript file under dir, including nested directories.
 * Concurrent calls for the same directory share one promise.
 */
export async function loadPlugins(dir = DEFAULT_DIR) {
  const resolvedDir = path.resolve(dir);

  while (_loadingPromise) {
    if (_loadingDir === resolvedDir) return _loadingPromise;
    await _loadingPromise.catch(() => {});
  }

  if (allPlugins.length > 0 && _loadedDir === resolvedDir) {
    return (_pluginsSnapshot ||= getSnapshot());
  }

  _loadingDir = resolvedDir;
  const p = _loadImpl(resolvedDir);
  _loadingPromise = p;
  try {
    return await p;
  } finally {
    if (_loadingPromise === p) _loadingPromise = null;
  }
}

// ── Hot reload ────────────────────────────────────────────────────────────────

/**
 * Re-import plugins without restarting or replacing WhatsApp sockets.
 * If every file fails, retain the existing registry.
 *
 * ESM modules cannot be removed from the module cache. Repeated reloads retain
 * old module instances, and plugin-owned timers or listeners may be duplicated.
 * Restart the process after repeated production reloads.
 */
export async function reloadPlugins(dir = _loadedDir || DEFAULT_DIR) {
  if (_reloading) throw new Error("reload already in progress");
  _reloading = true;

  const resolvedDir = path.resolve(dir);
  const stage = {
    commandMap: new Map(),
    textPlugins: [],
    msgPlugins: [],
    allPlugins: [],
    eventMap: new Map(),
  };
  const errors = [];
  let loaded = 0;
  let fileCount = 0;

  try {
    const files = await walkJsFiles(resolvedDir);
    fileCount = files.length;
    _stage = stage;

    for (const file of files) {
      const rel = path.relative(resolvedDir, file);
      try {
        const url = pathToFileURL(file).href + `?v=${Date.now()}`;
        await import(url);
        loaded++;
      } catch (err) {
        errors.push(`${rel}: ${err?.message || err}`);
        console.error(`[plugins] ❌ Reload error ${rel}:`, err?.message || err);
      }
    }
  } finally {
    _stage = null;
    _reloading = false;
  }

  // Keep the previous working registry if every plugin fails to load.
  if (fileCount > 0 && loaded === 0) {
    console.error(
      "[plugins] Reload aborted — every plugin failed, keeping old registry",
    );
    return {
      loaded: 0,
      failed: errors.length,
      errors,
      commands: commandMap.size,
      total: allPlugins.length,
      aborted: true,
    };
  }

  // Swap registry contents in place so the exported `commands` reference remains valid.
  commandMap.clear();
  for (const [k, v] of stage.commandMap) commandMap.set(k, v);
  textPlugins.length = 0;
  textPlugins.push(...stage.textPlugins);
  msgPlugins.length = 0;
  msgPlugins.push(...stage.msgPlugins);
  allPlugins.length = 0;
  allPlugins.push(...stage.allPlugins);
  eventMap.clear();
  for (const [k, v] of stage.eventMap) eventMap.set(k, v);

  _loadedDir = resolvedDir;
  _pluginsSnapshot = getSnapshot();

  console.log(
    `[plugins] 🔄 Reloaded — Commands: ${commandMap.size} | Events: ${eventMap.size} | Total: ${allPlugins.length}` +
      (errors.length ? ` | ⚠️  Failed: ${errors.length}` : ""),
  );

  return {
    loaded,
    failed: errors.length,
    errors,
    commands: commandMap.size,
    total: allPlugins.length,
  };
}

// ── Hot-path synchronous getter ───────────────────────────────────────────────

const EMPTY_SNAPSHOT = Object.freeze({
  commands: new Map(),
  text: [],
  message: [],
  textHeavy: [],
  textLight: [],
  messageHeavy: [],
  messageLight: [],
  events: new Map(),
  all: [],
});

/**
 * ensurePlugins() — synchronous snapshot getter for the hot message path.
 * Do NOT await this. Use forceLoadPlugins() at startup instead.
 */
export function ensurePlugins() {
  if (_pluginsSnapshot) return _pluginsSnapshot;

  if (!_loadingPromise) {
    loadPlugins().catch((err) => {
      console.error("[plugins] Background load failed:", err?.message || err);
    });
  }
  return EMPTY_SNAPSHOT;
}

// ── Startup loader ────────────────────────────────────────────────────────────

/**
 * forceLoadPlugins(dir) — awaitable, use at startup.
 */
export async function forceLoadPlugins(dir) {
  if (_pluginsSnapshot && (!dir || path.resolve(dir) === _loadedDir)) {
    return _pluginsSnapshot;
  }
  return loadPlugins(dir);
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const commands = commandMap;

export function getCommands() {
  return [...allPlugins];
}

export function getPluginInfo() {
  return {
    commands: Array.from(commandMap.keys()),
    textPlugins: textPlugins.map((p) => p.name || p.on || "unnamed"),
    msgPlugins: msgPlugins.map((p) => p.name || p.on || "unnamed"),
    events: Array.from(eventMap.entries()).map(([k, v]) => ({
      event: k,
      count: v.length,
    })),
    total: allPlugins.length,
    loadedDir: _loadedDir,
    loaded: _pluginsSnapshot !== null,
  };
}
