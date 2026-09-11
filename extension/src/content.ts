// Content script for Job Autofiller extension.
// Injected into every page; scans form fields and executes fill/upload actions
// requested by the popup. Each concern lives in ./content/*; this file just
// registers the two message listeners and routes to them.
import { analyzePage } from "./content/scanner";
import { uploadFile } from "./content/upload";
import { fillSingleField } from "./content/filler";
import { sleep } from "./content/nativeEvents";
import { extractJobMeta } from "./content/jobMeta";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ANALYZE_PAGE") {
    analyzePage().then(sendResponse);
    return true; // async response
  } else if (request.action === "UPLOAD_FILE") {
    const { selector, fileData, fileName } = request;
    sendResponse(uploadFile(selector, fileData, fileName));
  } else if (request.action === "EXTRACT_JOB_META") {
    sendResponse({ jobMeta: extractJobMeta() });
  }
  return false;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "FILL_FIELD") {
    const { selector, fillAction, value, optionsMode } = request;
    fillSingleField(selector, fillAction, value, optionsMode).then(sendResponse);
    return true; // async response

  } else if (request.action === "FILL_ALL_FIELDS") {
    (async () => {
      const items: Array<{ selector: string; fillAction: string; value: any; label?: string; optionsMode?: 'strict' | 'dynamic' }> =
        request.fields || [];
      const results: Array<{ selector: string; label?: string; success: boolean; error?: string; note?: string }> = [];

      for (const item of items) {
        const result = await fillSingleField(item.selector, item.fillAction, item.value, item.optionsMode);
        results.push({ selector: item.selector, label: item.label, ...result });
        await sleep(80);
      }

      const successCount = results.filter(r => r.success).length;
      sendResponse({
        results,
        successCount,
        failureCount: results.length - successCount,
      });
    })();
    return true; // async response
  }

  return false; // not a message this listener handles
});
