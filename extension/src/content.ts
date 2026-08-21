// Content script for Job Autofiller extension
// Scans form fields and extracts metadata for AI processing

interface ExtractedField {
  id: string;
  name: string;
  type: string;
  label: string;
  placeholder: string;
  required: boolean;
  options?: string[];
  /** True if this field accepts more than one selected value (e.g. id/name ending in "[]", a <select multiple>, or aria-multiselectable="true"). */
  multiple?: boolean;
  /**
   * Only meaningful when type === "select".
   * "strict"  — `options` is the complete, closed list. The value MUST be one of these entries verbatim; do not invent or free-type a value.
   * "dynamic" — this is a typeahead/search field (e.g. school or city lookup). `options` may be empty or just a stale preview — type a query into it and pick from whatever results actually render, rather than trusting `options` as exhaustive.
   */
  optionsMode?: 'strict' | 'dynamic';
  elementSelector: string;
  alreadyFilled?: boolean;
}

interface AnalysisResponse {
  url: string;
  title: string;
  inputsCount: number;
  textareasCount: number;
  selectsCount: number;
  fields: ExtractedField[];
}

/**
 * Checks if an element is visible in the viewport/DOM
 */
function isElementVisible(el: HTMLElement): boolean {
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

function isElementFilled(el: HTMLElement): boolean {
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

/**
 * Resolves the option-specific label for a single radio or checkbox element
 */
function getOptionLabel(element: HTMLElement): string {
  const clean = (text: string | null) => text ? text.trim().replace(/\s+/g, ' ') : "";

  // 1. Explicit HTML label targeting ID
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label && label.textContent) {
      const text = clean(label.textContent);
      if (text) return text;
    }
  }

  // 2. Implicit HTML label parent wrapper
  const parentLabel = element.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, select, textarea, button').forEach(c => c.remove());
    const text = clean(clone.textContent);
    if (text) return text;
  }

  // 3. Next Sibling text / element
  let next = element.nextSibling;
  while (next) {
    if (next.nodeType === Node.TEXT_NODE && next.textContent?.trim()) {
      return clean(next.textContent);
    }
    if (next.nodeType === Node.ELEMENT_NODE) {
      const el = next as HTMLElement;
      if (el.tagName === 'LABEL' || el.tagName === 'SPAN' || el.tagName === 'DIV' || el.tagName === 'P') {
        const text = clean(el.textContent);
        if (text) return text;
      }
    }
    next = next.nextSibling;
  }

  // 4. Accessible attributes
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return clean(ariaLabel);

  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const text = ariaLabelledBy
      .split(/\s+/)
      .map(id => document.getElementById(id)?.textContent || "")
      .join(' ');
    if (clean(text)) return clean(text);
  }

  // 5. Value attribute as fallback
  if (element instanceof HTMLInputElement && element.value && !['on', 'true', 'false', '1', '0', ''].includes(element.value.toLowerCase())) {
    return clean(element.value);
  }

  return "";
}

/**
 * Resolves the overarching question text for a multiple choice group (radio group or checkbox group)
 */
function getGroupQuestionLabel(elements: HTMLElement[], container?: HTMLElement | null): string {
  const clean = (text: string | null) => text ? text.trim().replace(/\s+/g, ' ') : "";

  // 1. Check parent fieldset legend
  const firstEl = elements[0];
  const fieldset = firstEl?.closest('fieldset') || container?.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend && legend.textContent) {
      const text = clean(legend.textContent);
      if (text) return text;
    }
  }

  // 2. Check container's aria attributes (e.g. role="radiogroup" aria-labelledby or aria-label)
  const groupWidget = firstEl?.closest('[role="radiogroup"], [role="group"]') || container;
  if (groupWidget) {
    const ariaLabel = groupWidget.getAttribute('aria-label');
    if (ariaLabel) return clean(ariaLabel);

    const ariaLabelledBy = groupWidget.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const text = ariaLabelledBy
        .split(/\s+/)
        .map(id => document.getElementById(id)?.textContent || "")
        .join(' ');
      if (clean(text)) return clean(text);
    }
  }

  // Option labels in this group to avoid mistaking an option label for the overarching question
  const knownOptionLabels = elements.map(el => getOptionLabel(el).toLowerCase().trim()).filter(Boolean);

  // 3. Search common parent hierarchy for question label/heading
  let currentParent = firstEl?.parentElement;
  let depth = 0;
  while (currentParent && depth < 6) {
    const candidates = Array.from(currentParent.querySelectorAll(
      'legend, [data-automation-id="formLabel"], label, h1, h2, h3, h4, h5, h6, [class*="label" i], [class*="title" i], [class*="question" i]'
    )) as HTMLElement[];

    for (const cand of candidates) {
      // Ignore if this candidate is actually one of the individual option labels
      const isOptionLabel = elements.some(el => {
        return cand.contains(el) || (el.id && cand.getAttribute('for') === el.id);
      });
      if (isOptionLabel) continue;

      // Ignore if this cand is explicitly a label for another input outside this group (e.g. for="date")
      const forId = cand.getAttribute('for');
      if (forId && !elements.some(el => el.id === forId)) {
        continue;
      }

      // Ignore if this cand contains a form input/select/textarea that is not in our group
      const foreignInput = cand.querySelector('input, select, textarea');
      if (foreignInput && !elements.includes(foreignInput as HTMLElement)) {
        continue;
      }

      const candText = clean(cand.textContent);
      const candLower = candText.toLowerCase();
      const isKnownOptionText = knownOptionLabels.some(opt => opt === candLower || (opt.length > 3 && candLower.startsWith(opt)));

      if (!isKnownOptionText) {
        if (candText && candText.length > 1 && candText.length < 250 && !isJunkOptionText(candText)) {
          return candText;
        }
      }
    }

    // Check preceding sibling of currentParent
    let prevSibling = currentParent.previousElementSibling;
    while (prevSibling) {
      // Do not accept prevSibling if it is another form field row with foreign inputs
      const hasForeignInput = prevSibling.querySelector('input, select, textarea');
      if (!hasForeignInput) {
        const cand = prevSibling.matches?.('label, legend, h1, h2, h3, h4, h5, h6, [class*="label" i], [class*="title" i], [class*="question" i]')
          ? (prevSibling as HTMLElement)
          : (prevSibling.querySelector('label, legend, h1, h2, h3, h4, h5, h6, [class*="label" i], [class*="title" i], [class*="question" i]') as HTMLElement | null);
        if (cand) {
          const text = clean(cand.textContent);
          const textLower = text.toLowerCase();
          const isKnownOptionText = knownOptionLabels.some(opt => opt === textLower);
          if (text && text.length > 1 && text.length < 250 && !isKnownOptionText) {
            return text;
          }
        }
      }
      prevSibling = prevSibling.previousElementSibling;
    }

    currentParent = currentParent.parentElement;
    depth++;
  }

  // 4. Fallback to name or getLabelText
  if (firstEl instanceof HTMLInputElement && firstEl.name) {
    return clean(firstEl.name);
  }
  return firstEl ? getLabelText(firstEl) : "";
}

/**
 * Resolves a human-readable label for a target element.
 * Widened to accept any HTMLElement (not just input/textarea/select) so it
 * also works for div/button-based dropdown triggers.
 */
function getLabelText(element: HTMLElement): string {
  const clean = (text: string | null) => text ? text.trim().replace(/\s+/g, ' ') : "";

  let resolved = "";

  // 1. Explicit HTML label targeting ID
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label && label.textContent) {
      resolved = clean(label.textContent);
    }
  }

  // 2. Implicit HTML label parent wrapper
  if (!resolved) {
    const parentLabel = element.closest('label');
    if (parentLabel && parentLabel.textContent) {
      resolved = clean(parentLabel.textContent);
    }
  }

  // 3. Accessible attributes (aria-label or aria-labelledby)
  if (!resolved) {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      resolved = clean(ariaLabel);
    }
  }

  if (!resolved) {
    const ariaLabelledBy = element.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      // aria-labelledby can reference multiple space-separated ids
      const text = ariaLabelledBy
        .split(/\s+/)
        .map(id => document.getElementById(id)?.textContent || "")
        .join(' ');
      if (text.trim()) resolved = clean(text);
    }
  }

  // 4. Placeholder text fallback (inputs/textareas only)
  if (!resolved && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.placeholder) {
    resolved = clean(element.placeholder);
  }

  // 5. Preceding Sibling text search (like Workday's tables/grids)
  if (!resolved) {
    const parent = element.parentElement;
    if (parent) {
      let sibling = element.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === 'LABEL' || sibling.classList.contains('label') || sibling.classList.contains('title')) {
          if (sibling.textContent) {
            resolved = clean(sibling.textContent);
            break;
          }
        }
        sibling = sibling.previousElementSibling;
      }

      if (!resolved) {
        const prevText = parent.previousElementSibling?.textContent;
        if (prevText) {
          resolved = clean(prevText);
        }
      }
    }
  }

  // 6. Name attribute fallback (inputs/textareas/selects only)
  if (!resolved && 'name' in element && (element as HTMLInputElement).name) {
    resolved = clean((element as HTMLInputElement).name);
  }

  // 7. Last resort for non-form elements (div/button triggers): own visible text,
  // but only if short (long text usually means we grabbed a wrapping container by mistake)
  if (!resolved) {
    const ownText = clean(element.textContent);
    if (ownText && ownText.length < 80) {
      resolved = ownText;
    }
  }

  // File Upload Dropzone / Container Context Enrichment:
  // If element is a file input or wrapped in a dropzone and has an empty/uninformative label,
  // inspect enclosing container for upload/resume headings or button text
  const isFileInput = (element instanceof HTMLInputElement && element.type === 'file') || element.getAttribute('type') === 'file';
  if (isFileInput && (!resolved || resolved.length < 3 || isJunkOptionText(resolved) || resolved === "file")) {
    const fileContainer = element.closest('.dropzone, [class*="upload" i], [class*="resume" i], [class*="file" i], [data-automation-id*="file" i], [data-automation-id*="upload" i], .form-group, .field, fieldset');
    if (fileContainer) {
      const heading = fileContainer.querySelector('label, legend, [data-automation-id="formLabel"], h1, h2, h3, h4, h5, h6, [class*="label" i], [class*="title" i], [class*="heading" i], button');
      if (heading && heading !== element.closest('label')) {
        const t = clean(heading.textContent);
        if (t && t.length > 1 && !isJunkOptionText(t)) {
          resolved = t;
        }
      }
    }
    if (!resolved) {
      const idOrName = (element instanceof HTMLInputElement ? (element.name || element.id) : (element.id || "")).toLowerCase();
      if (idOrName.includes("resume") || idOrName.includes("cv")) {
        resolved = "Resume / CV";
      } else if (idOrName.includes("cover")) {
        resolved = "Cover Letter";
      } else {
        resolved = "Attach Resume / File";
      }
    }
  }

  // Date Sub-Input Context Enrichment:
  // If the label is just a generic sub-date token like "Month", "Day", "Year", "MM", "DD", "YYYY",
  // search enclosing containers or element ID to provide complete context (e.g. "Date Signed On - Month")
  const dateSubTokens = ["month", "day", "year", "mm", "dd", "yyyy", "m", "d", "yr"];
  if (resolved && dateSubTokens.includes(resolved.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
    let parentLabelText = "";

    // A. Search ancestor date fieldset or section container
    const dateContainer = element.closest('fieldset, [class*="date" i], [id*="date" i], [data-automation-id*="date" i], .form-group, .field');
    if (dateContainer) {
      const legendOrHeading = dateContainer.querySelector('legend, [data-automation-id="formLabel"], label, h1, h2, h3, h4, h5, h6');
      if (legendOrHeading && legendOrHeading !== element.closest('label')) {
        const t = clean(legendOrHeading.textContent);
        if (t && !dateSubTokens.includes(t.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
          parentLabelText = t;
        }
      }
    }

    // B. Parse meaningful identifier slug from ID/name (e.g. "selfIdentifiedDisabilityData--dateSignedOn-dateSectionMonth-input" -> "Date Signed On")
    if (!parentLabelText && element.id) {
      const parts = element.id.split(/--|-|_/);
      const meaningfulParts = parts.filter(p => !p.match(/^(input|select|wrapper|dateSection|dateSectionMonth|dateSectionDay|dateSectionYear|month|day|year)$/i));
      if (meaningfulParts.length > 0) {
        const slug = meaningfulParts[meaningfulParts.length - 1];
        const unCamel = slug.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
        if (unCamel.trim()) {
          parentLabelText = unCamel.trim();
        }
      }
    }

    if (parentLabelText) {
      return `${parentLabelText} - ${resolved}`;
    }
  }

  return resolved;
}

/**
 * Escapes a value for safe use inside a double-quoted CSS attribute selector,
 * e.g. [id="VALUE"]. Only backslash and double-quote need escaping here —
 * unlike CSS.escape() used with '#id' selectors, this does NOT need to escape
 * '[', ']', '.', ':' etc, which keeps the resulting selector far less fragile
 * if it gets copied/retyped by other code (e.g. an LLM re-deriving a selector
 * from the plain "id"/"name" fields instead of using elementSelector as-is).
 */
function cssAttrEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Generates a unique CSS selector path to select this exact element again
 */
function getUniqueSelector(element: HTMLElement): string {
  if (element.id) {
    // Attribute-equals form instead of '#id' — many ATS platforms (Greenhouse,
    // etc.) use array-style ids/names like "question_123[]", which breaks a
    // '#'-prefixed selector unless every special char is escaped correctly.
    return `[id="${cssAttrEscape(element.id)}"]`;
  }

  // Check if a single class name uniquely identifies the element
  if (element.className && typeof element.className === 'string') {
    const classes = element.className
      .split(/\s+/)
      .filter(c => c.length > 0 && !c.includes(':') && !c.startsWith('w-') && !c.startsWith('h-') && !c.startsWith('bg-') && !c.startsWith('p-') && !c.startsWith('m-'));
    for (const cls of classes) {
      try {
        const matching = document.querySelectorAll(`.${CSS.escape(cls)}`);
        if (matching.length === 1) {
          return `.${CSS.escape(cls)}`;
        }
      } catch (e) { }
    }
  }

  // Match tags with names
  if (element instanceof HTMLInputElement && element.name) {
    return `input[name="${cssAttrEscape(element.name)}"]`;
  }
  if (element instanceof HTMLTextAreaElement && element.name) {
    return `textarea[name="${cssAttrEscape(element.name)}"]`;
  }
  if (element instanceof HTMLSelectElement && element.name) {
    return `select[name="${cssAttrEscape(element.name)}"]`;
  }

  // Fallback to strict structural DOM path selector
  const path: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    } else {
      let sibling = current.previousElementSibling;
      let index = 1;
      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }
      selector += `:nth-of-type(${index})`;
    }
    path.unshift(selector);
    current = current.parentElement;
  }
  return path.join(' > ');
}

// ---------------------------------------------------------------------------
// Custom dropdown handling
//
// A lot of ATS platforms (Greenhouse, Workday, iCIMS, SuccessFactors, React-Select
// based forms, etc.) implement dropdowns with no native <select> at all, and often
// no <input> either — just a <div>/<button> that opens a floating option list on
// click. There is no way to know their options without actually opening them, so
// both extraction and filling need to do a live "open, read, close" dance.
// ---------------------------------------------------------------------------

const DROPDOWN_TRIGGER_SELECTOR = [
  '[role="combobox"]',
  '[aria-haspopup="listbox"]',
  '.select__control',      // react-select
  '.select2-selection',    // select2
  '.chosen-single',        // chosen.js
  '.ng-select-container',  // ng-select
].join(', ');

const OPTION_ELEMENT_SELECTOR = [
  '[role="option"]',
  'li[id*="option" i]',
  '[class*="option" i]',
  '[data-automation-id*="option" i]',
  '[data-automation-id*="promptOption" i]',
  '.dropdown-item',
  '.select__option',
  '.select2-results__option',
  '.ng-option'
].join(', ');

// Text that shows up as a rendered "option" but isn't a real, selectable choice —
// loading placeholders and visual separator rows between groups of options
// (e.g. SAT vs ACT score scales separated by a row of dashes).
const JUNK_OPTION_PATTERNS: RegExp[] = [
  /^[-_.]{3,}$/,                 // separator rows like "-------------------"
  /^loading(\.{0,3})?$/i,
  /^please wait(\.{0,3})?$/i,
  /^searching(\.{0,3})?$/i,
  /^fetching(\.{0,3})?$/i,
  /^no (results|options|matches)( found)?$/i,
];

function isJunkOptionText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return JUNK_OPTION_PATTERNS.some(re => re.test(trimmed));
}

/** Strips loading placeholders / separator rows out of a scraped or DOM-read options list. */
function filterJunkOptions(options: string[]): string[] {
  return options.filter(opt => !isJunkOptionText(opt));
}

/**
 * Detects whether a field accepts multiple selected values. The `[]` suffix on
 * id/name is the standard convention (used by Greenhouse and many Rails-style
 * ATS forms) for array-valued fields like multi-select security clearances.
 */
function isMultiValueField(el: HTMLElement, backingSelect?: HTMLSelectElement | null): boolean {
  if (backingSelect?.multiple) return true;
  if (el instanceof HTMLSelectElement && el.multiple) return true;
  if (el.getAttribute('aria-multiselectable') === 'true') return true;
  const idOrName = el.id || (el as HTMLInputElement).name || '';
  return /\[\]\s*$/.test(idOrName);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sets an input/textarea's value in a way that React (and similar frameworks)
 * actually detect. Directly assigning `.value` and dispatching an 'input' event
 * is not enough for React-controlled fields — React overrides the instance's
 * value setter, so a plain assignment gets silently ignored by its internal
 * state, and the field never fires whatever triggers its search/filter logic
 * (e.g. the "School" or "Location" typeahead never queries anything). Calling
 * the native prototype setter first bypasses React's override.
 */
function setNativeInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }
  try {
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: value,
      view: window
    }));
  } catch (e) {
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  }
}

/**
 * Fully simulates the user typing lifecycle for an input or textarea element:
 * 1. Focus phase (focus, focusin)
 * 2. Prototype value setter override (bypasses React/Vue synthetic value trackers)
 * 3. Key & Input events (keydown, InputEvent with insertText data, keyup)
 * 4. Change event
 * 5. Blur phase (focusout, blur) to trigger form validation, touched/dirty states,
 *    and enable submit/apply buttons.
 */
function simulateInputLifecycle(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // 1. Focus phase
  input.focus?.();
  input.dispatchEvent(new FocusEvent('focus', { bubbles: false, cancelable: false, view: window }));
  input.dispatchEvent(new FocusEvent('focusin', { bubbles: true, cancelable: false, view: window }));

  // 2. Set native value & dispatch input event
  setNativeInputValue(input, value);

  // 3. Keyboard events
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Unidentified' }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Unidentified' }));

  // 4. Change event
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

  // 5. Blur phase: Essential for validation & touched state
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, cancelable: false, view: window }));
  input.dispatchEvent(new FocusEvent('blur', { bubbles: false, cancelable: false, view: window }));
  input.blur?.();
}

/**
 * Sets a checkbox's checked state via native prototype descriptor to bypass React/Vue value trackers
 */
function setNativeCheckboxChecked(input: HTMLInputElement, checked: boolean) {
  const proto = HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'checked')?.set;
  if (nativeSetter) {
    nativeSetter.call(input, checked);
  } else {
    input.checked = checked;
  }
}

/**
 * Fully simulates checkbox user interaction lifecycle:
 * Focus -> prototype checked assignment -> click on input & parent label -> input & change events -> Blur
 */
function simulateCheckboxToggle(targetEl: HTMLElement, desiredChecked: boolean) {
  targetEl.focus?.();
  targetEl.dispatchEvent(new FocusEvent('focus', { bubbles: false, cancelable: false, view: window }));
  targetEl.dispatchEvent(new FocusEvent('focusin', { bubbles: true, cancelable: false, view: window }));

  if (targetEl instanceof HTMLInputElement) {
    const isCurrentlyChecked = targetEl.checked;
    
    if (isCurrentlyChecked !== desiredChecked) {
      // Set native prototype property
      setNativeCheckboxChecked(targetEl, desiredChecked);

      // Dispatch click event on the target input
      targetEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

      // Ensure native checked state is preserved if click default action toggled it
      if (targetEl.checked !== desiredChecked) {
        setNativeCheckboxChecked(targetEl, desiredChecked);
      }

      try {
        targetEl.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, view: window }));
      } catch {
        targetEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      }
      targetEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }
  } else {
    // Custom ARIA role="checkbox"
    targetEl.setAttribute('aria-checked', desiredChecked ? 'true' : 'false');
    targetEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    targetEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    targetEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }

  targetEl.dispatchEvent(new FocusEvent('focusout', { bubbles: true, cancelable: false, view: window }));
  targetEl.dispatchEvent(new FocusEvent('blur', { bubbles: false, cancelable: false, view: window }));
  targetEl.blur?.();
}

function snapshotVisibleOptionElements(): Set<HTMLElement> {
  return new Set(
    (Array.from(document.querySelectorAll(OPTION_ELEMENT_SELECTOR)) as HTMLElement[]).filter(isElementVisible)
  );
}

function extractOptionTexts(optionElements: HTMLElement[]): string[] {
  return filterJunkOptions(Array.from(new Set(
    optionElements
      .map(el => (el.textContent || "").trim().replace(/\s+/g, ' '))
      .filter(text => text.length > 0)
  )));
}

/**
 * Polls for an option list to appear/settle after some action (opening a
 * dropdown, or typing a typeahead query). Shared by both flows below so
 * timing/detection logic only lives in one place.
 */
async function waitForOptionElements(
  trigger: HTMLElement,
  before: Set<HTMLElement>,
  timeoutMs: number
): Promise<HTMLElement[]> {
  const deadline = Date.now() + timeoutMs;
  let container: HTMLElement | null = null;
  let freshOptions: HTMLElement[] = [];

  while (Date.now() < deadline) {
    const controlsId = trigger.getAttribute('aria-controls') || trigger.getAttribute('aria-owns');
    if (controlsId) {
      const el = document.getElementById(controlsId);
      if (el && isElementVisible(el)) {
        container = el;
        break;
      }
    }

    const current = (Array.from(document.querySelectorAll(OPTION_ELEMENT_SELECTOR)) as HTMLElement[])
      .filter(isElementVisible);
    freshOptions = current.filter(el => !before.has(el));
    if (freshOptions.length > 0) break;

    await sleep(80);
  }

  if (container) {
    let els = (Array.from(container.querySelectorAll(OPTION_ELEMENT_SELECTOR)) as HTMLElement[]).filter(isElementVisible);
    if (els.length === 0) {
      els = (Array.from(container.children) as HTMLElement[]).filter(isElementVisible);
    }
    return els;
  }
  return freshOptions;
}

function isInsideNavigationOrHeaderFooter(el: HTMLElement): boolean {
  return !!el.closest('header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], .site-nav, .careers-nav, .navbar, .nav-wrapper, .announcement-banner');
}

/**
 * Finds top-level custom dropdown triggers that are NOT native <select>/<input>/<textarea>
 * elements (those are handled separately) and are not nested inside another trigger
 * or inside a field that already has its own <input>/<select>/<textarea> control.
 */
function getGenericDropdownTriggers(): HTMLElement[] {
  const candidates = Array.from(document.querySelectorAll(DROPDOWN_TRIGGER_SELECTOR)) as HTMLElement[];

  return candidates.filter((el) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      return false; // already handled by the input/select passes
    }
    if (!isElementVisible(el)) return false;
    if (isInsideNavigationOrHeaderFooter(el)) return false;

    // Skip if this trigger wraps an actual form control (e.g. react-select's
    // .select__control wraps an <input> — that input is already picked up
    // by the input-based combobox pass, so don't double-count the wrapper).
    if (el.querySelector('input, select, textarea')) return false;

    // Skip if nested inside another candidate (keep only the outermost trigger)
    const isNested = candidates.some(other => other !== el && other.contains(el) && isElementVisible(other));
    if (isNested) return false;

    return true;
  });
}

/**
 * Opens a dropdown trigger, waits for its option list to render, and returns
 * both the option text and a reference to where those options live so a caller
 * can act on them (e.g. click one) without re-searching the whole document.
 * Leaves the dropdown OPEN — caller is responsible for closing it if needed.
 * Use this for plain click-to-pick dropdowns (fixed lists).
 */
async function openDropdownAndLocateOptions(
  trigger: HTMLElement,
  timeoutMs: number = 600
): Promise<{ options: string[]; optionElements: HTMLElement[] }> {
  const before = snapshotVisibleOptionElements();

  // Different widget libraries listen for different events to open — cover the common cases.
  trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  trigger.focus?.();
  trigger.click();

  const optionElements = await waitForOptionElements(trigger, before, timeoutMs);
  return { options: extractOptionTexts(optionElements), optionElements };
}

/**
 * For typeahead/search comboboxes (school lookup, city lookup, etc.) — types
 * the target value into the input first so the widget's own search/filter
 * logic actually runs, THEN reads whatever results rendered. Opening these
 * without typing anything only ever shows a default/empty state, which is
 * why a plain "open and match" approach can never find a specific school or
 * city by name.
 */
async function typeIntoComboboxAndLocateOptions(
  input: HTMLInputElement,
  query: string,
  timeoutMs: number = 1000
): Promise<{ options: string[]; optionElements: HTMLElement[] }> {
  const before = snapshotVisibleOptionElements();

  input.focus();
  // Clear first — some widgets only kick off a new search on a value *change*,
  // and won't re-fire if the field already happens to contain the same text.
  setNativeInputValue(input, '');
  await sleep(30);
  setNativeInputValue(input, query);
  // Some widgets listen for real keyboard events rather than just 'input'.
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

  // Debounced network-backed searches (e.g. a university/city API) are slower
  // to settle than a purely client-side filter, hence the shorter default timeout.
  const optionElements = await waitForOptionElements(input, before, timeoutMs);
  return { options: extractOptionTexts(optionElements), optionElements };
}

function isDropdownOpen(trigger: HTMLElement): boolean {
  // 1. Check aria-expanded attribute
  const expanded = trigger.getAttribute('aria-expanded');
  if (expanded === 'true') return true;
  if (expanded === 'false') return false;

  // 2. Check custom class indicators
  const hasOpenClass = trigger.classList.contains('open') ||
    trigger.classList.contains('active') ||
    trigger.classList.contains('is-open') ||
    trigger.classList.contains('select__control--menu-is-open');
  if (hasOpenClass) return true;

  // 3. Check controls container visibility if targetable
  const controlsId = trigger.getAttribute('aria-controls') || trigger.getAttribute('aria-owns');
  if (controlsId) {
    const container = document.getElementById(controlsId);
    if (container && isElementVisible(container)) {
      return true;
    }
  }

  return false;
}

/** Closes an open dropdown progressively without submitting anything and releases focus */
async function closeDropdown(trigger: HTMLElement): Promise<void> {
  try {
    // 1. Initial Delay: Give React/framework effects a small moment to register listeners
    await sleep(100);

    // If already closed, no work needed
    if (!isDropdownOpen(trigger)) return;

    // 2. Strategy 1: Escape key sequence
    const escInit = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
    trigger.dispatchEvent(new KeyboardEvent('keydown', escInit));
    trigger.dispatchEvent(new KeyboardEvent('keypress', escInit));
    trigger.dispatchEvent(new KeyboardEvent('keyup', escInit));
    await sleep(50);
    if (!isDropdownOpen(trigger)) return;

    // 3. Strategy 2: Normal Click-Away (body click)
    const eventInit = { bubbles: true, cancelable: true, view: window };
    document.body.dispatchEvent(new MouseEvent('mousedown', eventInit));
    document.body.dispatchEvent(new MouseEvent('mouseup', eventInit));
    document.body.click();
    await sleep(50);
    if (!isDropdownOpen(trigger)) return;

    // 4. Strategy 3: Aggressive Click-Away on document, documentElement, window with modern pointer events
    const targets = [document.body, document.documentElement, document];
    for (const target of targets) {
      if (!target) continue;
      target.dispatchEvent(new PointerEvent('pointerdown', eventInit));
      target.dispatchEvent(new MouseEvent('mousedown', eventInit));
      target.dispatchEvent(new PointerEvent('pointerup', eventInit));
      target.dispatchEvent(new MouseEvent('mouseup', eventInit));
      target.dispatchEvent(new MouseEvent('click', eventInit));
    }
  } catch (err) {
    console.error("Error during closeDropdown execution:", err);
  } finally {
    // Robustness requirement: always release focus trap and blur trigger
    try {
      trigger.blur?.();
    } catch (e) {
      console.error("Error blurring trigger element:", e);
    }
  }
}

/**
 * Resolves an element from a selector string that was handed to us from
 * outside the page (e.g. a stored elementSelector, or one an LLM reconstructed
 * from a field's id/name). document.querySelector() throws a hard exception
 * on any malformed selector — a single unescaped '[' from an id like
 * "question_123[]" is enough to kill the whole FILL_FIELD/UPLOAD_FILE call.
 * This wraps that lookup and falls back to getElementById / getElementsByName
 * when the selector string itself isn't valid CSS.
 */
function resolveElement(selector: string): HTMLElement | null {
  try {
    return document.querySelector(selector) as HTMLElement | null;
  } catch (e) {
    console.warn("Selector was invalid, attempting fallback resolution:", selector, e);

    // '#rawId' where rawId may contain unescaped special characters
    const hashMatch = selector.match(/^#(.+)$/);
    if (hashMatch) {
      const rawId = hashMatch[1];
      const byId = document.getElementById(rawId);
      if (byId) return byId;
      const idMatch = (Array.from(document.querySelectorAll('[id]')) as HTMLElement[])
        .find(el => el.id === rawId);
      if (idMatch) return idMatch;
    }

    // '[id="..."]' or 'tag[id="..."]' where the quoted value may itself be malformed
    const idAttrMatch = selector.match(/\[id="((?:[^"\\]|\\.)*)"\]/);
    if (idAttrMatch) {
      const rawId = idAttrMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const byId = document.getElementById(rawId);
      if (byId) return byId;
    }

    // '[name="..."]' or 'tag[name="..."]'
    const nameAttrMatch = selector.match(/\[name="((?:[^"\\]|\\.)*)"\]/);
    if (nameAttrMatch) {
      const rawName = nameAttrMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const byName = document.getElementsByName(rawName);
      if (byName.length > 0) return byName[0] as HTMLElement;
    }

    console.error("Could not resolve element for selector after fallback attempts:", selector);
    return null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ANALYZE_PAGE") {
    (async () => {
      try {
        const allInputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
        const allTextareas = Array.from(document.querySelectorAll("textarea")) as HTMLTextAreaElement[];
        const allSelects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];

        const visibleInputs = allInputs.filter(isElementVisible);
        const visibleTextareas = allTextareas.filter(isElementVisible);
        const visibleSelects = allSelects.filter(select => {
          if (isElementVisible(select)) return true;
          const style = window.getComputedStyle(select);
          if (style.display === 'none' || style.visibility === 'hidden') {
            const parent = select.parentElement;
            if (parent && isElementVisible(parent)) {
              return true;
            }
          }
          return false;
        });

        const fields: ExtractedField[] = [];

        // -------------------------------------------------------------------
        // 1. Multiple Choice: Radio Button Groups (<input type="radio"> and role="radio")
        // -------------------------------------------------------------------
        const radioInputs = visibleInputs.filter(i => i.type === 'radio');
        const customRadios = (Array.from(document.querySelectorAll('[role="radio"]')) as HTMLElement[]).filter(isElementVisible);
        const allRadios: HTMLElement[] = [...radioInputs, ...customRadios.filter(r => !(r instanceof HTMLInputElement))];

        const radioGroupMap = new Map<string, HTMLElement[]>();
        allRadios.forEach(radio => {
          let groupKey = "";
          if (radio instanceof HTMLInputElement && radio.name) {
            groupKey = `name:${radio.name}`;
          } else {
            const groupContainer = radio.closest('fieldset, [role="radiogroup"], .form-group, .field, [class*="question"]') || radio.parentElement;
            groupKey = groupContainer ? `container:${getUniqueSelector(groupContainer as HTMLElement)}` : `radio:${getUniqueSelector(radio)}`;
          }
          if (!radioGroupMap.has(groupKey)) {
            radioGroupMap.set(groupKey, []);
          }
          radioGroupMap.get(groupKey)!.push(radio);
        });

        radioGroupMap.forEach((groupRadios, groupKey) => {
          const firstRadio = groupRadios[0];
          const groupName = firstRadio instanceof HTMLInputElement ? firstRadio.name : "";
          const questionLabel = getGroupQuestionLabel(groupRadios);

          const options = filterJunkOptions(
            Array.from(new Set(
              groupRadios
                .map(r => getOptionLabel(r))
                .filter(text => text.length > 0)
            ))
          );

          const isRequired = groupRadios.some(r =>
            (r instanceof HTMLInputElement && r.required) || r.getAttribute("aria-required") === "true"
          );

          const alreadyFilled = groupRadios.some(r =>
            (r instanceof HTMLInputElement && r.checked) || r.getAttribute("aria-checked") === "true"
          );

          let selector = "";
          if (groupName) {
            selector = `input[name="${cssAttrEscape(groupName)}"]`;
          } else {
            selector = getUniqueSelector(firstRadio);
          }

          fields.push({
            id: firstRadio.id || groupName || `radio_group_${fields.length}`,
            name: groupName || firstRadio.id || "",
            type: "radio",
            label: questionLabel || getLabelText(firstRadio) || "Multiple Choice Question",
            placeholder: "",
            required: isRequired,
            options: options.length > 0 ? options : undefined,
            multiple: false,
            optionsMode: 'strict',
            elementSelector: selector,
            alreadyFilled: alreadyFilled,
          });
        });

        // -------------------------------------------------------------------
        // 2. Checkboxes (<input type="checkbox"> and role="checkbox")
        // -------------------------------------------------------------------
        const checkboxInputs = visibleInputs.filter(i => i.type === 'checkbox');
        const customCheckboxes = (Array.from(document.querySelectorAll('[role="checkbox"]')) as HTMLElement[]).filter(isElementVisible);
        const allCheckboxes: HTMLElement[] = [...checkboxInputs, ...customCheckboxes.filter(c => !(c instanceof HTMLInputElement))];

        const checkboxGroupMap = new Map<string, HTMLElement[]>();
        allCheckboxes.forEach(cb => {
          let groupKey = "";
          if (cb instanceof HTMLInputElement && cb.name && (cb.name.endsWith("[]") || isMultiValueField(cb))) {
            groupKey = `name:${cb.name}`;
          } else {
            const container = cb.closest('fieldset, [role="group"], .form-group, .field, [class*="question"]');
            if (container) {
              const countInContainer = container.querySelectorAll('input[type="checkbox"], [role="checkbox"]').length;
              if (countInContainer > 1) {
                groupKey = `container:${getUniqueSelector(container as HTMLElement)}`;
              }
            }
          }

          if (groupKey) {
            if (!checkboxGroupMap.has(groupKey)) {
              checkboxGroupMap.set(groupKey, []);
            }
            checkboxGroupMap.get(groupKey)!.push(cb);
          } else {
            // Standalone Checkbox
            fields.push({
              id: cb.id || (cb instanceof HTMLInputElement ? cb.name : "") || `checkbox_${fields.length}`,
              name: (cb instanceof HTMLInputElement ? cb.name : "") || cb.id || "",
              type: "checkbox",
              label: getOptionLabel(cb) || getLabelText(cb) || "Checkbox",
              placeholder: "",
              required: (cb instanceof HTMLInputElement && cb.required) || cb.getAttribute("aria-required") === "true",
              options: ["Yes", "No"],
              multiple: false,
              optionsMode: 'strict',
              elementSelector: getUniqueSelector(cb),
              alreadyFilled: isElementFilled(cb),
            });
          }
        });

        // Process grouped checkboxes
        checkboxGroupMap.forEach((groupCbs, groupKey) => {
          const firstCb = groupCbs[0];
          const groupName = firstCb instanceof HTMLInputElement ? firstCb.name : "";
          const questionLabel = getGroupQuestionLabel(groupCbs);

          const options = filterJunkOptions(
            Array.from(new Set(
              groupCbs
                .map(c => getOptionLabel(c))
                .filter(text => text.length > 0)
            ))
          );

          const isRequired = groupCbs.some(c =>
            (c instanceof HTMLInputElement && c.required) || c.getAttribute("aria-required") === "true"
          );

          const alreadyFilled = groupCbs.some(c =>
            (c instanceof HTMLInputElement && c.checked) || c.getAttribute("aria-checked") === "true"
          );

          let selector = "";
          if (groupName) {
            selector = `input[name="${cssAttrEscape(groupName)}"]`;
          } else {
            selector = getUniqueSelector(firstCb);
          }

          fields.push({
            id: firstCb.id || groupName || `checkbox_group_${fields.length}`,
            name: groupName || firstCb.id || "",
            type: "checkbox",
            label: questionLabel || getLabelText(firstCb) || "Multiple Choice Question",
            placeholder: "",
            required: isRequired,
            options: options.length > 0 ? options : undefined,
            multiple: true,
            optionsMode: 'strict',
            elementSelector: selector,
            alreadyFilled: alreadyFilled,
          });
        });

        // -------------------------------------------------------------------
        // 3. Standard Inputs (text, email, tel, number, file, date, typeahead comboboxes)
        // -------------------------------------------------------------------
        const standardInputs = visibleInputs.filter(i => i.type !== 'radio' && i.type !== 'checkbox');
        for (const input of standardInputs) {
          const skipTypes = ['button', 'submit', 'reset', 'image', 'hidden'];
          if (skipTypes.includes(input.type)) continue;

          let normalizedType = input.type || "text";
          if (
            input.getAttribute("role") === "combobox" ||
            input.classList.contains("select__input") ||
            input.getAttribute("aria-haspopup") === "true" ||
            input.getAttribute("aria-haspopup") === "listbox"
          ) {
            normalizedType = "select";
          }

          let options: string[] | undefined = undefined;
          let optionsMode: 'strict' | 'dynamic' | undefined = undefined;
          let multiple: boolean | undefined = undefined;

          if (normalizedType === "select") {
            let parent = input.parentElement;
            let selectEl: HTMLSelectElement | null = null;
            let depth = 0;
            while (parent && !selectEl && depth < 6) {
              selectEl = parent.querySelector("select");
              if (!selectEl) {
                parent = parent.parentElement;
                depth++;
              }
            }

            if (!selectEl) {
              const inputIdentifier = (input.id || input.name || "").replace(/-(input|select|hidden|wrap|control)/g, "").toLowerCase().trim();
              if (inputIdentifier) {
                selectEl = Array.from(document.querySelectorAll("select")).find(s => {
                  const selectIdentifier = (s.id || s.name || "").toLowerCase().trim();
                  return selectIdentifier.includes(inputIdentifier) || inputIdentifier.includes(selectIdentifier);
                }) || null;
              }
            }

            multiple = isMultiValueField(input, selectEl);

            if (selectEl) {
              options = filterJunkOptions(
                Array.from(selectEl.options)
                  .map(opt => opt.text.trim())
                  .filter(text => text.length > 0)
              );
              optionsMode = 'strict';
            } else {
              const ariaAutocomplete = input.getAttribute('aria-autocomplete');
              const looksLikeTypeahead = ariaAutocomplete === 'list' || ariaAutocomplete === 'both';

              let scrapedOptions: string[] = [];
              try {
                const result = await openDropdownAndLocateOptions(input);
                scrapedOptions = result.options;
              } catch (e) {
                console.warn("Failed to open combobox to read options", e);
              } finally {
                await closeDropdown(input);
              }

              if (scrapedOptions.length > 0) {
                options = scrapedOptions;
              }
              optionsMode = (looksLikeTypeahead || scrapedOptions.length === 0) ? 'dynamic' : 'strict';
            }
          }

          fields.push({
            id: input.id || "",
            name: input.name || "",
            type: normalizedType,
            label: getLabelText(input),
            placeholder: input.placeholder || "",
            required: input.required || input.getAttribute("aria-required") === "true",
            options: options,
            multiple: multiple,
            optionsMode: optionsMode,
            elementSelector: getUniqueSelector(input),
            alreadyFilled: isElementFilled(input),
          });
        }

        // -------------------------------------------------------------------
        // 4. Textareas
        // -------------------------------------------------------------------
        visibleTextareas.forEach((textarea) => {
          fields.push({
            id: textarea.id || "",
            name: textarea.name || "",
            type: "textarea",
            label: getLabelText(textarea),
            placeholder: textarea.placeholder || "",
            required: textarea.required || textarea.getAttribute("aria-required") === "true",
            elementSelector: getUniqueSelector(textarea),
            alreadyFilled: isElementFilled(textarea),
          });
        });

        // -------------------------------------------------------------------
        // 5. Native Select Dropdowns
        // -------------------------------------------------------------------
        visibleSelects.forEach((select) => {
          const options = filterJunkOptions(
            Array.from(select.options)
              .map(opt => opt.text.trim())
              .filter(text => text.length > 0)
          );

          fields.push({
            id: select.id || "",
            name: select.name || "",
            type: "select",
            label: getLabelText(select),
            placeholder: "",
            required: select.required || select.getAttribute("aria-required") === "true",
            options: options,
            multiple: isMultiValueField(select),
            optionsMode: 'strict',
            elementSelector: getUniqueSelector(select),
            alreadyFilled: isElementFilled(select),
          });
        });

        // -------------------------------------------------------------------
        // 6. Generic Custom Dropdown Triggers
        // -------------------------------------------------------------------
        const genericTriggers = getGenericDropdownTriggers();
        for (const trigger of genericTriggers) {
          let options: string[] | undefined = undefined;
          try {
            const result = await openDropdownAndLocateOptions(trigger);
            if (result.options.length > 0) {
              options = result.options;
            }
          } catch (e) {
            console.warn("Failed to open generic dropdown to read options", e);
          } finally {
            await closeDropdown(trigger);
          }

          fields.push({
            id: trigger.id || "",
            name: trigger.getAttribute("name") || "",
            type: "select",
            label: getLabelText(trigger),
            placeholder: "",
            required: trigger.getAttribute("aria-required") === "true",
            options: options,
            multiple: isMultiValueField(trigger),
            optionsMode: (options && options.length > 0) ? 'strict' : 'dynamic',
            elementSelector: getUniqueSelector(trigger),
            alreadyFilled: isElementFilled(trigger),
          });
        }

        // Sort fields by DOM document position so the AI sees the natural top-down form order
        fields.sort((a, b) => {
          const elA = resolveElement(a.elementSelector);
          const elB = resolveElement(b.elementSelector);
          if (elA && elB) {
            const pos = elA.compareDocumentPosition(elB);
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
          }
          return 0;
        });

        const response: AnalysisResponse = {
          url: window.location.href,
          title: document.title || "No Title",
          inputsCount: standardInputs.length + radioGroupMap.size + checkboxGroupMap.size,
          textareasCount: visibleTextareas.length,
          selectsCount: visibleSelects.length + genericTriggers.length,
          fields: fields,
        };

        sendResponse(response);
      } catch (error) {
        console.error("Error extracting fields:", error);
        sendResponse({
          error: error instanceof Error ? error.message : "Failed to extract form fields"
        });
      }
    })();
    return true; // async response

  } else if (request.action === "UPLOAD_FILE") {
    try {
      const { selector, fileData, fileName } = request;
      const targetEl = resolveElement(selector);
      if (!targetEl) {
        sendResponse({ error: `Target element not found for selector: ${selector}` });
        return false;
      }

      let input: HTMLInputElement | null = null;
      if (targetEl instanceof HTMLInputElement && targetEl.type === 'file') {
        input = targetEl;
      } else {
        // If selector targeted a container/dropzone/label/button, find the associated file input
        input = targetEl.querySelector('input[type="file"]') as HTMLInputElement | null;
        if (!input && targetEl.parentElement) {
          input = targetEl.parentElement.querySelector('input[type="file"]') as HTMLInputElement | null;
        }
        if (!input && targetEl.id) {
          input = document.querySelector(`input[type="file"][id="${cssAttrEscape(targetEl.id)}"]`) as HTMLInputElement | null;
        }
        if (!input) {
          const forId = targetEl.getAttribute('for');
          if (forId) {
            input = document.querySelector(`input[type="file"][id="${cssAttrEscape(forId)}"]`) as HTMLInputElement | null;
          }
        }
      }

      if (!input) {
        sendResponse({ error: `File input element not found for selector: ${selector}` });
        return false;
      }

      const base64Parts = fileData.split(',');
      const base64Data = base64Parts.length > 1 ? base64Parts[1] : fileData;

      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      let mimeType = "application/pdf";
      const match = fileData.match(/^data:(.*);base64,/);
      if (match) {
        mimeType = match[1];
      } else if (fileName?.endsWith('.docx')) {
        mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (fileName?.endsWith('.doc')) {
        mimeType = "application/msword";
      }

      const blob = new Blob([bytes], { type: mimeType });
      const file = new File([blob], fileName || "resume.pdf", { type: mimeType, lastModified: Date.now() });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;

      input.focus?.();
      input.dispatchEvent(new FocusEvent('focus', { bubbles: false, cancelable: false, view: window }));
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true, cancelable: false, view: window }));
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, cancelable: false, view: window }));
      input.dispatchEvent(new FocusEvent('blur', { bubbles: false, cancelable: false, view: window }));
      input.blur?.();

      sendResponse({ success: true });
    } catch (err) {
      console.error("Error during programmatic file upload:", err);
      sendResponse({ error: err instanceof Error ? err.message : String(err) });
    }
  }
  return false;
});

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
async function fillSingleField(
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
            element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            await sleep(50);
            await closeDropdown(element);
            element.blur();
            return { success: true, note: "No option list rendered; confirmed typed value via Enter." };
          }
          continue;
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "FILL_FIELD") {
    const { selector, fillAction, value, optionsMode } = request;
    fillSingleField(selector, fillAction, value, optionsMode).then(sendResponse);
    return true; // async response

  } else if (request.action === "FILL_ALL_FIELDS") {
    (async () => {
      const items: Array<{ selector: string; fillAction: string; value: any; label?: string; optionsMode?: 'strict' | 'dynamic' }> =
        request.fields || [];
      const results: Array<{ selector: string; label?: string; success: boolean; error?: string; note?: string }> = [];

      for (const item of items) {
        const result = await fillSingleField(item.selector, item.fillAction, item.value, item.optionsMode);
        results.push({ selector: item.selector, label: item.label, ...result });
        await sleep(80);
      }

      const successCount = results.filter(r => r.success).length;
      sendResponse({
        results,
        successCount,
        failureCount: results.length - successCount,
      });
    })();
    return true; // async response
  }

  return false; // not a message this listener handles
});