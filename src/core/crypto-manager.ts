// crypto-manager.ts
// Ed25519 device identity for HubClaw gateway auth.
//
// Wire spec (matches the auth findings doc):
//   - Algorithm:        Ed25519
//   - Public key:       raw 32 bytes, base64url-encoded (43 chars without padding)
//   - Private key:      raw 32 bytes (seed), base64url-encoded
//   - Device ID:        SHA-256(raw 32-byte public key), hex (64 chars, lowercase)
//   - Signature:        Ed25519 over the UTF-8 JSON auth payload, base64url-encoded (88 chars)
//
// Storage:
//   - Keypair persists in IndexedDB so the device ID stays stable across reloads.
//   - Private key is stored as raw bytes (NOT a CryptoKey), so it can survive page reloads
//     without depending on extractable CryptoKey semantics.
//
// Library: @noble/ed25519 v2.x (already in package.json). Audited, used by ethers.js.
//   We use the synchronous API by pre-hashing with noble/hashes.

import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { sha512 } from '@noble/hashes/sha512';
import { base64UrlEncode, base64UrlDecode, nowMs } from './utils';

// noble/ed25519 v2 needs sha512 wired up explicitly (sync API).
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

// ─── Types ────────────────────────────────────────────────────────────────────

/** Persisted device key. Public + private keys are raw bytes (not CryptoKey). */
interface PersistedDeviceKey {
  /** device ID = hex(SHA-256(publicKey)) */
  id: string;
  /** base64url-encoded raw 32-byte Ed25519 public key */
  publicKey: string;
  /** base64url-encoded raw 32-byte Ed25519 private seed */
  privateKey: string;
  /** creation timestamp (ms) */
  createdAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = 'hubclaw-crypto';
// v1 → v2: key schema changed (P-256 → Ed25519 raw)
// v2 → v3: force fresh key on every gateway. Old deviceId (92b97d21…)
// was paired only on aspire's local gateway under a previous attempt;
// the 8 remote gateways don't have it. Bumping the version invalidates
// the stored key so the SPA generates a new Ed25519 keypair, which
// will trigger a fresh PAIRING_REQUIRED on every gateway the first
// time the user clicks Reconnect. User approves each via SSH or Nodes.
const DB_VERSION = 3;
const STORE_NAME = 'keys';
const KEY_ID = 'hubclaw-device';

// ─── CryptoManager ────────────────────────────────────────────────────────────

export class CryptoManager {
  private _currentKey: PersistedDeviceKey | null = null;
  private _db: IDBDatabase | null = null;
  private _initPromise: Promise<string> | null = null;

  // ─── Initialization ───────────────────────────────────────────────────────

  /**
   * Initialize the crypto manager. Idempotent — calling multiple times returns
   * the same promise. On first run, generates a new Ed25519 keypair and persists
   * it. On subsequent runs, loads the existing keypair from IndexedDB.
   */
  init(): Promise<string> {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._init();
    return this._initPromise;
  }

  private async _init(): Promise<string> {
    await this.openDB();
    const stored = await this.getStoredKey();
    if (stored) {
      this._currentKey = stored;
    } else {
      this._currentKey = await this.generateKey();
      await this.storeKey(this._currentKey);
    }
    return this._currentKey.id;
  }

  /** device ID = hex(SHA-256(raw 32-byte public key)) */
  get deviceId(): string {
    return this._currentKey?.id ?? '';
  }

  /** base64url-encoded raw 32-byte Ed25519 public key */
  get publicKeyBase64Url(): string {
    return this._currentKey?.publicKey ?? '';
  }

  // ─── Key Generation ───────────────────────────────────────────────────────

  private async generateKey(): Promise<PersistedDeviceKey> {
    // ed.utils.randomPrivateKey() generates 32 secure-random bytes
    const privateKeyBytes = ed.utils.randomPrivateKey();
    const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);

    // device ID = SHA-256(public key) hex
    const id = bytesToHex(sha256(publicKeyBytes));

    return {
      id,
      publicKey: base64UrlEncode(publicKeyBytes),
      privateKey: base64UrlEncode(privateKeyBytes),
      createdAt: nowMs(),
    };
  }

  // ─── Signing ──────────────────────────────────────────────────────────────

  /**
   * Sign a UTF-8 string payload with the device's Ed25519 private key.
   * Returns a base64url-encoded signature and the timestamp it was created.
   */
  async signPayload(
    payload: string
  ): Promise<{ signature: string; signedAt: number }> {
    if (!this._currentKey) throw new Error('No device key — call init() first');

    const data = new TextEncoder().encode(payload);
    const privateKeyBytes = base64UrlDecode(this._currentKey.privateKey);
    const signatureBytes = await ed.signAsync(data, privateKeyBytes);

    return {
      signature: base64UrlEncode(signatureBytes),
      signedAt: nowMs(),
    };
  }

  // ─── Auth Payload Assembly ────────────────────────────────────────────────

  /**
   * Build the canonical auth payload string for the gateway's signature
   * verification. The gateway (src/gateway/device-auth.ts) builds the same
   * pipe-delimited V2 string and tries to verify the signature against it.
   * The WebUI must produce byte-for-byte the same string.
   *
   * V2 format (9 fields, joined by '|'):
   *   v2 | deviceId | clientId | clientMode | role | scopes |
   *       signedAtMs | token | nonce
   *
   * Where:
   *   - scopes is joined by ',' (NOT '|')
   *   - token and nonce are always present (empty string if not provided)
   *   - signedAtMs is a decimal string
   *
   * The gateway also tries V3 (which adds platform + deviceFamily) — not
   * used here for now. The auth findings doc specifies V2 as primary.
   */
  createAuthPayload(
    deviceId: string,
    clientId: string,
    clientMode: string,
    role: string,
    scopes: string[],
    signedAtMs: number,
    token?: string,
    nonce?: string
  ): string {
    const scopeStr = scopes.join(',');
    const tokenStr = token ?? '';
    const nonceStr = nonce ?? '';
    return [
      'v2',
      deviceId,
      clientId,
      clientMode,
      role,
      scopeStr,
      String(signedAtMs),
      tokenStr,
      nonceStr,
    ].join('|');
  }

  /**
   * Build a complete device auth object for the `device` field in connect params.
   * The gateway uses this to verify the device identity and (depending on
   * policy) auto-approve the pairing.
   */
  async createDeviceAuth(
    role: string,
    scopes: string[],
    token?: string,
    nonce?: string
  ): Promise<{
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce?: string;
  }> {
    if (!this._currentKey) throw new Error('No device key — call init() first');

    const signedAtMs = nowMs();
    const authPayload = this.createAuthPayload(
      this._currentKey.id,
      'webchat-ui',
      'ui',
      role,
      scopes,
      signedAtMs,
      token,
      nonce
    );

    const { signature } = await this.signPayload(authPayload);

    const result: {
      id: string;
      publicKey: string;
      signature: string;
      signedAt: number;
      nonce?: string;
    } = {
      id: this._currentKey.id,
      publicKey: this._currentKey.publicKey,
      signature,
      signedAt: signedAtMs,
    };

    if (nonce !== undefined) result.nonce = nonce;

    return result;
  }

  // ─── IndexedDB Storage ────────────────────────────────────────────────────

  private openDB(): Promise<IDBDatabase> {
    if (this._db) return Promise.resolve(this._db);

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        this._db = req.result;
        resolve(this._db);
      };
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const tx = (e.target as IDBOpenDBRequest).transaction;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        // On any version bump, clear the existing key. The previous
        // deviceId (92b97d21…) was paired only on aspire's local gateway
        // and is unknown on the 8 remote gateways, so reusing it would
        // produce DEVICE_AUTH_DEVICE_ID_MISMATCH and block pairing.
        // Bumping the version wipes the stored key so _init() generates
        // a fresh Ed25519 keypair and the first connect to each gateway
        // returns a proper PAIRING_REQUIRED with a requestId.
        if (tx && db.objectStoreNames.contains(STORE_NAME)) {
          tx.objectStore(STORE_NAME).clear();
        }
      };
    });
  }

  private async getStoredKey(): Promise<PersistedDeviceKey | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY_ID);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const raw = req.result as PersistedDeviceKey | undefined;
        if (!raw) return resolve(null);
        // Validate shape — if an old P-256 key is in there, ignore it and regen.
        if (typeof raw.publicKey !== 'string' || typeof raw.privateKey !== 'string' || typeof raw.id !== 'string') {
          return resolve(null);
        }
        // Sanity check: id must be 64 hex chars (SHA-256 output).
        if (!/^[0-9a-f]{64}$/.test(raw.id)) {
          return resolve(null);
        }
        resolve(raw);
      };
    });
  }

  private async storeKey(key: PersistedDeviceKey): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(key, KEY_ID);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  }

  // ─── Test / Debug Helpers ─────────────────────────────────────────────────

  /**
   * Wipe the stored keypair. Useful for re-paired devices and for tests.
   * After calling this, the next init() will generate a new keypair.
   */
  async reset(): Promise<void> {
    if (!this._db) await this.openDB();
    const db = this._db!;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(KEY_ID);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
    this._currentKey = null;
    this._initPromise = null;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export const cryptoManager = new CryptoManager();
