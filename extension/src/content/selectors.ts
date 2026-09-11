/**
 * Escapes a value for safe use inside a double-quoted CSS attribute selector,
 * e.g. [id="VALUE"]. Only backslash and double-quote need escaping here —
 * unlike CSS.escape() used with '#id' selectors, this does NOT need to escape
 * '[', ']', '.', ':' etc, which keeps the resulting selector far less fragile
 * if it gets copied/retyped by other code (e.g. an LLM re-deriving a selector
 * from the plain "id"/"name" fields instead of using elementSelector as-is).
 */
export function cssAttrEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Generates a unique CSS selector path to select this exact element again
 */
export function getUniqueSelector(element: HTMLElement): string {
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

/**
 * Resolves an element from a selector string that was handed to us from
 * outside the page (e.g. a stored elementSelector, or one an LLM reconstructed
 * from a field's id/name). document.querySelector() throws a hard exception
 * on any malformed selector — a single unescaped '[' from an id like
 * "question_123[]" is enough to kill the whole FILL_FIELD/UPLOAD_FILE call.
 * This wraps that lookup and falls back to getElementById / getElementsByName
 * when the selector string itself isn't valid CSS.
 */
export function resolveElement(selector: string): HTMLElement | null {
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
