// Escapes a value for safe use inside a double-quoted CSS attribute selector.
export function cssAttrEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Generates a unique CSS selector path to select this exact element again.
export function getUniqueSelector(element: HTMLElement): string {
  if (element.id) {
    return `[id="${cssAttrEscape(element.id)}"]`;
  }

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

  if (element instanceof HTMLInputElement && element.name) {
    return `input[name="${cssAttrEscape(element.name)}"]`;
  }
  if (element instanceof HTMLTextAreaElement && element.name) {
    return `textarea[name="${cssAttrEscape(element.name)}"]`;
  }
  if (element instanceof HTMLSelectElement && element.name) {
    return `select[name="${cssAttrEscape(element.name)}"]`;
  }

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

// Resolves an element from a selector string that was handed to us from outside the page.
export function resolveElement(selector: string): HTMLElement | null {
  try {
    return document.querySelector(selector) as HTMLElement | null;
  } catch (e) {
    console.warn("Selector was invalid, attempting fallback resolution:", selector, e);

    const hashMatch = selector.match(/^#(.+)$/);
    if (hashMatch) {
      const rawId = hashMatch[1];
      const byId = document.getElementById(rawId);
      if (byId) return byId;
      const idMatch = (Array.from(document.querySelectorAll('[id]')) as HTMLElement[])
        .find(el => el.id === rawId);
      if (idMatch) return idMatch;
    }

    const idAttrMatch = selector.match(/\[id="((?:[^"\\]|\\.)*)"\]/);
    if (idAttrMatch) {
      const rawId = idAttrMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const byId = document.getElementById(rawId);
      if (byId) return byId;
    }

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
