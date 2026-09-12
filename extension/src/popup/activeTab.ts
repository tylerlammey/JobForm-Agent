// Resolves the tab the popup should act on.
export function getTargetTab(): Promise<chrome.tabs.Tab | undefined> {
  return new Promise((resolve) => {
    chrome.windows.getLastFocused({ windowTypes: ["normal"] }, (win) => {
      if (chrome.runtime.lastError || !win || win.id === undefined) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
        return;
      }
      chrome.tabs.query({ active: true, windowId: win.id }, (tabs) => {
        if (chrome.runtime.lastError || tabs.length === 0) {
          chrome.tabs.query({ active: true, currentWindow: true }, (fallbackTabs) => resolve(fallbackTabs[0]));
          return;
        }
        resolve(tabs[0]);
      });
    });
  });
}
