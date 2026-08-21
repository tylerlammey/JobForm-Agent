# Job Autofiller Scaffold

A minimal, working scaffold for a Chrome extension (Manifest V3 + TypeScript + esbuild) and a Python (FastAPI) backend. This provides a baseline implementation for testing extension-backend communication and content-script page analysis.

## Project Structure

```
/
├── .gitignore
├── README.md
├── backend/
│   ├── requirements.txt       # Python dependencies (FastAPI, Uvicorn)
│   └── main.py                # FastAPI endpoints with CORS configured
└── extension/
    ├── package.json           # Node configuration & scripts
    ├── tsconfig.json          # TypeScript compiler options
    ├── build.mjs              # Custom esbuild-based build and watch script
    ├── manifest.json          # Chrome Extension Manifest V3 configuration
    ├── popup.html             # Popup UI layout
    ├── popup.css              # Styling for popup UI
    └── src/
        ├── popup.ts           # Logic for popup events and network requests
        └── content.ts         # Content script injected into web pages to capture DOM details
```

---

## Getting Started

### 1. Start the FastAPI Backend

1. Navigate to the `backend/` directory.
2. Create a Python virtual environment:
   ```bash
   python -m venv venv
   ```
3. Activate the virtual environment:
   * **Windows (PowerShell):** `.\venv\Scripts\Activate.ps1`
   * **Windows (CMD):** `.\venv\Scripts\activate.bat`
   * **macOS/Linux:** `source venv/bin/activate`
4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Run the backend dev server:
   ```bash
   uvicorn main:app --reload
   ```
   The backend will start on `http://127.0.0.1:8000`. You can verify `/health` works by navigating to `http://127.0.0.1:8000/health` in your browser.

---

### 2. Build the Chrome Extension

1. Navigate to the `extension/` directory.
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
   This compiles the TypeScript files and copies static files into the `extension/dist/` directory.
4. *(Optional)* To run in development/watch mode:
   ```bash
   npm run watch
   ```

---

### 3. Load the Extension in Chrome

1. Open Google Chrome and go to `chrome://extensions`.
2. Toggle **Developer mode** in the top right.
3. Click **Load unpacked** in the top left.
4. Select the `extension/dist` folder from this project repository.

---

## Verifying Functionality

### Test Backend Connection
1. Ensure the FastAPI backend is running.
2. Click the **Job Autofiller** extension icon in your Chrome toolbar.
3. The popup will automatically check the connection on load:
   * A green indicator and "Connected" status indicates success.
   * A red/gray indicator and "Disconnected" status means the backend is unreachable.
4. Click the **Test Connection** button. It will request `/api/test` from the backend and display the greeting message.

### Test Page Analysis
1. Navigate to any website (e.g. `https://google.com` or `https://github.com`).
2. Open the extension popup.
3. Click **Analyze Page**.
4. The extension will send a message to the content script running on that page, which will count the forms elements.
5. The extension UI will update to display:
   * The page URL
   * The page Title
   * Counts of `<input>`, `<textarea>`, and `<select>` tags on that page.
