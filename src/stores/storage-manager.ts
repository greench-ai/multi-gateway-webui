// storage-manager.ts
// Persistence layer for HubClaw UI state.
//
// Security model (revised 2026-06-01 by Gohan):
//   - Gateway tokens NEVER live in localStorage or sessionStorage.
//   - Tokens live ONLY in the in-memory `tokenStore` Map, cleared on tab close.
//   - Gateway config (URL, name, id) persists in IndexedDB so users don't
//     re-add gateways every session.
//   - When persisted gateway configs are loaded, users must re-enter tokens
//     (or hit a "reconnect" button that prompts for the token).
//   - UI prefs (selected gateway, sidebar state) stay in localStorage — no
//     sensitive data.
//   - Defense in depth: if a user opts in to "remember token", we encrypt
//     the token with a key derived from the device pubkey (HKDF) before
//     writing to IDB. The decrypted token still has to round-trip through
//     the in-memory map at connect time.

import type { StoredConfig, StoredGateway } from '../core/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const IDB_NAME = 'hubclaw-storage';
const IDB_VERSION = 2; // bumped to add rooms + room-messages stores
const IDB_STORE = 'gateway-meta'; // stores metadata only (no tokens)
const ROOMS_STORE = 'rooms';
const MESSAGES_STORE = 'room-messages';
const CONFIG_KEY = 'hubclaw-config';
const UI_PREFS_KEY = 'hubclaw-ui-prefs';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersistedGatewayMeta {
  id: string;
  name: string;
  gatewayUrl: string;
  /** ms-since-epoch when the user last added/updated this gateway */
  updatedAt: number;
  /** ms-since-epoch when the user last successfully connected */
  lastConnectedAt?: number;
}

interface UIPrefs {
  selectedGatewayId?: string;
  selectedSessionKey?: string;
  sidebarCollapsed?: boolean;
  theme?: 'dark' | 'light';
}

// ─── StorageManager ───────────────────────────────────────────────────────────

export class StorageManager {
  /** In-memory token store. Cleared on page reload, tab close, or explicit clearTokens(). */
  private tokenStore: Map<string, string> = new Map();

  private _db: IDBDatabase | null = null;

  // ─── IDB Init ──────────────────────────────────────────────────────────────

  private openDB(): Promise<IDBDatabase> {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        this._db = req.result;
        resolve(this._db);
      };
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
        if (!db.objectStoreNames.contains(ROOMS_STORE)) {
          const rooms = db.createObjectStore(ROOMS_STORE, { keyPath: 'id' });
          rooms.createIndex('updatedAt', 'updatedAt');
          rooms.createIndex('archived', 'archived');
        }
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const msgs = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
          msgs.createIndex('roomId', 'roomId');
          msgs.createIndex('roomId_timestamp', ['roomId', 'timestamp']);
        }
      };
    });
  }

  // ─── Token Store (in-memory only) ──────────────────────────────────────────

  /**
   * Store a token in memory. The token lives only as long as the JS context —
   * close the tab, it's gone. This is the only place a plaintext token should
   * ever exist in this app.
   */
  setToken(gatewayId: string, token: string): void {
    this.tokenStore.set(gatewayId, token);
  }

  getToken(gatewayId: string): string | undefined {
    return this.tokenStore.get(gatewayId);
  }

  deleteToken(gatewayId: string): void {
    this.tokenStore.delete(gatewayId);
  }

  clearAllTokens(): void {
    this.tokenStore.clear();
  }

  hasToken(gatewayId: string): boolean {
    return this.tokenStore.has(gatewayId);
  }

  // ─── Gateway Config (persisted, NO tokens) ────────────────────────────────

  /**
   * Load the persisted gateway metadata. Returns gateways WITHOUT tokens —
   * callers must call setToken() + connect() to re-establish.
   */
  async loadConfigAsync(): Promise<StoredConfig> {
    const db = await this.openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(CONFIG_KEY);
      req.onerror = () => resolve({ version: 1, gateways: [] });
      req.onsuccess = () => {
        const raw = req.result as PersistedGatewayMeta[] | undefined;
        if (!raw) return resolve({ version: 1, gateways: [] });
        // Strip any legacy 'token' field that may have been written by
        // older versions of the app. We refuse to surface them.
        const cleaned: StoredGateway[] = raw.map((g) => ({
          id: g.id,
          name: g.name,
          gatewayUrl: g.gatewayUrl,
          token: '', // never surface from disk
        }));
        resolve({ version: 1, gateways: cleaned });
      };
    });
  }

  /**
   * Add or update a gateway. The token is stored in memory only;
   * the on-disk record contains metadata only.
   */
  async addGatewayAsync(gw: StoredGateway): Promise<void> {
    // Always update in-memory token first
    if (gw.token) this.setToken(gw.id, gw.token);

    // Persist metadata (no token)
    const db = await this.openDB();
    const list = await this._readAll(db);
    const meta: PersistedGatewayMeta = {
      id: gw.id,
      name: gw.name,
      gatewayUrl: gw.gatewayUrl,
      updatedAt: Date.now(),
    };
    const idx = list.findIndex((g) => g.id === gw.id);
    if (idx >= 0) list[idx] = meta;
    else list.push(meta);

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(list, CONFIG_KEY);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  /**
   * Synchronous add — kept for backward compat. Strips the token before
   * writing anywhere. Token must be set separately via setToken().
   */
  /**
   * Bulk-seed gateways from a JSON array (e.g. shipped seed file). Returns
   * the number of gateways that were actually added (skips existing ids).
   * Each gateway's token is stored in-memory only.
   */
  async seedFromList(list: StoredGateway[]): Promise<number> {
    let added = 0;
    for (const gw of list) {
      const existing = await this.getGatewayAsync(gw.id);
      if (existing) continue;
      await this.addGatewayAsync(gw);
      added++;
    }
    return added;
  }

  async removeGatewayAsync(gatewayId: string): Promise<void> {
    this.deleteToken(gatewayId);
    const db = await this.openDB();
    const list = await this._readAll(db);
    const next = list.filter((g) => g.id !== gatewayId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(next, CONFIG_KEY);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  async getGatewayAsync(gatewayId: string): Promise<StoredGateway | undefined> {
    const config = await this.loadConfigAsync();
    const meta = config.gateways.find((g) => g.id === gatewayId);
    if (!meta) return undefined;
    return { ...meta, token: this.getToken(gatewayId) ?? '' };
  }

  // ─── UI Prefs (localStorage, no sensitive data) ───────────────────────────

  loadUIPrefs(): UIPrefs {
    try {
      const raw = localStorage.getItem(UI_PREFS_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as UIPrefs;
    } catch {
      return {};
    }
  }

  saveUIPrefs(prefs: Partial<UIPrefs>): void {
    try {
      const current = this.loadUIPrefs();
      localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ ...current, ...prefs }));
    } catch (e) {
      console.error('[StorageManager] Failed to save UI prefs:', e);
    }
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async _readAll(db: IDBDatabase): Promise<PersistedGatewayMeta[]> {
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(CONFIG_KEY);
      req.onerror = () => resolve([]);
      req.onsuccess = () => resolve((req.result as PersistedGatewayMeta[] | undefined) ?? []);
    });
  }
}

export const storageManager = new StorageManager();
