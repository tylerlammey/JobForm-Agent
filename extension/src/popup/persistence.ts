import type { PopupElements } from "./dom";
import { appState } from "./state";
import { renderPlanList } from "./planList";

// Continuously-saved draft of the in-progress "Log Application" form.
// Deliberately NOT scoped per tab -- unlike a page scan (genuinely tied to
// one tab), a tracker entry is something the user is actively composing and
// may need to alt-tab away from mid-entry (to check their resume, re-read
// the job posting, copy a company name, etc.). Scoping this by tab URL
// looked correct but actually meant switching tabs looked up a *different*
// storage key and found nothing -- the old draft wasn't lost, just
// unreachable from wherever the user switched to. One global key fixes that.
// Kept separate from state_${activeTabUrl} -- that key is blindly overwritten
// from appState (which resets to empty every popup load), so folding tracker
// keystrokes into it would let the very first keystroke wipe an already-saved
// scan/plan for the tab.
const TRACKER_DRAFT_STORAGE_KEY = "trackerDraft";

export function saveTrackerDraft(els: PopupElements) {
  const draft = {
    fields: {
      company: els.tfCompany.value,
      role: els.tfRole.value,
      location: els.tfLocation.value,
      remote: els.tfRemote.value,
      source: els.tfSource.value,
      status: els.tfStatus.value,
      date_applied: els.tfDateApplied.value,
      deadline: els.tfDeadline.value,
      priority: els.tfPriority.value,
      follow_up_date: els.tfFollowup.value,
      contact: els.tfContact.value,
      stipend: els.tfStipend.value,
      next_step: els.tfNextStep.value,
      job_link: els.tfJobLink.value,
      notes: els.tfNotes.value,
    },
    expanded: !els.trackerForm.classList.contains("hidden"),
  };
  chrome.storage.local.set({ [TRACKER_DRAFT_STORAGE_KEY]: draft });
}

export function clearTrackerDraft() {
  chrome.storage.local.remove(TRACKER_DRAFT_STORAGE_KEY);
}

export function loadTrackerDraft(callback: (draft: any) => void) {
  chrome.storage.local.get([TRACKER_DRAFT_STORAGE_KEY], (result) => {
    callback(result[TRACKER_DRAFT_STORAGE_KEY]);
  });
}

// Save popup state helper. Global (not scoped per tab) -- same reasoning as
// the tracker draft above: this is "the last scan/plan/debug info", and it
// should stay visible regardless of which tab the popup is opened from, even
// if the original tab was closed entirely. Scoping it by tab URL made the
// Debug Console look wiped the moment you switched tabs or closed the tab
// the scan ran on, even though nothing was actually lost.
const POPUP_STATE_STORAGE_KEY = "popupState";

export function savePopupState(els: PopupElements) {
  const state = {
    url: els.infoUrl.innerText,
    title: els.infoTitle.innerText,
    inputsCount: els.statInputs.innerText,
    textareasCount: els.statTextareas.innerText,
    selectsCount: els.statSelects.innerText,
    extractedFields: appState.extractedFields,
    currentJsonPayload: appState.currentJsonPayload,
    generatedActionsPlan: appState.generatedActionsPlan,
    debugRequestPayload: appState.debugRequestPayload,
    debugResponsePayload: appState.debugResponsePayload
  };
  chrome.storage.local.set({ [POPUP_STATE_STORAGE_KEY]: state });
}

// Load popup state helper
export function loadPopupState(els: PopupElements) {
  chrome.storage.local.get([POPUP_STATE_STORAGE_KEY], (result) => {
    const state = result[POPUP_STATE_STORAGE_KEY];
    if (state) {
      els.infoUrl.innerText = state.url || "-";
      els.infoUrl.title = state.url || "";
      els.infoTitle.innerText = state.title || "-";
      els.infoTitle.title = state.title || "";
      els.statInputs.innerText = state.inputsCount || "0";
      els.statTextareas.innerText = state.textareasCount || "0";
      els.statSelects.innerText = state.selectsCount || "0";

      appState.extractedFields = state.extractedFields || [];
      appState.currentJsonPayload = state.currentJsonPayload || "";
      els.analysisJson.innerText = appState.currentJsonPayload || "No fields scanned yet. Run \"Autofill Application\" from Workspace.";

      appState.generatedActionsPlan = state.generatedActionsPlan || [];
      if (appState.generatedActionsPlan.length > 0) {
        renderPlanList(els, appState.generatedActionsPlan);
        els.aiPlanContainer.classList.remove("hidden");
        els.appliedCountBadge.innerText = `${appState.generatedActionsPlan.length} action${appState.generatedActionsPlan.length === 1 ? '' : 's'}`;
      }

      // Restore debug payload logs
      appState.debugRequestPayload = state.debugRequestPayload || "No request sent yet. Run \"Autofill Application\".";
      appState.debugResponsePayload = state.debugResponsePayload || "No response received yet.";
      els.debugRequestBox.innerText = appState.debugRequestPayload;
      els.debugResponseBox.innerText = appState.debugResponsePayload;

      if (appState.extractedFields.length > 0) {
        els.resultsSection.classList.remove("hidden");
        els.statTotalBadge.innerText = `${appState.extractedFields.length} field${appState.extractedFields.length === 1 ? '' : 's'} mapped`;
      }
    }
  });
}
