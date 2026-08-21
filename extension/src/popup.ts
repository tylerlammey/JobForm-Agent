// Popup logic for Job Autofiller extension
const BACKEND_URL = "http://localhost:8000";

document.addEventListener("DOMContentLoaded", () => {
  const statusDot = document.getElementById("status-dot") as HTMLElement;
  const statusText = document.getElementById("status-text") as HTMLElement;
  
  const btnAutofill = document.getElementById("btn-autofill") as HTMLButtonElement;
  const btnAutofillText = document.getElementById("btn-autofill-text") as HTMLElement;
  
  const resultsSection = document.getElementById("results-section") as HTMLElement;
  const analysisData = document.getElementById("analysis-data") as HTMLElement;
  const aiPlanContainer = document.getElementById("ai-plan-container") as HTMLElement;
  const aiPlanList = document.getElementById("ai-plan-list") as HTMLElement;
  const appliedCountBadge = document.getElementById("applied-count-badge") as HTMLElement;

  const infoUrl = document.getElementById("info-url") as HTMLElement;
  const infoTitle = document.getElementById("info-title") as HTMLElement;
  const statInputs = document.getElementById("stat-inputs") as HTMLElement;
  const statTextareas = document.getElementById("stat-textareas") as HTMLElement;
  const statSelects = document.getElementById("stat-selects") as HTMLElement;
  const analysisError = document.getElementById("analysis-error") as HTMLElement;

  // JSON viewer elements
  const analysisJsonContainer = document.getElementById("analysis-json-container") as HTMLElement;
  const analysisJson = document.getElementById("analysis-json") as HTMLElement;
  const btnCopyJson = document.getElementById("btn-copy-json") as HTMLButtonElement;
  const copyStatus = document.getElementById("copy-status") as HTMLElement;

  // Resume Settings elements
  const resumeFileInput = document.getElementById("resume-file") as HTMLInputElement;
  const resumeFilename = document.getElementById("resume-filename") as HTMLElement;

  // Tab Navigation Elements
  const tabBtnMain = document.getElementById("tab-btn-main") as HTMLButtonElement;
  const tabBtnDebug = document.getElementById("tab-btn-debug") as HTMLButtonElement;
  const tabContentMain = document.getElementById("tab-content-main") as HTMLElement;
  const tabContentDebug = document.getElementById("tab-content-debug") as HTMLElement;

  // Debug Console Box Elements
  const debugRequestBox = document.getElementById("debug-request-box") as HTMLElement;
  const debugResponseBox = document.getElementById("debug-response-box") as HTMLElement;

  let currentJsonPayload = "";
  let extractedFields: any[] = [];
  let generatedActionsPlan: any[] = [];
  let debugRequestPayload = "No request sent yet. Run \"Autofill Application\".";
  let debugResponsePayload = "No response received yet.";

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
      statusText.innerText = "Disconnected";
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
        analysisJson.innerText = currentJsonPayload;

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
          analysisJsonContainer.classList.remove("hidden");
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
   * Single Hero Button: Analyzes Page -> Runs Backend Matching -> Applies Changes Automatically
   */
  btnAutofill.addEventListener("click", async () => {
    btnAutofill.classList.add("loading");
    btnAutofill.disabled = true;
    btnAutofillText.innerText = "Analyzing page...";
    analysisError.classList.add("hidden");

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.id) {
        showError("Unable to locate active tab.");
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
        showError("Content scripts cannot run on system or browser utility pages.");
        resetAutofillBtn();
        return;
      }

      // Step 1: Analyze Page
      chrome.tabs.sendMessage(activeTab.id, { action: "ANALYZE_PAGE" }, async (scanResponse) => {
        if (chrome.runtime.lastError) {
          showError("Communication failed. Reload the job application page and try again.");
          console.error(chrome.runtime.lastError);
          resetAutofillBtn();
          return;
        }

        if (!scanResponse) {
          showError("Did not receive a response from the content script.");
          resetAutofillBtn();
          return;
        }

        if (scanResponse.error) {
          showError(scanResponse.error);
          resetAutofillBtn();
          return;
        }

        // Render metrics
        infoUrl.innerText = scanResponse.url || "-";
        infoUrl.title = scanResponse.url || "";
        infoTitle.innerText = scanResponse.title || "-";
        infoTitle.title = scanResponse.title || "";
        
        statInputs.innerText = String(scanResponse.inputsCount ?? 0);
        statTextareas.innerText = String(scanResponse.textareasCount ?? 0);
        statSelects.innerText = String(scanResponse.selectsCount ?? 0);

        extractedFields = scanResponse.fields || [];
        currentJsonPayload = JSON.stringify(extractedFields, null, 2);
        analysisJson.innerText = currentJsonPayload;
        
        resultsSection.classList.remove("hidden");
        analysisJsonContainer.classList.remove("hidden");

        if (extractedFields.length === 0) {
          showError("No fillable form inputs found on the current page.");
          resetAutofillBtn();
          return;
        }

        // Step 2: Call Backend AI Fill Plan
        btnAutofillText.innerText = "Generating fill plan...";
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
          applyPlanToPage(activeTab.id!, activeTab.url || "");

        } catch (err) {
          showError(`AI Matching failed: ${err instanceof Error ? err.message : String(err)}`);
          resetAutofillBtn();
        }
      });
    });
  });

  /**
   * Applies the plan actions directly to the content script
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
      const totalBatches = uploadActions.length + (standardActions.length > 0 ? 1 : 0);

      function checkFinish() {
        if (completed === totalBatches) {
          if (errors === 0) {
            onAutofillSuccess(activeTabUrl);
          } else {
            showError(`Autofill completed with ${errors} injection error(s).`);
            resetAutofillBtn();
            savePopupState(activeTabUrl);
          }
        }
      }

      // 1. Handle file uploads (handled individually with base64 data)
      uploadActions.forEach((planAction) => {
        if (planAction.value === "resume") {
          if (!resume || !resume.data) {
            errors++;
            completed++;
            console.error("Resume file is missing from extension storage.");
            checkFinish();
            return;
          }

          chrome.tabs.sendMessage(tabId, {
            action: "UPLOAD_FILE",
            selector: planAction.selector,
            fileData: resume.data,
            fileName: resume.name
          }, (res) => {
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

      // 2. Handle standard input / selection fields in a single sequential batch
      if (standardActions.length > 0) {
        const fieldsToFill = standardActions.map(a => {
          const fieldMeta = extractedFields.find(f => f.elementSelector === a.selector);
          return {
            selector: a.selector,
            fillAction: a.action,
            value: a.value,
            label: a.label,
            optionsMode: fieldMeta ? fieldMeta.optionsMode : undefined
          };
        });

        chrome.tabs.sendMessage(tabId, {
          action: "FILL_ALL_FIELDS",
          fields: fieldsToFill
        }, (res) => {
          completed++;
          if (chrome.runtime.lastError || !res) {
            errors += standardActions.length;
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
      }
    });
  }

  function onAutofillSuccess(activeTabUrl: string) {
    btnAutofill.classList.remove("loading");
    btnAutofill.disabled = false;
    btnAutofillText.innerText = "Autofill Complete! ✓";
    btnAutofill.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
    btnAutofill.style.boxShadow = "0 4px 14px rgba(16, 185, 129, 0.4)";
    
    savePopupState(activeTabUrl);

    setTimeout(() => {
      btnAutofillText.innerText = "Autofill Application";
      btnAutofill.style.background = "";
      btnAutofill.style.boxShadow = "";
    }, 3000);
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
        copyStatus.innerText = "Copied!";
        btnCopyJson.style.color = "var(--success)";
        setTimeout(() => {
          copyStatus.innerText = "Copy";
          btnCopyJson.style.color = "";
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
