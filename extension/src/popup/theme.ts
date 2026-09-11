import type { PopupElements } from "./dom";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/**
 * Reads a saved theme preference (chrome.storage.local, shared across the
 * docked popup and any popped-out window), defaulting to the OS/browser's
 * prefers-color-scheme when the user hasn't chosen one explicitly yet.
 */
export function initTheme(els: PopupElements) {
  chrome.storage.local.get([THEME_STORAGE_KEY], (result) => {
    const stored: Theme | undefined = result[THEME_STORAGE_KEY];
    const theme: Theme = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(theme);
  });

  els.btnThemeToggle.addEventListener("click", () => {
    const current: Theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next: Theme = current === "dark" ? "light" : "dark";
    applyTheme(next);
    chrome.storage.local.set({ [THEME_STORAGE_KEY]: next });
  });
}
