import axios from "axios";
import os from "os";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";
import net from "net";
import dns from "dns";
import { Readable } from "stream";

const require = createRequire(import.meta.url);

/* ================================================================
 * ORIGINAL FUNCTIONS
 * ============================================================== */

export async function getJson(url, options = {}) {
  try {
    const res = await axios({
      method: "GET",
      url,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36",
      },
      ...options,
    });
    return res.data;
  } catch (err) {
    // preserve previous behavior (returned error). If you prefer, change to: throw err;
    return err;
  }
}

export function MediaUrls(text) {
  if (typeof text !== "string") return false;
  const array = [];
  const regexp =
    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()'@:%_\+.~#?!&\/=]*)/gi;
  const urls = text.match(regexp);
  if (urls) {
    urls.forEach((url) => {
      const ext = url.split(".").pop().split(/[?#]/)[0].toLowerCase();
      if (["jpg", "jpeg", "png", "gif", "mp4", "webp"].includes(ext)) {
        array.push(url);
      }
    });
    return array;
  }
  return false;
}

export default function eventlogger() {
  ["error", "warn", "info", "debug", "trace"].forEach((method) => {
    console[method] = () => {};
  });

  const loggingLibraries = ["pino"];
  loggingLibraries.forEach((lib) => {
    try {
      const logger = require(lib);
      if (logger && logger.createLogger) {
        logger.createLogger = () => ({
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        });
      }
    } catch {}
  });
}

export function detectPlatformName({
  env = process.env,
  osModule = os,
  fsModule = fs,
  emoji = false,
} = {}) {
  const hasAny = (...keys) => keys.some((k) => !!env[k]);

  const checks = [
    {
      name: "Vercel",
      test: () => hasAny("VERCEL", "VERCEL_ENV", "NOW_REGION"),
    },
    {
      name: "Railway",
      test: () => hasAny("RAILWAY_STATIC_URL", "RAILWAY_ENVIRONMENT"),
    },
    {
      name: "Render",
      test: () => hasAny("RENDER", "RENDER_INSTANCE_ID", "RENDER_EXTERNAL_URL"),
    },
    {
      name: "Netlify",
      test: () => hasAny("NETLIFY", "NETLIFY_BUILD_ID", "NETLIFY_AUTH_TOKEN"),
    },
    {
      name: "Heroku",
      test: () => hasAny("HEROKU_APP_NAME", "HEROKU_API_KEY", "DYNO"),
    },
    { name: "Replit", test: () => hasAny("REPL_ID", "REPL_SLUG") },
    {
      name: "Glitch",
      test: () =>
        hasAny("PROJECT_REMIX_CHAIN", "GIT_REPO_SLUG", "GLITCH_PROJECT"),
    },
    { name: "Fly.io", test: () => hasAny("FLY_REGION", "FLY_APP_NAME") },
    {
      name: "Cloudflare",
      test: () => hasAny("CF_PAGES", "CF_ACCOUNT_ID", "CLOUDFLARE_WORKERS"),
    },
    {
      name: "AWS",
      test: () =>
        hasAny(
          "AWS_EXECUTION_ENV",
          "AWS_LAMBDA_FUNCTION_NAME",
          "ECS_CONTAINER_METADATA_URI",
          "EC2_INSTANCE_ID",
        ),
    },
    {
      name: "Google Cloud",
      test: () =>
        hasAny(
          "GCP_PROJECT",
          "GAE_SERVICE",
          "GCP_INSTANCE_ID",
          "FUNCTION_NAME",
          "K_SERVICE",
        ),
    },
    {
      name: "Azure",
      test: () =>
        hasAny(
          "WEBSITE_SITE_NAME",
          "FUNCTIONS_WORKER_RUNTIME",
          "WEBSITE_INSTANCE_ID",
          "AZURE_HTTP_USER_AGENT",
        ),
    },
    {
      name: "Kubernetes",
      test: () => !!(env.KUBERNETES_SERVICE_HOST || env.KUBE_SERVICE_PORT),
    },
    { name: "Termux (Android)", test: () => hasAny("TERMUX_VERSION") },
    {
      name: "CI (GitHub/GitLab/Circle)",
      test: () => hasAny("GITHUB_ACTIONS", "GITLAB_CI", "CIRCLECI"),
    },
  ];

  for (const c of checks) {
    try {
      if (c.test()) return emoji ? addEmoji(c.name) : c.name;
    } catch (e) {
      // ignore and continue
    }
  }

  try {
    if (fsModule) {
      if (fsModule.existsSync("/.dockerenv"))
        return emoji ? addEmoji("Docker") : "Docker";
      if (fsModule.existsSync("/run/.containerenv"))
        return emoji ? addEmoji("Container") : "Container";
      if (fsModule.existsSync("/proc/1/cgroup")) {
        const cg = fsModule.readFileSync("/proc/1/cgroup", "utf8");
        if (
          cg &&
          (cg.includes("docker") ||
            cg.includes("kubepods") ||
            cg.includes("containerd") ||
            cg.includes("lxc"))
        ) {
          const n = cg.includes("kubepods") ? "Kubernetes" : "Docker";
          return emoji ? addEmoji(n) : n;
        }
      }
    }
  } catch (e) {
    // ignore fs errors
  }

  // WSL detection
  try {
    const release =
      osModule.release && typeof osModule.release === "function"
        ? osModule.release().toLowerCase()
        : "";
    if (hasAny("WSL_DISTRO_NAME") || release.includes("microsoft"))
      return emoji ? addEmoji("WSL") : "WSL";
  } catch (e) {
    /* ignore */
  }

  // Fallback to OS type
  try {
    const t =
      osModule.type && typeof osModule.type === "function"
        ? osModule.type()
        : "";
    const map = { Linux: "Linux", Darwin: "macOS", Windows_NT: "Windows" };
    if (t in map) return emoji ? addEmoji(map[t]) : map[t];
    if (t) return emoji ? addEmoji(t) : t;
  } catch (e) {
    /* ignore */
  }

  return emoji ? addEmoji("Unknown") : "Unknown";
}

function addEmoji(name) {
  const map = {
    Railway: "🚄 Railway",
    Vercel: "⚡ Vercel",
    Render: "🎛️ Render",
    Netlify: "🌊 Netlify",
    Heroku: "☘️ Heroku",
    Replit: "🔁 Replit",
    Glitch: "🧩 Glitch",
    "Fly.io": "✈️ Fly.io",
    Cloudflare: "☁️ Cloudflare",
    AWS: "☁️ AWS",
    "Google Cloud": "☁️ Google Cloud",
    Azure: "🔷 Azure",
    Kubernetes: "☸️ Kubernetes",
    Docker: "🐳 Docker",
    Container: "📦 Container",
    WSL: "🪟 WSL",
    "Termux (Android)": "📱 Termux (Android)",
    Linux: "🐧 Linux",
    macOS: "🍎 macOS",
    Windows: "🪟 Windows",
    Unknown: "❓ Unknown",
  };
  return map[name] || name;
}

/* ================================================================
 * NEW: TIMING & ASYNC
 * ============================================================== */

/** 1. Wait for ms milliseconds */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 2. Wait a random time between min and max ms */
export const randomDelay = (min = 500, max = 1500) =>
  sleep(randomInt(min, max));

/** 3. Retry an async function with backoff */
export async function retry(
  fn,
  { retries = 3, delay = 500, factor = 2, onRetry } = {},
) {
  let attempt = 0;
  let wait = delay;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries) throw err;
      if (onRetry) onRetry(err, attempt + 1);
      await sleep(wait);
      wait *= factor;
      attempt++;
    }
  }
}

/** 4. Reject if promise takes longer than ms */
export function withTimeout(promise, ms, message = "Operation timed out") {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 5. Run async tasks with limited concurrency */
export async function runWithConcurrency(tasks, limit = 5) {
  const results = new Array(tasks.length);
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    async () => {
      while (i < tasks.length) {
        const idx = i++;
        results[idx] = await tasks[idx]();
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/** 6. Debounce */
export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** 7. Throttle */
export function throttle(fn, wait = 300) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      return fn(...args);
    }
  };
}

/** 8. Memoize with optional TTL (ms) */
export function memoize(fn, ttl = 0) {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    const hit = cache.get(key);
    if (hit && (!ttl || Date.now() - hit.t < ttl)) return hit.v;
    const v = fn(...args);
    cache.set(key, { v, t: Date.now() });
    return v;
  };
}

/** 9. Per-key cooldown tracker (e.g. per user command cooldown) */
export function createCooldown(ms = 3000) {
  const map = new Map();
  return {
    check(key) {
      const left = (map.get(key) || 0) - Date.now();
      return left > 0 ? left : 0;
    },
    set(key) {
      map.set(key, Date.now() + ms);
    },
    hit(key) {
      const left = this.check(key);
      if (left > 0) return left;
      this.set(key);
      return 0;
    },
    clear(key) {
      key === undefined ? map.clear() : map.delete(key);
    },
  };
}

/** 10. Sliding-window rate limiter: allow `max` calls per `windowMs` per key */
export function createRateLimiter(max = 5, windowMs = 10000) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      hits.set(key, arr);
      return false;
    }
    arr.push(now);
    hits.set(key, arr);
    return true;
  };
}

/* ================================================================
 * NEW: NUMBERS & RANDOM
 * ============================================================== */

/** 11. Random integer in [min, max] */
export const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/** 12. Pick a random element */
export const pickRandom = (arr) =>
  arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;

/** 13. Clamp a number */
export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

/** 14. Percentage */
export const percentage = (part, total, digits = 1) =>
  total ? Number(((part / total) * 100).toFixed(digits)) : 0;

/** 15. Is numeric string/number */
export const isNumeric = (v) =>
  (typeof v === "number" && Number.isFinite(v)) ||
  (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));

/** 16. Format number with thousand separators */
export const formatNumber = (n, locale = "en-US") =>
  new Intl.NumberFormat(locale).format(n);

/** 17. Random alphanumeric string */
export function randomString(
  length = 8,
  chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

/** 18. UUID v4 */
export const uuid = () => crypto.randomUUID();

/* ================================================================
 * NEW: ARRAYS & OBJECTS
 * ============================================================== */

/** 19. Shuffle (Fisher-Yates, returns new array) */
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 20. Split array into chunks */
export function chunk(arr, size = 10) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 21. Unique values */
export const unique = (arr) => [...new Set(arr)];

/** 22. Group array by key or fn */
export function groupBy(arr, keyOrFn) {
  const fn = typeof keyOrFn === "function" ? keyOrFn : (x) => x[keyOrFn];
  return arr.reduce((acc, item) => {
    const k = fn(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {});
}

/** 23. Sort by key (asc/desc), non-mutating */
export function sortBy(arr, key, dir = "asc") {
  const get = typeof key === "function" ? key : (x) => x[key];
  const m = dir === "desc" ? -1 : 1;
  return [...arr].sort((a, b) =>
    get(a) > get(b) ? m : get(a) < get(b) ? -m : 0,
  );
}

/** 24. Is plain object */
export const isObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** 25. Is empty (null, "", [], {}) */
export function isEmpty(v) {
  if (v == null) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (isObject(v)) return Object.keys(v).length === 0;
  return false;
}

/** 26. Deep clone */
export function deepClone(v) {
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

/** 27. Deep merge (objects only, arrays replaced) */
export function deepMerge(target, ...sources) {
  const out = { ...target };
  for (const src of sources) {
    for (const [k, v] of Object.entries(src || {})) {
      out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k], v) : v;
    }
  }
  return out;
}

/** 28. Pick keys from object */
export const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

/** 29. Omit keys from object */
export const omit = (obj, keys) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

/** 30. Safe JSON.parse with fallback */
export function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/** 31. Safe JSON.stringify (handles circular refs and BigInt) */
export function safeStringify(obj, space = 2) {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (_, v) => {
      if (typeof v === "bigint") return v.toString();
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    },
    space,
  );
}

/** 32. Is valid JSON string */
export function isJson(str) {
  if (typeof str !== "string") return false;
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/** 33. String to boolean */
export const toBool = (v, def = false) => {
  if (typeof v === "boolean") return v;
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off"].includes(s)) return false;
  return def;
};

/* ================================================================
 * NEW: STRINGS
 * ============================================================== */

/** 34. Capitalize first letter */
export const capitalize = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);

/** 35. Title Case */
export const titleCase = (s = "") =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** 36. camelCase */
export const camelCase = (s = "") =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""));

/** 37. snake_case */
export const snakeCase = (s = "") =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();

/** 38. slugify */
export const slugify = (s = "") =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** 39. Truncate with ellipsis */
export const truncate = (s = "", n = 100, ell = "…") =>
  s.length > n ? s.slice(0, Math.max(0, n - ell.length)) + ell : s;

/** 40. Escape regex special chars */
export const escapeRegExp = (s = "") =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 41. Strip ANSI color codes */
export const stripAnsi = (s = "") => s.replace(/\u001b\[[0-9;]*m/g, "");

/** 42. Base64 encode */
export const base64Encode = (s) => Buffer.from(s).toString("base64");

/** 43. Base64 decode */
export const base64Decode = (s) => Buffer.from(s, "base64").toString("utf8");

/** 44. Hash (md5, sha1, sha256...) */
export const hash = (data, algo = "sha256") =>
  crypto.createHash(algo).update(data).digest("hex");

/* ================================================================
 * NEW: VALIDATION & EXTRACTION
 * ============================================================== */

/** 45. Is valid http(s) URL */
export function isUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** 46. Extract all URLs from text */
export const extractUrls = (text = "") =>
  text.match(/https?:\/\/[^\s<>"']+/gi) || [];

/** 47. Is valid email */
export const isEmail = (s = "") => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/** 48. Extract emails from text */
export const extractEmails = (text = "") =>
  text.match(/[^\s@]+@[^\s@]+\.[^\s@]{2,}/g) || [];

/** 49. Extract all digit sequences */
export const extractNumbers = (text = "") =>
  (text.match(/\d+/g) || []).map(Number);

/** 50. Normalize phone number (digits only) */
export const normalizePhone = (s = "") => String(s).replace(/\D/g, "");

/** 51. Is plausible phone number (E.164: 7-15 digits) */
export const isValidPhone = (s = "") => {
  const n = normalizePhone(s);
  return n.length >= 7 && n.length <= 15;
};

/* ================================================================
 * NEW: WHATSAPP / BAILEYS HELPERS
 * ============================================================== */

/** 52. "8801xxxx@s.whatsapp.net" -> "8801xxxx" (also strips :device suffix) */
export const jidToNumber = (jid = "") =>
  String(jid).split("@")[0].split(":")[0];

/** 53. "8801xxxx" -> "8801xxxx@s.whatsapp.net" */
export const numberToJid = (num) => `${normalizePhone(num)}@s.whatsapp.net`;

/** 54. Is group JID */
export const isGroupJid = (jid = "") => String(jid).endsWith("@g.us");

/** 55. Is broadcast / status JID */
export const isBroadcastJid = (jid = "") => String(jid).endsWith("@broadcast");

/** 56. Is LID JID */
export const isLidJid = (jid = "") => String(jid).endsWith("@lid");

/** 57. Parse "!cmd arg1 arg2" into { prefix, command, args, text } */
export function parseCommand(body = "", prefixes = ["!", ".", "/", "#"]) {
  const text = String(body).trim();
  const prefix = prefixes.find((p) => text.startsWith(p));
  if (!prefix) return null;
  const [command, ...args] = text.slice(prefix.length).trim().split(/\s+/);
  if (!command) return null;
  return { prefix, command: command.toLowerCase(), args, text: args.join(" ") };
}

/** 58. Extract @mentions (numbers) from text */
export const getMentions = (text = "") =>
  [...String(text).matchAll(/@(\d{5,15})/g)].map((m) => m[1]);

/** 59. Parse flags: "--name=foo -v --count 3" -> { name:'foo', v:true, count:'3' } */
export function parseArgs(argv = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) out[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("-")) out[k] = argv[++i];
      else out[k] = true;
    } else if (a.startsWith("-") && a.length > 1) {
      out[a.slice(1)] = true;
    } else out._.push(a);
  }
  return out;
}

/* ================================================================
 * NEW: TIME & FORMATTING
 * ============================================================== */

/** 60. Format bytes -> "1.5 MB" */
export function formatBytes(bytes, decimals = 2) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(
    Math.floor(Math.log(Math.abs(bytes)) / Math.log(k)),
    sizes.length - 1,
  );
  return `${parseFloat((bytes / k ** i).toFixed(decimals))} ${sizes[i]}`;
}

/** 61. Seconds -> "1d 2h 3m 4s" (bot uptime style) */
export function runtime(seconds = process.uptime()) {
  seconds = Math.floor(seconds);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`]
    .filter(Boolean)
    .join(" ");
}

/** 62. Milliseconds -> readable duration */
export const formatDuration = (ms) => runtime(Math.floor(ms / 1000));

/** 63. Parse "10s", "5m", "2h", "1d" -> ms */
export function parseDuration(str) {
  const m = String(str)
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?$/i);
  if (!m) return null;
  const mult = { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };
  return Math.round(parseFloat(m[1]) * mult[(m[2] || "ms").toLowerCase()]);
}

/** 64. Format date with timezone */
export function formatDate(
  date = new Date(),
  { locale = "en-GB", timeZone = "Asia/Dhaka", ...opts } = {},
) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
    ...opts,
  }).format(new Date(date));
}

/** 65. "5 minutes ago" / "in 2 hours" */
export function timeAgo(date, locale = "en") {
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs || unit === "second")
      return rtf.format(Math.round(diff / secs), unit);
  }
}

/** 66. Greeting by time of day */
export function getGreeting(timeZone = "Asia/Dhaka") {
  const hour =
    Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone,
      }).format(new Date()),
    ) % 24;
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

/* ================================================================
 * NEW: HTTP & FILES
 * ============================================================== */

/** 67. POST JSON (returns data or the error, like getJson) */
export async function postJson(url, data = {}, options = {}) {
  try {
    const res = await axios({ method: "POST", url, data, ...options });
    return res.data;
  } catch (err) {
    return err;
  }
}

/** 68. Fetch a URL as Buffer */
export async function fetchBuffer(url, options = {}) {
  const res = await axios({
    method: "GET",
    url,
    responseType: "arraybuffer",
    headers: { "User-Agent": "Mozilla/5.0" },
    ...options,
  });
  return Buffer.from(res.data);
}

/** 69. Download a URL to disk, returns the output path */
export async function downloadFile(url, outPath) {
  ensureDir(path.dirname(outPath));
  const buf = await fetchBuffer(url);
  await fs.promises.writeFile(outPath, buf);
  return outPath;
}

/** 70. Get file extension (lowercase, no dot) from path or URL */
export const getExtension = (s = "") =>
  path.extname(String(s).split(/[?#]/)[0]).slice(1).toLowerCase();

/** 71. Basic mime type from extension */
export function getMimeType(fileOrExt = "") {
  const ext = fileOrExt.includes(".")
    ? getExtension(fileOrExt)
    : fileOrExt.toLowerCase();
  const map = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    mkv: "video/x-matroska",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    opus: "audio/ogg; codecs=opus",
    pdf: "application/pdf",
    zip: "application/zip",
    json: "application/json",
    txt: "text/plain",
    html: "text/html",
    css: "text/css",
    js: "text/javascript",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return map[ext] || "application/octet-stream";
}

/** 72. Classify a file/url: image | video | audio | document | other */
export function getFileType(fileOrUrl = "") {
  const ext = getExtension(fileOrUrl);
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext))
    return "image";
  if (["mp4", "mkv", "webm", "mov", "avi"].includes(ext)) return "video";
  if (["mp3", "ogg", "wav", "m4a", "opus", "aac"].includes(ext)) return "audio";
  if (
    ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "zip"].includes(
      ext,
    )
  )
    return "document";
  return "other";
}

/** 73. Create directory recursively if missing */
export function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 74. File exists? */
export const fileExists = (p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
};

/** 75. Read JSON file safely */
export function readJsonFile(p, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

/** 76. Write JSON file (creates folders) */
export function writeJsonFile(p, data, space = 2) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, space));
  return p;
}

/** 77. Delete file safely (no throw) */
export function deleteFile(p) {
  try {
    fs.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

/** 78. Temp file path */
export const tmpFile = (ext = "tmp") =>
  path.join(os.tmpdir(), `${Date.now()}_${randomString(6)}.${ext}`);

/* ================================================================
 * NEW: SYSTEM INFO
 * ============================================================== */

/** 79. Process memory usage (formatted) */
export function getMemoryUsage() {
  const m = process.memoryUsage();
  return {
    rss: formatBytes(m.rss),
    heapUsed: formatBytes(m.heapUsed),
    heapTotal: formatBytes(m.heapTotal),
    external: formatBytes(m.external),
  };
}

/** 80. CPU summary */
export function getCpuInfo() {
  const cpus = os.cpus() || [];
  return {
    model: cpus[0]?.model || "Unknown",
    cores: cpus.length,
    load: os.loadavg().map((n) => +n.toFixed(2)),
  };
}

/** 81. Full system info */
export function getSystemInfo() {
  return {
    platform: detectPlatformName(),
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    node: process.version,
    cpu: getCpuInfo(),
    memory: {
      total: formatBytes(os.totalmem()),
      free: formatBytes(os.freemem()),
      used: formatBytes(os.totalmem() - os.freemem()),
    },
    uptime: runtime(os.uptime()),
    botUptime: runtime(process.uptime()),
  };
}

/* ================================================================
 * PART 2 — ARRAYS
 * ============================================================== */

export const first = (a, n) => (n === undefined ? a[0] : a.slice(0, n));
export const last = (a, n) => (n === undefined ? a[a.length - 1] : a.slice(-n));
export const nth = (a, i) => a[i < 0 ? a.length + i : i];
export const take = (a, n = 1) => a.slice(0, Math.max(0, n));
export const takeRight = (a, n = 1) => (n > 0 ? a.slice(-n) : []);
export const drop = (a, n = 1) => a.slice(Math.max(0, n));
export const dropRight = (a, n = 1) => a.slice(0, Math.max(0, a.length - n));
export function takeWhile(a, fn) {
  const o = [];
  for (const x of a) {
    if (!fn(x)) break;
    o.push(x);
  }
  return o;
}
export function dropWhile(a, fn) {
  let i = 0;
  while (i < a.length && fn(a[i])) i++;
  return a.slice(i);
}
export const compact = (a) => a.filter(Boolean);
export const flatten = (a) => a.flat(1);
export const flattenDeep = (a) => a.flat(Infinity);
export const difference = (a, b) => {
  const s = new Set(b);
  return a.filter((x) => !s.has(x));
};
export const intersection = (a, b) => {
  const s = new Set(b);
  return unique(a.filter((x) => s.has(x)));
};
export const union = (...arrs) => unique(arrs.flat());
export const xor = (a, b) => [...difference(a, b), ...difference(b, a)];
export const zip = (...arrs) =>
  Array.from(
    { length: arrs.reduce((m, x) => Math.max(m, x.length), 0) },
    (_, i) => arrs.map((x) => x[i]),
  );
export const unzip = (a) => zip(...a);
export function range(start, end, step = 1) {
  if (end === undefined) {
    end = start;
    start = 0;
  }
  const o = [];
  if (!step) return o;
  if (step > 0) for (let i = start; i < end; i += step) o.push(i);
  else for (let i = start; i > end; i += step) o.push(i);
  return o;
}
export const rangeInclusive = (a, b) =>
  a <= b ? range(a, b + 1) : range(a, b - 1, -1);
export const times = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
export const fillArray = (n, v) => Array.from({ length: n }, () => v);
export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const sumBy = (a, f) =>
  a.reduce((s, x) => s + (typeof f === "function" ? f(x) : x[f]), 0);
export const product = (a) => a.reduce((s, x) => s * x, 1);
export const average = (a) => (a.length ? sum(a) / a.length : 0);
export const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const frequencies = (a) => {
  const m = new Map();
  for (const x of a) m.set(x, (m.get(x) || 0) + 1);
  return m;
};
export const mode = (a) => {
  let best,
    bc = 0;
  for (const [k, c] of frequencies(a))
    if (c > bc) {
      best = k;
      bc = c;
    }
  return best;
};
export const minOf = (a) => a.reduce((m, x) => (x < m ? x : m), Infinity);
export const maxOf = (a) => a.reduce((m, x) => (x > m ? x : m), -Infinity);
export const minBy = (a, f) =>
  a.reduce((m, x) => (m === undefined || f(x) < f(m) ? x : m), undefined);
export const maxBy = (a, f) =>
  a.reduce((m, x) => (m === undefined || f(x) > f(m) ? x : m), undefined);
export const variance = (a) => {
  if (!a.length) return 0;
  const m = average(a);
  return average(a.map((x) => (x - m) ** 2));
};
export const stdDev = (a) => Math.sqrt(variance(a));
export const percentile = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const i = (clamp(p, 0, 100) / 100) * (s.length - 1);
  const lo = Math.floor(i),
    hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
export const countBy = (a, f) =>
  a.reduce((acc, x) => {
    const k = typeof f === "function" ? f(x) : x[f];
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
export const countWhere = (a, fn) => a.reduce((n, x) => n + (fn(x) ? 1 : 0), 0);
export const partition = (a, fn) =>
  a.reduce((r, x) => (r[fn(x) ? 0 : 1].push(x), r), [[], []]);
export const keyBy = (a, f) =>
  Object.fromEntries(a.map((x) => [typeof f === "function" ? f(x) : x[f], x]));
export const sampleSize = (a, n = 1) => shuffle(a).slice(0, n);
export const rotate = (a, n = 1) => {
  if (!a.length) return [];
  const k = ((n % a.length) + a.length) % a.length;
  return [...a.slice(k), ...a.slice(0, k)];
};
export const moveItem = (a, from, to) => {
  const c = [...a];
  const [x] = c.splice(from, 1);
  c.splice(to, 0, x);
  return c;
};
export const insertAt = (a, i, ...items) => [
  ...a.slice(0, i),
  ...items,
  ...a.slice(i),
];
export const removeAt = (a, i) => a.filter((_, idx) => idx !== i);
export const removeItem = (a, item) => a.filter((x) => x !== item);
export const toggleItem = (a, item) =>
  a.includes(item) ? removeItem(a, item) : [...a, item];
export const uniqueBy = (a, f) => {
  const seen = new Set();
  return a.filter((x) => {
    const k = typeof f === "function" ? f(x) : x[f];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
export const duplicates = (a) =>
  [...frequencies(a)].filter(([, c]) => c > 1).map(([k]) => k);
export const isSubset = (a, b) => {
  const s = new Set(b);
  return a.every((x) => s.has(x));
};
export const arrayEquals = (a, b) =>
  a.length === b.length && a.every((x, i) => x === b[i]);
export const cartesian = (...arrs) =>
  arrs.reduce((acc, a) => acc.flatMap((x) => a.map((y) => [...x, y])), [[]]);
export function combinations(a, k) {
  if (k === 0) return [[]];
  if (a.length < k) return [];
  const [h, ...t] = a;
  return [
    ...combinations(t, k - 1).map((c) => [h, ...c]),
    ...combinations(t, k),
  ];
}
export function permutations(a) {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) =>
    permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]),
  );
}
export const windowed = (a, size, step = 1) => {
  const o = [];
  for (let i = 0; i + size <= a.length; i += step) o.push(a.slice(i, i + size));
  return o;
};
export const pairwise = (a) => windowed(a, 2);
export const sortNumeric = (a, dir = "asc") =>
  [...a].sort((x, y) => (dir === "desc" ? y - x : x - y));
export const sortAlpha = (a, dir = "asc") =>
  [...a].sort((x, y) =>
    dir === "desc"
      ? String(y).localeCompare(String(x))
      : String(x).localeCompare(String(y)),
  );
export const fromPairs = (p) => Object.fromEntries(p);
export const toPairs = (o) => Object.entries(o);
export const ensureArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
export function binarySearch(a, target) {
  let lo = 0,
    hi = a.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] === target) return mid;
    a[mid] < target ? (lo = mid + 1) : (hi = mid - 1);
  }
  return -1;
}
export const splitAt = (a, i) => [a.slice(0, i), a.slice(i)];
export function groupConsecutive(a) {
  const o = [];
  for (const x of a) {
    if (o.length && o[o.length - 1][0] === x) o[o.length - 1].push(x);
    else o.push([x]);
  }
  return o;
}
export const cumulativeSum = (a) => {
  let s = 0;
  return a.map((x) => (s += x));
};
export const isSorted = (a, dir = "asc") =>
  a.every((x, i) => i === 0 || (dir === "asc" ? a[i - 1] <= x : a[i - 1] >= x));
export const zipObject = (keys, values) =>
  Object.fromEntries(keys.map((k, i) => [k, values[i]]));
export const intersperse = (a, sep) =>
  a.flatMap((x, i) => (i ? [sep, x] : [x]));
export const allEqual = (a) => a.every((x) => x === a[0]);
export const pluck = (a, key) => a.map((x) => x?.[key]);
export const chunkInto = (a, parts) => {
  const size = Math.ceil(a.length / parts);
  return chunk(a, size || 1);
};
export const padArray = (a, n, v = null) =>
  a.length >= n ? a : [...a, ...Array(n - a.length).fill(v)];
export const reverseCopy = (a) => [...a].reverse();
export const findAllIndexes = (a, fn) =>
  a.reduce((o, x, i) => (fn(x, i) ? (o.push(i), o) : o), []);
export const swapItems = (a, i, j) => {
  const c = [...a];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
};
export const mapAsync = async (a, fn) => {
  const o = [];
  for (let i = 0; i < a.length; i++) o.push(await fn(a[i], i));
  return o;
};
export const filterAsync = async (a, fn) => {
  const o = [];
  for (let i = 0; i < a.length; i++) if (await fn(a[i], i)) o.push(a[i]);
  return o;
};
export const reduceAsync = async (a, fn, init) => {
  let acc = init;
  for (let i = 0; i < a.length; i++) acc = await fn(acc, a[i], i);
  return acc;
};
export const forEachAsync = async (a, fn) => {
  for (let i = 0; i < a.length; i++) await fn(a[i], i);
};
export const mapParallel = (a, fn, limit = 5) =>
  runWithConcurrency(
    a.map((x, i) => () => fn(x, i)),
    limit,
  );

/* ================================================================
 * PART 3 — OBJECTS
 * ============================================================== */

const pathKeys = (p) =>
  Array.isArray(p)
    ? p
    : String(p)
        .replace(/\[(\w+)\]/g, ".$1")
        .split(".")
        .filter(Boolean);
export function getPath(o, p, d) {
  let c = o;
  for (const k of pathKeys(p)) {
    if (c == null) return d;
    c = c[k];
  }
  return c === undefined ? d : c;
}
export function setPath(o, p, v) {
  const ks = pathKeys(p);
  let c = o;
  ks.forEach((k, i) => {
    if (i === ks.length - 1) c[k] = v;
    else {
      if (c[k] == null || typeof c[k] !== "object")
        c[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      c = c[k];
    }
  });
  return o;
}
export const hasPath = (o, p) => {
  const none = Symbol("none");
  return getPath(o, p, none) !== none;
};
export function unsetPath(o, p) {
  const ks = pathKeys(p);
  const lk = ks.pop();
  const parent = ks.length ? getPath(o, ks) : o;
  if (parent != null && lk in Object(parent)) {
    delete parent[lk];
    return true;
  }
  return false;
}
export function pathsOf(o, prefix = "") {
  return Object.entries(o).flatMap(([k, v]) => {
    const p = prefix ? `${prefix}.${k}` : k;
    return isObject(v) && Object.keys(v).length ? pathsOf(v, p) : [p];
  });
}
export const keysDeep = pathsOf;
export function flattenObject(o, sep = ".", prefix = "") {
  return Object.entries(o).reduce((acc, [k, v]) => {
    const key = prefix ? prefix + sep + k : k;
    if (isObject(v) && Object.keys(v).length)
      Object.assign(acc, flattenObject(v, sep, key));
    else acc[key] = v;
    return acc;
  }, {});
}
export function unflattenObject(o, sep = ".") {
  const out = {};
  for (const [k, v] of Object.entries(o)) setPath(out, k.split(sep), v);
  return out;
}
export const mapValues = (o, fn) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v, k)]));
export const mapKeys = (o, fn) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [fn(k, v), v]));
export const pickBy = (o, fn) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => fn(v, k)));
export const omitBy = (o, fn) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => !fn(v, k)));
export const invertObject = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
export const defaults = (o, ...src) => {
  const out = { ...o };
  for (const s of src)
    for (const [k, v] of Object.entries(s || {}))
      if (out[k] === undefined) out[k] = v;
  return out;
};
export function deepEqual(a, b) {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  if (typeof a !== "object" || typeof b !== "object" || !a || !b)
    return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a),
    kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]),
  );
}
export function deepFreeze(o) {
  Object.values(o).forEach((v) => {
    if (v && typeof v === "object") deepFreeze(v);
  });
  return Object.freeze(o);
}
export const compactObject = (o) => pickBy(o, (v) => Boolean(v));
export const stripUndefined = (o) => pickBy(o, (v) => v !== undefined);
export const stripNull = (o) => pickBy(o, (v) => v !== null && v !== undefined);
export const renameKeys = (o, map) => mapKeys(o, (k) => map[k] ?? k);
export const sortKeys = (o) =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
export const objectSize = (o) => Object.keys(o || {}).length;
export const hasAllKeys = (o, keys) => keys.every((k) => k in o);
export const hasAnyKey = (o, keys) => keys.some((k) => k in o);
export const firstKey = (o) => Object.keys(o)[0];
export const lastKey = (o) => Object.keys(o).pop();
export const findKey = (o, fn) => Object.keys(o).find((k) => fn(o[k], k));
export const isPlainObject = (v) =>
  isObject(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
export const cloneShallow = (v) =>
  Array.isArray(v) ? [...v] : isObject(v) ? { ...v } : v;
export const objectToArray = (o, keyName = "key", valName = "value") =>
  Object.entries(o).map(([k, v]) => ({ [keyName]: k, [valName]: v }));
export const mergeWith = (a, b, fn) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b))
    out[k] = k in out ? fn(out[k], v, k) : v;
  return out;
};
export const toMap = (o) => new Map(Object.entries(o));
export const fromMap = (m) => Object.fromEntries(m);
export const setDefault = (o, k, v) => (k in o ? o[k] : (o[k] = v));
export function diffObjects(a = {}, b = {}) {
  const added = {},
    removed = {},
    changed = {};
  for (const k of Object.keys(b))
    if (!(k in a)) added[k] = b[k];
    else if (!deepEqual(a[k], b[k])) changed[k] = { from: a[k], to: b[k] };
  for (const k of Object.keys(a)) if (!(k in b)) removed[k] = a[k];
  return { added, removed, changed };
}
const mapKeysDeep = (v, fn) =>
  Array.isArray(v)
    ? v.map((x) => mapKeysDeep(x, fn))
    : isObject(v)
      ? Object.fromEntries(
          Object.entries(v).map(([k, x]) => [fn(k), mapKeysDeep(x, fn)]),
        )
      : v;
export const camelKeys = (o) => mapKeysDeep(o, (k) => camelCase(snakeCase(k)));
export const snakeKeys = (o) => mapKeysDeep(o, snakeCase);
export const toQueryString = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .flatMap(([k, v]) =>
      (Array.isArray(v) ? v : [v]).map(
        (x) => `${encodeURIComponent(k)}=${encodeURIComponent(x)}`,
      ),
    )
    .join("&");
export function parseQueryString(q) {
  const out = {};
  for (const [k, v] of new URLSearchParams(String(q).replace(/^\?/, ""))) {
    if (k in out) out[k] = [].concat(out[k], v);
    else out[k] = v;
  }
  return out;
}

/* ================================================================
 * PART 4 — STRINGS
 * ============================================================== */

export const kebabCase = (s = "") => snakeCase(s).replace(/_/g, "-");
export const pascalCase = (s = "") => capitalize(camelCase(snakeCase(s)));
export const constantCase = (s = "") => snakeCase(s).toUpperCase();
export const dotCase = (s = "") => snakeCase(s).replace(/_/g, ".");
export const pathCase = (s = "") => snakeCase(s).replace(/_/g, "/");
export const sentenceCase = (s = "") => capitalize(s.toLowerCase());
export const swapCase = (s = "") =>
  [...s]
    .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
    .join("");
export const camelToWords = (s = "") =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
export const reverseString = (s = "") => [...s].reverse().join("");
export const reverseWords = (s = "") => s.split(/\s+/).reverse().join(" ");
export const padLeft = (s, n, c = " ") => String(s).padStart(n, c);
export const padRight = (s, n, c = " ") => String(s).padEnd(n, c);
export const zeroPad = (n, w = 2) => String(n).padStart(w, "0");
export const centerText = (s, n, c = " ") => {
  s = String(s);
  const t = Math.max(0, n - s.length);
  const l = t >> 1;
  return c.repeat(l) + s + c.repeat(t - l);
};
export const collapseSpaces = (s = "") => s.replace(/\s+/g, " ").trim();
export const removeAccents = (s = "") =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export const removeEmoji = (s = "") =>
  s.replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, "");
export const hasEmoji = (s = "") => /\p{Extended_Pictographic}/u.test(s);
export const countEmojis = (s = "") =>
  (s.match(/\p{Extended_Pictographic}/gu) || []).length;
export const stripHtml = (s = "") =>
  s
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "");
export const escapeHtml = (s = "") =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const unescapeHtml = (s = "") =>
  s.replace(
    /&(amp|lt|gt|quot|#39);/g,
    (_, c) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[c],
  );
export const escapeMarkdown = (s = "") =>
  s.replace(/([\\`*_{}\[\]()#+\-.!|>~])/g, "\\$1");
export const countWords = (s = "") => (s.trim().match(/\S+/g) || []).length;
export const countChars = (s = "") => [...s].length;
export const countLines = (s = "") => (s ? s.split(/\r\n|\r|\n/).length : 0);
export const countOccurrences = (s = "", sub = "") =>
  sub ? s.split(sub).length - 1 : 0;
export const wordList = (s = "") => s.match(/[\p{L}\p{N}']+/gu) || [];
export const firstWord = (s = "") => wordList(s)[0] || "";
export const lastWord = (s = "") => wordList(s).pop() || "";
export const longestWord = (s = "") =>
  wordList(s).reduce((m, w) => (w.length > m.length ? w : m), "");
export const shortestWord = (s = "") =>
  wordList(s).reduce(
    (m, w) => (m === undefined || w.length < m.length ? w : m),
    undefined,
  ) || "";
export const truncateWords = (s = "", n = 10, ell = "…") => {
  const w = s.trim().split(/\s+/);
  return w.length > n ? w.slice(0, n).join(" ") + ell : s;
};
export const truncateMiddle = (s = "", n = 20, ell = "…") => {
  if (s.length <= n) return s;
  const k = n - ell.length;
  const a = Math.ceil(k / 2),
    b = Math.floor(k / 2);
  return s.slice(0, a) + ell + (b ? s.slice(-b) : "");
};
export const startsWithAny = (s = "", arr = []) =>
  arr.some((x) => s.startsWith(x));
export const endsWithAny = (s = "", arr = []) => arr.some((x) => s.endsWith(x));
export const includesAny = (s = "", arr = [], ci = true) => {
  const t = ci ? s.toLowerCase() : s;
  return arr.some((x) => t.includes(ci ? String(x).toLowerCase() : x));
};
export const includesAll = (s = "", arr = [], ci = true) => {
  const t = ci ? s.toLowerCase() : s;
  return arr.every((x) => t.includes(ci ? String(x).toLowerCase() : x));
};
export const isBlank = (s) => s == null || String(s).trim() === "";
export const isAlpha = (s = "") => /^\p{L}+$/u.test(s);
export const isAlphanumeric = (s = "") => /^[\p{L}\p{N}]+$/u.test(s);
export const isUpperCase = (s = "") =>
  s !== "" && s === s.toUpperCase() && s !== s.toLowerCase();
export const isLowerCase = (s = "") =>
  s !== "" && s === s.toLowerCase() && s !== s.toUpperCase();
export const isPalindrome = (s = "") => {
  const t = removeAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return t.length > 0 && t === reverseString(t);
};
export const isAnagram = (a = "", b = "") => sortLetters(a) === sortLetters(b);
export const sortLetters = (s = "") =>
  [...s.toLowerCase().replace(/\s/g, "")].sort().join("");
export const isAscii = (s = "") => /^[\x00-\x7F]*$/.test(s);
export const isHexColor = (s = "") =>
  /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s);
export const isUuid = (s = "") =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
export const isIPv4 = (s = "") =>
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(s);
export const isIPv6 = (s = "") => net.isIPv6(s);
export const isDomain = (s = "") =>
  /^(?!-)(?:[a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/i.test(s);
export const isBase64 = (s = "") =>
  s.length > 0 && s.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(s);
export const isHexString = (s = "") => /^(0x)?[0-9a-f]+$/i.test(s);
export const isSlug = (s = "") => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
export const isStrongPassword = (s = "", min = 8) =>
  s.length >= min &&
  /[a-z]/.test(s) &&
  /[A-Z]/.test(s) &&
  /\d/.test(s) &&
  /[^A-Za-z0-9]/.test(s);
export const maskString = (s = "", visible = 4, ch = "*") =>
  s.length <= visible
    ? ch.repeat(s.length)
    : ch.repeat(s.length - visible) + s.slice(-visible);
export const maskEmail = (e = "") => {
  const [u, d] = e.split("@");
  return d ? `${u[0] || ""}${"*".repeat(Math.max(1, u.length - 1))}@${d}` : e;
};
export const maskPhone = (p = "") => {
  const n = normalizePhone(p);
  return n.length > 6
    ? n.slice(0, 3) + "*".repeat(n.length - 5) + n.slice(-2)
    : n;
};
export function levenshtein(a = "", b = "") {
  const m = a.length,
    n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = cur;
  }
  return prev[n];
}
export const stringSimilarity = (a = "", b = "") => {
  const L = Math.max(a.length, b.length);
  return L ? 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / L : 1;
};
export function closestMatch(s, list = [], minScore = 0) {
  let best = null,
    bs = -1;
  for (const x of list) {
    const sc = stringSimilarity(s, x);
    if (sc > bs) {
      bs = sc;
      best = x;
    }
  }
  return bs >= minScore ? best : null;
}
export const initials = (s = "", max = 2) =>
  wordList(s)
    .slice(0, max)
    .map((w) => w[0].toUpperCase())
    .join("");
export const acronym = (s = "") =>
  wordList(s)
    .map((w) => w[0].toUpperCase())
    .join("");
export function wrapText(s = "", width = 40) {
  const out = [];
  let line = "";
  for (const w of s.split(/\s+/)) {
    if ((line + " " + w).trim().length > width) {
      if (line) out.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out.join("\n");
}
export const indentText = (s = "", n = 2, ch = " ") =>
  s
    .split("\n")
    .map((l) => (l ? ch.repeat(n) + l : l))
    .join("\n");
export const dedent = (s = "") => {
  const lines = s.split("\n");
  const min = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length),
    Infinity,
  );
  return lines.map((l) => l.slice(min === Infinity ? 0 : min)).join("\n");
};
export const linesToArray = (s = "") =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
export const arrayToLines = (a = []) => a.join("\n");
export const normalizeNewlines = (s = "") => s.replace(/\r\n?/g, "\n");
export const splitOnce = (s = "", sep = " ") => {
  const i = s.indexOf(sep);
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + sep.length)];
};
export const splitLast = (s = "", sep = " ") => {
  const i = s.lastIndexOf(sep);
  return i < 0 ? [s, ""] : [s.slice(0, i), s.slice(i + sep.length)];
};
export const between = (s = "", a = "", b = "") => {
  const i = s.indexOf(a);
  if (i < 0) return "";
  const st = i + a.length;
  const j = s.indexOf(b, st);
  return j < 0 ? "" : s.slice(st, j);
};
export const beforeFirst = (s = "", sep = "") => {
  const i = s.indexOf(sep);
  return i < 0 ? s : s.slice(0, i);
};
export const afterFirst = (s = "", sep = "") => {
  const i = s.indexOf(sep);
  return i < 0 ? "" : s.slice(i + sep.length);
};
export const replaceAllSafe = (s = "", find = "", rep = "") =>
  s.split(find).join(rep);
export const replaceMany = (s = "", map = {}) => {
  const keys = Object.keys(map)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  return keys.length
    ? s.replace(new RegExp(keys.join("|"), "g"), (m) => map[m])
    : s;
};
export const template = (str = "", data = {}) =>
  str.replace(/\{\{\s*([\w.[\]]+)\s*\}\}/g, (_, k) => {
    const v = getPath(data, k);
    return v === undefined || v === null ? "" : String(v);
  });
export function sprintf(fmt = "", ...args) {
  let i = 0;
  return fmt.replace(/%([sdif%])/g, (_, t) => {
    if (t === "%") return "%";
    const v = args[i++];
    return t === "d" || t === "i"
      ? String(parseInt(v, 10))
      : t === "f"
        ? String(parseFloat(v))
        : String(v);
  });
}
export const pluralize = (word = "", n = 2) => {
  if (n === 1) return word;
  if (/(s|x|z|ch|sh)$/i.test(word)) return word + "es";
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";
  return word + "s";
};
export const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"],
    v = Math.abs(n) % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
export function numberToWords(num) {
  num = Math.trunc(Number(num));
  if (!Number.isFinite(num)) return "";
  if (num === 0) return "zero";
  if (num < 0) return "minus " + numberToWords(-num);
  const ones = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];
  const scales = [
    "",
    "thousand",
    "million",
    "billion",
    "trillion",
    "quadrillion",
  ];
  const below = (n) => {
    let o = "";
    if (n >= 100) {
      o += ones[Math.floor(n / 100)] + " hundred";
      n %= 100;
      if (n) o += " ";
    }
    if (n >= 20) {
      o += tens[Math.floor(n / 10)];
      if (n % 10) o += "-" + ones[n % 10];
    } else if (n) o += ones[n];
    return o;
  };
  const parts = [];
  let i = 0;
  while (num > 0) {
    const c = num % 1000;
    if (c) parts.unshift(below(c) + (scales[i] ? " " + scales[i] : ""));
    num = Math.floor(num / 1000);
    i++;
  }
  return parts.join(" ");
}
const ROMAN = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];
export function toRoman(n) {
  n = Math.trunc(n);
  if (!(n > 0 && n < 4000)) return "";
  let o = "";
  for (const [v, s] of ROMAN)
    while (n >= v) {
      o += s;
      n -= v;
    }
  return o;
}
export function fromRoman(s = "") {
  s = s.toUpperCase();
  let i = 0,
    n = 0;
  for (const [v, r] of ROMAN)
    while (s.startsWith(r, i)) {
      n += v;
      i += r.length;
    }
  return i === s.length && s ? n : NaN;
}
export const toBinaryText = (s = "") =>
  [...Buffer.from(s)].map((b) => b.toString(2).padStart(8, "0")).join(" ");
export const fromBinaryText = (s = "") =>
  Buffer.from(
    s
      .split(/\s+/)
      .filter(Boolean)
      .map((b) => parseInt(b, 2)),
  ).toString();
export const rot13 = (s = "") =>
  s.replace(/[a-z]/gi, (c) =>
    String.fromCharCode(
      (c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26,
    ),
  );
export const caesarCipher = (s = "", shift = 3) =>
  s.replace(/[a-z]/gi, (c) => {
    const b = c <= "Z" ? 65 : 97;
    return String.fromCharCode(
      ((((c.charCodeAt(0) - b + shift) % 26) + 26) % 26) + b,
    );
  });
export const hexEncode = (s = "") => Buffer.from(s).toString("hex");
export const hexDecode = (s = "") => Buffer.from(s, "hex").toString();
export const urlEncode = (s = "") => encodeURIComponent(s);
export const urlDecode = (s = "") => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
};
export const utf8ByteLength = (s = "") => Buffer.byteLength(s, "utf8");
export const charFrequency = (s = "") =>
  Object.fromEntries(frequencies([...s]));
export const removeDuplicateChars = (s = "") => [...new Set(s)].join("");
export const removeNonPrintable = (s = "") =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
export const asciiOnly = (s = "") =>
  removeAccents(s).replace(/[^\x00-\x7F]/g, "");
export const stringToColor = (s = "") => "#" + hash(s, "md5").slice(0, 6);
export function compareVersions(a, b) {
  const f = (v) =>
    String(v)
      .replace(/^v/i, "")
      .split(/[.-]/)
      .map((x) => parseInt(x, 10) || 0);
  const pa = f(a),
    pb = f(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
export const hasBengali = (s = "") => /[\u0980-\u09FF]/.test(s);
export const hasArabic = (s = "") => /[\u0600-\u06FF]/.test(s);
export const hasCJK = (s = "") =>
  /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(s);
export const hasCyrillic = (s = "") => /[\u0400-\u04FF]/.test(s);
export const hasDevanagari = (s = "") => /[\u0900-\u097F]/.test(s);
export const detectScript = (s = "") =>
  hasBengali(s)
    ? "bengali"
    : hasArabic(s)
      ? "arabic"
      : hasDevanagari(s)
        ? "devanagari"
        : hasCJK(s)
          ? "cjk"
          : hasCyrillic(s)
            ? "cyrillic"
            : /[a-z]/i.test(s)
              ? "latin"
              : "unknown";

/* ================================================================
 * PART 5 — MATH, UNITS, FINANCE, COLORS
 * ============================================================== */

export const roundTo = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};
export const floorTo = (n, d = 2) => {
  const f = 10 ** d;
  return Math.floor(n * f) / f;
};
export const ceilTo = (n, d = 2) => {
  const f = 10 ** d;
  return Math.ceil(n * f) / f;
};
export const roundToNearest = (n, step = 5) => Math.round(n / step) * step;
export const lerp = (a, b, t) => a + (b - a) * t;
export const inverseLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
export const mapRange = (v, a1, b1, a2, b2) =>
  a2 + ((v - a1) * (b2 - a2)) / (b1 - a1);
export const isEven = (n) => n % 2 === 0;
export const isOdd = (n) => Math.abs(n % 2) === 1;
export function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6)
    if (n % i === 0 || n % (i + 2) === 0) return false;
  return true;
}
export const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};
export const lcm = (a, b) => (a && b ? Math.abs(a * b) / gcd(a, b) : 0);
export const factorial = (n) => {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
};
export const factorialBig = (n) => {
  let r = 1n;
  for (let i = 2n; i <= BigInt(n); i++) r *= i;
  return r;
};
export const fibonacci = (n) => {
  let a = 0,
    b = 1;
  for (let i = 0; i < n; i++) [a, b] = [b, a + b];
  return a;
};
export const fibonacciList = (n) => {
  const o = [];
  let a = 0,
    b = 1;
  for (let i = 0; i < n; i++) {
    o.push(a);
    [a, b] = [b, a + b];
  }
  return o;
};
export function primesUpTo(n) {
  const s = new Uint8Array(n + 1);
  const o = [];
  for (let i = 2; i <= n; i++) {
    if (!s[i]) {
      o.push(i);
      for (let j = i * i; j <= n; j += i) s[j] = 1;
    }
  }
  return o;
}
export function primeFactors(n) {
  const o = [];
  for (let d = 2; d * d <= n; d++)
    while (n % d === 0) {
      o.push(d);
      n /= d;
    }
  if (n > 1) o.push(n);
  return o;
}
export const digitsOf = (n) =>
  String(Math.abs(n)).replace(/\D/g, "").split("").map(Number);
export const sumDigits = (n) => sum(digitsOf(n));
export const digitCount = (n) => digitsOf(n).length;
export const reverseNumber = (n) =>
  Math.sign(n) * Number(String(Math.abs(n)).split("").reverse().join(""));
export const isPalindromeNumber = (n) => {
  const s = String(Math.abs(n));
  return s === s.split("").reverse().join("");
};
export const isPerfectSquare = (n) => n >= 0 && Number.isInteger(Math.sqrt(n));
export const isPowerOfTwo = (n) =>
  Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
export const nextPowerOfTwo = (n) =>
  n <= 1 ? 1 : 2 ** Math.ceil(Math.log2(n));
export const toRadians = (d) => (d * Math.PI) / 180;
export const toDegrees = (r) => (r * 180) / Math.PI;
export const distance2D = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const midpoint = (x1, y1, x2, y2) => [(x1 + x2) / 2, (y1 + y2) / 2];
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1),
    dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export const dotProduct = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const magnitude = (v) => Math.sqrt(dotProduct(v, v));
export function linearRegression(points) {
  const n = points.length;
  const sx = sum(points.map((p) => p[0])),
    sy = sum(points.map((p) => p[1]));
  const sxy = sum(points.map((p) => p[0] * p[1])),
    sxx = sum(points.map((p) => p[0] ** 2));
  const slope = (n * sxy - sx * sy) / (n * sxx - sx ** 2);
  return { slope, intercept: (sy - slope * sx) / n };
}
export const randomFloat = (min = 0, max = 1) =>
  Math.random() * (max - min) + min;
export const randomBool = (p = 0.5) => Math.random() < p;
export const randomSign = () => (Math.random() < 0.5 ? -1 : 1);
export function weightedRandom(items, weights) {
  const t = sum(weights);
  let r = Math.random() * t;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}
export function gaussianRandom(mean = 0, sd = 1) {
  const u = 1 - Math.random(),
    v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export const rollDice = (sides = 6, count = 1) =>
  times(count, () => randomInt(1, sides));
export const flipCoin = () => (Math.random() < 0.5 ? "heads" : "tails");
export const formatCompact = (n, locale = "en") =>
  new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
export const formatCurrency = (n, currency = "USD", locale = "en-US") =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
export const formatPercent = (n, digits = 1, locale = "en-US") =>
  new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(n);
export const parseNumber = (s) => {
  if (typeof s === "number") return s;
  const n = parseFloat(String(s).replace(/[^\d.\-eE]/g, ""));
  return Number.isNaN(n) ? NaN : n;
};
export function abbreviateNumber(n) {
  const a = Math.abs(n);
  const u = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [v, s] of u) if (a >= v) return roundTo(n / v, 1) + s;
  return String(n);
}
export function parseBytes(str) {
  const m = String(str)
    .trim()
    .match(/^([\d.]+)\s*(b|kb|mb|gb|tb|pb)?$/i);
  if (!m) return NaN;
  const p = { b: 0, kb: 1, mb: 2, gb: 3, tb: 4, pb: 5 }[
    (m[2] || "b").toLowerCase()
  ];
  return Math.round(parseFloat(m[1]) * 1024 ** p);
}
export const toBase = (n, base = 2) => Number(n).toString(base);
export const fromBase = (s, base = 2) => parseInt(s, base);
export const approxEqual = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
export const absDiff = (a, b) => Math.abs(a - b);
export const mod = (n, m) => ((n % m) + m) % m;
export const isFloat = (n) =>
  typeof n === "number" && Number.isFinite(n) && !Number.isInteger(n);
export const isSafeInt = (n) => Number.isSafeInteger(n);
export const percentChange = (from, to) =>
  from === 0 ? (to === 0 ? 0 : Infinity) : ((to - from) / Math.abs(from)) * 100;
export const percentOf = (pct, total) => (total * pct) / 100;
export const discountPrice = (price, pct) => roundTo(price * (1 - pct / 100));
export const taxAmount = (price, pct) => roundTo((price * pct) / 100);
export const simpleInterest = (p, rate, years) =>
  roundTo((p * rate * years) / 100);
export const compoundInterest = (p, rate, years, n = 12) =>
  roundTo(p * (1 + rate / 100 / n) ** (n * years));
export const emi = (principal, annualRate, months) => {
  const r = annualRate / 12 / 100;
  return r === 0
    ? roundTo(principal / months)
    : roundTo((principal * r * (1 + r) ** months) / ((1 + r) ** months - 1));
};
export const calculateBMI = (kg, cm) => roundTo(kg / (cm / 100) ** 2, 1);
export const bmiCategory = (bmi) =>
  bmi < 18.5
    ? "Underweight"
    : bmi < 25
      ? "Normal"
      : bmi < 30
        ? "Overweight"
        : "Obese";
export const celsiusToFahrenheit = (c) => (c * 9) / 5 + 32;
export const fahrenheitToCelsius = (f) => ((f - 32) * 5) / 9;
export const celsiusToKelvin = (c) => c + 273.15;
export const kelvinToCelsius = (k) => k - 273.15;
export const kmToMiles = (k) => k * 0.621371;
export const milesToKm = (m) => m / 0.621371;
export const kgToLbs = (k) => k * 2.20462;
export const lbsToKg = (l) => l / 2.20462;
export const cmToInches = (c) => c / 2.54;
export const inchesToCm = (i) => i * 2.54;
export const metersToFeet = (m) => m * 3.28084;
export const feetToMeters = (f) => f / 3.28084;
export const litersToGallons = (l) => l * 0.264172;
export const gallonsToLiters = (g) => g / 0.264172;
export const degreesToCompass = (deg) =>
  [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ][Math.round(mod(deg, 360) / 22.5) % 16];
export const hexToRgb = (hex = "") => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
export const rgbToHex = (r, g, b) =>
  "#" +
  [r, g, b]
    .map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0"))
    .join("");
export const randomHexColor = () =>
  "#" + randomInt(0, 0xffffff).toString(16).padStart(6, "0");
export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h =
      mx === r
        ? (g - b) / d + (g < b ? 6 : 0)
        : mx === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
export function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4)),
  };
}
export const lightenColor = (hex, pct = 10) => {
  const { r, g, b } = hexToRgb(hex);
  const hsl = rgbToHsl(r, g, b);
  const c = hslToRgb(hsl.h, hsl.s, clamp(hsl.l + pct, 0, 100));
  return rgbToHex(c.r, c.g, c.b);
};
export const darkenColor = (hex, pct = 10) => lightenColor(hex, -pct);
export const isDarkColor = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
};

/* ================================================================
 * PART 6 — DATE & TIME
 * ============================================================== */

const D = (d = new Date()) => new Date(d instanceof Date ? d.getTime() : d);
export const nowMs = () => Date.now();
export const unixNow = () => Math.floor(Date.now() / 1000);
export const toUnix = (d) => Math.floor(D(d).getTime() / 1000);
export const fromUnix = (s) => new Date(s * 1000);
export const isValidDate = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return !Number.isNaN(x.getTime());
};
export const parseDateSafe = (v, fallback = null) =>
  isValidDate(v) ? new Date(v) : fallback;
export const addSeconds = (d, n) => new Date(D(d).getTime() + n * 1e3);
export const addMinutes = (d, n) => new Date(D(d).getTime() + n * 6e4);
export const addHours = (d, n) => new Date(D(d).getTime() + n * 36e5);
export const addDays = (d, n) => {
  const x = D(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const addWeeks = (d, n) => addDays(d, n * 7);
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const addMonths = (d, n) => {
  const x = D(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  x.setDate(Math.min(day, daysInMonth(x.getFullYear(), x.getMonth())));
  return x;
};
export const addYears = (d, n) => addMonths(d, n * 12);
export const startOfHour = (d) => {
  const x = D(d);
  x.setMinutes(0, 0, 0);
  return x;
};
export const startOfDay = (d) => {
  const x = D(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const endOfDay = (d) => {
  const x = D(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
export const startOfWeek = (d, weekStartsOn = 0) => {
  const x = startOfDay(d);
  x.setDate(x.getDate() - mod(x.getDay() - weekStartsOn, 7));
  return x;
};
export const endOfWeek = (d, weekStartsOn = 0) =>
  endOfDay(addDays(startOfWeek(d, weekStartsOn), 6));
export const startOfMonth = (d) => {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
};
export const endOfMonth = (d) => {
  const x = D(d);
  return endOfDay(new Date(x.getFullYear(), x.getMonth() + 1, 0));
};
export const startOfYear = (d) => new Date(D(d).getFullYear(), 0, 1);
export const endOfYear = (d) => endOfDay(new Date(D(d).getFullYear(), 11, 31));
export const isSameDay = (a, b) => D(a).toDateString() === D(b).toDateString();
export const isToday = (d) => isSameDay(d, new Date());
export const isYesterday = (d) => isSameDay(d, addDays(new Date(), -1));
export const isTomorrow = (d) => isSameDay(d, addDays(new Date(), 1));
export const isWeekend = (d) => [0, 6].includes(D(d).getDay());
export const isBusinessDay = (d) => !isWeekend(d);
export const isBefore = (a, b) => D(a) < D(b);
export const isAfter = (a, b) => D(a) > D(b);
export const isPast = (d) => D(d).getTime() < Date.now();
export const isFuture = (d) => D(d).getTime() > Date.now();
export const isBetweenDates = (d, a, b) => D(d) >= D(a) && D(d) <= D(b);
export const diffSeconds = (a, b) => Math.floor((D(a) - D(b)) / 1e3);
export const diffMinutes = (a, b) => Math.floor((D(a) - D(b)) / 6e4);
export const diffHours = (a, b) => Math.floor((D(a) - D(b)) / 36e5);
export const diffDays = (a, b) =>
  Math.floor((startOfDay(a) - startOfDay(b)) / 864e5);
export const diffMonths = (a, b) => {
  const x = D(a),
    y = D(b);
  return (x.getFullYear() - y.getFullYear()) * 12 + x.getMonth() - y.getMonth();
};
export const diffYears = (a, b) => Math.trunc(diffMonths(a, b) / 12);
export const isLeapYear = (y = new Date().getFullYear()) =>
  (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const getDayName = (d = new Date(), locale = "en-US") =>
  D(d).toLocaleDateString(locale, { weekday: "long" });
export const getMonthName = (d = new Date(), locale = "en-US") =>
  D(d).toLocaleDateString(locale, { month: "long" });
export const getQuarter = (d = new Date()) =>
  Math.floor(D(d).getMonth() / 3) + 1;
export const getDayOfYear = (d = new Date()) => diffDays(d, startOfYear(d)) + 1;
export function getWeekNumber(d = new Date()) {
  const x = new Date(
    Date.UTC(D(d).getFullYear(), D(d).getMonth(), D(d).getDate()),
  );
  const n = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - n);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - y0) / 864e5 + 1) / 7);
}
export const getAge = (birth, ref = new Date()) => {
  const b = D(birth),
    r = D(ref);
  let a = r.getFullYear() - b.getFullYear();
  if (
    r.getMonth() < b.getMonth() ||
    (r.getMonth() === b.getMonth() && r.getDate() < b.getDate())
  )
    a--;
  return a;
};
export const nextBirthday = (birth, from = new Date()) => {
  const b = D(birth),
    f = startOfDay(from);
  let n = new Date(f.getFullYear(), b.getMonth(), b.getDate());
  if (n < f) n = new Date(f.getFullYear() + 1, b.getMonth(), b.getDate());
  return n;
};
export const daysUntil = (d, from = new Date()) => diffDays(d, from);
export const nextDayOfWeek = (dow, from = new Date()) => {
  const x = startOfDay(from);
  x.setDate(x.getDate() + ((dow - x.getDay() + 7) % 7 || 7));
  return x;
};
export const addBusinessDays = (d, n) => {
  let x = D(d),
    left = Math.abs(n);
  const s = n < 0 ? -1 : 1;
  while (left > 0) {
    x = addDays(x, s);
    if (!isWeekend(x)) left--;
  }
  return x;
};
export const dateRange = (start, end, stepDays = 1) => {
  const o = [];
  for (let d = startOfDay(start); d <= D(end); d = addDays(d, stepDays))
    o.push(new Date(d));
  return o;
};
export const formatISODate = (d = new Date()) => {
  const x = D(d);
  return `${x.getFullYear()}-${zeroPad(x.getMonth() + 1)}-${zeroPad(x.getDate())}`;
};
export const formatDateTime = (d = new Date()) => {
  const x = D(d);
  return `${formatISODate(x)} ${zeroPad(x.getHours())}:${zeroPad(x.getMinutes())}:${zeroPad(x.getSeconds())}`;
};
export const formatTime12 = (d = new Date()) => {
  const x = D(d);
  const h = x.getHours() % 12 || 12;
  return `${h}:${zeroPad(x.getMinutes())} ${x.getHours() < 12 ? "AM" : "PM"}`;
};
export const formatRelativeDay = (d, locale = "en-US") =>
  isToday(d)
    ? "Today"
    : isYesterday(d)
      ? "Yesterday"
      : isTomorrow(d)
        ? "Tomorrow"
        : D(d).toLocaleDateString(locale, { dateStyle: "medium" });
export const toTimezone = (d, timeZone = "UTC", locale = "en-GB") =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone,
  }).format(D(d));
export function getTimezoneOffset(timeZone = "UTC", d = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  })
    .formatToParts(D(d))
    .reduce((a, x) => ((a[x.type] = +x.value), a), {});
  return Math.round(
    (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
      Math.floor(D(d).getTime() / 1000) * 1000) /
      6e4,
  );
}
export const getTimeOfDay = (d = new Date()) => {
  const h = D(d).getHours();
  return h < 5
    ? "night"
    : h < 12
      ? "morning"
      : h < 17
        ? "afternoon"
        : h < 21
          ? "evening"
          : "night";
};
export function msToParts(ms) {
  const t = Math.abs(Math.trunc(ms));
  return {
    days: Math.floor(t / 864e5),
    hours: Math.floor(t / 36e5) % 24,
    minutes: Math.floor(t / 6e4) % 60,
    seconds: Math.floor(t / 1e3) % 60,
    milliseconds: t % 1000,
  };
}
export const countdown = (target, from = new Date()) => {
  const total = D(target) - D(from);
  return { total, expired: total <= 0, ...msToParts(Math.max(0, total)) };
};
export function humanizeDuration(ms, maxUnits = 3) {
  const p = msToParts(ms);
  const u = [
    ["day", p.days],
    ["hour", p.hours],
    ["minute", p.minutes],
    ["second", p.seconds],
  ]
    .filter(([, v]) => v > 0)
    .slice(0, maxUnits)
    .map(([n, v]) => `${v} ${pluralize(n, v)}`);
  return u.length ? u.join(", ") : "0 seconds";
}
export const secondsToHMS = (s) => {
  s = Math.max(0, Math.floor(s));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((x) => zeroPad(x))
    .join(":");
};
export const hmsToSeconds = (str = "") =>
  str
    .split(":")
    .reverse()
    .reduce((t, v, i) => t + (parseInt(v, 10) || 0) * 60 ** i, 0);
export const sleepUntil = (d) => sleep(Math.max(0, D(d) - Date.now()));
export function createStopwatch() {
  let start = Date.now(),
    lapAt = start;
  return {
    elapsed: () => Date.now() - start,
    lap: () => {
      const n = Date.now();
      const r = n - lapAt;
      lapAt = n;
      return r;
    },
    reset: () => {
      start = lapAt = Date.now();
    },
  };
}
export async function measureTime(fn) {
  const t = process.hrtime.bigint();
  const result = await fn();
  return { result, ms: Number(process.hrtime.bigint() - t) / 1e6 };
}

/* ================================================================
 * PART 7 — TYPE CHECKS & CRYPTO
 * ============================================================== */

export const typeOf = (v) =>
  Object.prototype.toString.call(v).slice(8, -1).toLowerCase();
export const isString = (v) => typeof v === "string";
export const isNumber = (v) => typeof v === "number" && !Number.isNaN(v);
export const isBoolean = (v) => typeof v === "boolean";
export const isFunction = (v) => typeof v === "function";
export const isAsyncFunction = (v) =>
  typeof v === "function" && v.constructor?.name === "AsyncFunction";
export const isArray = Array.isArray;
export const isNil = (v) => v === null || v === undefined;
export const isNull = (v) => v === null;
export const isUndefined = (v) => v === undefined;
export const isDate = (v) => v instanceof Date && !Number.isNaN(v.getTime());
export const isRegExp = (v) => v instanceof RegExp;
export const isPromise = (v) => !!v && typeof v.then === "function";
export const isBuffer = (v) => Buffer.isBuffer(v);
export const isSymbol = (v) => typeof v === "symbol";
export const isError = (v) => v instanceof Error;
export const isMap = (v) => v instanceof Map;
export const isSet = (v) => v instanceof Set;
export const isPrimitive = (v) =>
  v === null || (typeof v !== "object" && typeof v !== "function");
export const isIterable = (v) =>
  v != null && typeof v[Symbol.iterator] === "function";
export const isStream = (v) => !!v && typeof v.pipe === "function";
export const isInRange = (n, min, max) => n >= min && n <= max;
export const isPositive = (n) => isNumber(n) && n > 0;
export const isNegative = (n) => isNumber(n) && n < 0;

export const md5 = (d) => hash(d, "md5");
export const sha1 = (d) => hash(d, "sha1");
export const sha256 = (d) => hash(d, "sha256");
export const sha512 = (d) => hash(d, "sha512");
export const hmacSha256 = (data, secret, enc = "hex") =>
  crypto.createHmac("sha256", secret).update(data).digest(enc);
export const hashObject = (o, algo = "sha256") =>
  hash(safeStringify(sortKeys(o), 0), algo);
export const randomHex = (bytes = 16) =>
  crypto.randomBytes(bytes).toString("hex");
export const randomToken = (bytes = 32) =>
  crypto.randomBytes(bytes).toString("base64url");
export const randomBytesBuffer = (n = 16) => crypto.randomBytes(n);
export const nanoid = (size = 21) => {
  const a = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
  const b = crypto.randomBytes(size);
  let id = "";
  for (let i = 0; i < size; i++) id += a[b[i] & 63];
  return id;
};
export const generateOtp = (digits = 6) =>
  String(crypto.randomInt(0, 10 ** digits)).padStart(digits, "0");
export const generateApiKey = (prefix = "sk") => `${prefix}_${randomToken(24)}`;
export const generatePassword = (len = 16) => {
  const sets = [
    "abcdefghijklmnopqrstuvwxyz",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "0123456789",
    "!@#$%^&*()-_=+",
  ];
  const all = sets.join("");
  const o = sets.map((s) => s[crypto.randomInt(s.length)]);
  while (o.length < len) o.push(all[crypto.randomInt(all.length)]);
  return shuffle(o).join("");
};
export const base64UrlEncode = (s) => Buffer.from(s).toString("base64url");
export const base64UrlDecode = (s) =>
  Buffer.from(s, "base64url").toString("utf8");
export const timingSafeEqualStr = (a, b) => {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
export const djb2Hash = (s = "") => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
};
let CRC_TABLE;
export function crc32(input) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  const b = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++)
    c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function encryptText(text, secret) {
  const salt = crypto.randomBytes(16),
    iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(secret, salt, 32);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return Buffer.concat([salt, iv, c.getAuthTag(), enc]).toString("base64");
}
export function decryptText(payload, secret) {
  const b = Buffer.from(payload, "base64");
  const salt = b.subarray(0, 16),
    iv = b.subarray(16, 28),
    tag = b.subarray(28, 44),
    enc = b.subarray(44);
  const key = crypto.scryptSync(secret, salt, 32);
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}
export function verifyPassword(pw, stored) {
  const [salt, h] = String(stored).split(":");
  if (!salt || !h) return false;
  return crypto.timingSafeEqual(
    Buffer.from(h, "hex"),
    crypto.scryptSync(pw, salt, 64),
  );
}
export function signJwt(payload, secret, { expiresIn } = {}) {
  const now = unixNow();
  const body = { iat: now, ...payload };
  if (expiresIn)
    body.exp =
      now +
      (typeof expiresIn === "number"
        ? expiresIn
        : Math.floor(parseDuration(expiresIn) / 1000));
  const h = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    p = base64UrlEncode(JSON.stringify(body));
  return `${h}.${p}.${hmacSha256(`${h}.${p}`, secret, "base64url")}`;
}
export function decodeJwt(token) {
  try {
    return JSON.parse(base64UrlDecode(String(token).split(".")[1]));
  } catch {
    return null;
  }
}
export function verifyJwt(token, secret) {
  const [h, p, s] = String(token).split(".");
  if (!h || !p || !s) return null;
  if (!timingSafeEqualStr(hmacSha256(`${h}.${p}`, secret, "base64url"), s))
    return null;
  const body = decodeJwt(token);
  return body && (!body.exp || body.exp > unixNow()) ? body : null;
}
export const bufferToHex = (b) => Buffer.from(b).toString("hex");
export const hexToBuffer = (h) => Buffer.from(h, "hex");
export const bufferToBase64 = (b) => Buffer.from(b).toString("base64");
export const base64ToBuffer = (s) => Buffer.from(s, "base64");
export const toBuffer = (v) =>
  Buffer.isBuffer(v)
    ? v
    : typeof v === "string"
      ? Buffer.from(v)
      : Buffer.from(v);
export const concatBuffers = (...bs) => Buffer.concat(bs.map(toBuffer));
export const bufferEquals = (a, b) => toBuffer(a).equals(toBuffer(b));

/* ================================================================
 * PART 8 — FILES & PATHS
 * ============================================================== */

export const readTextFile = (p, enc = "utf8") => fs.readFileSync(p, enc);
export const writeTextFile = (p, data) => {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, data);
  return p;
};
export const appendTextFile = (p, data) => {
  ensureDir(path.dirname(p));
  fs.appendFileSync(p, data);
  return p;
};
export const readLines = (p) => readTextFile(p).split(/\r?\n/);
export const readJsonFileAsync = async (p, fallback = null) => {
  try {
    return JSON.parse(await fs.promises.readFile(p, "utf8"));
  } catch {
    return fallback;
  }
};
export const writeJsonFileAsync = async (p, data, space = 2) => {
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, JSON.stringify(data, null, space));
  return p;
};
export const appendJsonLine = (p, obj) =>
  appendTextFile(p, JSON.stringify(obj) + "\n");
export const readJsonLines = (p) =>
  fileExists(p)
    ? linesToArray(readTextFile(p))
        .map((l) => safeJsonParse(l))
        .filter((x) => x !== null)
    : [];
export const fileSize = (p) => {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
};
export const formatFileSize = (p) => formatBytes(fileSize(p));
export const fileStat = (p) => {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
};
export const isDirectory = (p) => !!fileStat(p)?.isDirectory();
export const isFile = (p) => !!fileStat(p)?.isFile();
export const listDir = (p) => {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
};
export function listFilesRecursive(dir, filter) {
  const out = [];
  for (const name of listDir(dir)) {
    const full = path.join(dir, name);
    if (isDirectory(full)) out.push(...listFilesRecursive(full, filter));
    else if (!filter || filter(full)) out.push(full);
  }
  return out;
}
export const findFilesByExt = (dir, ...exts) => {
  const e = exts.map((x) => x.replace(/^\./, "").toLowerCase());
  return listFilesRecursive(dir, (f) => e.includes(getExtension(f)));
};
export const dirSize = (dir) =>
  listFilesRecursive(dir).reduce((s, f) => s + fileSize(f), 0);
export const copyFile = (src, dest) => {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return dest;
};
export const moveFile = (src, dest) => {
  ensureDir(path.dirname(dest));
  try {
    fs.renameSync(src, dest);
  } catch {
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
  return dest;
};
export const removePath = (p) => {
  try {
    fs.rmSync(p, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
};
export const emptyDir = (dir) => {
  listDir(dir).forEach((n) => removePath(path.join(dir, n)));
  return dir;
};
export const touchFile = (p) => {
  ensureDir(path.dirname(p));
  const t = new Date();
  try {
    fs.utimesSync(p, t, t);
  } catch {
    fs.closeSync(fs.openSync(p, "w"));
  }
  return p;
};
export const mkdirp = (p) => fs.promises.mkdir(p, { recursive: true });
export const pathExistsAsync = (p) =>
  fs.promises.access(p).then(
    () => true,
    () => false,
  );
export const getFileName = (p) => path.basename(p);
export const getBaseName = (p) => path.basename(p, path.extname(p));
export const getDirName = (p) => path.dirname(p);
export const joinPath = (...p) => path.join(...p);
export const resolvePath = (...p) => path.resolve(...p);
export const relativePath = (from, to) => path.relative(from, to);
export const normalizePath = (p) => path.normalize(p);
export const isAbsolutePath = (p) => path.isAbsolute(p);
export const changeExtension = (p, ext) =>
  path.join(
    path.dirname(p),
    getBaseName(p) + (ext.startsWith(".") ? ext : "." + ext),
  );
export const sanitizeFilename = (s = "", repl = "_") =>
  s
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, repl)
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200) || "file";
export const uniqueFilename = (name = "file.txt") =>
  `${getBaseName(name)}_${Date.now()}_${randomString(4)}${path.extname(name)}`;
export function writeFileAtomic(p, data) {
  ensureDir(path.dirname(p));
  const tmp = `${p}.${process.pid}.${randomString(6)}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, p);
  return p;
}
export const fileHash = (p, algo = "sha256") => hash(fs.readFileSync(p), algo);
export function tailLines(p, n = 10) {
  const l = readLines(p);
  if (l[l.length - 1] === "") l.pop();
  return l.slice(-n);
}
export const countFileLines = (p) =>
  fileExists(p) ? countLines(readTextFile(p)) : 0;
export const getHomeDir = () => os.homedir();
export const getTempDir = () => os.tmpdir();
export const getCwd = () => process.cwd();
export function parseEnv(str = "") {
  const o = {};
  for (const raw of str.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    o[
      line
        .slice(0, i)
        .replace(/^export\s+/, "")
        .trim()
    ] = v;
  }
  return o;
}
export const readEnvFile = (p = ".env") =>
  fileExists(p) ? parseEnv(readTextFile(p)) : {};
export const writeEnvFile = (p, obj) =>
  writeTextFile(
    p,
    Object.entries(obj)
      .map(
        ([k, v]) =>
          `${k}=${/\s|#/.test(String(v)) ? JSON.stringify(String(v)) : v}`,
      )
      .join("\n") + "\n",
  );
export const loadEnv = (p = ".env", override = false) => {
  const e = readEnvFile(p);
  for (const [k, v] of Object.entries(e))
    if (override || process.env[k] === undefined) process.env[k] = v;
  return e;
};
export const streamToBuffer = (stream) =>
  new Promise((res, rej) => {
    const c = [];
    stream.on("data", (d) => c.push(Buffer.from(d)));
    stream.on("end", () => res(Buffer.concat(c)));
    stream.on("error", rej);
  });
export const bufferToStream = (buf) => Readable.from(toBuffer(buf));
export const saveBuffer = (buf, p) => writeTextFile(p, toBuffer(buf));

/* ================================================================
 * PART 9 — HTTP & NETWORK
 * ============================================================== */

const UA_LIST = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
];
export const randomUserAgent = () => pickRandom(UA_LIST);
const _req = async (method, url, data, options = {}) => {
  try {
    const res = await axios({
      method,
      url,
      data,
      headers: { "User-Agent": randomUserAgent() },
      ...options,
    });
    return res.data;
  } catch (err) {
    return err;
  }
};
export const httpGet = (url, options) => _req("GET", url, undefined, options);
export const httpPost = (url, data, options) =>
  _req("POST", url, data, options);
export const httpPut = (url, data, options) => _req("PUT", url, data, options);
export const httpPatch = (url, data, options) =>
  _req("PATCH", url, data, options);
export const httpDelete = (url, options) =>
  _req("DELETE", url, undefined, options);
export const httpHead = async (url, options = {}) => {
  try {
    return (await axios({ method: "HEAD", url, ...options })).headers;
  } catch (e) {
    return e.response?.headers || null;
  }
};
export const getText = async (url, options = {}) => {
  const r = await axios({
    method: "GET",
    url,
    responseType: "text",
    headers: { "User-Agent": randomUserAgent() },
    ...options,
  });
  return typeof r.data === "string" ? r.data : String(r.data);
};
export const getBufferSafe = async (url, options = {}) => {
  try {
    return await fetchBuffer(url, options);
  } catch {
    return null;
  }
};
export const getStatusCode = async (url, options = {}) => {
  try {
    return (
      await axios({
        method: "GET",
        url,
        validateStatus: () => true,
        ...options,
      })
    ).status;
  } catch {
    return 0;
  }
};
export const isUrlAlive = async (url, timeout = 8000) => {
  const s = await getStatusCode(url, { timeout });
  return s >= 200 && s < 400;
};
export const resolveRedirect = async (url) => {
  try {
    const r = await axios({
      method: "GET",
      url,
      maxRedirects: 10,
      responseType: "stream",
      headers: { "User-Agent": randomUserAgent() },
    });
    const final = r.request?.res?.responseUrl || url;
    r.data.destroy?.();
    return final;
  } catch {
    return url;
  }
};
export const getContentType = async (url) =>
  (await httpHead(url))?.["content-type"] || null;
export const getContentLength = async (url) => {
  const l = (await httpHead(url))?.["content-length"];
  return l ? Number(l) : null;
};
export const fetchWithRetry = (url, options = {}, retries = 3) =>
  retry(
    async () => {
      const r = await axios({ method: "GET", url, ...options });
      return r.data;
    },
    { retries, delay: 700 },
  );
export const fetchJsonWithTimeout = async (url, ms = 10000, options = {}) => {
  try {
    return (await axios({ method: "GET", url, timeout: ms, ...options })).data;
  } catch (e) {
    return null;
  }
};
export const basicAuthHeader = (user, pass) => ({
  Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
});
export const bearerHeader = (token) => ({ Authorization: `Bearer ${token}` });
export const parseUrl = (u) => {
  try {
    return new URL(u);
  } catch {
    return null;
  }
};
export const getHostname = (u) => parseUrl(u)?.hostname || "";
export const getDomain = (u) => {
  const h = getHostname(u).replace(/^www\./, "");
  const p = h.split(".");
  return p.length > 2 ? p.slice(-2).join(".") : h;
};
export const getQueryParams = (u) => {
  const p = parseUrl(u);
  return p ? parseQueryString(p.search) : {};
};
export const addQueryParams = (u, params = {}) => {
  const p = new URL(u);
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null) p.searchParams.set(k, v);
  return p.toString();
};
export const removeQueryParams = (u, keys = []) => {
  const p = new URL(u);
  keys.forEach((k) => p.searchParams.delete(k));
  return p.toString();
};
export const buildUrl = (base, pathname = "", params = {}) =>
  addQueryParams(urlJoin(base, pathname), params);
export const urlJoin = (...parts) =>
  parts
    .filter((x) => x !== "" && x != null)
    .map((p, i) =>
      i === 0
        ? String(p).replace(/\/+$/, "")
        : String(p).replace(/^\/+|\/+$/g, ""),
    )
    .filter(Boolean)
    .join("/");
export const normalizeUrl = (u) => {
  const p = parseUrl(/^https?:\/\//i.test(u) ? u : "https://" + u);
  if (!p) return u;
  p.hash = "";
  p.hostname = p.hostname.toLowerCase();
  return p.toString().replace(/\/$/, "");
};
export const isSameOrigin = (a, b) =>
  parseUrl(a)?.origin === parseUrl(b)?.origin;
export const getFileNameFromUrl = (u) =>
  decodeURIComponent(path.basename(parseUrl(u)?.pathname || "")) || "";
export const isLocalhost = (s = "") =>
  /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i.test(getHostname(s) || s);
export const isPrivateIp = (ip = "") =>
  /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) ||
  ip === "::1" ||
  /^f[cd]/i.test(ip);
export const isImageUrl = (u) =>
  getFileType(String(u).split(/[?#]/)[0]) === "image";
export const isVideoUrl = (u) =>
  getFileType(String(u).split(/[?#]/)[0]) === "video";
export const isAudioUrl = (u) =>
  getFileType(String(u).split(/[?#]/)[0]) === "audio";
export const isMediaUrl = (u) =>
  ["image", "video", "audio"].includes(getFileType(String(u).split(/[?#]/)[0]));
const hostIs = (u, re) => re.test(getHostname(u));
export const isYoutubeUrl = (u) =>
  hostIs(u, /(^|\.)(youtube\.com|youtu\.be)$/i);
export const isInstagramUrl = (u) => hostIs(u, /(^|\.)instagram\.com$/i);
export const isTiktokUrl = (u) => hostIs(u, /(^|\.)tiktok\.com$/i);
export const isFacebookUrl = (u) =>
  hostIs(u, /(^|\.)(facebook\.com|fb\.watch|fb\.com)$/i);
export const isTwitterUrl = (u) => hostIs(u, /(^|\.)(twitter\.com|x\.com)$/i);
export const isGithubUrl = (u) => hostIs(u, /(^|\.)github\.com$/i);
export const isTelegramUrl = (u) => hostIs(u, /(^|\.)(t\.me|telegram\.me)$/i);
export const isMediafireUrl = (u) => hostIs(u, /(^|\.)mediafire\.com$/i);
export const isDriveUrl = (u) => hostIs(u, /(^|\.)drive\.google\.com$/i);
export const detectUrlPlatform = (u) =>
  isYoutubeUrl(u)
    ? "youtube"
    : isInstagramUrl(u)
      ? "instagram"
      : isTiktokUrl(u)
        ? "tiktok"
        : isFacebookUrl(u)
          ? "facebook"
          : isTwitterUrl(u)
            ? "twitter"
            : isGithubUrl(u)
              ? "github"
              : isTelegramUrl(u)
                ? "telegram"
                : isMediafireUrl(u)
                  ? "mediafire"
                  : isDriveUrl(u)
                    ? "gdrive"
                    : "unknown";
export const getYoutubeId = (u = "") => {
  const m = String(u).match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/,
  );
  return m ? m[1] : null;
};
export const getHtmlTitle = (html = "") =>
  (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
    .replace(/\s+/g, " ")
    .trim();
export function getMetaTags(html = "") {
  const o = {};
  for (const m of html.matchAll(
    /<meta\s+[^>]*?(?:name|property)=["']([^"']+)["'][^>]*?content=["']([^"']*)["'][^>]*>/gi,
  ))
    o[m[1].toLowerCase()] = unescapeHtml(m[2]);
  return o;
}
export const extractLinks = (html = "", base) =>
  unique(
    [...html.matchAll(/<a\s+[^>]*?href=["']([^"'#][^"']*)["']/gi)].map((m) => {
      try {
        return base ? new URL(m[1], base).toString() : m[1];
      } catch {
        return m[1];
      }
    }),
  );
export const extractImages = (html = "", base) =>
  unique(
    [...html.matchAll(/<img\s+[^>]*?src=["']([^"']+)["']/gi)].map((m) => {
      try {
        return base ? new URL(m[1], base).toString() : m[1];
      } catch {
        return m[1];
      }
    }),
  );
export const parseCookies = (header = "") =>
  Object.fromEntries(
    header
      .split(/;\s*/)
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf("=");
        return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
      }),
  );
export const serializeCookie = (
  name,
  value,
  { maxAge, path: p = "/", httpOnly, secure, sameSite } = {},
) =>
  [
    `${name}=${encodeURIComponent(value)}`,
    maxAge != null && `Max-Age=${maxAge}`,
    p && `Path=${p}`,
    httpOnly && "HttpOnly",
    secure && "Secure",
    sameSite && `SameSite=${sameSite}`,
  ]
    .filter(Boolean)
    .join("; ");
export const getLocalIPs = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
export const getPublicIp = async () => {
  const r = await fetchJsonWithTimeout(
    "https://api.ipify.org?format=json",
    8000,
  );
  return r?.ip || null;
};
export const getIpInfo = async (ip = "") =>
  fetchJsonWithTimeout(`http://ip-api.com/json/${ip}`, 8000);
export const tcpPing = (host, port = 80, timeout = 3000) =>
  new Promise((res) => {
    const t = Date.now();
    const s = net.connect({ host, port, timeout });
    s.once("connect", () => {
      s.destroy();
      res({ ok: true, ms: Date.now() - t });
    });
    s.once("timeout", () => {
      s.destroy();
      res({ ok: false, ms: null });
    });
    s.once("error", () => res({ ok: false, ms: null }));
  });
export const isPortOpen = async (host, port, timeout = 2000) =>
  (await tcpPing(host, port, timeout)).ok;
export const dnsLookup = (host) =>
  dns.promises.lookup(host, { all: true }).catch(() => []);

/* ================================================================
 * PART 10 — WHATSAPP / BAILEYS & BOT HELPERS
 * ============================================================== */

export function unwrapMessage(msg) {
  let m = msg?.message ?? msg;
  for (let i = 0; i < 6 && m; i++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message ||
      m.editedMessage?.message?.protocolMessage?.editedMessage;
    if (!inner) break;
    m = inner;
  }
  return m || {};
}
export const getMessageType = (msg) =>
  Object.keys(unwrapMessage(msg)).find(
    (k) => k !== "messageContextInfo" && k !== "senderKeyDistributionMessage",
  ) || null;
export function getBody(msg) {
  const m = unwrapMessage(msg);
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    ""
  );
}
export const getContextInfo = (msg) => {
  const m = unwrapMessage(msg);
  const t = getMessageType(msg);
  return (t && m[t]?.contextInfo) || null;
};
export const getQuotedMessage = (msg) =>
  getContextInfo(msg)?.quotedMessage || null;
export const getQuotedBody = (msg) => {
  const q = getQuotedMessage(msg);
  return q ? getBody({ message: q }) : "";
};
export const getQuotedSender = (msg) =>
  getContextInfo(msg)?.participant || null;
export const getMentionedJids = (msg) =>
  getContextInfo(msg)?.mentionedJid || [];
export const getChatJid = (m) => m?.key?.remoteJid || null;
export const isFromMe = (m) => !!m?.key?.fromMe;
export const isGroupMessage = (m) => isGroupJid(getChatJid(m) || "");
export const getSenderJid = (m, botJid) =>
  isGroupMessage(m)
    ? m.key?.participant || m.participant || null
    : m.key?.fromMe
      ? botJid || null
      : getChatJid(m);
export const getPushName = (m) => m?.pushName || "";
export const getMessageId = (m) => m?.key?.id || null;
export const getMessageTimestamp = (m) =>
  Number(m?.messageTimestamp?.low ?? m?.messageTimestamp ?? 0);
const hasMsg = (msg, key) => !!unwrapMessage(msg)[key];
export const isTextMessage = (m) =>
  hasMsg(m, "conversation") || hasMsg(m, "extendedTextMessage");
export const isImageMessage = (m) => hasMsg(m, "imageMessage");
export const isVideoMessage = (m) => hasMsg(m, "videoMessage");
export const isAudioMessage = (m) => hasMsg(m, "audioMessage");
export const isVoiceNote = (m) => !!unwrapMessage(m).audioMessage?.ptt;
export const isStickerMessage = (m) => hasMsg(m, "stickerMessage");
export const isDocumentMessage = (m) => hasMsg(m, "documentMessage");
export const isContactMessage = (m) =>
  hasMsg(m, "contactMessage") || hasMsg(m, "contactsArrayMessage");
export const isLocationMessage = (m) =>
  hasMsg(m, "locationMessage") || hasMsg(m, "liveLocationMessage");
export const isPollMessage = (m) =>
  [
    "pollCreationMessage",
    "pollCreationMessageV2",
    "pollCreationMessageV3",
  ].some((k) => hasMsg(m, k));
export const isReactionMessage = (m) => hasMsg(m, "reactionMessage");
export const isViewOnceMessage = (m) => {
  const x = m?.message || {};
  return !!(
    x.viewOnceMessage ||
    x.viewOnceMessageV2 ||
    x.viewOnceMessageV2Extension ||
    unwrapMessage(m)[getMessageType(m)]?.viewOnce
  );
};
export const hasMedia = (m) =>
  isImageMessage(m) ||
  isVideoMessage(m) ||
  isAudioMessage(m) ||
  isStickerMessage(m) ||
  isDocumentMessage(m);
export const getMediaInfo = (m) => {
  const x = unwrapMessage(m);
  const t = [
    "imageMessage",
    "videoMessage",
    "audioMessage",
    "stickerMessage",
    "documentMessage",
  ].find((k) => x[k]);
  return t
    ? {
        type: t.replace("Message", ""),
        mimetype: x[t].mimetype || null,
        size: Number(x[t].fileLength || 0),
        caption: x[t].caption || "",
        fileName: x[t].fileName || null,
        seconds: x[t].seconds || 0,
      }
    : null;
};

export const normalizeJid = (jid = "") => {
  const s = String(jid);
  const [left, server] = s.split("@");
  return server ? `${left.split(":")[0]}@${server}` : s;
};
export const decodeJid = normalizeJid;
export const jidDecode = (jid = "") => {
  const m = String(jid).match(/^([^@:]+)(?::(\d+))?@(.+)$/);
  return m
    ? { user: m[1], device: m[2] ? Number(m[2]) : 0, server: m[3] }
    : null;
};
export const jidEncode = (user, server = "s.whatsapp.net", device) =>
  `${user}${device ? ":" + device : ""}@${server}`;
export const isUserJid = (jid = "") => String(jid).endsWith("@s.whatsapp.net");
export const isNewsletterJid = (jid = "") =>
  String(jid).endsWith("@newsletter");
export const isStatusJid = (jid = "") => String(jid) === "status@broadcast";
export const isSameJid = (a, b) => normalizeJid(a) === normalizeJid(b);
export const isOwner = (jid, owners = []) => {
  const n = jidToNumber(jid);
  return owners.some((o) => normalizePhone(jidToNumber(o)) === n);
};
export const getGroupAdmins = (participants = []) =>
  participants
    .filter(
      (p) =>
        p.admin === "admin" ||
        p.admin === "superadmin" ||
        p.isAdmin ||
        p.isSuperAdmin,
    )
    .map((p) => p.id || p.jid);
export const isGroupAdmin = (participants = [], jid = "") =>
  getGroupAdmins(participants).some((a) => isSameJid(a, jid));
export const getGroupOwner = (meta = {}) =>
  meta.owner ||
  meta.participants?.find((p) => p.admin === "superadmin")?.id ||
  null;
export const isBotAdmin = (participants = [], botJid = "") =>
  isGroupAdmin(participants, botJid);
export const getAllMentionJids = (participants = []) =>
  participants.map((p) => p.id || p.jid).filter(Boolean);
export const mentionTag = (jid) => `@${jidToNumber(jid)}`;
export const mentionTags = (jids = [], sep = " ") =>
  jids.map(mentionTag).join(sep);
export const getJidsFromText = (text = "") =>
  getMentions(text).map(numberToJid);
export const formatPhoneInternational = (n = "") => {
  const d = normalizePhone(n);
  return d ? "+" + d : "";
};
const DIAL = {
  1: "US/CA",
  7: "RU/KZ",
  20: "EG",
  27: "ZA",
  33: "FR",
  34: "ES",
  39: "IT",
  44: "GB",
  49: "DE",
  52: "MX",
  55: "BR",
  60: "MY",
  61: "AU",
  62: "ID",
  63: "PH",
  64: "NZ",
  65: "SG",
  66: "TH",
  81: "JP",
  82: "KR",
  84: "VN",
  86: "CN",
  90: "TR",
  91: "IN",
  92: "PK",
  93: "AF",
  94: "LK",
  95: "MM",
  98: "IR",
  212: "MA",
  234: "NG",
  254: "KE",
  880: "BD",
  960: "MV",
  966: "SA",
  971: "AE",
  973: "BH",
  974: "QA",
  977: "NP",
};
export const getCountryFromNumber = (n = "") => {
  const d = normalizePhone(n);
  for (const len of [3, 2, 1]) {
    const c = DIAL[d.slice(0, len)];
    if (c) return { code: d.slice(0, len), country: c };
  }
  return null;
};

export const textMessage = (text, { mentions, quoted } = {}) => ({
  content: { text, ...(mentions ? { mentions } : {}) },
  options: quoted ? { quoted } : {},
});
export const imageMessage = (img, caption = "", extra = {}) => ({
  image: typeof img === "string" ? { url: img } : img,
  caption,
  ...extra,
});
export const videoMessage = (vid, caption = "", extra = {}) => ({
  video: typeof vid === "string" ? { url: vid } : vid,
  caption,
  ...extra,
});
export const audioMessage = (aud, ptt = false, extra = {}) => ({
  audio: typeof aud === "string" ? { url: aud } : aud,
  mimetype: ptt ? "audio/ogg; codecs=opus" : "audio/mpeg",
  ptt,
  ...extra,
});
export const documentMessage = (
  doc,
  fileName = "file",
  mimetype,
  caption = "",
) => ({
  document: typeof doc === "string" ? { url: doc } : doc,
  fileName,
  mimetype: mimetype || getMimeType(fileName),
  caption,
});
export const stickerMessage = (sticker) => ({
  sticker: typeof sticker === "string" ? { url: sticker } : sticker,
});
export const reactionMessage = (key, emoji) => ({
  react: { text: emoji, key },
});
export const locationMessage = (lat, lng, name = "", address = "") => ({
  location: { degreesLatitude: lat, degreesLongitude: lng, name, address },
});
export const buildVCard = (name, number, org = "") =>
  [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${name}`,
    org && `ORG:${org};`,
    `TEL;type=CELL;type=VOICE;waid=${normalizePhone(number)}:${formatPhoneInternational(number)}`,
    "END:VCARD",
  ]
    .filter(Boolean)
    .join("\n");
export const contactMessage = (name, number, org = "") => ({
  contacts: {
    displayName: name,
    contacts: [{ vcard: buildVCard(name, number, org) }],
  },
});
export const pollMessage = (name, values = [], selectableCount = 1) => ({
  poll: { name, values, selectableCount },
});
export const mentionAllMessage = (participants = [], text = "") => {
  const jids = getAllMentionJids(participants);
  return {
    text: `${text}${text ? "\n" : ""}${mentionTags(jids, "\n")}`,
    mentions: jids,
  };
};
export function splitMessage(text = "", max = 4000) {
  if (text.length <= max) return [text];
  const out = [];
  let cur = "";
  for (const raw of text.split("\n")) {
    let line = raw;
    if (cur && (cur + "\n" + line).length > max) {
      out.push(cur);
      cur = "";
    }
    while (line.length > max) {
      out.push(line.slice(0, max));
      line = line.slice(max);
    }
    cur = cur ? cur + "\n" + line : line;
  }
  if (cur) out.push(cur);
  return out;
}

export const waBold = (s) => `*${s}*`;
export const waItalic = (s) => `_${s}_`;
export const waStrike = (s) => `~${s}~`;
export const waMono = (s) => "```" + s + "```";
export const waInlineCode = (s) => "`" + s + "`";
export const waQuote = (s) =>
  String(s)
    .split("\n")
    .map((l) => "> " + l)
    .join("\n");
export const waBullet = (items = [], b = "•") =>
  items.map((i) => `${b} ${i}`).join("\n");
export const waNumbered = (items = [], start = 1) =>
  items.map((i, n) => `${n + start}. ${i}`).join("\n");
export const waDivider = (len = 20, ch = "─") => ch.repeat(len);
export const waHeader = (title, emoji = "") =>
  `${emoji ? emoji + " " : ""}*${title}*\n${waDivider(Math.max(8, countChars(title)))}`;
export const waKeyValue = (obj = {}, sep = ": ") =>
  Object.entries(obj)
    .map(([k, v]) => `• *${k}*${sep}${v}`)
    .join("\n");
export const waBox = (lines = [], title = "") => {
  const body = ensureArray(lines)
    .map((l) => `│ ${l}`)
    .join("\n");
  return `┌${title ? ` ${title} ` : "──"}\n${body}\n└──`;
};
export const waProgressBar = (
  value,
  total = 100,
  len = 10,
  fill = "█",
  empty = "░",
) => {
  const p = total ? clamp(value / total, 0, 1) : 0;
  const f = Math.round(p * len);
  return `${fill.repeat(f)}${empty.repeat(len - f)} ${Math.round(p * 100)}%`;
};
export const waEscape = (s = "") => s.replace(/([*_~`])/g, "\u200b$1");
export const waStripFormatting = (s = "") =>
  s.replace(/[*_~]([^*_~\n]+)[*_~]/g, "$1").replace(/`{1,3}/g, "");
export function waTable(rows = [], header) {
  const all = header ? [header, ...rows] : rows;
  const w = all[0].map((_, i) =>
    Math.max(...all.map((r) => countChars(String(r[i] ?? "")))),
  );
  const fmt = (r) => r.map((c, i) => String(c ?? "").padEnd(w[i])).join(" | ");
  const lines = all.map(fmt);
  if (header) lines.splice(1, 0, w.map((n) => "-".repeat(n)).join("-+-"));
  return waMono(lines.join("\n"));
}
export function buildMenu({
  title = "MENU",
  sections = {},
  prefix = ".",
  emoji = "✦",
} = {}) {
  const parts = [waHeader(title, emoji)];
  for (const [name, cmds] of Object.entries(sections))
    parts.push(
      `\n${waBold(name)}\n${cmds.map((c) => `${emoji} ${prefix}${c}`).join("\n")}`,
    );
  return parts.join("\n");
}

export const containsLink = (s = "") => /(https?:\/\/|www\.)[^\s]+/i.test(s);
export const extractWaInvites = (s = "") =>
  [...s.matchAll(/chat\.whatsapp\.com\/([A-Za-z0-9]{20,24})/g)].map(
    (m) => m[1],
  );
export const containsWaInvite = (s = "") => extractWaInvites(s).length > 0;
export const isRepeatedChars = (s = "", n = 10) =>
  new RegExp(`(.)\\1{${n - 1},}`, "u").test(s);
export const isAllCaps = (s = "", minLen = 8) => {
  const l = s.replace(/[^\p{L}]/gu, "");
  return l.length >= minLen && l === l.toUpperCase();
};
export const isSpamText = (s = "") =>
  isRepeatedChars(s, 12) ||
  (isAllCaps(s, 20) && s.length > 40) ||
  extractUrls(s).length >= 4 ||
  countEmojis(s) > 25;
export const containsBadWords = (s = "", words = []) => {
  const t = removeAccents(s).toLowerCase();
  return words.some((w) =>
    new RegExp(
      `(^|[^\\p{L}])${escapeRegExp(removeAccents(w).toLowerCase())}($|[^\\p{L}])`,
      "u",
    ).test(t),
  );
};
export const censorBadWords = (s = "", words = [], ch = "*") =>
  words.reduce(
    (t, w) =>
      t.replace(new RegExp(escapeRegExp(w), "gi"), (m) => ch.repeat(m.length)),
    s,
  );
export function createFloodDetector(max = 5, windowMs = 5000) {
  const allow = createRateLimiter(max, windowMs);
  return (key) => !allow(key);
}
export const matchKeyword = (
  text = "",
  keywords = [],
  { exact = false } = {},
) => {
  const t = text.toLowerCase().trim();
  return (
    keywords.find((k) =>
      exact ? t === k.toLowerCase() : t.includes(k.toLowerCase()),
    ) || null
  );
};
export const suggestCommand = (input = "", commands = [], minScore = 0.5) =>
  closestMatch(
    input.toLowerCase(),
    commands.map((c) => c.toLowerCase()),
    minScore,
  );
export function createMessageDeduper(ttl = 60000) {
  const seen = new Map();
  return (id) => {
    const now = Date.now();
    for (const [k, t] of seen) if (now - t > ttl) seen.delete(k);
    if (seen.has(id)) return true;
    seen.set(id, now);
    return false;
  };
}
export function createCommandRegistry() {
  const cmds = new Map(),
    aliases = new Map();
  return {
    register(name, handler, meta = {}) {
      cmds.set(name.toLowerCase(), { name, handler, ...meta });
      (meta.aliases || []).forEach((a) =>
        aliases.set(a.toLowerCase(), name.toLowerCase()),
      );
      return this;
    },
    resolve(n = "") {
      const k = n.toLowerCase();
      return cmds.get(aliases.get(k) || k) || null;
    },
    has(n) {
      return !!this.resolve(n);
    },
    list() {
      return [...cmds.values()];
    },
    names() {
      return [...cmds.keys(), ...aliases.keys()];
    },
    suggest(n) {
      return suggestCommand(n, this.names());
    },
    async run(n, ...args) {
      const c = this.resolve(n);
      if (!c) throw new Error(`Unknown command: ${n}`);
      return c.handler(...args);
    },
  };
}

/* ================================================================
 * PART 11 — FUNCTION UTILITIES & FACTORIES
 * ============================================================== */

export const noop = () => {};
export const identity = (x) => x;
export const constant = (v) => () => v;
export const once = (fn) => {
  let done = false,
    r;
  return (...a) => (done ? r : ((done = true), (r = fn(...a))));
};
export const after = (n, fn) => {
  let c = 0;
  return (...a) => (++c >= n ? fn(...a) : undefined);
};
export const before = (n, fn) => {
  let c = 0,
    r;
  return (...a) => (c++ < n ? (r = fn(...a)) : r);
};
export const negate =
  (fn) =>
  (...a) =>
    !fn(...a);
export const pipe =
  (...fns) =>
  (x) =>
    fns.reduce((v, f) => f(v), x);
export const pipeAsync =
  (...fns) =>
  (x) =>
    fns.reduce((p, f) => p.then(f), Promise.resolve(x));
export const compose =
  (...fns) =>
  (x) =>
    fns.reduceRight((v, f) => f(v), x);
export const curry = (fn, n = fn.length) =>
  function c(...a) {
    return a.length >= n ? fn(...a) : (...b) => c(...a, ...b);
  };
export const partial =
  (fn, ...pre) =>
  (...a) =>
    fn(...pre, ...a);
export const flip =
  (fn) =>
  (a, b, ...r) =>
    fn(b, a, ...r);
export const tap = (v, fn) => {
  fn(v);
  return v;
};
export const tryCatch = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return typeof fallback === "function" ? fallback() : fallback;
  }
};
export const tryCatchAsync = async (fn, fallback = null) => {
  try {
    return await fn();
  } catch {
    return typeof fallback === "function" ? fallback() : fallback;
  }
};
export const safeCall = async (fn, ...args) => {
  try {
    return [null, await fn(...args)];
  } catch (e) {
    return [e, null];
  }
};
export const awaitTo = (p) =>
  Promise.resolve(p).then(
    (r) => [null, r],
    (e) => [e, undefined],
  );
export const coalesce = (...v) => v.find((x) => x !== undefined && x !== null);
export const withDefault = (v, d) => (v === undefined || v === null ? d : v);
export const assert = (cond, msg = "Assertion failed") => {
  if (!cond) throw new Error(msg);
};
export const raise = (msg) => {
  throw msg instanceof Error ? msg : new Error(msg);
};
export const nextTick = () => new Promise((r) => process.nextTick(r));
export const waitImmediate = () => new Promise((r) => setImmediate(r));
export function createDeferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
export async function waitFor(cond, { timeout = 10000, interval = 100 } = {}) {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    const v = await cond();
    if (v) return v;
    await sleep(interval);
  }
  throw new Error("waitFor timed out");
}
export const memoizeAsync = (fn, ttl = 0) => {
  const c = new Map();
  return (...a) => {
    const k = JSON.stringify(a);
    const h = c.get(k);
    if (h && (!ttl || Date.now() - h.t < ttl)) return h.p;
    const p = Promise.resolve(fn(...a)).catch((e) => {
      c.delete(k);
      throw e;
    });
    c.set(k, { p, t: Date.now() });
    return p;
  };
};
export const promisifyCallback =
  (fn, ctx) =>
  (...a) =>
    new Promise((res, rej) =>
      fn.call(ctx, ...a, (e, r) => (e ? rej(e) : res(r))),
    );
export function* createBackoff(
  base = 500,
  factor = 2,
  max = 30000,
  jitter = true,
) {
  let d = base;
  for (;;) {
    yield jitter ? Math.round(d * (0.5 + Math.random() / 2)) : d;
    d = Math.min(d * factor, max);
  }
}
export function createEventEmitter() {
  const l = new Map();
  const api = {
    on(e, fn) {
      (l.get(e) || l.set(e, new Set()).get(e)).add(fn);
      return () => api.off(e, fn);
    },
    once(e, fn) {
      const off = api.on(e, (...a) => {
        off();
        fn(...a);
      });
      return off;
    },
    off(e, fn) {
      l.get(e)?.delete(fn);
    },
    emit(e, ...a) {
      (l.get(e) || []).forEach((fn) => {
        try {
          fn(...a);
        } catch {}
      });
      return l.has(e);
    },
    clear(e) {
      e ? l.delete(e) : l.clear();
    },
    count(e) {
      return l.get(e)?.size || 0;
    },
  };
  return api;
}
export const createPubSub = () => {
  const bus = createEventEmitter();
  return { publish: bus.emit, subscribe: bus.on, unsubscribe: bus.off };
};
export function createLogger({
  level = "info",
  prefix = "",
  sink = (line) => process.stdout.write(line + "\n"),
} = {}) {
  const L = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
  const log =
    (lv) =>
    (...a) => {
      if (L[lv] >= L[level])
        sink(
          `[${formatDateTime()}] ${lv.toUpperCase()}${prefix ? " " + prefix : ""}: ${a.map((x) => (typeof x === "string" ? x : safeStringify(x, 0))).join(" ")}`,
        );
    };
  return {
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    setLevel: (l) => {
      level = l;
    },
    child: (p) =>
      createLogger({
        level,
        prefix: [prefix, p].filter(Boolean).join(":"),
        sink,
      }),
  };
}
export function createTtlCache(ttl = 60000, maxSize = Infinity) {
  const m = new Map();
  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of m) if (v.e <= now) m.delete(k);
  };
  return {
    get(k) {
      const v = m.get(k);
      if (!v) return undefined;
      if (v.e <= Date.now()) {
        m.delete(k);
        return undefined;
      }
      return v.v;
    },
    set(k, v, t = ttl) {
      sweep();
      if (m.size >= maxSize) m.delete(m.keys().next().value);
      m.set(k, { v, e: Date.now() + t });
      return v;
    },
    has(k) {
      return this.get(k) !== undefined;
    },
    delete(k) {
      return m.delete(k);
    },
    clear() {
      m.clear();
    },
    get size() {
      sweep();
      return m.size;
    },
    keys() {
      sweep();
      return [...m.keys()];
    },
  };
}
export function createLruCache(max = 100) {
  const m = new Map();
  return {
    get(k) {
      if (!m.has(k)) return undefined;
      const v = m.get(k);
      m.delete(k);
      m.set(k, v);
      return v;
    },
    set(k, v) {
      m.delete(k);
      m.set(k, v);
      if (m.size > max) m.delete(m.keys().next().value);
      return v;
    },
    has: (k) => m.has(k),
    delete: (k) => m.delete(k),
    clear: () => m.clear(),
    get size() {
      return m.size;
    },
    keys: () => [...m.keys()],
  };
}
export function createQueue({ concurrency = 1 } = {}) {
  const q = [];
  let active = 0;
  const idle = [];
  const next = () => {
    while (active < concurrency && q.length) {
      const { fn, res, rej } = q.shift();
      active++;
      Promise.resolve()
        .then(fn)
        .then(res, rej)
        .finally(() => {
          active--;
          next();
          if (!active && !q.length) idle.splice(0).forEach((f) => f());
        });
    }
  };
  return {
    add: (fn) =>
      new Promise((res, rej) => {
        q.push({ fn, res, rej });
        next();
      }),
    get size() {
      return q.length;
    },
    get pending() {
      return active;
    },
    onIdle: () =>
      !active && !q.length
        ? Promise.resolve()
        : new Promise((r) => idle.push(r)),
    clear: () => {
      q.length = 0;
    },
  };
}
export function createMutex() {
  let p = Promise.resolve();
  return {
    run: (fn) => {
      const r = p.then(fn, fn);
      p = r.catch(() => {});
      return r;
    },
  };
}
export function createKeyedMutex() {
  const m = new Map();
  return (key, fn) => {
    const prev = m.get(key) || Promise.resolve();
    const r = prev.then(fn, fn);
    const tail = r.catch(() => {});
    m.set(key, tail);
    tail.then(() => {
      if (m.get(key) === tail) m.delete(key);
    });
    return r;
  };
}
export function createSemaphore(max = 1) {
  let n = 0;
  const w = [];
  const release = () => {
    const next = w.shift();
    if (next) next();
    else n--;
  };
  const acquire = async () => {
    if (n < max) n++;
    else await new Promise((r) => w.push(r));
    return release;
  };
  return {
    acquire,
    run: async (fn) => {
      const rel = await acquire();
      try {
        return await fn();
      } finally {
        rel();
      }
    },
  };
}
export function createBatcher(handler, { size = 20, wait = 100 } = {}) {
  let buf = [],
    t = null;
  const flush = async () => {
    clearTimeout(t);
    t = null;
    const b = buf;
    buf = [];
    if (b.length) await handler(b);
  };
  return {
    add(x) {
      buf.push(x);
      if (buf.length >= size) return flush();
      if (!t) t = setTimeout(flush, wait);
    },
    flush,
  };
}
export const createCounter = (start = 0) => {
  let n = start;
  return {
    inc: (by = 1) => (n += by),
    dec: (by = 1) => (n -= by),
    get: () => n,
    reset: () => {
      n = start;
    },
  };
};
export function createStateMachine(config) {
  let state = config.initial;
  const subs = new Set();
  return {
    get state() {
      return state;
    },
    can: (ev) => !!config.states[state]?.on?.[ev],
    send(ev, payload) {
      const to = config.states[state]?.on?.[ev];
      if (!to) return false;
      const from = state;
      state = typeof to === "function" ? to(payload, from) : to;
      subs.forEach((f) => f(state, from, ev));
      return true;
    },
    subscribe: (f) => (subs.add(f), () => subs.delete(f)),
  };
}
export function createStore(
  file,
  { autosaveMs = 500, defaults: def = {} } = {},
) {
  let data = { ...def, ...(readJsonFile(file, {}) || {}) };
  const save = debounce(() => {
    try {
      writeFileAtomic(file, JSON.stringify(data, null, 2));
    } catch {}
  }, autosaveMs);
  return {
    get: (k, d) => getPath(data, k, d),
    set: (k, v) => {
      setPath(data, k, v);
      save();
      return v;
    },
    delete: (k) => {
      const r = unsetPath(data, k);
      save();
      return r;
    },
    has: (k) => hasPath(data, k),
    all: () => data,
    clear: () => {
      data = {};
      save();
    },
    flush: () => {
      try {
        writeFileAtomic(file, JSON.stringify(data, null, 2));
      } catch {}
    },
  };
}
export function createAbortTimeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return {
    signal: c.signal,
    clear: () => clearTimeout(t),
    abort: () => c.abort(),
  };
}
export const getEnv = (key, def, cast) => {
  const v = process.env[key];
  if (v === undefined || v === "") return def;
  if (cast === "number") return Number(v);
  if (cast === "boolean") return toBool(v, def);
  if (cast === "json") return safeJsonParse(v, def);
  if (cast === "list")
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return v;
};
export const requireEnv = (...keys) => {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);
  return true;
};
export const isProduction = () => process.env.NODE_ENV === "production";
export const isDevelopment = () => !isProduction();
export const onExit = (fn) => {
  let called = false;
  const run = async (sig) => {
    if (called) return;
    called = true;
    try {
      await fn(sig);
    } finally {
      process.exit(0);
    }
  };
  ["SIGINT", "SIGTERM"].forEach((s) => process.once(s, () => run(s)));
};
export const handleUncaught = (logger = console) => {
  process.on("uncaughtException", (e) =>
    logger.error?.("uncaughtException", e?.stack || e),
  );
  process.on("unhandledRejection", (e) =>
    logger.error?.("unhandledRejection", e?.stack || e),
  );
};
