// Popup logic for Job Autofiller extension
const BACKEND_URL = "http://localhost:8000";

document.addEventListener("DOMContentLoaded", () => {
  const statusDot = document.getElementById("status-dot") as HTMLElement;
  const statusText = document.getElementById("status-text") as HTMLElement;
  
  const btnTestConn = document.getElementById("btn-test-conn") as HTMLButtonElement;
  const connResult = document.getElementById("conn-result") as HTMLElement;

  const btnAnalyzePage = document.getElementById("btn-analyze-page") as HTMLButtonElement;
  const btnGeneratePlan = document.getElementById("btn-generate-plan") as HTMLButtonElement;
  const btnApplyPlan = document.getElementById("btn-apply-plan") as HTMLButtonElement;
  const btnFillResume = document.getElementById("btn-fill-resume") as HTMLButtonElement | null;
  
  const analysisData = document.getElementById("analysis-data") as HTMLElement;
  const aiPlanContainer = document.getElementById("ai-plan-container") as HTMLElement;
  const aiPlanList = document.getElementById("ai-plan-list") as HTMLElement;
  const infoUrl = document.getElementById("info-url") as HTMLElement;
  const infoTitle = document.getElementById("info-title") as HTMLElement;
  const statInputs = document.getElementById("stat-inputs") as HTMLElement;
  const statTextareas = document.getElementById("stat-textareas") as HTMLElement;
  const statSelects = document.getElementById("stat-selects") as HTMLElement;
  const analysisError = document.getElementById("analysis-error") as HTMLElement;

  // JSON viewer elements
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
  let hasSavedResume = false;
  let debugRequestPayload = "No request sent yet. Run \"Generate Fill Plan\" or \"Analyze Page\".";
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
    } catch (err) {
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
        hasSavedResume = true;
        
        // Dynamic visibility check for Autofill Resume button
        checkShowFillResumeBtn();
      } else {
        resumeFilename.innerText = "No file selected";
        hasSavedResume = false;
        btnFillResume?.classList.add("hidden");
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
        }

        // Restore debug payload logs
        debugRequestPayload = state.debugRequestPayload || "No request sent yet. Run \"Generate Fill Plan\" or \"Analyze Page\".";
        debugResponsePayload = state.debugResponsePayload || "No response received yet.";
        debugRequestBox.innerText = debugRequestPayload;
        debugResponseBox.innerText = debugResponsePayload;
        
        checkShowFillResumeBtn();
        if (extractedFields.length > 0) {
          btnGeneratePlan.classList.remove("hidden");
          analysisData.classList.remove("hidden");
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
   * Identifies if a file field is likely the main resume slot based on label and ID
   */
  function isResumeField(field: any): boolean {
    const label = (field.label || "").toLowerCase();
    const id = (field.id || "").toLowerCase();

    // Explicitly avoid non-resume attachments
    if (
      label.includes("cover") || id.includes("cover") ||
      label.includes("portfolio") || id.includes("portfolio") ||
      label.includes("transcript") || id.includes("transcript") ||
      label.includes("photo") || id.includes("photo") ||
      label.includes("other") || id.includes("other")
    ) {
      return false;
    }

    // Explicitly match resume keywords
    if (
      label.includes("resume") || id.includes("resume") ||
      label.includes("cv") || id.includes("cv") ||
      label.includes("curriculum")
    ) {
      return true;
    }

    // Fallback for generic inputs (e.g. "Attach", "Upload File")
    if (label.includes("attach") || label.includes("upload") || label.includes("file")) {
      return true;
    }

    return false;
  }

  /**
   * Helper to verify if manual "Autofill Resume" should be shown.
   * Only shown if page contains at least one target resume 'file' input AND user has saved a resume.
   */
  function checkShowFillResumeBtn() {
    const hasResumeField = extractedFields.some(f => f.type === "file" && isResumeField(f));
    if (hasResumeField && hasSavedResume) {
      btnFillResume?.classList.remove("hidden");
    } else {
      btnFillResume?.classList.add("hidden");
    }
  }

  /**
   * Performs an API call to the backend test endpoint
   */
  btnTestConn.addEventListener("click", async () => {
    btnTestConn.classList.add("loading");
    btnTestConn.disabled = true;
    connResult.classList.add("hidden");
    connResult.innerText = "";

    try {
      const response = await fetch(`${BACKEND_URL}/api/test`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      connResult.innerText = data.message || JSON.stringify(data);
      connResult.classList.remove("hidden");
      
      statusDot.className = "status-dot connected";
      statusText.innerText = "Connected";
    } catch (err) {
      connResult.innerText = `Connection failed: ${err instanceof Error ? err.message : String(err)}`;
      connResult.classList.remove("hidden");
      
      statusDot.className = "status-dot disconnected";
      statusText.innerText = "Disconnected";
    } finally {
      btnTestConn.classList.remove("loading");
      btnTestConn.disabled = false;
    }
  });

  /**
   * Sends a message to the content script of the active tab to extract page analytics
   */
  btnAnalyzePage.addEventListener("click", () => {
    analysisData.classList.add("hidden");
    analysisError.classList.add("hidden");
    aiPlanContainer.classList.add("hidden");
    btnFillResume?.classList.add("hidden");
    btnGeneratePlan.classList.add("hidden");
    currentJsonPayload = "";
    extractedFields = [];
    generatedActionsPlan = [];
    aiPlanList.innerHTML = "";
    analysisJson.innerText = "";

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.id) {
        showError("Unable to locate active tab.");
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
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, { action: "ANALYZE_PAGE" }, (response) => {
        if (chrome.runtime.lastError) {
          showError("Communication failed. Reload the current page and try again.");
          console.error(chrome.runtime.lastError);
          return;
        }

        if (!response) {
          showError("Did not receive a response from the content script.");
          return;
        }

        if (response.error) {
          showError(response.error);
          return;
        }

        // Render extracted metrics
        infoUrl.innerText = response.url || "-";
        infoUrl.title = response.url || "";
        infoTitle.innerText = response.title || "-";
        infoTitle.title = response.title || "";
        
        statInputs.innerText = String(response.inputsCount ?? 0);
        statTextareas.innerText = String(response.textareasCount ?? 0);
        statSelects.innerText = String(response.selectsCount ?? 0);

        // Format and render raw fields JSON
        if (response.fields && Array.isArray(response.fields)) {
          extractedFields = response.fields;
          currentJsonPayload = JSON.stringify(response.fields, null, 2);
          analysisJson.innerText = currentJsonPayload;
          
          // Show Autofill Resume button if appropriate
          checkShowFillResumeBtn();
          
          // Show Generate Fill Plan button since we have scanned fields
          if (extractedFields.length > 0) {
            btnGeneratePlan.classList.remove("hidden");
          }
        } else {
          analysisJson.innerText = "[]";
        }

        analysisData.classList.remove("hidden");

        // Save state for active tab
        savePopupState(activeTab.url || "");
      });
    });
  });

  /**
   * Action to query the FastAPI LLM matching endpoint to create the filling plan
   */
  btnGeneratePlan.addEventListener("click", async () => {
    btnGeneratePlan.classList.add("loading");
    btnGeneratePlan.disabled = true;
    analysisError.classList.add("hidden");
    aiPlanContainer.classList.add("hidden");
    aiPlanList.innerHTML = "";
    generatedActionsPlan = [];

    try {
      const requestPayloadObject = { fields: extractedFields };
      debugRequestPayload = JSON.stringify(requestPayloadObject, null, 2);
      debugRequestBox.innerText = debugRequestPayload;

      const response = await fetch(`${BACKEND_URL}/api/fill-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayloadObject)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const plan = await response.json();
      debugResponsePayload = JSON.stringify(plan, null, 2);
      debugResponseBox.innerText = debugResponsePayload;

      generatedActionsPlan = plan.actions;

      // Render the plan list in the UI for verification
      renderPlanList(generatedActionsPlan);

      // Show container
      aiPlanContainer.classList.remove("hidden");

      // Save state
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab && activeTab.url) {
          savePopupState(activeTab.url);
        }
      });

    } catch (err) {
      showError(`AI Plan Generation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      btnGeneratePlan.classList.remove("loading");
      btnGeneratePlan.disabled = false;
    }
  });

  /**
   * Action to apply the generated AI Fill Plan to the page
   */
  btnApplyPlan.addEventListener("click", () => {
    if (generatedActionsPlan.length === 0) return;
    btnApplyPlan.classList.add("loading");
    btnApplyPlan.disabled = true;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.id) {
        showError("Unable to locate active tab.");
        btnApplyPlan.classList.remove("loading");
        btnApplyPlan.disabled = false;
        return;
      }

      chrome.storage.local.get("userResume", (storageResult) => {
        const resume = storageResult.userResume;
        
        let completed = 0;
        let errors = 0;
        
        // Filter out actions set to skip
        const fillActions = generatedActionsPlan.filter(a => a.action !== "skip");

        if (fillActions.length === 0) {
          btnApplyPlan.classList.remove("loading");
          btnApplyPlan.disabled = false;
          return;
        }

        const uploadActions = fillActions.filter(a => a.action === "upload");
        const standardActions = fillActions.filter(a => a.action !== "upload");
        const totalActions = uploadActions.length + (standardActions.length > 0 ? 1 : 0);

        function checkFinish() {
          if (completed === totalActions) {
            btnApplyPlan.classList.remove("loading");
            btnApplyPlan.disabled = false;
            
            if (errors === 0) {
              const originalText = btnApplyPlan.querySelector("span")?.innerText || "Apply Autofill";
              const spanEl = btnApplyPlan.querySelector("span") as HTMLElement;
              spanEl.innerText = "Autofill Applied! ✓";
              btnApplyPlan.style.backgroundColor = "var(--success)";
              setTimeout(() => {
                spanEl.innerText = originalText;
                btnApplyPlan.style.backgroundColor = "";
              }, 2500);
            } else {
              showError(`Applied with ${errors} field injection errors.`);
            }
          }
        }

        // 1. Handle file uploads (handled individually since they need local base64 resume data)
        uploadActions.forEach((planAction) => {
          if (planAction.value === "resume") {
            if (!resume || !resume.data) {
              errors++;
              completed++;
              console.error("Resume file is missing from extension storage.");
              checkFinish();
              return;
            }

            chrome.tabs.sendMessage(activeTab.id, {
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
          }
        });

        // 2. Handle standard input / selection fields in a single sequential batch message
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

          chrome.tabs.sendMessage(activeTab.id, {
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
    });
  });

  /**
   * Action to autofill resume file fields on page (Legacy Manual Shortcut)
   */
  btnFillResume?.addEventListener("click", () => {
    if (btnFillResume) btnFillResume.disabled = true;
    const resumeFields = extractedFields.filter(f => f.type === "file" && isResumeField(f));
    if (resumeFields.length === 0) return;

    chrome.storage.local.get("userResume", (result) => {
      const resume = result.userResume;
      if (!resume || !resume.data) {
        showError("Resume not found in storage.");
        if (btnFillResume) btnFillResume.disabled = false;
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
          showError("Unable to locate active tab.");
          if (btnFillResume) btnFillResume.disabled = false;
          return;
        }

        let completed = 0;
        let errors = 0;

        resumeFields.forEach((field) => {
          chrome.tabs.sendMessage(activeTab.id, {
            action: "UPLOAD_FILE",
            selector: field.elementSelector,
            fileData: resume.data,
            fileName: resume.name
          }, (res) => {
            completed++;
            if (chrome.runtime.lastError || !res || res.error) {
              errors++;
              console.error("Upload error for field", field.id, chrome.runtime.lastError || res?.error);
            }

            if (completed === resumeFields.length) {
              if (btnFillResume) btnFillResume.disabled = false;
              if (errors === 0) {
                const originalText = btnFillResume ? btnFillResume.innerText : "";
                if (btnFillResume) {
                  btnFillResume.innerText = "Resume Filled! ✓";
                  btnFillResume.style.backgroundColor = "var(--success)";
                }
                setTimeout(() => {
                  if (btnFillResume) {
                    btnFillResume.innerText = originalText;
                    btnFillResume.style.backgroundColor = "";
                  }
                }, 2500);
              } else {
                showError(`Failed to upload to ${errors} file inputs.`);
              }
            }
          });
        });
      });
    });
  });

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
