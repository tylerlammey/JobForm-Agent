import { queryElements } from "./popup/dom";
import { initProgress } from "./popup/progress";
import { initHealthCheck } from "./popup/health";
import { initResume } from "./popup/resume";
import { initTabs } from "./popup/tabs";
import { initTracker } from "./popup/tracker";
import { initDebugConsole } from "./popup/debug";
import { initAutofill } from "./popup/autofill";
import { loadPopupState } from "./popup/persistence";
import { getTargetTab } from "./popup/activeTab";
import { initTheme } from "./popup/theme";
import { initPopOut } from "./popup/popout";
import { initReels } from "./popup/reels";

document.addEventListener("DOMContentLoaded", async () => {
  const els = queryElements();
  try {
    els.footerVersion.innerText = `v${chrome?.runtime?.getManifest?.()?.version || "1.3.0"}`;
  } catch (_) {}

  const progress = initProgress(els);
  const reels = initReels(els);

  initTheme(els);
  initPopOut(els);
  initHealthCheck(els);
  initResume(els);
  initTabs(els);
  initDebugConsole(els);
  initAutofill(els, progress, reels);

  const activeTab = await getTargetTab();
  initTracker(els, activeTab?.id, activeTab?.url || "");
  loadPopupState(els);
});
