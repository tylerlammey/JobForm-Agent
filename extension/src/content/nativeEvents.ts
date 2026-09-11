export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Sets an input/textarea's value in a way that React (and similar frameworks) actually detect.
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

// Fully simulates the user typing lifecycle for an input or textarea element.
export function simulateInputLifecycle(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.focus?.();
  input.dispatchEvent(new FocusEvent('focus', { bubbles: false, cancelable: false, view: window }));
  input.dispatchEvent(new FocusEvent('focusin', { bubbles: true, cancelable: false, view: window }));

  setNativeInputValue(input, value);

  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Unidentified' }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Unidentified' }));

  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, cancelable: false, view: window }));
  input.dispatchEvent(new FocusEvent('blur', { bubbles: false, cancelable: false, view: window }));
  input.blur?.();
}

// Sets a checkbox's checked state via native prototype descriptor to bypass React/Vue value trackers.
export function setNativeCheckboxChecked(input: HTMLInputElement, checked: boolean) {
  const proto = HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'checked')?.set;
  if (nativeSetter) {
    nativeSetter.call(input, checked);
  } else {
    input.checked = checked;
  }
}

// Fully simulates checkbox user interaction lifecycle.
export function simulateCheckboxToggle(targetEl: HTMLElement, desiredChecked: boolean) {
  targetEl.focus?.();
  targetEl.dispatchEvent(new FocusEvent('focus', { bubbles: false, cancelable: false, view: window }));
  targetEl.dispatchEvent(new FocusEvent('focusin', { bubbles: true, cancelable: false, view: window }));

  if (targetEl instanceof HTMLInputElement) {
    const isCurrentlyChecked = targetEl.checked;

    if (isCurrentlyChecked !== desiredChecked) {
      setNativeCheckboxChecked(targetEl, desiredChecked);

      targetEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

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
    targetEl.setAttribute('aria-checked', desiredChecked ? 'true' : 'false');
    targetEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    targetEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    targetEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }

  targetEl.dispatchEvent(new FocusEvent('focusout', { bubbles: true, cancelable: false, view: window }));
  targetEl.dispatchEvent(new FocusEvent('blur', { bubbles: false, cancelable: false, view: window }));
  targetEl.blur?.();
}
