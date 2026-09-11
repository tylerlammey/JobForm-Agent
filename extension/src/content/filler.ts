import { resolveElement, cssAttrEscape } from "./selectors";
import { isElementVisible, isElementFilled } from "./visibility";
import { getOptionLabel } from "./labels";
import { simulateInputLifecycle, simulateCheckboxToggle, sleep } from "./nativeEvents";
import { openDropdownAndLocateOptions, typeIntoComboboxAndLocateOptions, closeDropdown, snapshotVisibleOptionElements, waitForOptionElements } from "./dropdown";

function getTargetValues(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map(val => String(val).trim());
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(val => String(val).trim());
        }
      } catch (e) {
        // ignore and fall back to single value
      }
    }
    if (trimmed.includes(";")) {
      return trimmed.split(";").map(val => val.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return [String(value).trim()];
}

/**
 * Fills radio groups, checkbox groups, or single checkboxes
 */
async function fillMultipleChoiceOrCheckable(
  element: HTMLElement | null,
  selector: string,
  value: any
): Promise<{ success: boolean; error?: string; note?: string }> {
  const targets = getTargetValues(value);
  if (targets.length === 0) {
    return { success: true, note: "No target options to select." };
  }

  // 1. Gather all candidate option elements belonging to this group
  let candidateOptions: HTMLElement[] = [];

  const nameMatch = selector.match(/name="((?:[^"\\]|\\.)*)"/);
  if (nameMatch) {
    const rawName = nameMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const matchedByName = Array.from(document.querySelectorAll(
      `input[name="${cssAttrEscape(rawName)}"], [name="${cssAttrEscape(rawName)}"]`
    )) as HTMLElement[];
    if (matchedByName.length > 1) {
      candidateOptions = matchedByName;
    }
  }

  // If not found via shared name, search enclosing fieldset/group/question containers for sibling checkable options
  if (candidateOptions.length <= 1 && element) {
    let searchEl: HTMLElement | null = element;
    let depth = 0;
    while (searchEl && searchEl !== document.body && depth < 5) {
      const container = searchEl.closest('fieldset, [role="radiogroup"], [role="group"], [data-automation-id*="group" i], [data-automation-id*="formItem" i], [data-uxi-form-item="true"], .form-group, .field, [class*="question" i], [class*="group" i]') || searchEl.parentElement;
      if (container && container !== document.body) {
        const found = (Array.from(container.querySelectorAll(
          'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]'
        )) as HTMLElement[]).filter(isElementVisible);
        if (found.length > 1) {
          candidateOptions = found;
          break;
        }
      }
      searchEl = searchEl.parentElement;
      depth++;
    }
  }

  // Fallback to name match or single element
  if (candidateOptions.length === 0) {
    if (nameMatch) {
      const rawName = nameMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const matchedByName = Array.from(document.querySelectorAll(
        `input[name="${cssAttrEscape(rawName)}"], [name="${cssAttrEscape(rawName)}"]`
      )) as HTMLElement[];
      if (matchedByName.length > 0) candidateOptions = matchedByName;
    }
  }

  if (candidateOptions.length === 0 && element) {
    candidateOptions = [element];
  }

  if (candidateOptions.length === 0) {
    return { success: false, error: `No radio/checkbox options found for selector: ${selector}` };
  }

  // Check if this candidate collection is a multi-select checkbox group
  const isCheckboxGroup = candidateOptions.length > 1 && candidateOptions.some(
    el => (el instanceof HTMLInputElement && el.type === 'checkbox') || el.getAttribute("role") === "checkbox"
  );

  if (isCheckboxGroup) {
    let matchedCount = 0;
    for (const optEl of candidateOptions) {
      const optLabel = getOptionLabel(optEl).toLowerCase().trim();
      const optVal = (optEl instanceof HTMLInputElement ? optEl.value : (optEl.getAttribute("value") || "")).toLowerCase().trim();

      const shouldCheck = targets.some(target => {
        const t = target.toLowerCase().trim();
        if (t === "all") return true;
        if (optLabel === t || optVal === t) return true;
        if (t === "true" || t === "yes" || t === "1") {
          return optLabel === "yes" || optVal === "yes" || optLabel === "true" || optVal === "true" || optLabel === "1" || optVal === "1";
        }
        if (t === "false" || t === "no" || t === "0") {
          return optLabel === "no" || optVal === "no" || optLabel === "false" || optVal === "false" || optLabel === "0" || optVal === "0";
        }
        return (t.length > 2 && (optLabel.includes(t) || t.includes(optLabel)));
      });

      simulateCheckboxToggle(optEl, shouldCheck);
      if (shouldCheck) matchedCount++;
    }
    return { success: true, note: `Set ${matchedCount} checkbox option(s).` };
  }

  // Check if this candidate is a single standalone checkbox
  if (
    candidateOptions.length === 1 &&
    ((candidateOptions[0] instanceof HTMLInputElement && candidateOptions[0].type === 'checkbox') ||
     candidateOptions[0].getAttribute("role") === "checkbox")
  ) {
    const firstTarget = targets[0]?.toLowerCase().trim() || "";
    const isFalse = firstTarget === "false" || firstTarget === "no" || firstTarget === "0" || firstTarget === "decline" || firstTarget === "disagree";
    const shouldCheck = !isFalse;
    simulateCheckboxToggle(candidateOptions[0], shouldCheck);
    return { success: true };
  }

  // Radio button groups: find best matching option and check it
  let matchedAny = false;

  for (const target of targets) {
    const targetLower = target.toLowerCase().trim();
    const isTargetTrue = targetLower === "true" || targetLower === "yes" || targetLower === "1" || targetLower === "y";
    const isTargetFalse = targetLower === "false" || targetLower === "no" || targetLower === "0" || targetLower === "n";

    let bestMatch: HTMLElement | null = null;

    // A. Exact match against option label or input value
    for (const optEl of candidateOptions) {
      const optLabel = getOptionLabel(optEl).toLowerCase().trim();
      const optVal = (optEl instanceof HTMLInputElement ? optEl.value : (optEl.getAttribute("value") || "")).toLowerCase().trim();

      if (optLabel === targetLower || optVal === targetLower) {
        bestMatch = optEl;
        break;
      }
      if (isTargetTrue && (optLabel === "yes" || optVal === "yes" || optVal === "true" || optVal === "1")) {
        bestMatch = optEl;
        break;
      }
      if (isTargetFalse && (optLabel === "no" || optVal === "no" || optVal === "false" || optVal === "0")) {
        bestMatch = optEl;
        break;
      }
    }

    // B. Substring / fuzzy match fallback
    if (!bestMatch) {
      for (const optEl of candidateOptions) {
        const optLabel = getOptionLabel(optEl).toLowerCase().trim();
        const optVal = (optEl instanceof HTMLInputElement ? optEl.value : (optEl.getAttribute("value") || "")).toLowerCase().trim();

        if (optLabel.includes(targetLower) || targetLower.includes(optLabel) ||
          (optVal && (optVal.includes(targetLower) || targetLower.includes(optVal)))) {
          bestMatch = optEl;
          break;
        }
      }
    }

    if (bestMatch) {
      bestMatch.focus?.();
      bestMatch.dispatchEvent(new FocusEvent('focus', { bubbles: false, cancelable: false, view: window }));
      bestMatch.dispatchEvent(new FocusEvent('focusin', { bubbles: true, cancelable: false, view: window }));
      if (bestMatch instanceof HTMLInputElement) {
        if (bestMatch.type === 'radio') {
          bestMatch.checked = true;
          bestMatch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          const parentLabel = bestMatch.closest('label') || (bestMatch.id ? document.querySelector(`label[for="${CSS.escape(bestMatch.id)}"]`) : null);
          if (parentLabel && (parentLabel as Element) !== bestMatch) {
            parentLabel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          }
          bestMatch.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          bestMatch.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        } else if (bestMatch.type === 'checkbox') {
          simulateCheckboxToggle(bestMatch, !isTargetFalse);
        }
      } else {
        // Custom ARIA role="radio" or role="checkbox"
        bestMatch.setAttribute('aria-checked', 'true');
        bestMatch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        bestMatch.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        bestMatch.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      }
      bestMatch.dispatchEvent(new FocusEvent('focusout', { bubbles: true, cancelable: false, view: window }));
      bestMatch.dispatchEvent(new FocusEvent('blur', { bubbles: false, cancelable: false, view: window }));
      bestMatch.blur?.();
      matchedAny = true;
    }
  }

  if (matchedAny) {
    return { success: true };
  }

  return { success: false, error: `None of the multiple choice options matched '${targets.join(", ")}'.` };
}

/**
 * Performs one field fill and always resolves to a result object rather than
 * throwing — this is what lets FILL_ALL_FIELDS keep going through the rest of
 * a form even when one particular field fails.
 */
export async function fillSingleField(
  selector: string,
  fillAction: string,
  value: any,
  optionsMode?: 'strict' | 'dynamic'
): Promise<{ success: boolean; error?: string; note?: string }> {
  const element = resolveElement(selector);
  if (!element) {
    return { success: false, error: `Element not found for selector: ${selector}` };
  }

  // Handle skip action
  if (fillAction === "skip") {
    return { success: true, note: "Field skipped (left blank)." };
  }

  // Prevent overwriting if already filled/selected by the user
  if (isElementFilled(element)) {
    return { success: true, note: "Field already has a value, skipping write to prevent overwrite." };
  }

  try {
    // Check if target is a radio/checkbox multiple choice field or check action
    const isCheckable =
      (element instanceof HTMLInputElement && (element.type === "radio" || element.type === "checkbox")) ||
      element.getAttribute("role") === "radio" ||
      element.getAttribute("role") === "checkbox" ||
      element.getAttribute("role") === "radiogroup" ||
      element.getAttribute("role") === "group" ||
      fillAction === "check" ||
      selector.includes('type="radio"') ||
      selector.includes('type="checkbox"');

    if (isCheckable) {
      return await fillMultipleChoiceOrCheckable(element, selector, value);
    }

    if (fillAction === "type") {
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      simulateInputLifecycle(input, String(value));
      return { success: true };

    } else if (fillAction === "select") {
      const targets = getTargetValues(value);
      if (targets.length === 0) {
        return { success: true, note: "No target options to select." };
      }

      if (element instanceof HTMLSelectElement) {
        // Standard HTML Select elements
        let matchedAny = false;
        const isMultiple = element.multiple;
        const targetsToMatch = isMultiple ? targets : [targets[0]];

        if (isMultiple) {
          for (let i = 0; i < element.options.length; i++) {
            element.options[i].selected = false;
          }
        }

        for (let i = 0; i < element.options.length; i++) {
          const opt = element.options[i];
          const optText = opt.text.toLowerCase().trim();
          const optValue = opt.value.toLowerCase().trim();

          const isMatch = targetsToMatch.some(target => {
            const targetLower = target.toLowerCase();
            return optText === targetLower || optValue === targetLower;
          });

          if (isMatch) {
            if (isMultiple) {
              opt.selected = true;
            } else {
              element.selectedIndex = i;
            }
            matchedAny = true;
          }
        }

        if (matchedAny) {
          element.focus?.();
          element.dispatchEvent(new FocusEvent('focus', { bubbles: false, cancelable: false, view: window }));
          element.dispatchEvent(new FocusEvent('focusin', { bubbles: true, cancelable: false, view: window }));
          element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, cancelable: false, view: window }));
          element.dispatchEvent(new FocusEvent('blur', { bubbles: false, cancelable: false, view: window }));
          element.blur?.();
          return { success: true };
        }
        return { success: false, error: `None of the options '${targets.join(", ")}' were found in dropdown list.` };
      }

      // Custom Styled Combobox / plain div-or-button dropdowns.
      let clickedAny = false;
      const isReadOnly = (element as HTMLInputElement).readOnly || element.getAttribute("readonly") !== null;
      const isDynamicTypeahead = !isReadOnly && (
        optionsMode === "dynamic" ||
        (element instanceof HTMLInputElement &&
          (element.getAttribute("aria-autocomplete") === "list" || element.getAttribute("aria-autocomplete") === "both"))
      );

      for (const target of targets) {
        let optionElements: HTMLElement[] = [];
        if (element instanceof HTMLInputElement && isDynamicTypeahead) {
          // Typeahead-capable control: type the target value first so a search-
          // backed widget (school lookup, city lookup, etc.) actually fetches
          // and renders matching results, THEN read what showed up.
          const typed = await typeIntoComboboxAndLocateOptions(element, target);
          optionElements = typed.optionElements;
        } else {
          const opened = await openDropdownAndLocateOptions(element);
          optionElements = opened.optionElements;
        }

        if (optionElements.length === 0) {
          if (element instanceof HTMLInputElement) {
            // Some widgets (school/college search especially) only actually run
            // their search and render results once Enter is pressed -- typing
            // alone isn't enough. Give it one more chance to show options
            // before giving up and just confirming the typed text as-is.
            const beforeEnter = snapshotVisibleOptionElements();
            element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            const afterEnter = await waitForOptionElements(element, beforeEnter, 800);
            if (afterEnter.length > 0) {
              optionElements = afterEnter;
            } else {
              await sleep(50);
              await closeDropdown(element);
              element.blur();
              return { success: true, note: "No option list rendered; confirmed typed value via Enter." };
            }
          } else {
            continue;
          }
        }

        const targetText = target.toLowerCase().trim();
        let optionToClick = optionElements.find(opt => {
          const optText = (opt.textContent || "").trim().toLowerCase();
          return optText === targetText;
        });

        if (!optionToClick) {
          optionToClick = optionElements.find(opt => {
            const optText = (opt.textContent || "").trim().toLowerCase();
            return optText.includes(targetText) || targetText.includes(optText);
          });
        }

        if (optionToClick) {
          optionToClick.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          optionToClick.click();
          await sleep(100);
          clickedAny = true;
        }
      }

      await closeDropdown(element);
      element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, cancelable: false, view: window }));
      element.dispatchEvent(new FocusEvent('blur', { bubbles: false, cancelable: false, view: window }));
      element.blur();

      if (clickedAny) {
        return { success: true };
      }
      return { success: false, error: `None of the options '${targets.join(", ")}' were found or selected in custom dropdown.` };

    } else {
      return { success: false, error: `Unsupported fill action: ${fillAction}` };
    }
  } catch (err) {
    console.error("Error programmatically filling field:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
