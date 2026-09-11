import { isJunkOptionText } from "./junkOptions";

/**
 * Resolves the option-specific label for a single radio or checkbox element
 */
export function getOptionLabel(element: HTMLElement): string {
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
export function getGroupQuestionLabel(elements: HTMLElement[], container?: HTMLElement | null): string {
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
export function getLabelText(element: HTMLElement): string {
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
