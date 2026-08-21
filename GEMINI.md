# GEMINI.md - Job Autofiller Repository Guidelines

## Project Architecture & Tech Stack

- **Monorepo Structure**:
  - `extension/`: Chrome Extension (Manifest V3, TypeScript, esbuild, Vanilla HTML/CSS popup).
  - `backend/`: Python service (FastAPI, Uvicorn, OpenAI Structured Outputs `gpt-4o-mini`, Pydantic).
- **Candidate Profile**: Stored in `backend/me/context.md`. Serves as ground truth for LLM form matching.
- **Communication Flow**:
  - `popup.ts` ↔ `content.ts`: `chrome.tabs.sendMessage` (`ANALYZE_PAGE`, `FILL_ALL_FIELDS`, `UPLOAD_FILE`).
  - `popup.ts` ↔ `backend`: REST HTTP `POST http://localhost:8000/api/fill-form` (`FieldInputPayload` → `FillPlan`).

---

## Build & Run Commands

### Backend (Python / FastAPI)
```bash
# Setup & Activation (from repo root or backend/)
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1        # Windows PowerShell (or source venv/bin/activate on Unix)
pip install -r requirements.txt

# Run Development Server (Port 8000)
uvicorn main:app --reload

# Run Automated Matching / Plan Verification Test
python test_autofill_plan.py
```

### Chrome Extension (TypeScript / esbuild)
```bash
cd extension
npm install

# Build to extension/dist/ (compiles TS & copies static HTML/CSS/manifest)
npm run build

# Watch mode for iterative development
npm run watch

# Type Check
npx tsc --noEmit
```
*Load in Chrome via `chrome://extensions` → Developer mode → Load unpacked → select `extension/dist`.*

---

## Critical Development Rules & Conventions

### 1. DOM Interaction & Framework Reactivity
- **React/Framework Input Bypassing**: Setting `element.value = ...` does NOT update React/Vue state. Always invoke the prototype setter descriptor (`setNativeInputValue` in `content.ts`) before dispatching `input` and `change` bubbling events.
- **Robust Selectors**: ATS platforms (Greenhouse, Workday, etc.) frequently use array-style names/IDs (e.g., `question_123[]`). Never use `#unescaped-id` queries directly. Always query `[id="..."]` with `cssAttrEscape()` and wrap lookups with `resolveElement()`.
- **Overwrite Protection**: Check `isElementFilled()` before writing. Never overwrite fields already entered by the user; mark them `action: "skip"`.

### 2. Custom Dropdowns & Typeaheads
- **Dropdown Classification**:
  - Native `<select>`: Complete static list (`optionsMode: "strict"`). Match option text or value directly.
  - Typeahead / Search Combobox (`optionsMode: "dynamic"` or `aria-autocomplete="list"`): Must focus, type target query via `typeIntoComboboxAndLocateOptions`, wait for DOM results, click match, or fallback to `Enter`.
  - Generic Div/Button comboboxes (`[role="combobox"]`, `[aria-haspopup="listbox"]`): Must simulate click/mousedown, scrape options, select, and always invoke `closeDropdown()` (`Escape` → click-away → `blur()`) to prevent lingering UI overlays.
- **Multi-Select Dropdowns**: When `multiple: true`, support JSON string arrays (e.g. `'["Secret", "Top Secret"]'`) or semicolon-separated strings (`"A; B"`).

### 3. Backend & LLM Matching Contract
- **Completeness Invariant**: The backend `FillPlan.actions` MUST contain exactly 1 action per input field in the exact same array order.
- **Option Strictness**: For `optionsMode: "strict"`, the value MUST match an existing option verbatim (case-exact where possible). Never rephrase or hallucinate options.
- **Privacy Notices & Candidate Consents**: All questions regarding Candidate Privacy Notices, Data Processing Consents, Cross-Border Transfer Consents, Terms of Application, and Accuracy Declarations MUST be answered affirmatively (`Yes`, `I Agree`, `Agree`, `I Consent`, `Consent`, or checkbox `true`) so candidate applications are not rejected or discarded.
- **N/A and Missing Data**:
  - **Optional Fields (`required: false`)**: If context is `(N/A)`, empty, or lacks useful info, mark `action: "skip"` and `value: ""` to leave it blank/unselected rather than filling with "N/A" or guessing.
  - **Required Fields (`required: true`)**: Map to verbatim "N/A" / "Not Applicable" / "None" / "Decline" if present in options; otherwise make a logical fallback choice rather than skipping.

### 4. Chrome Extension & State Management
- **Manifest V3 Constraints**: Content scripts cannot execute on `chrome://`, `edge://`, `chrome-extension://`, or `about:` URLs.
- **Message Listener Integrity**: Async message handlers (`chrome.runtime.onMessage`) must return `true` to keep the response channel open. Check `chrome.runtime.lastError`.
- **Per-Tab Persistence**: Save popup state into `chrome.storage.local` under `state_${activeTabUrl}` so popup closes/reopens do not discard scanned state or plans.
- **File Uploads**: Resumes are stored as base64 in `chrome.storage.local` under `userResume` and dispatched to file inputs via synthetic `DataTransfer` blobs.

---

## Agent Modification Guardrails
- **Inspect Before Modifying**: Review existing handlers in `content.ts`, `popup.ts`, and `main.py` before adding new DOM selectors, endpoints, or field types.
- **Preserve Separation of Concerns**: Keep DOM parsing and execution inside `content.ts`; UI/orchestration in `popup.ts`; AI prompting and schema generation in `backend/main.py`.
- **No Unnecessary Dependencies**: Use existing esbuild bundling in `extension/` and standard libraries in `backend/`.

---

## Validation Checklist for Changes
1. Run `npx tsc --noEmit` and `npm run build` inside `extension/` to ensure no compile or bundling errors.
2. Run `python test_autofill_plan.py` in `backend/` with backend server running to verify LLM prompt compatibility and schema integrity.
3. Test against live/mock job application forms to verify dropdown open/close cycles, React input binding, and file upload behavior without console errors.
