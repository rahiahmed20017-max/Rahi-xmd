import { EventEmitter } from "node:events";
import { createAuthStore, MultiSocketManager } from "wa-multi-socket";
import config from "../config.js";

const authStore = createAuthStore(config.DATABASE_URL);

class SessionManagerFacade extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this._phonePairings = new Map();
    this._closing = false;
    this.whatsapp = new MultiSocketManager({
      authStore,
      socketConfig: {
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
      },
      maxConcurrentConnections:
        Number(process.env.MAX_CONCURRENT_CONNECTIONS) || 12,
      maxConcurrentPairings: Number(process.env.MAX_CONCURRENT_PAIRINGS) || 3,
      sendIntervalMs: Number(process.env.WA_SEND_INTERVAL_MS) || 1_000,
      sendJitterMs: Number(process.env.WA_SEND_JITTER_MS) || 300,
    });
    this._attachManagerEvents();
  }

  _entry(sessionId) {
    let entry = this.sessions.get(sessionId);
    if (!entry) {
      entry = { sock: null, status: "disconnected", reconnectAttempts: 0 };
      this.sessions.set(sessionId, entry);
    }
    return entry;
  }

  _attachManagerEvents() {
    const events = this.whatsapp.events;

    events.on("user:connecting", ({ userId }) => {
      this._entry(userId).status = "connecting";
    });
    events.on("user:connected", ({ userId, socket }) => {
      const entry = this._entry(userId);
      entry.sock = socket;
      entry.status = "connected";
      entry.reconnectAttempts = 0;
      this._attachSocketEvents(userId, socket);
      this.emit("connected", userId);
    });
    events.on("user:disconnected", ({ userId, socket }) => {
      const entry = this._entry(userId);
      if (entry.sock === socket) entry.sock = null;
      entry.status = "disconnected";
    });
    events.on("user:reconnecting", ({ userId, attempt }) => {
      const entry = this._entry(userId);
      entry.status = "reconnecting";
      entry.reconnectAttempts = attempt;
    });
    events.on("user:pairing-code", ({ userId, pairingCode }) => {
      this.emit("qr", userId, pairingCode);
    });
    events.on("user:pairing-failed", ({ userId, error }) => {
      const entry = this.sessions.get(userId);
      if (entry) {
        entry.status = "disconnected";
        entry.sock = null;
      }
      this._releasePhonePairingBySession(userId);
      if (error) this.emit("manager.error", userId, error);
    });
    events.on("user:logged-out", ({ userId }) => this._deleteSession(userId));
    events.on("user:removed", ({ userId }) => this._deleteSession(userId));
    events.on("manager:error", ({ userId, error }) => {
      this.emit("manager.error", userId, error);
    });
  }

  _attachSocketEvents(sessionId, socket) {
    const entry = this._entry(sessionId);
    if (entry._eventSocket === socket) return;
    entry._eventSocket = socket;

    for (const name of [
      "messages.upsert",
      "connection.update",
      "call",
      "groups.update",
      "group-participants.update",
    ]) {
      socket.ev.on(name, (payload) => {
        if (name === "connection.update") {
          this.emit(name, sessionId, payload);
          if (payload?.connection === "open")
            this.emit("open", sessionId, payload);
          if (payload?.connection === "close") {
            this.emit("close", sessionId, payload, {
              statusCode: payload?.lastDisconnect?.error?.output?.statusCode,
            });
          }
          return;
        }
        this.emit(name, sessionId, payload);
      });
    }
  }

  _deleteSession(sessionId) {
    this.sessions.delete(sessionId);
    this._releasePhonePairingBySession(sessionId);
    this.emit("session.deleted", sessionId);
  }

  async loadSavedSessions() {
    await this.whatsapp.start();
    for (const sessionId of await authStore.listUsers()) this._entry(sessionId);
  }

  async start(sessionId) {
    const socket = await this.whatsapp.connectUser(sessionId);
    const entry = this._entry(sessionId);
    entry.sock = socket;
    entry.status = this.whatsapp.getStatus(sessionId);
    this._attachSocketEvents(sessionId, socket);
    return socket;
  }

  list() {
    return [...this.sessions].map(([sessionId, entry]) => ({
      sessionId,
      status: entry.status,
      running: this.isRunning(sessionId),
      reconnectAttempts: entry.reconnectAttempts || 0,
    }));
  }

  isRunning(sessionId) {
    return Boolean(this.whatsapp.getConnectedSocket(sessionId));
  }

  async findSessionIdByPhone(phone) {
    const ids = await authStore.listUsers();
    const prefix = `${phone}_`;
    const matches = ids.filter((id) => id === phone || id.startsWith(prefix));
    return (
      matches.find((id) => this.isRunning(id)) || matches.sort().at(-1) || null
    );
  }

  async findConnectedSessionIdByPhone(phone) {
    const ids = await authStore.listUsers();
    return (
      ids.find(
        (id) =>
          (id === phone || id.startsWith(`${phone}_`)) && this.isRunning(id),
      ) || null
    );
  }

  reservePhonePairing(phone, sessionId) {
    if (this._phonePairings.has(phone)) return false;
    this._phonePairings.set(phone, sessionId);
    return true;
  }

  releasePhonePairing(sessionId) {
    this._releasePhonePairingBySession(sessionId);
  }

  _releasePhonePairingBySession(sessionId) {
    for (const [phone, reserved] of this._phonePairings) {
      if (reserved === sessionId) this._phonePairings.delete(phone);
    }
  }

  async cleanupPhoneSessions(phone) {
    const ids = await authStore.listUsers();
    const stale = ids.filter(
      (id) => id === phone || id.startsWith(`${phone}_`),
    );
    await Promise.allSettled(stale.map((id) => this.logout(id)));
  }

  async requestPairingCode(sessionId, phone) {
    this._entry(sessionId).status = "awaiting-pairing";
    return this.whatsapp.requestPairingCode(sessionId, phone);
  }

  awaitPairingOutcome(sessionId, { timeoutMs = 60_000 } = {}) {
    if (this.isRunning(sessionId)) return Promise.resolve({ success: true });
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.removeListener("connected", onConnected);
        this.removeListener("session.deleted", onDeleted);
      };
      const onConnected = (id) => {
        if (id !== sessionId) return;
        cleanup();
        resolve({ success: true });
      };
      const onDeleted = (id) => {
        if (id !== sessionId) return;
        cleanup();
        resolve({ success: false });
      };
      const timer = setTimeout(() => {
        cleanup();
        this.logout(sessionId)
          .catch(() => {})
          .finally(() => resolve({ success: false, timeout: true }));
      }, timeoutMs);
      this.on("connected", onConnected);
      this.on("session.deleted", onDeleted);
    });
  }

  async stop(sessionId) {
    if (!this.sessions.has(sessionId) && !this.whatsapp.getSocket(sessionId))
      return false;
    await this.whatsapp.disconnectUser(sessionId);
    const entry = this._entry(sessionId);
    entry.sock = null;
    entry.status = "disconnected";
    entry._eventSocket = null;
    return true;
  }

  async logout(sessionId) {
    const exists =
      this.sessions.has(sessionId) ||
      (await authStore.listUsers()).includes(sessionId);
    if (!exists) return false;
    await this.whatsapp.removeUser(sessionId);
    return true;
  }

  getAllConnections() {
    return [...this.sessions].map(([id, entry]) => ({
      id,
      connection: entry.sock,
      healthy: this.isRunning(id),
      status: entry.status,
    }));
  }

  async stopAll() {
    if (this._closing) return;
    this._closing = true;
    await this.whatsapp.close();
  }
}

export const manager = new SessionManagerFacade();
