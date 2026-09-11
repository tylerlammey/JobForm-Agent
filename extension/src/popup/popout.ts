import type { PopupElements } from "./dom";

/**
 * Chrome's toolbar-anchored action popup can never be dragged or moved --
 * that's a platform constraint, not something fixable here. The workaround
 * is opening the exact same popup.html bundle in a real, detached OS window
 * (chrome.windows.create with type "popup"), which the user CAN drag/resize
 * anywhere. See popup/activeTab.ts for the companion fix that makes "which
 * tab am I acting on" resolve correctly once running detached like this.
 */
export function initPopOut(els: PopupElements) {
  els.btnPopOut.addEventListener("click", () => {
    chrome.windows.create(
      {
        // popup.html's own content (collapsed tracker, no results yet) runs
        // well under this height -- a real OS window doesn't auto-shrink to
        // fit its content the way the toolbar dropdown does, so picking a
        // size close to the common case avoids a large empty gap at the
        // bottom. The window is still user-resizable if a run grows taller
        // than this (the page scrolls; nothing gets clipped). Matches
        // popup.css's body width (380px) plus a little OS window chrome.
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
