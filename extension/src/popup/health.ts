import type { PopupElements } from "./dom";
import { BACKEND_URL } from "./config";

// Pings the FastAPI health endpoint to check connection state.
export function initHealthCheck(els: PopupElements) {
  async function checkBackendHealth() {
    els.statusDot.className = "status-dot checking";
    els.statusText.innerText = "Connecting...";
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      if (response.ok) {
        els.statusDot.className = "status-dot connected";
        els.statusText.innerText = "Connected";
      } else {
        throw new Error("Backend unhealthy");
      }
    } catch {
      els.statusDot.className = "status-dot disconnected";
      els.statusText.innerText = "Offline";
    }
  }

  checkBackendHealth();
}
