export interface PopupElements {
  statusDot: HTMLElement;
  statusText: HTMLElement;
  btnThemeToggle: HTMLButtonElement;
  btnPopOut: HTMLButtonElement;
  btnReelsToggle: HTMLButtonElement;

  btnAutofill: HTMLButtonElement;
  btnAutofillText: HTMLElement;

  progressSection: HTMLElement;
  progressBarFill: HTMLElement;
  progressStatusText: HTMLElement;
  progressPercentBadge: HTMLElement;
  stepScan: HTMLElement;
  stepPlan: HTMLElement;
  stepInject: HTMLElement;
  line1: HTMLElement;
  line2: HTMLElement;

  reelsSection: HTMLElement;
  btnReelsClose: HTMLButtonElement;
  reelsStatusPill: HTMLElement;
  reelsStatusText: HTMLElement;
  instagramFrame: HTMLIFrameElement;
  reelsLoadingPlaceholder: HTMLElement;

  resultsSection: HTMLElement;
  aiPlanContainer: HTMLElement;
  aiPlanList: HTMLElement;
  appliedCountBadge: HTMLElement;
  statTotalBadge: HTMLElement;
  infoUrl: HTMLElement;
  infoTitle: HTMLElement;
  statInputs: HTMLElement;
  statTextareas: HTMLElement;
  statSelects: HTMLElement;
  analysisError: HTMLElement;

  analysisJson: HTMLElement;
  btnCopyJson: HTMLButtonElement;
  copyStatus: HTMLElement;
  debugRequestBox: HTMLElement;
  btnCopyRequest: HTMLButtonElement;
  copyRequestStatus: HTMLElement;
  debugResponseBox: HTMLElement;
  btnCopyResponse: HTMLButtonElement;
  copyResponseStatus: HTMLElement;

  resumeFileInput: HTMLInputElement;
  resumeFilename: HTMLElement;

  tabBtnMain: HTMLButtonElement;
  tabBtnDebug: HTMLButtonElement;
  tabContentMain: HTMLElement;
  tabContentDebug: HTMLElement;

  btnExportTracker: HTMLButtonElement;
  btnToggleTracker: HTMLButtonElement;
  trackerToggleText: HTMLElement;
  trackerSheetPathRow: HTMLElement;
  tfSheetPath: HTMLInputElement;
  trackerForm: HTMLFormElement;
  trackerStatusMsg: HTMLElement;
  btnForcePush: HTMLButtonElement;
  btnSaveTracker: HTMLButtonElement;
  btnSaveTrackerText: HTMLElement;
  tfCompany: HTMLInputElement;
  tfRole: HTMLInputElement;
  tfLocation: HTMLInputElement;
  tfRemote: HTMLSelectElement;
  tfSource: HTMLInputElement;
  tfStatus: HTMLSelectElement;
  tfDateApplied: HTMLInputElement;
  tfDeadline: HTMLInputElement;
  tfPriority: HTMLSelectElement;
  tfFollowup: HTMLInputElement;
  tfContact: HTMLInputElement;
  tfStipend: HTMLInputElement;
  tfNextStep: HTMLInputElement;
  tfJobLink: HTMLInputElement;
  tfNotes: HTMLTextAreaElement;

  footerVersion: HTMLElement;
}

export function queryElements(): PopupElements {
  return {
    statusDot: document.getElementById("status-dot") as HTMLElement,
    statusText: document.getElementById("status-text") as HTMLElement,
    btnThemeToggle: document.getElementById("btn-theme-toggle") as HTMLButtonElement,
    btnPopOut: document.getElementById("btn-pop-out") as HTMLButtonElement,
    btnReelsToggle: document.getElementById("btn-reels-toggle") as HTMLButtonElement,

    btnAutofill: document.getElementById("btn-autofill") as HTMLButtonElement,
    btnAutofillText: document.getElementById("btn-autofill-text") as HTMLElement,

    progressSection: document.getElementById("progress-section") as HTMLElement,
    progressBarFill: document.getElementById("progress-bar-fill") as HTMLElement,
    progressStatusText: document.getElementById("progress-status-text") as HTMLElement,
    progressPercentBadge: document.getElementById("progress-percent-badge") as HTMLElement,
    stepScan: document.getElementById("step-scan") as HTMLElement,
    stepPlan: document.getElementById("step-plan") as HTMLElement,
    stepInject: document.getElementById("step-inject") as HTMLElement,
    line1: document.getElementById("line-1") as HTMLElement,
    line2: document.getElementById("line-2") as HTMLElement,

    reelsSection: document.getElementById("reels-section") as HTMLElement,
    btnReelsClose: document.getElementById("btn-reels-close") as HTMLButtonElement,
    reelsStatusPill: document.getElementById("reels-status-pill") as HTMLElement,
    reelsStatusText: document.getElementById("reels-status-text") as HTMLElement,
    instagramFrame: document.getElementById("instagram-frame") as HTMLIFrameElement,
    reelsLoadingPlaceholder: document.getElementById("reels-loading-placeholder") as HTMLElement,

    resultsSection: document.getElementById("results-section") as HTMLElement,
    aiPlanContainer: document.getElementById("ai-plan-container") as HTMLElement,
    aiPlanList: document.getElementById("ai-plan-list") as HTMLElement,
    appliedCountBadge: document.getElementById("applied-count-badge") as HTMLElement,
    statTotalBadge: document.getElementById("stat-total-badge") as HTMLElement,
    infoUrl: document.getElementById("info-url") as HTMLElement,
    infoTitle: document.getElementById("info-title") as HTMLElement,
    statInputs: document.getElementById("stat-inputs") as HTMLElement,
    statTextareas: document.getElementById("stat-textareas") as HTMLElement,
    statSelects: document.getElementById("stat-selects") as HTMLElement,
    analysisError: document.getElementById("analysis-error") as HTMLElement,

    analysisJson: document.getElementById("analysis-json") as HTMLElement,
    btnCopyJson: document.getElementById("btn-copy-json") as HTMLButtonElement,
    copyStatus: document.getElementById("copy-status") as HTMLElement,
    debugRequestBox: document.getElementById("debug-request-box") as HTMLElement,
    btnCopyRequest: document.getElementById("btn-copy-request") as HTMLButtonElement,
    copyRequestStatus: document.getElementById("copy-request-status") as HTMLElement,
    debugResponseBox: document.getElementById("debug-response-box") as HTMLElement,
    btnCopyResponse: document.getElementById("btn-copy-response") as HTMLButtonElement,
    copyResponseStatus: document.getElementById("copy-response-status") as HTMLElement,

    resumeFileInput: document.getElementById("resume-file") as HTMLInputElement,
    resumeFilename: document.getElementById("resume-filename") as HTMLElement,

    tabBtnMain: document.getElementById("tab-btn-main") as HTMLButtonElement,
    tabBtnDebug: document.getElementById("tab-btn-debug") as HTMLButtonElement,
    tabContentMain: document.getElementById("tab-content-main") as HTMLElement,
    tabContentDebug: document.getElementById("tab-content-debug") as HTMLElement,

    btnExportTracker: document.getElementById("btn-export-tracker") as HTMLButtonElement,
    btnToggleTracker: document.getElementById("btn-toggle-tracker") as HTMLButtonElement,
    trackerToggleText: document.getElementById("tracker-toggle-text") as HTMLElement,
    trackerSheetPathRow: document.getElementById("tracker-sheet-path-row") as HTMLElement,
    tfSheetPath: document.getElementById("tf-sheet-path") as HTMLInputElement,
    trackerForm: document.getElementById("tracker-form") as HTMLFormElement,
    trackerStatusMsg: document.getElementById("tracker-status-msg") as HTMLElement,
    btnForcePush: document.getElementById("btn-force-push") as HTMLButtonElement,
    btnSaveTracker: document.getElementById("btn-save-tracker") as HTMLButtonElement,
    btnSaveTrackerText: document.getElementById("btn-save-tracker-text") as HTMLElement,
    tfCompany: document.getElementById("tf-company") as HTMLInputElement,
    tfRole: document.getElementById("tf-role") as HTMLInputElement,
    tfLocation: document.getElementById("tf-location") as HTMLInputElement,
    tfRemote: document.getElementById("tf-remote") as HTMLSelectElement,
    tfSource: document.getElementById("tf-source") as HTMLInputElement,
    tfStatus: document.getElementById("tf-status") as HTMLSelectElement,
    tfDateApplied: document.getElementById("tf-date-applied") as HTMLInputElement,
    tfDeadline: document.getElementById("tf-deadline") as HTMLInputElement,
    tfPriority: document.getElementById("tf-priority") as HTMLSelectElement,
    tfFollowup: document.getElementById("tf-followup") as HTMLInputElement,
    tfContact: document.getElementById("tf-contact") as HTMLInputElement,
    tfStipend: document.getElementById("tf-stipend") as HTMLInputElement,
    tfNextStep: document.getElementById("tf-next-step") as HTMLInputElement,
    tfJobLink: document.getElementById("tf-job-link") as HTMLInputElement,
    tfNotes: document.getElementById("tf-notes") as HTMLTextAreaElement,

    footerVersion: document.getElementById("footer-version") as HTMLElement,
  };
}
