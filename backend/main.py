from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# Load environment variables from .env on startup (overriding shell environment)
load_dotenv(override=True)

app = FastAPI(
    title="Job Autofiller Backend",
    description="Minimal FastAPI backend for Chrome extension communication",
    version="0.1.0"
)

# CORS configuration
# Using "*" is sufficient for local development to allow the Chrome Extension
# (which requests from origin chrome-extension://...) to fetch backend resources.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from pydantic import BaseModel, Field as PydanticField
from typing import List, Optional
from openai import OpenAI

# Initialize OpenAI client (will automatically read OPENAI_API_KEY from environment)
openai_client = OpenAI()

# Input schemas from extension
class ExtractedField(BaseModel):
    id: str
    name: str
    type: str
    label: str
    placeholder: str
    required: bool
    options: Optional[List[str]] = None
    multiple: Optional[bool] = None
    optionsMode: Optional[str] = None  # 'strict' | 'dynamic'
    elementSelector: str
    alreadyFilled: Optional[bool] = None

class FieldInputPayload(BaseModel):
    fields: List[ExtractedField]

# Structured output schemas for OpenAI agent
class FieldAction(BaseModel):
    selector: str
    action: str        # "type" | "select" | "check" | "upload" | "skip"
    value: str         # Text to type, select option text, or check boolean
    label: str         # Original field label
    explanation: str   # Brief rationale for verification

class FillPlan(BaseModel):
    actions: List[FieldAction]

@app.get("/health")
async def health_check():
    """
    Standard health check endpoint to verify backend is active.
    """
    return {
        "status": "ok",
        "message": "Backend is running and healthy"
    }

@app.get("/api/test")
async def test_connection():
    """
    Simple endpoint for connection verification from the Chrome Extension popup.
    """
    return {
        "status": "connected",
        "message": "Successfully connected to python backend!"
    }

@app.post("/api/fill-form", response_model=FillPlan)
async def generate_fill_plan(payload: FieldInputPayload):
    """
    Takes a list of extracted DOM fields and generates a verified fill plan
    based on the candidate's context profile file.
    """
    print(payload)
    # 1. Load context.md dynamically
    # Look in the me/ folder inside backend
    context_path = os.path.join(os.path.dirname(__file__), "me", "context.md")
    
    # Fallback to backend root if it hasn't been moved yet
    if not os.path.exists(context_path):
        context_path = os.path.join(os.path.dirname(__file__), "context.md")

    if not os.path.exists(context_path):
        return {
            "actions": [
                FieldAction(
                    selector="body",
                    action="skip",
                    value="",
                    label="System Error",
                    explanation=f"Error: Candidate context file not found at expected path: {context_path}"
                )
            ]
        }

    try:
        with open(context_path, "r", encoding="utf-8") as f:
            candidate_context = f.read()
    except Exception as e:
        return {
            "actions": [
                FieldAction(
                    selector="body",
                    action="skip",
                    value="",
                    label="System Error",
                    explanation=f"Error reading context file: {str(e)}"
                )
            ]
        }

    # 2. Build system prompt instruction
    system_prompt = f"""
You are an expert AI job application autofilling agent. Your task is to inspect a list of job application form fields (provided as a JSON list) and decide how to fill them out based on the candidate's profile context.

Here is the candidate's context profile:
=== CANDIDATE CONTEXT PROFILE ===
{candidate_context}
=== END CANDIDATE CONTEXT PROFILE ===

Instructions:
1. CRITICAL COMPLETENESS RULE: You MUST return exactly one `FieldAction` in the `actions` array for EVERY single field present in the input `fields` array. If the input list contains N fields, your output `actions` list MUST contain exactly N items, in the exact same order. Do NOT leave out or omit any field under any circumstances. If a field should be skipped (e.g. because it is already filled, or it is optional and cannot be logically guessed), you MUST include a FieldAction for it with action: "skip" and value: "".
2. Match each form field (by label, ID, name, options) to the most relevant information in the candidate context.
3. You are FORCED to provide an answer/value for EVERY input field you receive, including optional ones. You must never use the "skip" action unless it is already filled (see Overwrite Protection below) or it is absolutely impossible to logically guess a value (such as an optional document upload for a file the candidate doesn't have). You MUST use your best educated guess based on candidate context, or a standard common-sense default fallback.
4. Handle "N/A", "(N/A)", or missing/empty values in the context:
   - For dropdowns (`type: "select"`): If the candidate lists "(N/A)" or has no score/value/clearance for a field (such as SAT, ACT, GRE, GPA, or Clearance), inspect the field's `options` list. If the list contains an option representing "N/A", "Not Applicable", "None", "No", "I did not take this test", "I did not take the SAT", "I did not take the ACT", "I do not wish to share", or similar, you MUST select that option verbatim (e.g., action: "select", value: "N/A" or value: "I did not take this test"). If the list does NOT contain any such "N/A" or "no score" option, do NOT skip the field; instead, make an educated guess by selecting a standard default option or a logical fallback from the list (e.g., choose a common option, or the lowest/highest score, or whatever fits best). Note that generic placeholders or default prompting options (like "Select...", "Choose...", "Select an option", "Choose one", or similar) do NOT count as "N/A" or "Not Applicable" options, and you MUST NOT select them.
   - For text inputs (such as "Alternate Phone" or other optional text inputs): If the candidate lists "(N/A)" or is missing the information, do NOT skip the field. You must provide a best guess (e.g. for "Alternate Phone", guess their primary phone "+1 201-962-5813" or "N/A"; for "Middle Name", guess "N/A" or leave empty) or a sensible fallback value rather than skipping.
5. Determine the correct 'action' and 'value':
   - "type": Use for text, tel, email, textarea, or numbers. Provide the text value (e.g. "Tyler", "+1 201-962-5813", etc.).
    - "select": Use for dropdown selections. If the field has a list of 'options' and optionsMode is 'strict', you MUST select one of the options in that list EXACTLY as written, character-for-character. Do NOT rephrase, shorten, translate, correct, or summarize the option string under any circumstances (for example, if the option is "3.8 out of 4.0", do not return "3.8" or "3.8/4.0", you MUST return "3.8 out of 4.0" verbatim). If the field has `multiple: true` (which is a multiple choice / multi-select dropdown field), you can select multiple matching options. To do this, format the `value` as a JSON-serialized list of strings (e.g. `'["Secret", "Top Secret"]'`) or a semicolon-separated string (e.g. `"Secret; Top Secret"`). If optionsMode is 'dynamic' (meaning it is a search typeahead lookup box): if the 'options' list is empty, provide the best search keyword based on context (e.g., "Rensselaer" or "Troy"); if the 'options' list is NOT empty, you MUST choose a search keyword that corresponds to or filters down to one of the options in that list (for example, if options include 'Top Secret' and 'Secret', and the candidate context says 'Active DoD Secret Clearance', you MUST return 'Secret' as the value/search keyword, NOT 'Active DoD Secret Clearance', so that the dropdown filter is successful).
   - "check": Use for checkboxes and radio items. Set the value to "true" to select/check, or "false" to uncheck.
   - "upload": Use for file uploads. If it is the main resume slot, set action to "upload" and value to "resume". If it is another slot (cover letter, portfolio) and you find no match, use "skip".
   - "skip": Use ONLY as a last resort for optional fields where no logical guess can be made and no default values fit. If you choose "skip", you MUST set action to "skip" and value to "". Do NOT use the "select" action to choose placeholders or default prompting options (like "Select...", "Choose...", "Select an option", "Choose one", or similar); instead, use "skip" with value "". For EEO/diversity questions (like Race, Gender, Veteran, Disability), map to candidate choices. If not specified or matches "Decline to identify", choose that option.
6. Overwrite Protection: If a field is marked with `alreadyFilled: true` (meaning the user has already entered or selected a value in it), you MUST NOT attempt to overwrite it. Instead, you MUST set action to "skip" and value to "" for that field, and note "Field already filled" in the explanation.
7. Keep the explanations extremely brief and friendly (e.g., "Matched to email", "Selected verbatim N/A option", etc.).
8. Return a structured JSON response matching the FillPlan schema.
"""

    # 3. Call OpenAI Structured Outputs completion
    try:
        # We read the API key from environment. If it is placeholder or missing, it will raise an error.
        completion = openai_client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Here are the form fields extracted from the page:\n{payload.model_dump_json()}"}
            ],
            response_format=FillPlan,
            temperature=0.1  # Low temperature for highly deterministic matching
        )
        
        fill_plan = completion.choices[0].message.parsed
        print('\n\n', fill_plan)
        return fill_plan

    except Exception as e:
        error_msg = str(e)
        if "api_key" in error_msg.lower() or "auth" in error_msg.lower():
            explanation_str = "Error: OpenAI API key is missing or invalid. Please check backend/.env file."
        else:
            explanation_str = f"Error calling OpenAI API: {error_msg}"
            
        return {
            "actions": [
                FieldAction(
                    selector="body",
                    action="skip",
                    value="",
                    label="Completion Failure",
                    explanation=explanation_str
                )
            ]
        }

