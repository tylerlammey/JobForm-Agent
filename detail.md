# JobForm Agent — Details

Full feature reference, environment variable list, and functionality-verification steps. See [README.md](README.md) for the project overview, setup instructions, and configuration basics.

## Table of Contents

- [Features](#features)
  - [AI-Powered Form Matching](#ai-powered-form-matching)
  - [Choice of LLM Provider (OpenAI-Compatible or Claude)](#choice-of-llm-provider-openai-compatible-or-claude)
  - [Self-Correcting Option Matching](#self-correcting-option-matching)
  - [Deterministic Safeguards (Guardrails)](#deterministic-safeguards-guardrails)
  - [Full-Page Form Scanning](#full-page-form-scanning)
  - [Custom Dropdown & Typeahead Handling](#custom-dropdown--typeahead-handling)
  - [Multi-Pass Fill for Follow-Up Questions](#multi-pass-fill-for-follow-up-questions)
  - [Framework-Safe Input Simulation](#framework-safe-input-simulation)
  - [Overwrite Protection](#overwrite-protection)
  - [Resume / CV Attachment](#resume--cv-attachment)
  - [Application Tracker (Excel Logging)](#application-tracker-excel-logging)
  - [Debug Console](#debug-console)
  - [State Persistence](#state-persistence)
  - [Dark Mode](#dark-mode)
  - [Pop Out Into a Movable Window](#pop-out-into-a-movable-window)
- [Environment Variables](#environment-variables)
- [Verifying Functionality](#verifying-functionality)

---

## ***Features***

### **AI-Powered Form Matching**

`POST /api/fill-form` takes every field the content script extracted from the page and returns a `FillPlan`: exactly one action (`type`, `select`, `check`, `upload`, or `skip`) per field, in the same order they were scanned. The model is given your full candidate profile as context and a fairly extensive rulebook covering completeness, required-vs-optional handling, date formatting, dynamic-search dropdowns, and more 
> (see `backend/main.py`).

Every AI matching call — including each follow-up pass, see [Multi-Pass Fill for Follow-Up Questions](#multi-pass-fill-for-follow-up-questions) — is capped at 3 minutes on both ends: the extension aborts and shows a clear error if the backend doesn't respond in time (`extension/src/popup/autofill.ts`), and the backend itself won't wait longer than that on the upstream LLM provider (`LLM_TIMEOUT_SECONDS` in `backend/llm_client.py`), so a slow or hung provider can't leave the popup stuck indefinitely.

### **Choice of LLM Provider (OpenAI-Compatible or Claude)**

The backend doesn't lock you into one AI provider. `backend/llm_client.py` sends every matching/retry request through whichever provider `LLM_PROVIDER` in `backend/.env` selects — `openai` (default, `gpt-4o-mini`) or `anthropic` (`claude-haiku-4-5`) — using each provider's native Structured Outputs API so the same `FillPlan` schema comes back either way. Switching providers is just an `.env` change, no code edits.

The `openai` path isn't limited to OpenAI itself, either: it's built on the OpenAI SDK's standard chat-completions request shape, which most other providers also speak. Set `OPENAI_BASE_URL` to redirect it at **OpenRouter, DeepSeek, Groq, Together, or any other OpenAI-compatible endpoint** — including the cheaper open-weight/Chinese models (DeepSeek, Qwen, Llama, etc.) available through a single OpenRouter key — with `OPENAI_API_KEY`/`OPENAI_MODEL` set to that provider's key and model string. Only Anthropic's Claude needs its own dedicated code path, since its API has a different request/response shape 
> (see [Configuration](README.md#configuration)).

### **Self-Correcting Option Matching**

For strict dropdown/radio fields, the value returned by the AI must match one of that field's own options character-for-character. If it doesn't (or it accidentally picked an option that belongs to a neighboring question), the backend automatically retries just the broken fields — up to 3 times — with targeted feedback about what went wrong, then falls back to a deterministic "N/A"-style choice if retries are exhausted. This all happens server-side before you ever see a result.

### **Deterministic Safeguards (Guardrails)**

A small set of Python functions in `backend/guardrails.py` run *after* the AI produces its plan, to enforce rules that shouldn't be left to chance:

- **Affirmative consents** — privacy notices, data-processing consents, and terms-of-application questions are always answered affirmatively (never touches demographic/EEO/criminal-history questions, which are left to your actual profile answers).
- **Resume routing** — guarantees your resume is attached to *only* the genuine Resume/CV upload slot, never accidentally uploaded into a Cover Letter, Portfolio, or Transcripts slot — including ATS platforms (Workday especially) that pair one generic, reusable file input with a separate "Document Type"/"Category" dropdown instead of labeling the upload slot itself.
- **Candidate links** — makes sure LinkedIn/GitHub/Website fields get filled even if the AI skipped them, by parsing the URLs straight out of your profile text.

Guardrails are a simple list (`GUARDRAILS` in `guardrails.py`) — comment one out to disable it, or add a new `(fields, actions, candidate_context) -> actions` function to extend it.

### **Full-Page Form Scanning**

The content script (`extension/src/content/scanner.ts`) walks the entire page — including embedded iframes from ATS providers — and extracts every fillable field: text/email/tel/number inputs, textareas, native `<select>` elements, radio button groups, checkbox groups (including array-style `name="q[]"` multi-selects), and non-native dropdowns built out of plain `<div>`/`<button>` widgets. For each one it resolves a human-readable label using a cascade of strategies (explicit `<label for>`, ARIA attributes, sibling text, fieldset legends, container headings, and more).

### **Custom Dropdown & Typeahead Handling**

Many ATS platforms (Workday, iCIMS, SuccessFactors, React-Select-based forms) don't use a native `<select>` at all — just a styled trigger that opens a floating option list on click, with no way to know the options without actually opening it. `extension/src/content/dropdown.ts` handles both flavors:

- **Fixed-list dropdowns** — open, read whatever rendered, close.
- **Typeahead/search comboboxes** (school lookup, city lookup, security clearance search) — type the target value in first so the widget's own search logic actually fires, then read the results that come back. Some widgets (college search especially) only actually run that search once **Enter** is pressed, not just on typing — if nothing renders after typing, `extension/src/content/filler.ts` presses Enter and checks again before giving up, rather than assuming a bare "typed but unselected" result is the best it can do.

### **Multi-Pass Fill for Follow-Up Questions**

Some forms use progressive disclosure — answering one question (e.g. "Do you have a security clearance?") reveals a new follow-up field (e.g. "Which level?") that didn't exist in the DOM when the page was first scanned. Autofill handles this by re-scanning the page after each fill pass and checking for genuinely new fields (tracked per frame so it can't mistake one frame's field for another's); if any appear, only those are sent through the AI and filled, and the cycle repeats up to 3 passes total. A form with no follow-up questions completes in exactly one pass, same as before 
> (see `extension/src/popup/autofill.ts`).

### **Framework-Safe Input Simulation**

Modern ATS forms are almost always built on React, Vue, or Angular, which override the native `value`/`checked` setters — a plain `element.value = "..."` gets ignored by the framework's internal state. `extension/src/content/nativeEvents.ts` calls the underlying prototype setter, then fires the event lifecycle (focus → keydown/keyup → input → change → blur) so the framework's validation, dirty-state tracking, and "Next"/"Submit" button enabling all behave exactly as if you'd typed it yourself.

### **Overwrite Protection**

Before writing to any field, the extension checks whether it already has a value (`isElementFilled`). Anything you've already filled in yourself is left untouched and reported back as skipped. The agent never overwrites your own edits.

### **Resume / CV Attachment**

You can upload a resume (PDF/DOCX) once in the popup; it's stored locally (`chrome.storage.local`) and, when the AI's plan calls for it, attached to the correct upload field via a synthetic `DataTransfer`, exactly like using the native file picker.

**Important limitation:** the resume's contents are never parsed or read. It's treated as an opaque file purely for the purpose of attaching it to the right upload button. It has no effect on the quality of any other answer. Everything the AI knows about you comes from your candidate profile 
> (see [Configuration](README.md#configuration))

### **Application Tracker (Excel Logging)**

A "Log Application" form in the popup lets you append a row to a personal Excel tracker (`Company`, `Role`, `Status`, `Date Applied`, links, notes, etc.) after you actually submit an application. **It does NOT do it automatically**

The backend (`backend/tracker.py`):

- **Only ever appends** — it loads your existing workbook, finds the first blank row, writes into it, and saves back to the same file. It never regenerates the workbook, so any manual edits, extra sheets, formulas, or formatting you've will not be destroyed.
- **Supports your own spreadsheet layout.** If the file is named `Application_Tracker.xlsx` *and* matches the reference template's exact structure, it uses fast, guaranteed-correct fixed-column writes. Any other file goes through a generic mode that matches columns by header text (`FIELD_ALIASES`) instead of position. A sheet with "Employer" instead of "Company," or columns in a different order, still works.
- **Never guesses** If generic mode can't find anything resembling a "Company" column, it reports back what did and didn't match, and the popup shows a "Push Anyway" button to push what it managed to answer.
- **Readable rows.** The Job Link column shows short "Job Link" text with the real URL kept as the cell's hyperlink target, instead of a long raw URL stretching the row. The Company column's width grows (never shrinks) to fit whatever name gets written, up to a sane cap, so it doesn't stay clipped at whatever width the sheet started with.

The workbook's location is configurable via `APPLICATIONS_XLSX_PATH` in `backend/.env` 
> (see [Configuration](README.md#configuration))

**Or point at your own spreadsheet from the popup, no `.env` edit needed.** The "Custom Sheet Path" field (shown when the tracker form is expanded) lets you type/paste an absolute path to your own `.xlsx` file on your own machine — saved in `chrome.storage.local` so you only set it once. When filled in, it overrides `APPLICATIONS_XLSX_PATH` for that request only (both logging and exporting); leave it blank to keep using the server default. This is a local file path, not a live Google Sheet — the backend still just opens/saves an `.xlsx` file with `openpyxl`, so the same dual-mode (hardcoded/generic) matching applies no matter which file you point it at.

**Auto-prefill from the page.** When you open the "Log Application" form, Company/Role/Location are pre-filled from the current page's own `schema.org` `JobPosting` structured data when the page provides one (common on Greenhouse/Lever and other SEO-conscious job boards) — `extension/src/content/jobMeta.ts` reads it straight out of a `<script type="application/ld+json">` tag. If a page doesn't have that data, those fields are simply left blank rather than guessed from the page title. Prefill never overwrites a field you've already typed into.

**Your in-progress entry survives closing the popup — on any tab.** Chrome extension popups fully close (and lose all in-memory state) the moment you switch browser tabs — normally that would wipe whatever you'd typed into the tracker form. Every keystroke here is saved to `chrome.storage.local` and restored automatically the next time you reopen the popup, including whether the form was left expanded, no matter which tab you reopen it on — useful since you'll often need to alt-tab away mid-entry (to check your resume, re-read the posting, copy a company name). The draft is cleared only once the entry is actually logged successfully.

**Export.** Click the **Export** button next to "Log Application" to download the current `Application_Tracker.xlsx` (via a new `GET /api/export-tracker` backend endpoint) straight from the popup, without needing to know where it lives on disk.

### **Debug Console**

A small, deliberately de-emphasized second tab in the popup (most people never need it) shows the raw JSON of everything scanned from the page, the exact request sent to `/api/fill-form`, and the exact response received — including a separate `--- Pass N ---` section for each follow-up pass, if any ran. Each of the three boxes has its own **Copy JSON** button, for pasting the relevant one into a bug report or asking for help. Use this to diagnose why a field failed.

### **State Persistence**

Scan results, the generated fill plan, and debug payloads are saved to `chrome.storage.local` under one global key, so closing and reopening the popup doesn't lose your last scan — on any tab, even if the tab the scan ran on has since been closed. (An earlier version scoped this per tab URL, which seemed sensible but actually made the Debug Console look wiped the moment you switched tabs; it's global now specifically to avoid that.) The Application Tracker's in-progress draft is saved the same way but under its own separate key, written continuously (debounced on every keystroke, not just at scan checkpoints) so it survives a popup closing mid-entry — see [Application Tracker (Excel Logging)](#application-tracker-excel-logging).

### **Dark Mode**

Click the sun/moon icon in the header to switch themes; the choice is saved (`chrome.storage.local`) and restored on next open. If you've never toggled it, it follows your OS/browser's `prefers-color-scheme` automatically. Every color in `extension/popup.css` is driven by CSS variables specifically so dark mode is a single override block (`:root[data-theme="dark"]`) rather than a parallel set of styles to keep in sync.

### **Pop Out Into a Movable Window**

Chrome pins a toolbar-icon popup in place — it can never be dragged around the screen, full stop. Click the pop-out icon in the header to open the exact same UI in a real, detached window instead, which you can move, resize, and keep open anywhere while you work through a form. It's still the same extension, same backend connection, same everything — just not glued to the toolbar.

---

## ***Environment Variables***

`backend/.env`:

| Variable | Required | Description |
|---|---|---|
| `LLM_PROVIDER` | No | `openai` (also accepts `openai_compatible` as an alias) or `anthropic`. Defaults to `openai` if unset. |
| `OPENAI_API_KEY` | If using the `openai` path | Used for the `/api/fill-form` matching call and its self-correction retries. When `OPENAI_BASE_URL` is set, this holds that provider's key instead (OpenRouter, DeepSeek, Groq, etc.), not necessarily an OpenAI key. |
| `OPENAI_BASE_URL` | No | Redirects the `openai` path to any OpenAI-compatible endpoint — e.g. `https://openrouter.ai/api/v1` or `https://api.deepseek.com`. Unset uses OpenAI's own API. |
| `ANTHROPIC_API_KEY` | If using Claude | Same purpose as `OPENAI_API_KEY`, for the Anthropic path. |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini`. Set to whatever model string your chosen provider expects (e.g. `deepseek/deepseek-chat` on OpenRouter). |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-haiku-4-5`. |
| `APPLICATIONS_XLSX_PATH` | No | Absolute path to your Application Tracker spreadsheet. Defaults to `backend/data/Application_Tracker.xlsx` if unset. |

---

## ***Verifying Functionality***

### **Test Backend Connection**

1. With the backend running, open the extension popup — it pings `/health` automatically and shows a green "Connected" indicator.
2. Run `python backend/test_autofill_plan.py` (backend must be running) to send a mock set of form fields through `/api/fill-form` and print/assert on how they were matched against your `context.md`.

### **Test Page Analysis & Autofill**

1. Navigate to any job application page (or a simple test form).
2. Open the popup and click **Autofill Application**.
3. The popup scans the page, sends the fields to the backend, and applies the returned plan — watch the progress bar move through Scan → AI Match → Fill & Upload, and check the **Debug Console** tab if anything didn't match the way you expected.
