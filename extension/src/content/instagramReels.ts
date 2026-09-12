/**
 * instagramReels.ts
 * Injected script for Instagram pages running inside the Chrome extension or companion window.
 * Provides:
 * 1. Discrete single-reel snapping on mouse wheel events (prevents stopping halfway between reels).
 * 2. Next / Previous reel navigation triggers via postMessage and runtime messaging.
 * 3. Auto-recovery: if Instagram hits the cold-start error page, automatically returns to home and navigates to Reels.
 * 4. Ensures navigation elements remain visible and interactive.
 */

function findReelScrollContainer(): HTMLElement | null {
  const allElements = Array.from(document.querySelectorAll<HTMLElement>('*'));
  for (const el of allElements) {
    const style = window.getComputedStyle(el);
    if ((style.overflowY === 'scroll' || style.overflowY === 'auto') && el.scrollHeight > el.clientHeight + 100) {
      return el;
    }
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

export function advanceReel(direction: 1 | -1) {
  const container = findReelScrollContainer();
  const step = container ? (container.clientHeight || 540) : (window.innerHeight || 540);

  if (container && container !== document.documentElement && container !== document.scrollingElement) {
    container.scrollBy({ top: direction * step, behavior: 'smooth' });
  } else {
    window.scrollBy({ top: direction * step, behavior: 'smooth' });
  }

  // Also dispatch keyboard event to notify Instagram's internal state machine
  const key = direction > 0 ? 'ArrowDown' : 'ArrowUp';
  const keyCode = direction > 0 ? 40 : 38;
  const target = container || document.activeElement || window;
  
  try {
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key,
      code: key,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      composed: true
    }));
  } catch (_) {
    // Ignore synthetic event restrictions if any
  }
}

export function initInstagramReelsController() {
  if (!window.location.hostname.includes('instagram.com')) {
    return;
  }

  console.log('[JobForm Agent] Instagram Reels companion controller active.');

  // 1. Auto-recovery: If Instagram hits the generic error page or is on home, navigate to Reels
  let autoNavAttempts = 0;
  function checkAndRecover() {
    if (autoNavAttempts > 10) return;

    const bodyText = document.body ? document.body.innerText : '';
    
    // Case A: On the "Sorry, this page isn't available" error page
    if (bodyText.includes("Sorry, this page isn't available") || bodyText.includes('page may have been removed')) {
      const goBackLink = document.querySelector<HTMLAnchorElement>('a[href*="instagram.com"], a[href="/"]');
      if (goBackLink) {
        console.log('[JobForm Agent] Detected Instagram error page. Navigating back to home to initialize session...');
        autoNavAttempts++;
        goBackLink.click();
      }
      return;
    }

    // Case B: On Instagram home / feed, auto-click the Reels navigation button
    if (window.location.pathname === '/' || window.location.pathname === '') {
      const reelsLink = document.querySelector<HTMLAnchorElement>(
        'a[href*="/reels/"], a[href="/reels"], a[aria-label="Reels"]'
      );
      if (reelsLink) {
        console.log('[JobForm Agent] Found Reels navigation button on home. Navigating to Reels...');
        autoNavAttempts++;
        reelsLink.click();
      }
    }
  }

  // Poll a few times during initial hydration
  const recoveryInterval = setInterval(checkAndRecover, 700);
  setTimeout(() => clearInterval(recoveryInterval), 12000);

  // 2. Snap cleanly between reels on mouse wheel scroll instead of scrolling halfway
  let isWheelThrottled = false;
  window.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      // Only apply snap scrolling if on reels page
      if (!window.location.pathname.includes('/reels')) return;
      if (Math.abs(event.deltaY) < 18) return;

      // Intercept wheel event to prevent native partial-notch scrolling
      event.preventDefault();
      event.stopPropagation();

      if (isWheelThrottled) return;
      isWheelThrottled = true;

      const direction = event.deltaY > 0 ? 1 : -1;
      advanceReel(direction);

      setTimeout(() => {
        isWheelThrottled = false;
      }, 550);
    },
    { passive: false, capture: true }
  );

  // 3. Listen for postMessage from parent extension popup
  window.addEventListener('message', (event: MessageEvent) => {
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.action === 'IG_NEXT_REEL') {
      advanceReel(1);
    } else if (event.data.action === 'IG_PREV_REEL') {
      advanceReel(-1);
    } else if (event.data.action === 'IG_GO_TO_REELS') {
      const reelsLink = document.querySelector<HTMLAnchorElement>('a[href*="/reels/"], a[href="/reels"]');
      if (reelsLink) {
        reelsLink.click();
      } else {
        window.location.href = 'https://www.instagram.com/reels/';
      }
    }
  });

  // 4. Listen for Chrome runtime messages
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (request.action === 'IG_NEXT_REEL') {
        advanceReel(1);
        sendResponse({ success: true });
        return true;
      } else if (request.action === 'IG_PREV_REEL') {
        advanceReel(-1);
        sendResponse({ success: true });
        return true;
      } else if (request.action === 'IG_GO_TO_REELS') {
        const reelsLink = document.querySelector<HTMLAnchorElement>('a[href*="/reels/"], a[href="/reels"]');
        if (reelsLink) {
          reelsLink.click();
        } else {
          window.location.href = 'https://www.instagram.com/reels/';
        }
        sendResponse({ success: true });
        return true;
      }
      return false;
    });
  }

  // 5. Auto-focus container when page finishes loading
  window.addEventListener('load', () => {
    checkAndRecover();
    const container = findReelScrollContainer();
    if (container) {
      container.focus();
    }
  });
}
