import type { PopupElements } from "./dom";
import { BACKEND_URL } from "./config";
import { appState } from "./state";
import type { ProgressController } from "./progress";
import { renderPlanList } from "./planList";
import { savePopupState } from "./persistence";
import { getTargetTab } from "./activeTab";

// Change to however many passthroughs it does. Could change to be configurable in future versions.
const MAX_PASSES = 3;

const FILL_PLAN_TIMEOUT_MS = 180000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fieldKey(f: { frameId?: number; elementSelector: string }): string {
  return `${f.frameId ?? 0}::${f.elementSelector}`;
}

interface ScanAggregate {
  fields: any[];
  totalInputs: number;
  totalTextareas: number;
  totalSelects: number;
  displayTitle: string;
}

import type { ReelsController } from "./reels";

// Analyzes page, runs backend matching, and applies changes automatically.
export function initAutofill(els: PopupElements, progress: ProgressController, reels?: ReelsController) {
  const { updateProgress } = progress;

  function showError(msg: string) {
    els.analysisError.innerText = msg;
    els.analysisError.classList.remove("hidden");
  }

  function resetAutofillBtn() {
    els.btnAutofill.classList.remove("loading");
    els.btnAutofill.disabled = false;
    els.btnAutofillText.innerText = "Autofill Application";
    els.btnAutofill.style.background = "";
    els.btnAutofill.style.boxShadow = "";
  }

  function onAutofillSuccess() {
    updateProgress("complete", "Autofill completed successfully! ✓", 100);
    els.btnAutofill.classList.remove("loading");
    els.btnAutofill.disabled = false;
    els.btnAutofillText.innerText = "Autofill Complete! ✓";
    els.btnAutofill.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
    els.btnAutofill.style.boxShadow = "0 8px 24px -4px rgba(16, 185, 129, 0.45)";

    savePopupState(els);

    setTimeout(() => {
      els.btnAutofillText.innerText = "Autofill Application";
      els.btnAutofill.style.background = "";
      els.btnAutofill.style.boxShadow = "";
    }, 4000);
  }

  // Discovers all frame IDs for the active tab.
  async function getTabFrames(tabId: number): Promise<{ frameId: number; url?: string }[]> {
    return new Promise((resolve) => {
      if (chrome.webNavigation && chrome.webNavigation.getAllFrames) {
        chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
          if (chrome.runtime.lastError || !frames || frames.length === 0) {
            resolve([{ frameId: 0 }]);
          } else {
            resolve(frames.map(f => ({ frameId: f.frameId, url: f.url })));
          }
        });
      } else {
        resolve([{ frameId: 0 }]);
      }
    });
  }

  // Scans every frame of the tab and aggregates the results.
  async function scanAllFrames(tabId: number, fallbackTitle: string): Promise<ScanAggregate | null> {
    const frames = await getTabFrames(tabId);
    const scanPromises = frames.map(frame => {
      return new Promise<any>((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: "ANALYZE_PAGE" }, { frameId: frame.frameId }, (scanResponse) => {
          if (chrome.runtime.lastError || !scanResponse || scanResponse.error) {
            resolve(null);
          } else {
            if (Array.isArray(scanResponse.fields)) {
              scanResponse.fields.forEach((f: any) => {
                f.frameId = frame.frameId;
              });
            }
            resolve(scanResponse);
          }
        });
      });
    });

    const frameResults = (await Promise.all(scanPromises)).filter(Boolean);
    if (frameResults.length === 0) return null;

    let totalInputs = 0;
    let totalTextareas = 0;
    let totalSelects = 0;
    let combinedFields: any[] = [];
    let displayTitle = fallbackTitle;

    for (const res of frameResults) {
      totalInputs += res.inputsCount || 0;
      totalTextareas += res.textareasCount || 0;
      totalSelects += res.selectsCount || 0;
      if (Array.isArray(res.fields) && res.fields.length > 0) {
        combinedFields.push(...res.fields);
        if (!displayTitle || displayTitle === "No Title") {
          displayTitle = res.title || displayTitle;
        }
      }
    }

    return { fields: combinedFields, totalInputs, totalTextareas, totalSelects, displayTitle };
  }

  // Sends a batch of fields to the backend for a fill plan.
  async function fetchFillPlan(fields: any[], passLabel: string): Promise<any[]> {
    const requestPayloadObject = { fields };
    const requestJson = JSON.stringify(requestPayloadObject, null, 2);
    appState.debugRequestPayload = appState.debugRequestPayload
      ? `${appState.debugRequestPayload}\n\n--- ${passLabel} ---\n\n${requestJson}`
      : requestJson;
    els.debugRequestBox.innerText = appState.debugRequestPayload;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FILL_PLAN_TIMEOUT_MS);

    let backendRes: Response;
    try {
      backendRes = await fetch(`${BACKEND_URL}/api/fill-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayloadObject),
        signal: controller.signal
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("AI matching timed out after 3 minutes. The LLM provider may be slow or unresponsive -- try again, or check the backend's terminal output.");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!backendRes.ok) {
      throw new Error(`Backend HTTP error ${backendRes.status}: ${backendRes.statusText}`);
    }

    const plan = await backendRes.json();
    const responseJson = JSON.stringify(plan, null, 2);
    appState.debugResponsePayload = appState.debugResponsePayload
      ? `${appState.debugResponsePayload}\n\n--- ${passLabel} ---\n\n${responseJson}`
      : responseJson;
    els.debugResponseBox.innerText = appState.debugResponsePayload;

    return plan.actions || [];
  }

  // Applies one pass's plan actions to the content script in their respective frames.
  function applyPlanToPage(tabId: number, planActions: any[], candidateFields: any[]): Promise<{ errors: number }> {
    return new Promise((resolve) => {
      const fillActions = planActions.filter((a: any) => a.action !== "skip");
      if (fillActions.length === 0) {
        resolve({ errors: 0 });
        return;
      }

      chrome.storage.local.get("userResume", (storageResult) => {
        const resume = storageResult.userResume;

        let completed = 0;
        let errors = 0;

        function findFieldMeta(selector: string) {
          return candidateFields.find((f: any) => f.elementSelector === selector)
            ?? appState.extractedFields.find((f: any) => f.elementSelector === selector);
        }

        const uploadActions = fillActions.filter((a: any) => a.action === "upload");
        const standardActions = fillActions.filter((a: any) => a.action !== "upload");

        const standardByFrame = new Map<number, any[]>();
        standardActions.forEach((a: any) => {
          const fieldMeta = findFieldMeta(a.selector);
          const frameId = a.frameId ?? fieldMeta?.frameId ?? 0;
          if (!standardByFrame.has(frameId)) {
            standardByFrame.set(frameId, []);
          }
          standardByFrame.get(frameId)!.push({
            selector: a.selector,
            fillAction: a.action,
            value: a.value,
            label: a.label,
            optionsMode: fieldMeta ? fieldMeta.optionsMode : undefined
          });
        });

        const totalBatches = uploadActions.length + standardByFrame.size;
        if (totalBatches === 0) {
          resolve({ errors: 0 });
          return;
        }

        function checkFinish() {
          if (completed === totalBatches) {
            resolve({ errors });
          }
        }

        uploadActions.forEach((planAction: any) => {
          if (planAction.value === "resume") {
            if (!resume || !resume.data) {
              errors++;
              completed++;
              console.error("Resume file is missing from extension storage.");
              checkFinish();
              return;
            }

            const fieldMeta = findFieldMeta(planAction.selector);
            const frameId = planAction.frameId ?? fieldMeta?.frameId ?? 0;

            chrome.tabs.sendMessage(tabId, {
              action: "UPLOAD_FILE",
              selector: planAction.selector,
              fileData: resume.data,
              fileName: resume.name
            }, { frameId }, (res) => {
              completed++;
              if (chrome.runtime.lastError || !res || res.error) {
                errors++;
                console.error("Upload error:", chrome.runtime.lastError || res?.error);
              }
              checkFinish();
            });
          } else {
            completed++;
            checkFinish();
          }
        });

        standardByFrame.forEach((fieldsToFill, frameId) => {
          chrome.tabs.sendMessage(tabId, {
            action: "FILL_ALL_FIELDS",
            fields: fieldsToFill
          }, { frameId }, (res) => {
            completed++;
            if (chrome.runtime.lastError || !res) {
              errors += fieldsToFill.length;
              console.error("Batch fill error:", chrome.runtime.lastError || "No response received");
            } else if (res.results) {
              res.results.forEach((r: any) => {
                if (!r.success) {
                  errors++;
                  console.error(`Error filling field ${r.label || r.selector}: ${r.error}`);
                }
              });
            }
            checkFinish();
          });
        });
      });
    });
  }

  els.btnAutofill.addEventListener("click", async () => {
    els.btnAutofill.classList.add("loading");
    els.btnAutofill.disabled = true;
    els.btnAutofillText.innerText = "Analyzing page...";
    els.analysisError.classList.add("hidden");
    updateProgress("scanning", "Scanning form inputs across page frames...", 25);
    reels?.showReels();

    const activeTab = await getTargetTab();
    if (!activeTab || !activeTab.id) {
      showError("Unable to locate active browser tab.");
      resetAutofillBtn();
      return;
    }

    const url = activeTab.url || "";
    if (
      url.startsWith("chrome://") ||
      url.startsWith("chrome-extension://") ||
      url.startsWith("edge://") ||
      url.startsWith("about:")
    ) {
      showError("Content scripts cannot execute on internal browser pages.");
      resetAutofillBtn();
      return;
    }

    const tabId = activeTab.id;
    const activeTabUrl = activeTab.url || "";
    const seenFieldKeys = new Set<string>();
    let totalErrors = 0;

    appState.extractedFields = [];
    appState.generatedActionsPlan = [];
    appState.debugRequestPayload = "";
    appState.debugResponsePayload = "";

    try {
      for (let pass = 1; pass <= MAX_PASSES; pass++) {
        if (pass > 1) {
          els.btnAutofillText.innerText = `Checking for new fields (pass ${pass}/${MAX_PASSES})...`;
          updateProgress("scanning", `Checking for newly revealed fields (pass ${pass}/${MAX_PASSES})...`, 25);
          await sleep(300);
        }

        const scan = await scanAllFrames(tabId, activeTab.title || "-");

        if (!scan) {
          if (pass === 1) {
            showError("Communication failed. Please reload the job application page and try again.");
            resetAutofillBtn();
            return;
          }
          break;
        }

        if (pass === 1) {
          els.infoUrl.innerText = activeTabUrl || "-";
          els.infoUrl.title = activeTabUrl || "-";
          els.infoTitle.innerText = scan.displayTitle;
          els.infoTitle.title = scan.displayTitle;
          els.statInputs.innerText = String(scan.totalInputs);
          els.statTextareas.innerText = String(scan.totalTextareas);
          els.statSelects.innerText = String(scan.totalSelects);
          els.resultsSection.classList.remove("hidden");

          if (scan.fields.length === 0) {
            showError("No fillable form inputs found on the current page.");
            resetAutofillBtn();
            return;
          }
        }

        const newFields = scan.fields.filter((f: any) => !seenFieldKeys.has(fieldKey(f)));
        scan.fields.forEach((f: any) => seenFieldKeys.add(fieldKey(f)));

        if (pass > 1 && newFields.length === 0) break;

        appState.extractedFields = appState.extractedFields.concat(newFields);
        appState.currentJsonPayload = JSON.stringify(appState.extractedFields, null, 2);
        els.analysisJson.innerText = appState.currentJsonPayload;
        els.statTotalBadge.innerText = `${appState.extractedFields.length} field${appState.extractedFields.length === 1 ? '' : 's'} mapped`;

        els.btnAutofillText.innerText = pass === 1 ? "Matching with AI..." : `Matching ${newFields.length} new field(s)...`;
        updateProgress(
          "planning",
          pass === 1
            ? `Generating plan for ${newFields.length} fields...`
            : `Generating plan for ${newFields.length} newly revealed field(s) (pass ${pass})...`,
          60
        );

        const passActions = await fetchFillPlan(newFields, `Pass ${pass}`);

        appState.generatedActionsPlan = appState.generatedActionsPlan.concat(passActions);
        renderPlanList(els, appState.generatedActionsPlan);
        els.aiPlanContainer.classList.remove("hidden");
        els.appliedCountBadge.innerText = `${appState.generatedActionsPlan.length} action${appState.generatedActionsPlan.length === 1 ? '' : 's'}`;

        els.btnAutofillText.innerText = "Applying autofill...";
        updateProgress(
          "injecting",
          pass === 1
            ? `Filling ${passActions.length} inputs & attachments...`
            : `Filling ${passActions.length} newly revealed input(s) (pass ${pass})...`,
          85
        );

        const { errors } = await applyPlanToPage(tabId, passActions, newFields);
        totalErrors += errors;

        if (pass === MAX_PASSES) {
          console.info("Autofill: reached max pass cap; later-appearing fields, if any, were not checked.");
        }
      }

      if (totalErrors === 0) {
        onAutofillSuccess();
      } else {
        showError(`Autofill finished with ${totalErrors} injection error(s).`);
        updateProgress("error", `Completed with ${totalErrors} issue(s)`);
        resetAutofillBtn();
        savePopupState(els);
      }
    } catch (err) {
      showError(`AI Matching failed: ${err instanceof Error ? err.message : String(err)}`);
      updateProgress("error", "AI Matching failed");
      resetAutofillBtn();
    }
  });
}
