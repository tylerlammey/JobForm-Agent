import type { PopupElements } from "./dom";
import { BACKEND_URL } from "./config";
import { saveTrackerDraft, clearTrackerDraft, loadTrackerDraft } from "./persistence";

const CUSTOM_SHEET_PATH_STORAGE_KEY = "customSheetPath";

// Application Tracker feature: toggles the logging form, prefills it, persists drafts, and submits entries to the backend.
export function initTracker(els: PopupElements, activeTabId: number | undefined, activeTabUrl: string) {
  let draftSaveTimer: number | undefined;

  function scheduleDraftSave() {
    if (draftSaveTimer !== undefined) window.clearTimeout(draftSaveTimer);
    draftSaveTimer = window.setTimeout(() => saveTrackerDraft(els), 300);
  }

  function fillJobMetaIfBlank(jobMeta: { company: string | null; role: string | null; location: string | null }) {
    let changed = false;
    if (!els.tfCompany.value && jobMeta.company) { els.tfCompany.value = jobMeta.company; changed = true; }
    if (!els.tfRole.value && jobMeta.role) { els.tfRole.value = jobMeta.role; changed = true; }
    if (!els.tfLocation.value && jobMeta.location) { els.tfLocation.value = jobMeta.location; changed = true; }
    if (changed) saveTrackerDraft(els);
  }

  function prefillJobMetaFromPage() {
    if (els.tfCompany.value && els.tfRole.value && els.tfLocation.value) return;
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, { action: "EXTRACT_JOB_META" }, { frameId: 0 }, (res) => {
      if (chrome.runtime.lastError || !res?.jobMeta) return;
      fillJobMetaIfBlank(res.jobMeta);
    });
  }

  function expandTrackerForm() {
    els.trackerForm.classList.remove("hidden");
    els.trackerSheetPathRow.classList.remove("hidden");
    els.trackerToggleText.innerText = "− Hide Form";

    if (!els.tfDateApplied.value) {
      els.tfDateApplied.value = new Date().toISOString().slice(0, 10);
    }
    if (!els.tfJobLink.value && activeTabUrl) {
      els.tfJobLink.value = activeTabUrl;
    }
    prefillJobMetaFromPage();
  }

  function collapseTrackerForm() {
    els.trackerForm.classList.add("hidden");
    els.trackerSheetPathRow.classList.add("hidden");
    els.trackerToggleText.innerText = "+ Log Application";
  }

  chrome.storage.local.get([CUSTOM_SHEET_PATH_STORAGE_KEY], (result) => {
    const savedPath = result[CUSTOM_SHEET_PATH_STORAGE_KEY];
    if (savedPath) els.tfSheetPath.value = savedPath;
  });

  els.tfSheetPath.addEventListener("change", () => {
    chrome.storage.local.set({ [CUSTOM_SHEET_PATH_STORAGE_KEY]: els.tfSheetPath.value.trim() });
  });

  els.btnToggleTracker.addEventListener("click", () => {
    if (els.trackerForm.classList.contains("hidden")) {
      expandTrackerForm();
    } else {
      collapseTrackerForm();
    }
  });

  els.trackerForm.addEventListener("input", scheduleDraftSave);
  els.trackerForm.addEventListener("change", scheduleDraftSave);

  loadTrackerDraft((draft) => {
    const fields = draft?.fields;
    if (fields) {
      if (fields.company !== undefined) els.tfCompany.value = fields.company;
      if (fields.role !== undefined) els.tfRole.value = fields.role;
      if (fields.location !== undefined) els.tfLocation.value = fields.location;
      if (fields.remote !== undefined) els.tfRemote.value = fields.remote;
      if (fields.source !== undefined) els.tfSource.value = fields.source;
      if (fields.status !== undefined) els.tfStatus.value = fields.status;
      if (fields.date_applied !== undefined) els.tfDateApplied.value = fields.date_applied;
      if (fields.deadline !== undefined) els.tfDeadline.value = fields.deadline;
      if (fields.priority !== undefined) els.tfPriority.value = fields.priority;
      if (fields.follow_up_date !== undefined) els.tfFollowup.value = fields.follow_up_date;
      if (fields.contact !== undefined) els.tfContact.value = fields.contact;
      if (fields.stipend !== undefined) els.tfStipend.value = fields.stipend;
      if (fields.next_step !== undefined) els.tfNextStep.value = fields.next_step;
      if (fields.job_link !== undefined) els.tfJobLink.value = fields.job_link;
      if (fields.notes !== undefined) els.tfNotes.value = fields.notes;
    }
    if (draft?.expanded) {
      expandTrackerForm();
    }
  });

  function showTrackerStatus(message: string, kind: "success" | "error" | "warning") {
    els.trackerStatusMsg.innerText = message;
    els.trackerStatusMsg.className = `tracker-status-msg ${kind}`;
    els.trackerStatusMsg.classList.remove("hidden");
  }

  function fieldLabel(fieldName: string): string {
    return fieldName
      .split("_")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  function buildTrackerEntry(force: boolean) {
    return {
      company: els.tfCompany.value.trim(),
      role: els.tfRole.value.trim() || null,
      location: els.tfLocation.value.trim() || null,
      remote: els.tfRemote.value || null,
      source: els.tfSource.value.trim() || null,
      date_applied: els.tfDateApplied.value || null,
      deadline: els.tfDeadline.value || null,
      status: els.tfStatus.value || null,
      priority: els.tfPriority.value || null,
      contact: els.tfContact.value.trim() || null,
      stipend: els.tfStipend.value.trim() || null,
      next_step: els.tfNextStep.value.trim() || null,
      follow_up_date: els.tfFollowup.value || null,
      job_link: els.tfJobLink.value.trim() || null,
      notes: els.tfNotes.value.trim() || null,
      force,
      sheet_path: els.tfSheetPath.value.trim() || null
    };
  }

  async function submitTrackerEntry(force: boolean) {
    els.btnSaveTracker.disabled = true;
    els.btnSaveTracker.classList.add("loading");
    els.btnSaveTrackerText.innerText = "Saving...";
    els.btnForcePush.classList.add("hidden");
    els.trackerStatusMsg.classList.add("hidden");

    try {
      const res = await fetch(`${BACKEND_URL}/api/log-application`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildTrackerEntry(force))
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.detail || `Backend HTTP error ${res.status}`);
      }

      if (data.status === "needs_confirmation") {
        const unmatched = (data.unmatched_fields || []).map(fieldLabel).join(", ") || "none";
        showTrackerStatus(
          `No "Company" column found in your spreadsheet. Unmatched fields: ${unmatched}. Push this row anyway using whatever did match?`,
          "warning"
        );
        els.btnForcePush.classList.remove("hidden");
        return;
      }

      const unmatched = data.unmatched_fields || [];
      const suffix = unmatched.length ? ` (columns not found in your sheet: ${unmatched.map(fieldLabel).join(", ")})` : "";
      showTrackerStatus(`Logged to tracker (row ${data.row}) ✓${suffix}`, "success");
      els.trackerForm.reset();
      els.tfStatus.value = "Applied";
      els.tfDateApplied.value = new Date().toISOString().slice(0, 10);
      if (draftSaveTimer !== undefined) window.clearTimeout(draftSaveTimer);
      clearTrackerDraft();
    } catch (err) {
      showTrackerStatus(err instanceof Error ? err.message : String(err), "error");
    } finally {
      els.btnSaveTracker.disabled = false;
      els.btnSaveTracker.classList.remove("loading");
      els.btnSaveTrackerText.innerText = "Save to Tracker";
    }
  }

  els.trackerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    submitTrackerEntry(false);
  });

  els.btnForcePush.addEventListener("click", () => {
    submitTrackerEntry(true);
  });

  els.btnExportTracker.addEventListener("click", async () => {
    const originalText = els.btnExportTracker.innerText;
    els.btnExportTracker.disabled = true;
    els.btnExportTracker.innerText = "Exporting...";
    try {
      const customPath = els.tfSheetPath.value.trim();
      const exportUrl = customPath ? `${BACKEND_URL}/api/export-tracker?path=${encodeURIComponent(customPath)}` : `${BACKEND_URL}/api/export-tracker`;
      const res = await fetch(exportUrl);
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : "Application_Tracker.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showTrackerStatus("Tracker exported.", "success");
    } catch (err) {
      showTrackerStatus(err instanceof Error ? err.message : "Export failed.", "error");
    } finally {
      els.btnExportTracker.disabled = false;
      els.btnExportTracker.innerText = originalText;
    }
  });
}
