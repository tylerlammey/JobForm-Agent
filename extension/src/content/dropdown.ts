import { isElementVisible, isInsideNavigationOrHeaderFooter } from "./visibility";
import { filterJunkOptions } from "./junkOptions";
import { sleep, setNativeInputValue } from "./nativeEvents";

export const DROPDOWN_TRIGGER_SELECTOR = [
  '[role="combobox"]',
  '[aria-haspopup="listbox"]',
  '.select__control',
  '.select2-selection',
  '.chosen-single',
  '.ng-select-container',
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

// Detects whether a field accepts multiple selected values.
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

// Polls for an option list to appear/settle after some action.
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

// Finds top-level custom dropdown triggers.
export function getGenericDropdownTriggers(): HTMLElement[] {
  const candidates = Array.from(document.querySelectorAll(DROPDOWN_TRIGGER_SELECTOR)) as HTMLElement[];

  return candidates.filter((el) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      return false;
    }
    if (!isElementVisible(el)) return false;
    if (isInsideNavigationOrHeaderFooter(el)) return false;

    if (el.querySelector('input, select, textarea')) return false;

    const isNested = candidates.some(other => other !== el && other.contains(el) && isElementVisible(other));
    if (isNested) return false;

    return true;
  });
}

// Opens a dropdown trigger, waits for its option list to render, and returns the options.
export async function openDropdownAndLocateOptions(
  trigger: HTMLElement,
  timeoutMs: number = 600
): Promise<{ options: string[]; optionElements: HTMLElement[] }> {
  const before = snapshotVisibleOptionElements();

  trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  trigger.focus?.();
  trigger.click();

  const optionElements = await waitForOptionElements(trigger, before, timeoutMs);
  return { options: extractOptionTexts(optionElements), optionElements };
}

// For typeahead/search comboboxes, types the target value into the input and reads whatever results rendered.
export async function typeIntoComboboxAndLocateOptions(
  input: HTMLInputElement,
  query: string,
  timeoutMs: number = 1000
): Promise<{ options: string[]; optionElements: HTMLElement[] }> {
  const before = snapshotVisibleOptionElements();

  input.focus();
  setNativeInputValue(input, '');
  await sleep(30);
  setNativeInputValue(input, query);
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

  const optionElements = await waitForOptionElements(input, before, timeoutMs);
  return { options: extractOptionTexts(optionElements), optionElements };
}

export function isDropdownOpen(trigger: HTMLElement): boolean {
  const expanded = trigger.getAttribute('aria-expanded');
  if (expanded === 'true') return true;
  if (expanded === 'false') return false;

  const hasOpenClass = trigger.classList.contains('open') ||
    trigger.classList.contains('active') ||
    trigger.classList.contains('is-open') ||
    trigger.classList.contains('select__control--menu-is-open');
  if (hasOpenClass) return true;

  const controlsId = trigger.getAttribute('aria-controls') || trigger.getAttribute('aria-owns');
  if (controlsId) {
    const container = document.getElementById(controlsId);
    if (container && isElementVisible(container)) {
      return true;
    }
  }

  return false;
}

// Closes an open dropdown progressively without submitting anything and releases focus.
export async function closeDropdown(trigger: HTMLElement): Promise<void> {
  try {
    await sleep(100);

    if (!isDropdownOpen(trigger)) return;

    const escInit = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
    trigger.dispatchEvent(new KeyboardEvent('keydown', escInit));
    trigger.dispatchEvent(new KeyboardEvent('keypress', escInit));
    trigger.dispatchEvent(new KeyboardEvent('keyup', escInit));
    await sleep(50);
    if (!isDropdownOpen(trigger)) return;

    const eventInit = { bubbles: true, cancelable: true, view: window };
    document.body.dispatchEvent(new MouseEvent('mousedown', eventInit));
    document.body.dispatchEvent(new MouseEvent('mouseup', eventInit));
    document.body.click();
    await sleep(50);
    if (!isDropdownOpen(trigger)) return;

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
    try {
      trigger.blur?.();
    } catch (e) {
      console.error("Error blurring trigger element:", e);
    }
  }
}
