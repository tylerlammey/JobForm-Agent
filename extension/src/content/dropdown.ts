// ---------------------------------------------------------------------------
// Custom dropdown handling
//
// A lot of ATS platforms (Greenhouse, Workday, iCIMS, SuccessFactors, React-Select
// based forms, etc.) implement dropdowns with no native <select> at all, and often
// no <input> either — just a <div>/<button> that opens a floating option list on
// click. There is no way to know their options without actually opening them, so
// both extraction and filling need to do a live "open, read, close" dance.
// ---------------------------------------------------------------------------
import { isElementVisible, isInsideNavigationOrHeaderFooter } from "./visibility";
import { filterJunkOptions } from "./junkOptions";
import { sleep, setNativeInputValue } from "./nativeEvents";

export const DROPDOWN_TRIGGER_SELECTOR = [
  '[role="combobox"]',
  '[aria-haspopup="listbox"]',
  '.select__control',      // react-select
  '.select2-selection',    // select2
  '.chosen-single',        // chosen.js
  '.ng-select-container',  // ng-select
].join(', ');

export const OPTION_ELEMENT_SELECTOR = [
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

/**
 * Detects whether a field accepts multiple selected values. The `[]` suffix on
 * id/name is the standard convention (used by Greenhouse and many Rails-style
 * ATS forms) for array-valued fields like multi-select security clearances.
 */
export function isMultiValueField(el: HTMLElement, backingSelect?: HTMLSelectElement | null): boolean {
  if (backingSelect?.multiple) return true;
  if (el instanceof HTMLSelectElement && el.multiple) return true;
  if (el.getAttribute('aria-multiselectable') === 'true') return true;
  const idOrName = el.id || (el as HTMLInputElement).name || '';
  return /\[\]\s*$/.test(idOrName);
}

export function snapshotVisibleOptionElements(): Set<HTMLElement> {
  return new Set(
    (Array.from(document.querySelectorAll(OPTION_ELEMENT_SELECTOR)) as HTMLElement[]).filter(isElementVisible)
  );
}

export function extractOptionTexts(optionElements: HTMLElement[]): string[] {
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
export async function waitForOptionElements(
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
export function getGenericDropdownTriggers(): HTMLElement[] {
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
export async function openDropdownAndLocateOptions(
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
export async function typeIntoComboboxAndLocateOptions(
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

export function isDropdownOpen(trigger: HTMLElement): boolean {
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
export async function closeDropdown(trigger: HTMLElement): Promise<void> {
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
