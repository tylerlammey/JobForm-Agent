/**
 * Resolves the tab the popup should act on. A plain
 * chrome.tabs.query({ active: true, currentWindow: true }) only works when
 * the popup is docked to the toolbar -- "current window" there is the
 * browser window the user is looking at. When the popup has been "popped
 * out" into its own detached window (see popup/windowPopout.ts), "current
 * window" is that detached window itself, which has no job-application tab
 * at all. Resolving against the last-focused *normal* browser window instead
 * gives the right answer in both cases.
 */
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
