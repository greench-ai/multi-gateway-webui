// rooms-storage.ts
// Persistence for rooms — IndexedDB only.
// v1 keeps rooms client-side; v2 will swap to a Brainclaw-backed HTTP API.
//
// Uses the same IDB connection (hubclaw-storage, v2) as storage-manager.
// Schema is owned by storage-manager.ts onupgradeneeded — this file just
// opens at v2 and assumes the stores exist.

import type { Room, RoomMessage } from '../core/types';

const IDB_NAME = 'hubclaw-storage';
const IDB_VERSION = 2;
const ROOMS_STORE = 'rooms';
const MESSAGES_STORE = 'room-messages';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    // No onupgradeneeded here — storage-manager owns the schema.
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IDB open blocked: another tab holds an old connection. Close other HubClaw tabs and reload.'));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ─── Rooms CRUD ───────────────────────────────────────────────────────────────

export class RoomsStorage {
  /** Load all rooms, sorted by pinned DESC, updatedAt DESC. */
  async listRooms(): Promise<Room[]> {
    const db = await openDB();
    try {
      const all = (await reqToPromise(db.transaction(ROOMS_STORE).objectStore(ROOMS_STORE).getAll())) as Room[];
      return all.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
    } finally {
      db.close();
    }
  }

  async getRoom(id: string): Promise<Room | undefined> {
    const db = await openDB();
    try {
      return (await reqToPromise(db.transaction(ROOMS_STORE).objectStore(ROOMS_STORE).get(id))) as Room | undefined;
    } finally {
      db.close();
    }
  }

  async putRoom(room: Room): Promise<void> {
    const db = await openDB();
    try {
      const tx = db.transaction(ROOMS_STORE, 'readwrite');
      await reqToPromise(tx.objectStore(ROOMS_STORE).put(room));
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async deleteRoom(id: string): Promise<void> {
    const db = await openDB();
    try {
      const tx = db.transaction([ROOMS_STORE, MESSAGES_STORE], 'readwrite');
      // Delete the room
      await reqToPromise(tx.objectStore(ROOMS_STORE).delete(id));
      // Delete all messages in that room
      const msgIdx = tx.objectStore(MESSAGES_STORE).index('roomId');
      const cursorReq = msgIdx.openCursor(IDBKeyRange.only(id));
      await new Promise<void>((resolve, reject) => {
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      });
      await txDone(tx);
    } finally {
      db.close();
    }
  }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export class RoomMessagesStorage {
  /** List all messages for a room, oldest first. */
  async listMessages(roomId: string): Promise<RoomMessage[]> {
    const db = await openDB();
    try {
      const idx = db.transaction(MESSAGES_STORE).objectStore(MESSAGES_STORE).index('roomId_timestamp');
      const range = IDBKeyRange.bound([roomId, 0], [roomId, Number.MAX_SAFE_INTEGER]);
      const all = (await reqToPromise(idx.getAll(range))) as RoomMessage[];
      return all.sort((a, b) => a.timestamp - b.timestamp);
    } finally {
      db.close();
    }
  }

  async putMessage(msg: RoomMessage): Promise<void> {
    const db = await openDB();
    try {
      const tx = db.transaction(MESSAGES_STORE, 'readwrite');
      await reqToPromise(tx.objectStore(MESSAGES_STORE).put(msg));
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async deleteMessage(id: string): Promise<void> {
    const db = await openDB();
    try {
      const tx = db.transaction(MESSAGES_STORE, 'readwrite');
      await reqToPromise(tx.objectStore(MESSAGES_STORE).delete(id));
      await txDone(tx);
    } finally {
      db.close();
    }
  }
}

export const roomsStorage = new RoomsStorage();
export const roomMessagesStorage = new RoomMessagesStorage();
