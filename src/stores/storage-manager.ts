import type { StoredConfig, StoredGateway } from '../core/types';

const CONFIG_KEY = 'hubclaw-config';
const UI_PREFS_KEY = 'hubclaw-ui-prefs';

interface UIPrefs {
  selectedGatewayId?: string;
  selectedSessionKey?: string;
  sidebarCollapsed?: boolean;
}

const DEFAULT_CONFIG: StoredConfig = {
  version: 1,
  gateways: [],
};

export class StorageManager {
  // ─── Gateway Config ─────────────────────────────────────────────────────────

  loadConfig(): StoredConfig {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return { ...DEFAULT_CONFIG };
      return JSON.parse(raw) as StoredConfig;
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  saveConfig(config: StoredConfig): void {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
      console.error('[StorageManager] Failed to save config:', e);
    }
  }

  addGateway(gw: StoredGateway): void {
    const config = this.loadConfig();
    const idx = config.gateways.findIndex((g) => g.id === gw.id);
    if (idx >= 0) {
      config.gateways[idx] = gw;
    } else {
      config.gateways.push(gw);
    }
    this.saveConfig(config);
  }

  removeGateway(gatewayId: string): void {
    const config = this.loadConfig();
    config.gateways = config.gateways.filter((g) => g.id !== gatewayId);
    this.saveConfig(config);
  }

  getGateway(gatewayId: string): StoredGateway | undefined {
    const config = this.loadConfig();
    return config.gateways.find((g) => g.id === gatewayId);
  }

  // ─── UI Preferences ────────────────────────────────────────────────────────

  loadUIPrefs(): UIPrefs {
    try {
      const raw = localStorage.getItem(UI_PREFS_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
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
}

export const storageManager = new StorageManager();
