import type { PopupElements } from "./dom";

const INSTAGRAM_REELS_URL = "https://www.instagram.com/?next=/reels/";
const INSTAGRAM_DIRECT_REELS = "https://www.instagram.com/reels/";
const INSTAGRAM_HOME_URL = "https://www.instagram.com/";

export interface ReelsController {
  showReels: () => void;
  hideReels: () => void;
  toggleReels: () => void;
  reloadReels: () => void;
  openCompanionWindow: () => void;
  goToReels: () => void;
  goToHome: () => void;
  nextReel: () => void;
  prevReel: () => void;
}

export function initReels(els: PopupElements): ReelsController {
  let isFrameLoaded = false;

  function showReels() {
    document.body.classList.add("reels-active");
    els.reelsSection.classList.remove("hidden");
    els.btnReelsToggle.classList.add("active");

    // Lazy load Instagram Reels iframe on first reveal
    if (!isFrameLoaded || els.instagramFrame.src === "about:blank" || !els.instagramFrame.src) {
      els.reelsLoadingPlaceholder.classList.remove("hidden");
      els.instagramFrame.src = INSTAGRAM_REELS_URL;
    }

    // Give iframe focus so keyboard controls work immediately
    setTimeout(() => {
      try {
        els.instagramFrame.focus();
      } catch (_) {}
    }, 400);
  }

  function hideReels() {
    document.body.classList.remove("reels-active");
    els.reelsSection.classList.add("hidden");
    els.btnReelsToggle.classList.remove("active");
  }

  function toggleReels() {
    if (els.reelsSection.classList.contains("hidden")) {
      showReels();
    } else {
      hideReels();
    }
  }

  function reloadReels() {
    els.reelsLoadingPlaceholder.classList.remove("hidden");
    const current = els.instagramFrame.src;
    els.instagramFrame.src = current && current !== "about:blank" ? current : INSTAGRAM_REELS_URL;
  }

  function goToReels() {
    els.reelsLoadingPlaceholder.classList.remove("hidden");
    // 1. Send postMessage to content script to try client-side click
    try {
      els.instagramFrame.contentWindow?.postMessage({ action: "IG_GO_TO_REELS" }, "*");
    } catch (_) {}
    // 2. Set direct reels URL
    els.instagramFrame.src = INSTAGRAM_DIRECT_REELS;
  }

  function goToHome() {
    els.reelsLoadingPlaceholder.classList.remove("hidden");
    els.instagramFrame.src = INSTAGRAM_HOME_URL;
  }

  function nextReel() {
    // 1. Send postMessage to the iframe content script
    try {
      els.instagramFrame.contentWindow?.postMessage({ action: "IG_NEXT_REEL" }, "*");
    } catch (_) {}

    // 2. Broadcast via chrome.runtime
    try {
      chrome.runtime.sendMessage({ action: "IG_NEXT_REEL" }, () => {
        if (chrome.runtime.lastError) {}
      });
    } catch (_) {}

    // 3. Focus iframe so native ArrowDown also works
    try {
      els.instagramFrame.focus();
    } catch (_) {}
  }

  function prevReel() {
    // 1. Send postMessage to the iframe content script
    try {
      els.instagramFrame.contentWindow?.postMessage({ action: "IG_PREV_REEL" }, "*");
    } catch (_) {}

    // 2. Broadcast via chrome.runtime
    try {
      chrome.runtime.sendMessage({ action: "IG_PREV_REEL" }, () => {
        if (chrome.runtime.lastError) {}
      });
    } catch (_) {}

    // 3. Focus iframe
    try {
      els.instagramFrame.focus();
    } catch (_) {}
  }

  // Opens a detached floating companion window with Instagram Reels.
  // Because this is a top-level window, Chrome automatically provides your existing
  // Instagram account login and cookies with zero iframe restrictions!
  function openCompanionWindow() {
    chrome.windows.create({
      url: INSTAGRAM_DIRECT_REELS,
      type: "popup",
      width: 420,
      height: 740,
      focused: true,
    });
  }

  // Handle iframe load event
  els.instagramFrame.addEventListener("load", () => {
    if (els.instagramFrame.src && els.instagramFrame.src !== "about:blank") {
      isFrameLoaded = true;
      els.reelsLoadingPlaceholder.classList.add("hidden");
      // Auto-focus the frame so keyboard controls work
      setTimeout(() => {
        try {
          els.instagramFrame.focus();
        } catch (_) {}
      }, 300);
    }
  });

  // Wire up button click listeners
  els.btnReelsToggle.addEventListener("click", () => toggleReels());
  els.btnReelsClose.addEventListener("click", () => hideReels());
  els.reelsStatusPill?.addEventListener("click", () => hideReels());

  // Global keyboard shortcuts while Reels drawer is active
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (els.reelsSection.classList.contains("hidden")) return;

    if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j") {
      nextReel();
    } else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") {
      prevReel();
    } else if (e.key === "Escape") {
      hideReels();
    }
  });

  return {
    showReels,
    hideReels,
    toggleReels,
    reloadReels,
    openCompanionWindow,
    goToReels,
    goToHome,
    nextReel,
    prevReel,
  };
}
