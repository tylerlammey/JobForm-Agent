import type { PopupElements } from "./dom";

export function initResume(els: PopupElements) {
  // Loads saved resume metadata from local storage.
  function loadSavedResume() {
    chrome.storage.local.get("userResume", (result) => {
      if (result.userResume && result.userResume.name && result.userResume.data) {
        els.resumeFilename.innerText = result.userResume.name;
        els.resumeFilename.title = result.userResume.name;
      } else {
        els.resumeFilename.innerText = "No file selected";
        els.resumeFilename.title = "";
      }
    });
  }

  // Saves selected file as base64 data-URL string in local storage.
  els.resumeFileInput.addEventListener("change", () => {
    const file = els.resumeFileInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Data = e.target?.result as string;
      chrome.storage.local.set({
        userResume: {
          name: file.name,
          data: base64Data
        }
      }, () => {
        loadSavedResume();
      });
    };
    reader.readAsDataURL(file);
  });

  loadSavedResume();
}
