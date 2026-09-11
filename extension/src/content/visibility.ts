import { cssAttrEscape } from "./selectors";
import { isJunkOptionText } from "./junkOptions";

/**
 * Checks if an element is visible in the viewport/DOM
 */
export function isElementVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);

  const isFileInput = el instanceof HTMLInputElement && el.type === 'file';

  // Exemption: custom combobox inputs/triggers can be opacity 0 or 0px width/height by style design
  const isDropdownOrCombobox =
    el.getAttribute("role") === "combobox" ||
    el.classList.contains("select__input") ||
    el.getAttribute("aria-haspopup") === "true" ||
    el.getAttribute("aria-haspopup") === "listbox" ||
    el.classList.contains("select__control") ||
    el.classList.contains("select2-selection") ||
    el.classList.contains("ng-select-container");

  const isCheckable =
    (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) ||
    el.getAttribute("role") === "radio" ||
    el.getAttribute("role") === "checkbox";

  // File inputs: ATS platforms (Greenhouse, Lever, Workday, Ashby) frequently style file inputs
  // with display:none, opacity:0, or 0x0 size and wrap them in custom dropzone buttons.
  // As long as the enclosing form/container is visible (not inside a closed modal/tab), it is valid.
  if (isFileInput) {
    let parent = el.parentElement;
    while (parent) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
        return false;
      }
      parent = parent.parentElement;
    }
    return true;
  }

  if (style.display === 'none' || style.visibility === 'hidden') {
    // If it's a styled native checkable input, check if its parent label/wrapper is visible
    if (isCheckable && el.parentElement) {
      const parentStyle = window.getComputedStyle(el.parentElement);
      if (parentStyle.display !== 'none' && parentStyle.visibility !== 'hidden') {
        return true;
      }
    }
    return false;
  }

  // If not a dropdown control, checkable input, or file input, filter out opacity 0
  if (!isDropdownOrCombobox && !isCheckable && style.opacity === '0') {
    return false;
  }

  // Traverse up parents to check display / visibility
  let parent = el.parentElement;
  while (parent) {
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
      return false;
    }
    parent = parent.parentElement;
  }

  // HTMLInputElement hidden types are physically invisible
  if (el instanceof HTMLInputElement && el.type === 'hidden') {
    return false;
  }

  // Basic check for dimensions (except for checkboxes, radios, and dropdown controls)
  if (!isCheckable && !isDropdownOrCombobox) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }
  }

  return true;
}

export function isElementFilled(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'radio') {
      if (el.name) {
        const group = document.querySelectorAll(`input[type="radio"][name="${cssAttrEscape(el.name)}"]`);
        return Array.from(group).some(r => (r as HTMLInputElement).checked);
      }
      return el.checked;
    }
    if (el.type === 'checkbox') {
      return el.checked;
    }
    if (el.type === 'file') {
      if (el.files !== null && el.files.length > 0) return true;
      const container = el.closest('.dropzone, .file-upload, [data-automation-id*="file" i], [class*="upload" i], [class*="resume" i], .field, .form-group') || el.parentElement;
      if (container) {
        const uploadedIndicator = container.querySelector('.uploaded-file, .file-name, [data-automation-id*="uploaded" i], [class*="file-item" i], [class*="attached" i], button[aria-label*="remove" i], button[aria-label*="delete" i]');
        if (uploadedIndicator && isElementVisible(uploadedIndicator as HTMLElement)) {
          return true;
        }
      }
      return false;
    }
    const val = el.value.trim();
    return val !== "" && !isJunkOptionText(val);
  }

  if (el instanceof HTMLTextAreaElement) {
    const val = el.value.trim();
    return val !== "" && !isJunkOptionText(val);
  }

  if (el instanceof HTMLSelectElement) {
    if (el.selectedIndex < 0) return false;
    const opt = el.options[el.selectedIndex];
    if (!opt) return false;
    const val = opt.value.trim();
    const text = opt.text.trim();
    return val !== "" && text !== "" && !isJunkOptionText(text) && !text.toLowerCase().includes("select");
  }

  // Custom styled combobox triggers or plain div-or-button dropdown triggers
  const isDropdownOrCombobox =
    el.getAttribute("role") === "combobox" ||
    el.classList.contains("select__input") ||
    el.getAttribute("aria-haspopup") === "true" ||
    el.getAttribute("aria-haspopup") === "listbox" ||
    el.classList.contains("select__control") ||
    el.classList.contains("select2-selection") ||
    el.classList.contains("ng-select-container");

  if (isDropdownOrCombobox) {
    const text = el.textContent?.trim() || "";
    if (text === "" || isJunkOptionText(text)) return false;

    const lower = text.toLowerCase();
    if (lower.includes("select") || lower.includes("choose") || lower.includes("placeholder") || lower.includes("option")) {
      return false;
    }
    return true;
  }

  return false;
}

export function isInsideNavigationOrHeaderFooter(el: HTMLElement): boolean {
  return !!el.closest('header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], .site-nav, .careers-nav, .navbar, .nav-wrapper, .announcement-banner');
}
