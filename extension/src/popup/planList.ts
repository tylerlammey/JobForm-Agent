import type { PopupElements } from "./dom";

// Used by both the autofill flow (after a fresh plan comes back) and
// persistence (when restoring a previously saved plan for this tab).
export function renderPlanList(els: PopupElements, planActions: any[]) {
  els.aiPlanList.innerHTML = "";
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

    els.aiPlanList.appendChild(itemDiv);
  });
}
