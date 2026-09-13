import type { PopupElements } from "./dom";
import { appState } from "./state";

export type TabName = "main" | "tracker" | "debug";

export function initTabs(els: PopupElements) {
  function selectTab(tab: TabName) {
    els.tabBtnMain.classList.toggle("active", tab === "main");
    els.tabBtnTracker.classList.toggle("active", tab === "tracker");
    els.tabBtnDebug.classList.toggle("active", tab === "debug");

    els.tabContentMain.classList.toggle("hidden", tab !== "main");
    els.tabContentTracker.classList.toggle("hidden", tab !== "tracker");
    els.tabContentDebug.classList.toggle("hidden", tab !== "debug");
  }

  els.tabBtnMain.addEventListener("click", () => selectTab("main"));
  els.tabBtnTracker.addEventListener("click", () => selectTab("tracker"));
  els.tabBtnDebug.addEventListener("click", () => selectTab("debug"));

  if (els.btnOpenTracker) {
    els.btnOpenTracker.addEventListener("click", () => selectTab("tracker"));
  }

  return { selectTab };
}

