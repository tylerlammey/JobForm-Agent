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

  // Exemption: custom combobox inputs/triggers can be opacity 0 or 0px width/height by style design
  const isDropdownOrCombobox =
    el.getAttribute("role") === "combobox" ||
    el.classList.contains("select__input") ||
    el.getAttribute("aria-haspopup") === "true" ||
    el.getAttribute("aria-haspopup") === "listbox" ||
    el.classList.contains("select__control") ||
    el.classList.contains("select2-selection") ||
    el.classList.contains("ng-select-container");

  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  // If not a dropdown control, filter out opacity 0
  if (!isDropdownOrCombobox && style.opacity === '0') {
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
  const isCheckable = el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');
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
    if (el.type === 'checkbox' || el.type === 'radio') {
      return el.checked;
    }
    if (el.type === 'file') {
      return el.files !== null && el.files.length > 0;
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
 * Resolves a human-readable label for a target element.
 * Widened to accept any HTMLElement (not just input/textarea/select) so it
 * also works for div/button-based dropdown triggers.
 */
function getLabelText(element: HTMLElement): string {
  const clean = (text: string | null) => text ? text.trim().replace(/\s+/g, ' ') : "";

  // 1. Explicit HTML label targeting ID
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label && label.textContent) {
      return clean(label.textContent);
    }
  }

  // 2. Implicit HTML label parent wrapper
  const parentLabel = element.closest('label');
  if (parentLabel && parentLabel.textContent) {
    return clean(parentLabel.textContent);
  }

  // 3. Accessible attributes (aria-label or aria-labelledby)
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return clean(ariaLabel);
  }

  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    // aria-labelledby can reference multiple space-separated ids
    const text = ariaLabelledBy
      .split(/\s+/)
      .map(id => document.getElementById(id)?.textContent || "")
      .join(' ');
    if (text.trim()) return clean(text);
  }

  // 4. Placeholder text fallback (inputs/textareas only)
  if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.placeholder) {
    return clean(element.placeholder);
  }

  // 5. Preceding Sibling text search (like Workday's tables/grids)
  const parent = element.parentElement;
  if (parent) {
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === 'LABEL' || sibling.classList.contains('label') || sibling.classList.contains('title')) {
        if (sibling.textContent) return clean(sibling.textContent);
      }
      sibling = sibling.previousElementSibling;
    }

    const prevText = parent.previousElementSibling?.textContent;
    if (prevText) {
      return clean(prevText);
    }
  }

  // 6. Name attribute fallback (inputs/textareas/selects only)
  if ('name' in element && (element as HTMLInputElement).name) {
    return clean((element as HTMLInputElement).name);
  }

  // 7. Last resort for non-form elements (div/button triggers): own visible text,
  // but only if short (long text usually means we grabbed a wrapping container by mistake)
  const ownText = clean(element.textContent);
  if (ownText && ownText.length < 80) {
    return ownText;
  }

  return "";
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
  '[aria-haspopup="true"][role="button"]',
  '.select__control',      // react-select
  '.select2-selection',    // select2
  '.chosen-single',        // chosen.js
  '.ng-select-container',  // ng-select
].join(', ');

const OPTION_ELEMENT_SELECTOR = '[role="option"], li[id*="option" i], [class*="option" i], [class*="-item" i]';

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
  input.dispatchEvent(new Event('input', { bubbles: true }));
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

        // Extract Inputs
        for (const input of visibleInputs) {
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
            // 1. Climb up to 6 parent levels to find any wrapped or sibling native select
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

            // 2. Global fallback: Match by similar name or ID substrings if not found locally
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
              // A backing native <select> exists, so we truly have the complete,
              // closed list of choices — safe to tell the backend it's "strict".
              options = filterJunkOptions(
                Array.from(selectEl.options)
                  .map(opt => opt.text.trim())
                  .filter(text => text.length > 0)
              );
              optionsMode = 'strict';
            } else {
              // 3. No backing native <select> exists (common for React-Select/custom
              //    widgets) — the only way to know the options is to open it live.
              // aria-autocomplete on the input is the standard signal that this is a
              // typeahead field (type to search) rather than a fixed click-to-pick list.
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
              // Empty after filtering junk (e.g. only a "Loading..." placeholder was
              // ever rendered) is itself a strong sign this needed a typed query first.
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

        // Extract Textareas
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

        // Extract native Select dropdowns
        visibleSelects.forEach((select) => {
          // A native <select> is always the complete, closed list of choices.
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

        // Extract custom dropdown triggers that have NO backing <input>/<select>
        // at all (plain div/button comboboxes) — these were previously invisible
        // to the extractor entirely.
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
            // A plain div/button trigger doesn't support typing, so if we got a
            // rendered list it's the real (closed) set of choices. If nothing
            // rendered, we genuinely don't know — flag as dynamic rather than
            // implying an exhaustive-but-empty list.
            optionsMode: (options && options.length > 0) ? 'strict' : 'dynamic',
            elementSelector: getUniqueSelector(trigger),
            alreadyFilled: isElementFilled(trigger),
          });
        }

        const response: AnalysisResponse = {
          url: window.location.href,
          title: document.title || "No Title",
          inputsCount: visibleInputs.length,
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
      const input = resolveElement(selector) as HTMLInputElement | null;
      if (!input) {
        sendResponse({ error: `Input element not found for selector: ${selector}` });
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
      }

      const blob = new Blob([bytes], { type: mimeType });
      const file = new File([blob], fileName, { type: mimeType });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;

      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      sendResponse({ success: true });
    } catch (err) {
      console.error("Error during programatic file upload:", err);
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

  // Prevent overwriting if already filled/selected by the user
  if (isElementFilled(element)) {
    return { success: true, note: "Field already has a value, skipping write to prevent overwrite." };
  }

  try {
    if (fillAction === "type") {
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      input.focus();
      setNativeInputValue(input, String(value));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
      return { success: true };

    } else if (fillAction === "check") {
      const input = element as HTMLInputElement;
      const checkState = value === "true" || value === true;
      if (input.checked !== checkState) {
        input.click();
      }
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
          element.dispatchEvent(new Event('change', { bubbles: true }));
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
            // Nothing rendered even after typing — the typed value is still in
            // the field, so confirm it via Enter as a last resort (works for
            // free-typed comboboxes that don't require picking from a list).
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
          await sleep(100); // Wait for framework state to register click
          clickedAny = true;
        }
      }

      await closeDropdown(element);
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
    // Fills a whole batch of fields in one call. Crucially, a failure on any
    // one field does NOT stop the rest — fillSingleField always resolves to a
    // result object rather than throwing, so every field in the list gets
    // attempted regardless of what happened to the ones before it. The caller
    // gets back a full per-field report to see what actually went in.
    (async () => {
      const items: Array<{ selector: string; fillAction: string; value: any; label?: string; optionsMode?: 'strict' | 'dynamic' }> =
        request.fields || [];
      const results: Array<{ selector: string; label?: string; success: boolean; error?: string; note?: string }> = [];

      for (const item of items) {
        const result = await fillSingleField(item.selector, item.fillAction, item.value, item.optionsMode);
        results.push({ selector: item.selector, label: item.label, ...result });
        // Small breather between fields so rapid-fire DOM/framework events
        // from one field don't collide with the next one starting.
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