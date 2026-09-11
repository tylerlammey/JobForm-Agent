export function sleep(ms: number): Promise<void> {
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
export function setNativeInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
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
export function simulateInputLifecycle(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
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
export function setNativeCheckboxChecked(input: HTMLInputElement, checked: boolean) {
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
export function simulateCheckboxToggle(targetEl: HTMLElement, desiredChecked: boolean) {
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
