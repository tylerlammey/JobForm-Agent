// Popup logic for JobForm Agent extension
const BACKEND_URL = "http://localhost:8000";

type ProgressStage = "idle" | "scanning" | "planning" | "injecting" | "complete" | "error";

document.addEventListener("DOMContentLoaded", () => {
  // Status Header
  const statusDot = document.getElementById("status-dot") as HTMLElement;
  const statusText = document.getElementById("status-text") as HTMLElement;
  
  // Hero Button
  const btnAutofill = document.getElementById("btn-autofill") as HTMLButtonElement;
  const btnAutofillText = document.getElementById("btn-autofill-text") as HTMLElement;
  
  // Progress Bar Components
  const progressSection = document.getElementById("progress-section") as HTMLElement;
  const progressBarFill = document.getElementById("progress-bar-fill") as HTMLElement;
  const progressStatusText = document.getElementById("progress-status-text") as HTMLElement;
  const progressPercentBadge = document.getElementById("progress-percent-badge") as HTMLElement;
  const stepScan = document.getElementById("step-scan") as HTMLElement;
  const stepPlan = document.getElementById("step-plan") as HTMLElement;
  const stepInject = document.getElementById("step-inject") as HTMLElement;
  const line1 = document.getElementById("line-1") as HTMLElement;
  const line2 = document.getElementById("line-2") as HTMLElement;

  // Results & Plan Section
  const resultsSection = document.getElementById("results-section") as HTMLElement;
  const aiPlanContainer = document.getElementById("ai-plan-container") as HTMLElement;
  const aiPlanList = document.getElementById("ai-plan-list") as HTMLElement;
  const appliedCountBadge = document.getElementById("applied-count-badge") as HTMLElement;
  const statTotalBadge = document.getElementById("stat-total-badge") as HTMLElement;

  const infoUrl = document.getElementById("info-url") as HTMLElement;
  const infoTitle = document.getElementById("info-title") as HTMLElement;
  const statInputs = document.getElementById("stat-inputs") as HTMLElement;
  const statTextareas = document.getElementById("stat-textareas") as HTMLElement;
  const statSelects = document.getElementById("stat-selects") as HTMLElement;
  const analysisError = document.getElementById("analysis-error") as HTMLElement;

  // Debug Console Elements
  const analysisJson = document.getElementById("analysis-json") as HTMLElement;
  const btnCopyJson = document.getElementById("btn-copy-json") as HTMLButtonElement;
  const copyStatus = document.getElementById("copy-status") as HTMLElement;
  const debugRequestBox = document.getElementById("debug-request-box") as HTMLElement;
  const debugResponseBox = document.getElementById("debug-response-box") as HTMLElement;

  // Resume Elements
  const resumeFileInput = document.getElementById("resume-file") as HTMLInputElement;
  const resumeFilename = document.getElementById("resume-filename") as HTMLElement;

  // Tab Navigation Elements
  const tabBtnMain = document.getElementById("tab-btn-main") as HTMLButtonElement;
  const tabBtnDebug = document.getElementById("tab-btn-debug") as HTMLButtonElement;
  const tabContentMain = document.getElementById("tab-content-main") as HTMLElement;
  const tabContentDebug = document.getElementById("tab-content-debug") as HTMLElement;

  let currentJsonPayload = "";
  let extractedFields: any[] = [];
  let generatedActionsPlan: any[] = [];
  let debugRequestPayload = "No request sent yet. Run \"Autofill Application\".";
  let debugResponsePayload = "No response received yet.";

  /**
   * Progress State Controller
   */
  function updateProgress(stage: ProgressStage, message?: string, percent?: number) {
    if (stage === "idle") {
      progressSection.classList.add("hidden");
      progressBarFill.style.width = "0%";
      stepScan.className = "step-pill";
      stepPlan.className = "step-pill";
      stepInject.className = "step-pill";
      line1.className = "step-line";
      line2.className = "step-line";
      return;
    }

    progressSection.classList.remove("hidden");

    if (stage === "scanning") {
      const p = percent ?? 25;
      progressBarFill.style.width = `${p}%`;
      progressPercentBadge.innerText = `${p}%`;
      progressStatusText.innerText = message || "Scanning form inputs...";
      stepScan.className = "step-pill active";
      stepPlan.className = "step-pill";
      stepInject.className = "step-pill";
      line1.className = "step-line";
      line2.className = "step-line";
    } else if (stage === "planning") {
      const p = percent ?? 65;
      progressBarFill.style.width = `${p}%`;
      progressPercentBadge.innerText = `${p}%`;
      progressStatusText.innerText = message || "Generating AI fill plan...";
      stepScan.className = "step-pill completed";
      line1.className = "step-line completed";
      stepPlan.className = "step-pill active";
      stepInject.className = "step-pill";
      line2.className = "step-line";
    } else if (stage === "injecting") {
      const p = percent ?? 90;
      progressBarFill.style.width = `${p}%`;
      progressPercentBadge.innerText = `${p}%`;
      progressStatusText.innerText = message || "Applying autofill actions...";
      stepScan.className = "step-pill completed";
      line1.className = "step-line completed";
      stepPlan.className = "step-pill completed";
      line2.className = "step-line completed";
      stepInject.className = "step-pill active";
    } else if (stage === "complete") {
      progressBarFill.style.width = "100%";
      progressPercentBadge.innerText = "100%";
      progressStatusText.innerText = message || "Autofill completed successfully!";
      stepScan.className = "step-pill completed";
      line1.className = "step-line completed";
      stepPlan.className = "step-pill completed";
      line2.className = "step-line completed";
      stepInject.className = "step-pill completed";
    } else if (stage === "error") {
      progressBarFill.style.width = "100%";
      progressBarFill.style.background = "var(--liquid-rose)";
      progressPercentBadge.innerText = "Error";
      progressStatusText.innerText = message || "Process encountered an error.";
    }
  }

  /**
   * Pings the FastAPI health endpoint to check connection state
   */
  async function checkBackendHealth() {
    statusDot.className = "status-dot checking";
    statusText.innerText = "Connecting...";
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      if (response.ok) {
        statusDot.className = "status-dot connected";
        statusText.innerText = "Connected";
      } else {
        throw new Error("Backend unhealthy");
      }
    } catch {
      statusDot.className = "status-dot disconnected";
      statusText.innerText = "Offline";
    }
  }

  /**
   * Loads saved resume metadata from local storage
   */
  function loadSavedResume() {
    chrome.storage.local.get("userResume", (result) => {
      if (result.userResume && result.userResume.name && result.userResume.data) {
        resumeFilename.innerText = result.userResume.name;
        resumeFilename.title = result.userResume.name;
      } else {
        resumeFilename.innerText = "No file selected";
        resumeFilename.title = "";
      }
    });
  }

  // Render plan list helper
  function renderPlanList(planActions: any[]) {
    aiPlanList.innerHTML = "";
    planActions.forEach((action) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "plan-item";

      const headerDiv = document.createElement("div");
      headerDiv.className = "plan-item-header";
      
      const labelSpan = document.createElement("span");
      labelSpan.className = "plan-item-label";
      labelSpan.innerText = action.label || "Unnamed Field";
      labelSpan.title = action.selector;

      const badgeSpan = document.createElement("span");
      badgeSpan.className = `badge badge-${action.action}`;
      badgeSpan.innerText = action.action;

      headerDiv.appendChild(labelSpan);
      headerDiv.appendChild(badgeSpan);
      itemDiv.appendChild(headerDiv);

      if (action.value !== undefined && action.value !== null && action.value !== "") {
        const valDiv = document.createElement("div");
        valDiv.className = "plan-item-value";
        valDiv.innerText = `"${action.value}"`;
        itemDiv.appendChild(valDiv);
      }

      if (action.explanation) {
        const expDiv = document.createElement("div");
        expDiv.className = "plan-item-exp";
        expDiv.innerText = action.explanation;
        itemDiv.appendChild(expDiv);
      }

      aiPlanList.appendChild(itemDiv);
    });
  }

  // Save popup state helper
  function savePopupState(activeTabUrl: string) {
    if (!activeTabUrl) return;
    const state = {
      url: infoUrl.innerText,
      title: infoTitle.innerText,
      inputsCount: statInputs.innerText,
      textareasCount: statTextareas.innerText,
      selectsCount: statSelects.innerText,
      extractedFields,
      currentJsonPayload,
      generatedActionsPlan,
      debugRequestPayload,
      debugResponsePayload
    };
    chrome.storage.local.set({ [`state_${activeTabUrl}`]: state });
  }

  // Load popup state helper
  function loadPopupState(activeTabUrl: string) {
    if (!activeTabUrl) return;
    chrome.storage.local.get([`state_${activeTabUrl}`], (result) => {
      const state = result[`state_${activeTabUrl}`];
      if (state) {
        infoUrl.innerText = state.url || "-";
        infoUrl.title = state.url || "";
        infoTitle.innerText = state.title || "-";
        infoTitle.title = state.title || "";
        statInputs.innerText = state.inputsCount || "0";
        statTextareas.innerText = state.textareasCount || "0";
        statSelects.innerText = state.selectsCount || "0";
        
        extractedFields = state.extractedFields || [];
        currentJsonPayload = state.currentJsonPayload || "";
        analysisJson.innerText = currentJsonPayload || "No fields scanned yet. Run \"Autofill Application\" from Workspace.";

        generatedActionsPlan = state.generatedActionsPlan || [];
        if (generatedActionsPlan.length > 0) {
          renderPlanList(generatedActionsPlan);
          aiPlanContainer.classList.remove("hidden");
          appliedCountBadge.innerText = `${generatedActionsPlan.length} action${generatedActionsPlan.length === 1 ? '' : 's'}`;
        }

        // Restore debug payload logs
        debugRequestPayload = state.debugRequestPayload || "No request sent yet. Run \"Autofill Application\".";
        debugResponsePayload = state.debugResponsePayload || "No response received yet.";
        debugRequestBox.innerText = debugRequestPayload;
        debugResponseBox.innerText = debugResponsePayload;
        
        if (extractedFields.length > 0) {
          resultsSection.classList.remove("hidden");
          statTotalBadge.innerText = `${extractedFields.length} field${extractedFields.length === 1 ? '' : 's'} mapped`;
        }
      }
    });
  }

  // Bind tab switching click listeners
  tabBtnMain.addEventListener("click", () => {
    tabBtnMain.classList.add("active");
    tabBtnDebug.classList.remove("active");
    tabContentMain.classList.remove("hidden");
    tabContentDebug.classList.add("hidden");
  });

  tabBtnDebug.addEventListener("click", () => {
    tabBtnDebug.classList.add("active");
    tabBtnMain.classList.remove("active");
    tabContentDebug.classList.remove("hidden");
    tabContentMain.classList.add("hidden");
  });

  // Initial check and load on startup
  checkBackendHealth();
  loadSavedResume();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab && activeTab.url) {
      loadPopupState(activeTab.url);
    }
  });

  /**
   * Saves selected file as base64 data-URL string in local storage
   */
  resumeFileInput.addEventListener("change", () => {
    const file = resumeFileInput.files?.[0];
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

  /**
   * Discovers all frame IDs for the active tab (e.g. main frame + Greenhouse/Lever embedded iframes)
   */
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

  /**
   * Hero Button Flow: Analyzes Page -> Runs Backend Matching -> Applies Changes Automatically
   */
  btnAutofill.addEventListener("click", async () => {
    btnAutofill.classList.add("loading");
    btnAutofill.disabled = true;
    btnAutofillText.innerText = "Analyzing page...";
    analysisError.classList.add("hidden");
    updateProgress("scanning", "Scanning form inputs across page frames...", 25);

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const activeTab = tabs[0];
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

      // Step 1: Analyze Page across all frames (top frame + embedded ATS iframes)
      const frames = await getTabFrames(activeTab.id);
      const scanPromises = frames.map(frame => {
        return new Promise<any>((resolve) => {
          chrome.tabs.sendMessage(activeTab.id!, { action: "ANALYZE_PAGE" }, { frameId: frame.frameId }, (scanResponse) => {
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

      if (frameResults.length === 0) {
        showError("Communication failed. Please reload the job application page and try again.");
        resetAutofillBtn();
        return;
      }

      // Aggregate metrics and fields from all frames
      let totalInputs = 0;
      let totalTextareas = 0;
      let totalSelects = 0;
      let combinedFields: any[] = [];
      let displayUrl = activeTab.url || "-";
      let displayTitle = activeTab.title || "-";

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

      infoUrl.innerText = displayUrl;
      infoUrl.title = displayUrl;
      infoTitle.innerText = displayTitle;
      infoTitle.title = displayTitle;
      
      statInputs.innerText = String(totalInputs);
      statTextareas.innerText = String(totalTextareas);
      statSelects.innerText = String(totalSelects);

      extractedFields = combinedFields;
      statTotalBadge.innerText = `${extractedFields.length} field${extractedFields.length === 1 ? '' : 's'} mapped`;
      currentJsonPayload = JSON.stringify(extractedFields, null, 2);
      analysisJson.innerText = currentJsonPayload;
      
      resultsSection.classList.remove("hidden");

      if (extractedFields.length === 0) {
        showError("No fillable form inputs found on the current page.");
        resetAutofillBtn();
        return;
      }

      // Step 2: Call Backend AI Fill Plan
      btnAutofillText.innerText = "Matching with AI...";
      updateProgress("planning", `Generating plan for ${extractedFields.length} fields...`, 60);

      try {
        const requestPayloadObject = { fields: extractedFields };
        debugRequestPayload = JSON.stringify(requestPayloadObject, null, 2);
        debugRequestBox.innerText = debugRequestPayload;

        const backendRes = await fetch(`${BACKEND_URL}/api/fill-form`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayloadObject)
        });

        if (!backendRes.ok) {
          throw new Error(`Backend HTTP error ${backendRes.status}: ${backendRes.statusText}`);
        }

        const plan = await backendRes.json();
        debugResponsePayload = JSON.stringify(plan, null, 2);
        debugResponseBox.innerText = debugResponsePayload;

        generatedActionsPlan = plan.actions || [];
        renderPlanList(generatedActionsPlan);
        aiPlanContainer.classList.remove("hidden");
        appliedCountBadge.innerText = `${generatedActionsPlan.length} action${generatedActionsPlan.length === 1 ? '' : 's'}`;

        // Step 3: Apply Fill Actions
        btnAutofillText.innerText = "Applying autofill...";
        updateProgress("injecting", `Filling ${generatedActionsPlan.length} inputs & attachments...`, 85);
        applyPlanToPage(activeTab.id!, activeTab.url || "");

      } catch (err) {
        showError(`AI Matching failed: ${err instanceof Error ? err.message : String(err)}`);
        updateProgress("error", "AI Matching failed");
        resetAutofillBtn();
      }
    });
  });

  /**
   * Applies the plan actions directly to the content script in their respective frames
   */
  function applyPlanToPage(tabId: number, activeTabUrl: string) {
    if (generatedActionsPlan.length === 0) {
      resetAutofillBtn();
      return;
    }

    chrome.storage.local.get("userResume", (storageResult) => {
      const resume = storageResult.userResume;
      
      let completed = 0;
      let errors = 0;
      
      const fillActions = generatedActionsPlan.filter(a => a.action !== "skip");

      if (fillActions.length === 0) {
        onAutofillSuccess(activeTabUrl);
        return;
      }

      const uploadActions = fillActions.filter(a => a.action === "upload");
      const standardActions = fillActions.filter(a => a.action !== "upload");

      // Group standard actions by frameId
      const standardByFrame = new Map<number, any[]>();
      standardActions.forEach(a => {
        const fieldMeta = extractedFields.find(f => f.elementSelector === a.selector);
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

      function checkFinish() {
        if (completed === totalBatches) {
          if (errors === 0) {
            onAutofillSuccess(activeTabUrl);
          } else {
            showError(`Autofill finished with ${errors} injection error(s).`);
            updateProgress("error", `Completed with ${errors} issue(s)`);
            resetAutofillBtn();
            savePopupState(activeTabUrl);
          }
        }
      }

      // 1. Handle file uploads (handled individually per frame with base64 data)
      uploadActions.forEach((planAction) => {
        if (planAction.value === "resume") {
          if (!resume || !resume.data) {
            errors++;
            completed++;
            console.error("Resume file is missing from extension storage.");
            checkFinish();
            return;
          }

          const fieldMeta = extractedFields.find(f => f.elementSelector === planAction.selector);
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

      // 2. Handle standard input / selection fields in frame-specific batches
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
  }

  function onAutofillSuccess(activeTabUrl: string) {
    updateProgress("complete", "Autofill completed successfully! ✓", 100);
    btnAutofill.classList.remove("loading");
    btnAutofill.disabled = false;
    btnAutofillText.innerText = "Autofill Complete! ✓";
    btnAutofill.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
    btnAutofill.style.boxShadow = "0 8px 24px -4px rgba(16, 185, 129, 0.45)";
    
    savePopupState(activeTabUrl);

    setTimeout(() => {
      btnAutofillText.innerText = "Autofill Application";
      btnAutofill.style.background = "";
      btnAutofill.style.boxShadow = "";
    }, 4000);
  }

  function resetAutofillBtn() {
    btnAutofill.classList.remove("loading");
    btnAutofill.disabled = false;
    btnAutofillText.innerText = "Autofill Application";
    btnAutofill.style.background = "";
    btnAutofill.style.boxShadow = "";
  }

  /**
   * Copies current JSON output payload to clipboard
   */
  btnCopyJson.addEventListener("click", () => {
    if (!currentJsonPayload) return;
    
    navigator.clipboard.writeText(currentJsonPayload)
      .then(() => {
        copyStatus.innerText = "Copied! ✓";
        btnCopyJson.style.color = "var(--liquid-emerald)";
        btnCopyJson.style.borderColor = "var(--liquid-emerald)";
        setTimeout(() => {
          copyStatus.innerText = "Copy JSON";
          btnCopyJson.style.color = "";
          btnCopyJson.style.borderColor = "";
        }, 1500);
      })
      .catch((err) => {
        console.error("Clipboard copy failed:", err);
      });
  });

  function showError(msg: string) {
    analysisError.innerText = msg;
    analysisError.classList.remove("hidden");
  }
});
