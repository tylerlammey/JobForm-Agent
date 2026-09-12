import { isJunkOptionText } from "./junkOptions";

// Resolves the option-specific label for a single radio or checkbox element.
export function getOptionLabel(element: HTMLElement): string {
  const clean = (text: string | null) => text ? text.trim().replace(/\s+/g, ' ') : "";

  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label && label.textContent) {
      const text = clean(label.textContent);
      if (text) return text;
    }
  }

  const parentLabel = element.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, select, textarea, button').forEach(c => c.remove());
    const text = clean(clone.textContent);
    if (text) return text;
  }

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

  if (element instanceof HTMLInputElement && element.value && !['on', 'true', 'false', '1', '0', ''].includes(element.value.toLowerCase())) {
    return clean(element.value);
  }

  return "";
}

// Resolves the overarching question text for a multiple choice group (radio group or checkbox group).
export function getGroupQuestionLabel(elements: HTMLElement[], container?: HTMLElement | null): string {
  const clean = (text: string | null) => text ? text.trim().replace(/\s+/g, ' ') : "";

  const firstEl = elements[0];
  const fieldset = firstEl?.closest('fieldset') || container?.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend && legend.textContent) {
      const text = clean(legend.textContent);
      if (text) return text;
    }
  }

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

  const knownOptionLabels = elements.map(el => getOptionLabel(el).toLowerCase().trim()).filter(Boolean);

  let currentParent = firstEl?.parentElement;
  let depth = 0;
  while (currentParent && depth < 6) {
    const candidates = Array.from(currentParent.querySelectorAll(
      'legend, [data-automation-id="formLabel"], label, h1, h2, h3, h4, h5, h6, [class*="label" i], [class*="title" i], [class*="question" i]'
    )) as HTMLElement[];

    for (const cand of candidates) {
      const isOptionLabel = elements.some(el => {
        return cand.contains(el) || (el.id && cand.getAttribute('for') === el.id);
      });
      if (isOptionLabel) continue;

      const forId = cand.getAttribute('for');
      if (forId && !elements.some(el => el.id === forId)) {
        continue;
      }

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

    let prevSibling = currentParent.previousElementSibling;
    while (prevSibling) {
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

  if (firstEl instanceof HTMLInputElement && firstEl.name) {
    return clean(firstEl.name);
  }
  return firstEl ? getLabelText(firstEl) : "";
}

// Resolves a human-readable label for a target element.
export function getLabelText(element: HTMLElement): string {
  const clean = (text: string | null) => text ? text.trim().replace(/\s+/g, ' ') : "";

  let resolved = "";

  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label && label.textContent) {
      resolved = clean(label.textContent);
    }
  }

  if (!resolved) {
    const parentLabel = element.closest('label');
    if (parentLabel && parentLabel.textContent) {
      resolved = clean(parentLabel.textContent);
    }
  }

  if (!resolved) {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      resolved = clean(ariaLabel);
    }
  }

  if (!resolved) {
    const ariaLabelledBy = element.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const text = ariaLabelledBy
        .split(/\s+/)
        .map(id => document.getElementById(id)?.textContent || "")
        .join(' ');
      if (text.trim()) resolved = clean(text);
    }
  }

  if (!resolved && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.placeholder) {
    resolved = clean(element.placeholder);
  }

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

  if (!resolved && 'name' in element && (element as HTMLInputElement).name) {
    resolved = clean((element as HTMLInputElement).name);
  }

  if (!resolved) {
    const ownText = clean(element.textContent);
    if (ownText && ownText.length < 80) {
      resolved = ownText;
    }
  }

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

  const dateSubTokens = ["month", "day", "year", "mm", "dd", "yyyy", "m", "d", "yr"];
  if (resolved && dateSubTokens.includes(resolved.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
    let parentLabelText = "";

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
