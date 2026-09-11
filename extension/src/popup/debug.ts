import type { PopupElements } from "./dom";
import { appState } from "./state";

// Wires one "Copy JSON" button: copies whatever getText() currently returns to the clipboard.
function wireCopyButton(button: HTMLButtonElement, statusEl: HTMLElement, getText: () => string) {
  const defaultLabel = statusEl.innerText;
  button.addEventListener("click", () => {
    const text = getText();
    if (!text) return;

    navigator.clipboard.writeText(text)
      .then(() => {
        statusEl.innerText = "Copied! ✓";
        button.style.color = "var(--liquid-emerald)";
        button.style.borderColor = "var(--liquid-emerald)";
        setTimeout(() => {
          statusEl.innerText = defaultLabel;
          button.style.color = "";
          button.style.borderColor = "";
        }, 1500);
      })
      .catch((err) => {
        console.error("Clipboard copy failed:", err);
      });
  });
}

export function initDebugConsole(els: PopupElements) {
  wireCopyButton(els.btnCopyJson, els.copyStatus, () => appState.currentJsonPayload);
  wireCopyButton(els.btnCopyRequest, els.copyRequestStatus, () => appState.debugRequestPayload);
  wireCopyButton(els.btnCopyResponse, els.copyResponseStatus, () => appState.debugResponsePayload);
}
