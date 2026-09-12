# ***JobForm Agent***

An AI-powered Chrome extension + Python backend that scans a job application form, matches every field against your candidate profile using an LLM, and fills it out for you — including native `<select>` dropdowns, JS-driven comboboxes/typeaheads, radio and checkbox groups, and resume file uploads. It also logs every application you submit to a personal Excel tracker.

This README covers what the project is and how to get it running. For the full feature list, the environment variable reference, and functionality-verification steps, see **[detail.md](detail.md)**.

## ***Table of Contents***

- [What Is This?](#what-is-this)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [For Non-Techy People](#for-non-techy-people)

---

## ***What Is This?***

Job applications on ATS platforms (Greenhouse, Workday, Lever, iCIMS, SuccessFactors, and many custom in-house forms) tend to make you fill out your resume into boxes after giving them the resume. If you're anything like me, you find this tedious. Contact info, work authorization, EEO self-identification, education history, links, and an open-ended *"Why do you want to work here?"* Then do it all over again for the next position.

JobForm Agent automates filling those out so you can focus on maximizing your time and application.

Two pieces working together:

- **`extension/`** — a Manifest V3 Chrome extension. Its content script scans whatever form is on the current page and, separately, executes the fill actions it's told to perform. Its popup is the UI you actually click.
- **`backend/`** — a local FastAPI service. It takes the scanned fields, combines them with your candidate profile (a markdown file you write once), and asks an LLM — OpenAI, Anthropic Claude, or any OpenAI-compatible provider like OpenRouter or DeepSeek, your choice, via Structured Outputs — to fill in the fields.

The data the agent pulls from is a context file on your own machine. 
> (see [Configuration](#configuration)) 

For the full feature breakdown, see **[detail.md](detail.md#features)**.

---

## ***Project Structure***

```
├── .gitignore
├── README.md
├── detail.md
├── 📁 backend/
│   ├── main.py
│   ├── schemas.py
│   ├── guardrails.py
│   ├── tracker.py
│   ├── llm_client.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── test_autofill_plan.py
│   ├── test_user_scenario.py
│   ├── test_openai.py
│   └── test_anthropic.py
│
└── 📁 extension/
    ├── manifest.json
    ├── package.json
    ├── tsconfig.json
    ├── build.mjs
    ├── popup.html
    ├── popup.css
    └── 📁 src/
        ├── popup.ts
        ├── 📁 popup/
        │   ├── config.ts
        │   ├── dom.ts
        │   ├── state.ts
        │   ├── activeTab.ts
        │   ├── progress.ts
        │   ├── health.ts
        │   ├── resume.ts
        │   ├── tabs.ts
        │   ├── theme.ts
        │   ├── popout.ts
        │   ├── planList.ts
        │   ├── persistence.ts
        │   ├── tracker.ts
        │   ├── debug.ts
        │   └── autofill.ts
        ├── content.ts
        └── 📁 content/
            ├── types.ts
            ├── junkOptions.ts
            ├── visibility.ts
            ├── selectors.ts
            ├── labels.ts
            ├── nativeEvents.ts
            ├── dropdown.ts
            ├── jobMeta.ts
            ├── scanner.ts
            ├── upload.ts
            └── filler.ts
```

---

## ***Getting Started***

### **1. Start the FastAPI Backend**

```bash
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1        # Windows PowerShell (or: source venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in a real API key for whichever provider you're using — `OPENAI_API_KEY` (default) or `ANTHROPIC_API_KEY` (set `LLM_PROVIDER=anthropic` too). See [Configuration](#configuration). Then run:

```bash
uvicorn main:app --reload
```

The backend starts on `http://127.0.0.1:8000`. Confirm it's up by visiting `http://127.0.0.1:8000/health`.

### **2. Build the Chrome Extension**

```bash
cd extension
npm install
npm run build          # compiles TypeScript & copies static files into extension/dist/
npm run watch          # optional: rebuild automatically on save
```

### **3. Load the Extension in Chrome**

1. Go to `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked**, and select `extension/dist`.

---

## ***Configuration***

### **Candidate Profile (required)**

The AI's only knowledge of you comes from a markdown profile file. It isn't included in this repo — download it as an asset from the project's **Releases** page:

1. Download `context.example.md` from Releases and save it as `backend/me/context.md`.
2. Replace the placeholder content with your real background, experience, and standard job-questionnaire answers (work authorization, EEO self-identification, links, education dates, etc.)

### **Application Tracker Template (optional)**

If you want a ready-made Excel tracker instead of pointing `APPLICATIONS_XLSX_PATH` at your own spreadsheet, download the blank `Application_Tracker.xlsx` template from Releases and save it at `backend/data/Application_Tracker.xlsx`.

For the full list of environment variables `backend/.env` accepts, see **[detail.md](detail.md#environment-variables)**.

---

## ***For Non-Techy People***

I get it. I'm not so blind to assume everyone who wants this program is technologically literate and knows what npm and api keys are.

We are going to assume you have never opened a terminal window in your life.
This will take maybe 30–45 minutes the first time. You will never have to do most of it again.

### **Step 1: Downloading**

1. At the top of this page, find the green button that says 
> **`<> Code`**.
2. Click it, then click **Download ZIP**.
3. Find the downloaded ZIP file (usually in your **Downloads** folder), right-click it, and choose **Extract All...** → **Extract**.

### **Step 2: Installing**

This project needs two other free programs installed on your computer to run.

**Python**:

1. Go to [python.org/downloads](https://www.python.org/downloads/) and click the big yellow **Download Python** button.
2. Run the installer.
3. **This is the one step in this entire guide where the order of operations matters**: on the very first installer screen, there is a small checkbox at the bottom that says **"Add python.exe to PATH."** Check it. Check it before you click anything else. If you skip this, absolutely nothing later in this guide will work, and you will get an error where your computer insists Python doesn't exist even though you just watched it install.
4. Click **Install Now** and let it finish.

**Node.js**:

Click the **Start Menu** (the Windows logo) and type `PowerShell`.
Click on **Windows PowerShell** when it shows up.

1. Open PowerShell and run:
   ```powershell
   winget install CoreyButler.NVMforWindows
   ```
   Let it finish, then **close the PowerShell window completely and open a brand-new one**
2. In the new window, install Node itself:
   ```powershell
   nvm install lts
   nvm use lts
   ```
3. Check it worked:
   ```powershell
   node -v
   ```
   ```powershell
   npm -v
   ```

   If both print back a version number (like `v22.x.x` and `10.x.x`) instead of an error, you're done.

### **Step 3: Terminal**

Click the **Start Menu** (the Windows logo) and type `PowerShell`.
Click on **Windows PowerShell** when it shows up.

From now on, "run this command" means: click into that window, type (or paste) the exact text given, and press **Enter**. You'll usually see a few lines of text scroll by afterward.

### **Step 4: API Key**

This app doesn't have its own built-in AI — it borrows one from Anthropic (makers of Claude) or OpenAI (makers of ChatGPT), and it needs your own personal "API key" to do that. That key is what allows you to access the AI chat, Filling out forms costs fractions of a cent each.

**Pick one** (Claude is what this guide will use below, but OpenAI works identically):

- **Claude**: go to [console.anthropic.com](https://console.anthropic.com), sign up, click **API Keys** in the sidebar, click **Create Key**, and copy the long string starting with `sk-ant-`. Then go to **Settings → Billing** and add a small amount of credit (a few dollars is plenty to start).
- **OpenAI**: go to [platform.openai.com](https://platform.openai.com), sign up, click **API Keys**, click **Create new secret key**, and copy the string starting with `sk-`. Add billing credit under **Settings → Billing**.

Paste this key into Notepad temporarily so you don't lose it — you'll need to paste it again in a couple of steps, and it is only ever shown to you once.

### **Step 5: Turning On**

Open PowerShell (Step 2/3) and run these one line at a time. Replace the path in the first line with wherever you actually put the extracted folder from Step 2.

```powershell
cd "C:\Users\YourName\Desktop\JobForm-Agent\backend"
python -m venv venv
```

---

```powershell
.\venv\Scripts\Activate.ps1
```

If your prompt now starts with `(venv)`, it worked. If PowerShell instead complains about "running scripts is disabled," paste this once and try activating again:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Now install the project's dependencies:

```powershell
pip install -r requirements.txt
```

This downloads a bunch of stuff and prints a lot of text. That's fine. Let it finish.

### **Step 6: Which AI To Use?**

Still in that same PowerShell window:

```powershell
Copy-Item .env.example .env
notepad .env
```

Notepad will open a small file. Edit it so it contains your provider choice and the key you copied in Step 4:

```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-paste-your-real-key-here
```

(If you're using OpenAI instead, use `LLM_PROVIDER=openai` and `OPENAI_API_KEY=sk-paste-your-key-here`.) Save the file (**Ctrl+S**) and close Notepad.

Next, this app needs to know things about *you* — your work history, your skills, how you'd answer the same fifteen boring questions every job application asks. This lives in a file called `context.md`. Download the `context.example.md` template from this project's **Releases** page (see [Configuration](#configuration) above), save it as `backend/me/context.md`, edit and replace the placeholder text with your real information.

### **Step 7: Starting**

Back in PowerShell (still inside the `backend` folder, still showing `(venv)`):

```powershell
uvicorn main:app --reload
```

You'll see a line like `Uvicorn running on http://127.0.0.1:8000`. **Leave this window open** — closing it turns it off. To double-check it's alive, open your normal web browser and visit `http://127.0.0.1:8000/health`. If you see some text with the word `"ok"` in it, you're good.

### **Step 8: Extension**

Open a **second, brand-new** PowerShell window (don't close the first one). In the new window:

```powershell
cd "C:\Users\YourName\Desktop\JobForm-Agent\extension"
npm install
npm run build
```

Same deal — lots of text, that's fine, let it finish. This creates a new folder called `dist` inside `extension`.

Now load it into Chrome:
1. Open Chrome and type `chrome://extensions` into the address bar.
2. Flip on **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension/dist` folder you just created.

You should now see "JobForm Agent" show up as an extension. Click the little puzzle-piece icon in Chrome's toolbar and pin it so it's always visible.

### **Step 9: You're Done**

1. Make sure your first PowerShell window (the backend) is still open and running.
2. Go to any job application page in Chrome.
3. Click the JobForm Agent icon, then click **Autofill Application**.
4. Watch it think, then watch fields fill themselves in like a tiny polite ghost is doing your paperwork.
