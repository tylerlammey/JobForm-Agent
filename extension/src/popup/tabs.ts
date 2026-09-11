import type { PopupElements } from "./dom";

export function initTabs(els: PopupElements) {
  els.tabBtnMain.addEventListener("click", () => {
    els.tabBtnMain.classList.add("active");
    els.tabBtnDebug.classList.remove("active");
    els.tabContentMain.classList.remove("hidden");
    els.tabContentDebug.classList.add("hidden");
  });

  els.tabBtnDebug.addEventListener("click", () => {
    els.tabBtnDebug.classList.add("active");
    els.tabBtnMain.classList.remove("active");
    els.tabContentDebug.classList.remove("hidden");
    els.tabContentMain.classList.add("hidden");
  });
}
