import type { ExtractedField, AnalysisResponse } from "./types";
import { isElementVisible, isElementFilled } from "./visibility";
import { getOptionLabel, getGroupQuestionLabel, getLabelText } from "./labels";
import { cssAttrEscape, getUniqueSelector, resolveElement } from "./selectors";
import { filterJunkOptions } from "./junkOptions";
import { isMultiValueField, getGenericDropdownTriggers, openDropdownAndLocateOptions, closeDropdown } from "./dropdown";

// Scans the current page's form fields and builds the AnalysisResponse sent back to the popup.
export async function analyzePage(): Promise<AnalysisResponse | { error: string }> {
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

    const radioInputs = visibleInputs.filter(i => i.type === 'radio');
    const customRadios = (Array.from(document.querySelectorAll('[role="radio"]')) as HTMLElement[]).filter(isElementVisible);
    const allRadios: HTMLElement[] = [...radioInputs, ...customRadios.filter(r => !(r instanceof HTMLInputElement))];

    const radioGroupMap = new Map<string, HTMLElement[]>();
    allRadios.forEach(radio => {
      let groupKey = "";
      if (radio instanceof HTMLInputElement && radio.name) {
        groupKey = `name:${radio.name}`;
      } else {
        const groupContainer = radio.closest('fieldset, [role="radiogroup"], .form-group, .field, [class*="question"]') || radio.parentElement;
        groupKey = groupContainer ? `container:${getUniqueSelector(groupContainer as HTMLElement)}` : `radio:${getUniqueSelector(radio)}`;
      }
      if (!radioGroupMap.has(groupKey)) {
        radioGroupMap.set(groupKey, []);
      }
      radioGroupMap.get(groupKey)!.push(radio);
    });

    radioGroupMap.forEach((groupRadios, groupKey) => {
      const firstRadio = groupRadios[0];
      const groupName = firstRadio instanceof HTMLInputElement ? firstRadio.name : "";
      const questionLabel = getGroupQuestionLabel(groupRadios);

      const options = filterJunkOptions(
        Array.from(new Set(
          groupRadios
            .map(r => getOptionLabel(r))
            .filter(text => text.length > 0)
        ))
      );

      const isRequired = groupRadios.some(r =>
        (r instanceof HTMLInputElement && r.required) || r.getAttribute("aria-required") === "true"
      );

      const alreadyFilled = groupRadios.some(r =>
        (r instanceof HTMLInputElement && r.checked) || r.getAttribute("aria-checked") === "true"
      );

      let selector = "";
      if (groupName) {
        selector = `input[name="${cssAttrEscape(groupName)}"]`;
      } else {
        selector = getUniqueSelector(firstRadio);
      }

      fields.push({
        id: firstRadio.id || groupName || `radio_group_${fields.length}`,
        name: groupName || firstRadio.id || "",
        type: "radio",
        label: questionLabel || getLabelText(firstRadio) || "Multiple Choice Question",
        placeholder: "",
        required: isRequired,
        options: options.length > 0 ? options : undefined,
        multiple: false,
        optionsMode: 'strict',
        elementSelector: selector,
        alreadyFilled: alreadyFilled,
      });
    });

    const checkboxInputs = visibleInputs.filter(i => i.type === 'checkbox');
    const customCheckboxes = (Array.from(document.querySelectorAll('[role="checkbox"]')) as HTMLElement[]).filter(isElementVisible);
    const allCheckboxes: HTMLElement[] = [...checkboxInputs, ...customCheckboxes.filter(c => !(c instanceof HTMLInputElement))];

    const checkboxGroupMap = new Map<string, HTMLElement[]>();
    allCheckboxes.forEach(cb => {
      let groupKey = "";
      if (cb instanceof HTMLInputElement && cb.name && (cb.name.endsWith("[]") || isMultiValueField(cb))) {
        groupKey = `name:${cb.name}`;
      } else {
        const container = cb.closest('fieldset, [role="group"], .form-group, .field, [class*="question"]');
        if (container) {
          const countInContainer = container.querySelectorAll('input[type="checkbox"], [role="checkbox"]').length;
          if (countInContainer > 1) {
            groupKey = `container:${getUniqueSelector(container as HTMLElement)}`;
          }
        }
      }

      if (groupKey) {
        if (!checkboxGroupMap.has(groupKey)) {
          checkboxGroupMap.set(groupKey, []);
        }
        checkboxGroupMap.get(groupKey)!.push(cb);
      } else {
        fields.push({
          id: cb.id || (cb instanceof HTMLInputElement ? cb.name : "") || `checkbox_${fields.length}`,
          name: (cb instanceof HTMLInputElement ? cb.name : "") || cb.id || "",
          type: "checkbox",
          label: getOptionLabel(cb) || getLabelText(cb) || "Checkbox",
          placeholder: "",
          required: (cb instanceof HTMLInputElement && cb.required) || cb.getAttribute("aria-required") === "true",
          options: ["Yes", "No"],
          multiple: false,
          optionsMode: 'strict',
          elementSelector: getUniqueSelector(cb),
          alreadyFilled: isElementFilled(cb),
        });
      }
    });

    checkboxGroupMap.forEach((groupCbs, groupKey) => {
      const firstCb = groupCbs[0];
      const groupName = firstCb instanceof HTMLInputElement ? firstCb.name : "";
      const questionLabel = getGroupQuestionLabel(groupCbs);

      const options = filterJunkOptions(
        Array.from(new Set(
          groupCbs
            .map(c => getOptionLabel(c))
            .filter(text => text.length > 0)
        ))
      );

      const isRequired = groupCbs.some(c =>
        (c instanceof HTMLInputElement && c.required) || c.getAttribute("aria-required") === "true"
      );

      const alreadyFilled = groupCbs.some(c =>
        (c instanceof HTMLInputElement && c.checked) || c.getAttribute("aria-checked") === "true"
      );

      let selector = "";
      if (groupName) {
        selector = `input[name="${cssAttrEscape(groupName)}"]`;
      } else {
        selector = getUniqueSelector(firstCb);
      }

      fields.push({
        id: firstCb.id || groupName || `checkbox_group_${fields.length}`,
        name: groupName || firstCb.id || "",
        type: "checkbox",
        label: questionLabel || getLabelText(firstCb) || "Multiple Choice Question",
        placeholder: "",
        required: isRequired,
        options: options.length > 0 ? options : undefined,
        multiple: true,
        optionsMode: 'strict',
        elementSelector: selector,
        alreadyFilled: alreadyFilled,
      });
    });

    const standardInputs = visibleInputs.filter(i => i.type !== 'radio' && i.type !== 'checkbox');
    for (const input of standardInputs) {
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
          options = filterJunkOptions(
            Array.from(selectEl.options)
              .map(opt => opt.text.trim())
              .filter(text => text.length > 0)
          );
          optionsMode = 'strict';
        } else {
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

    visibleSelects.forEach((select) => {
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
        optionsMode: (options && options.length > 0) ? 'strict' : 'dynamic',
        elementSelector: getUniqueSelector(trigger),
        alreadyFilled: isElementFilled(trigger),
      });
    }

    fields.sort((a, b) => {
      const elA = resolveElement(a.elementSelector);
      const elB = resolveElement(b.elementSelector);
      if (elA && elB) {
        const pos = elA.compareDocumentPosition(elB);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      }
      return 0;
    });

    const response: AnalysisResponse = {
      url: window.location.href,
      title: document.title || "No Title",
      inputsCount: standardInputs.length + radioGroupMap.size + checkboxGroupMap.size,
      textareasCount: visibleTextareas.length,
      selectsCount: visibleSelects.length + genericTriggers.length,
      fields: fields,
    };

    return response;
  } catch (error) {
    console.error("Error extracting fields:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to extract form fields"
    };
  }
}
