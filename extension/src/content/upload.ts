import { resolveElement, cssAttrEscape } from "./selectors";

/**
 * Programmatically attaches a base64-encoded file to a file input for the
 * UPLOAD_FILE message, synthesizing a DataTransfer since file inputs can't be
 * assigned a File object's list directly.
 */
export function uploadFile(selector: string, fileData: string, fileName: string): { success?: true; error?: string } {
  try {
    const targetEl = resolveElement(selector);
    if (!targetEl) {
      return { error: `Target element not found for selector: ${selector}` };
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
      return { error: `File input element not found for selector: ${selector}` };
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

    return { success: true };
  } catch (err) {
    console.error("Error during programmatic file upload:", err);
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
