
import { MapStylePreset } from '@/types';
import { createLogger } from '@/core/logger';

const logger = createLogger('StorageService');

const KEYS = {
  STYLES: 'mapAlchemistStyles',
};

const DB_NAME = 'MapAlchemistDB';
const DB_VERSION = 1;
const STORE_NAME = 'styles';

// Helper to open IndexedDB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

export const storageService = {
  // Async retrieve styles from IndexedDB (with localStorage migration fallback)
  getStyles: async (): Promise<MapStylePreset[] | null> => {
    try {
      const db = await openDB();
      const fromDB = await new Promise<MapStylePreset[] | undefined>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get('presets');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      if (fromDB && fromDB.length > 0) {
        return fromDB;
      }

      // MIGRATION: If DB is empty, check localStorage (legacy)
      const fromLocal = localStorage.getItem(KEYS.STYLES);
      if (fromLocal) {
        try {
          logger.info("Migrating styles from localStorage to IndexedDB...");
          const parsed = JSON.parse(fromLocal);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Save to DB
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).put(parsed, 'presets');

            // Clear localStorage to free space
            localStorage.removeItem(KEYS.STYLES);
            return parsed;
          }
        } catch (e) {
          logger.error("Migration failed", e);
        }
      }
      return null;
    } catch (e) {
      logger.error("Failed to load styles from DB", e);
      return null;
    }
  },

  // Async save styles to IndexedDB
  saveStyles: async (styles: MapStylePreset[]) => {
    try {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(styles, 'presets');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (e) {
      logger.error("Failed to save styles to DB", e);
    }
  },

  // Clear styles from DB and LocalStorage
  clearStyles: async () => {
    try {
      const db = await openDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete('presets');
      localStorage.removeItem(KEYS.STYLES);
    } catch (e) {
      logger.error("Error clearing styles", e);
    }
  }
};
