import type { OperionLocalSettings } from "@/types/desktop";

const STORAGE_KEY = "operion.local.settings.v1";

export const DEFAULT_LOCAL_SETTINGS: OperionLocalSettings = {
  general: {
    compactNavigation: false,
    prioritizeAlerts: true,
    showAITeaser: true,
  },
  integrations: {
    provider: "openai",
    apiKey: "",
    model: "gpt-4o-mini",
    lastSavedAt: null,
    lastTestedAt: null,
    lastStatus: null,
  },
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadLocalSettings(): OperionLocalSettings {
  if (!isBrowser()) {
    return DEFAULT_LOCAL_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_LOCAL_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<OperionLocalSettings>;
    return {
      general: {
        ...DEFAULT_LOCAL_SETTINGS.general,
        ...parsed.general,
      },
      integrations: {
        ...DEFAULT_LOCAL_SETTINGS.integrations,
        ...parsed.integrations,
      },
    };
  } catch {
    return DEFAULT_LOCAL_SETTINGS;
  }
}

export function saveLocalSettings(settings: OperionLocalSettings) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearLocalSettings() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
