import type { PopupElements } from "./dom";
import type { ProgressStage } from "./state";

// Progress state controller.
export function initProgress(els: PopupElements) {
  function updateProgress(stage: ProgressStage, message?: string, percent?: number) {
    if (stage === "idle") {
      els.progressSection.classList.add("hidden");
      els.progressBarFill.style.width = "0%";
      els.stepScan.className = "step-pill";
      els.stepPlan.className = "step-pill";
      els.stepInject.className = "step-pill";
      els.line1.className = "step-line";
      els.line2.className = "step-line";
      return;
    }

    els.progressSection.classList.remove("hidden");

    if (stage === "scanning") {
      const p = percent ?? 25;
      els.progressBarFill.style.width = `${p}%`;
      els.progressPercentBadge.innerText = `${p}%`;
      els.progressStatusText.innerText = message || "Scanning form inputs...";
      els.stepScan.className = "step-pill active";
      els.stepPlan.className = "step-pill";
      els.stepInject.className = "step-pill";
      els.line1.className = "step-line";
      els.line2.className = "step-line";
    } else if (stage === "planning") {
      const p = percent ?? 65;
      els.progressBarFill.style.width = `${p}%`;
      els.progressPercentBadge.innerText = `${p}%`;
      els.progressStatusText.innerText = message || "Generating AI fill plan...";
      els.stepScan.className = "step-pill completed";
      els.line1.className = "step-line completed";
      els.stepPlan.className = "step-pill active";
      els.stepInject.className = "step-pill";
      els.line2.className = "step-line";
    } else if (stage === "injecting") {
      const p = percent ?? 90;
      els.progressBarFill.style.width = `${p}%`;
      els.progressPercentBadge.innerText = `${p}%`;
      els.progressStatusText.innerText = message || "Applying autofill actions...";
      els.stepScan.className = "step-pill completed";
      els.line1.className = "step-line completed";
      els.stepPlan.className = "step-pill completed";
      els.line2.className = "step-line completed";
      els.stepInject.className = "step-pill active";
    } else if (stage === "complete") {
      els.progressBarFill.style.width = "100%";
      els.progressPercentBadge.innerText = "100%";
      els.progressStatusText.innerText = message || "Autofill completed successfully!";
      els.stepScan.className = "step-pill completed";
      els.line1.className = "step-line completed";
      els.stepPlan.className = "step-pill completed";
      els.line2.className = "step-line completed";
      els.stepInject.className = "step-pill completed";
      if (els.reelsStatusPill) {
        els.reelsStatusPill.classList.remove("hidden");
        if (els.reelsStatusText) {
          els.reelsStatusText.innerText = "Form Filled!";
        }
      }
    } else if (stage === "error") {
      els.progressBarFill.style.width = "100%";
      els.progressBarFill.style.background = "var(--liquid-rose)";
      els.progressPercentBadge.innerText = "Error";
      els.progressStatusText.innerText = message || "Process encountered an error.";
      if (els.reelsStatusPill) {
        els.reelsStatusPill.classList.add("hidden");
      }
    }

    if (stage !== "complete" && els.reelsStatusPill) {
      els.reelsStatusPill.classList.add("hidden");
    }
  }

  return { updateProgress };
}

export type ProgressController = ReturnType<typeof initProgress>;
