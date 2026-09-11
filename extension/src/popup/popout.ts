import type { PopupElements } from "./dom";

// Opens the popup in a real, detached, draggable OS window.
export function initPopOut(els: PopupElements) {
  els.btnPopOut.addEventListener("click", () => {
    chrome.windows.create(
      {
        url: chrome.runtime.getURL("popup.html"),
        type: "popup",
        width: 410,
        height: 540
      },
      () => {
        window.close();
      }
    );
  });
}
