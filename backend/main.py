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

from datetime import datetime

def apply_affirmative_consents_safeguard(fields: List[ExtractedField], actions: List[FieldAction]) -> List[FieldAction]:
    negative_question_triggers = [
        "convicted", "felony", "crime", "misdemeanor", "criminal",
        "debar", "suspend", "investigation for suspension",
        "non-compete", "conflict of interest",
        "relatives", "family member",
        "terminated", "discharged", "fired",
        "require sponsorship", "visa sponsorship", "need sponsorship",
        "government entity",
        "disability", "handicap", "veteran", "gender", "race", "ethnicity",
        "hispanic", "latino", "eeo", "self-identification", "demographic"
    ]
    
    consent_triggers = [
        "consent", "privacy notice", "privacy policy", "data privacy",
        "personal data", "personal information", "data processing",
        "transfer to other countries", "third parties",
        "terms of application", "terms and conditions", "terms & conditions",
        "certify", "declaration", "true and accurate", "true and complete",
        "understand the purposes", "hereby consent", "agree to the", "acknowledgement",
        "accurate to the best of my knowledge"
    ]

    affirmative_candidates = [
        "yes", "i agree", "agree", "i consent", "consent", "accept", "i accept",
        "true", "i understand", "i acknowledge", "yes, i agree", "yes, i consent"
    ]

    for i, field in enumerate(fields):
        if i >= len(actions):
            break
        
        # Don't alter fields that the user already manually filled
        if field.alreadyFilled:
            continue

        search_text = f"{field.label} {field.name} {field.id}".lower()
        
        # If it's a criminal/sponsorship/relatives/disability/demographic check, do NOT touch it
        if any(neg in search_text for neg in negative_question_triggers):
            continue
            
        # Check if it matches consent/privacy patterns
        if any(trigger in search_text for trigger in consent_triggers):
            current_action = actions[i]
            
            # Checkbox case
            if field.type in ["checkbox", "check"]:
                actions[i] = FieldAction(
                    selector=current_action.selector,
                    action="check",
                    value="true",
                    label=current_action.label,
                    explanation="Affirmatively agreed to terms / privacy policy"
                )
            # Select / Radio / Dropdown case
            elif field.options:
                chosen_opt = None
                for opt in field.options:
                    opt_lower = opt.strip().lower()
                    if opt_lower in affirmative_candidates:
                        chosen_opt = opt
                        break
                if not chosen_opt:
                    for opt in field.options:
                        opt_lower = opt.strip().lower()
                        if opt_lower.startswith("yes") or opt_lower.startswith("agree") or opt_lower.startswith("i consent") or opt_lower.startswith("i agree"):
                            chosen_opt = opt
                            break
                
                if chosen_opt:
                    actions[i] = FieldAction(
                        selector=current_action.selector,
                        action="select",
                        value=chosen_opt,
                        label=current_action.label,
                        explanation="Affirmatively agreed to terms / privacy policy"
                    )

    return actions

def apply_resume_upload_safeguard(fields: List[ExtractedField], actions: List[FieldAction]) -> List[FieldAction]:
    """
    Ensures that ONLY the dedicated resume/CV file upload slot receives
    action: "upload" and value: "resume". All secondary file slots (cover letter,
    portfolio, transcript, references, additional files) must be set to action: "skip".
    """
    resume_indicators = [
        "resume", "cv", "curriculum vitae", "attach resume", "upload resume", "upload your resume"
    ]
    non_resume_indicators = [
        "cover letter", "cover_letter", "coverletter", "cover", "transcript", "portfolio",
        "references", "writing sample", "diversity statement", "letter of recommendation",
        "additional document", "other document", "work sample", "attachment", "sample"
    ]

    # First pass: find the best explicit resume field
    # (A field where label/name/id contains resume/cv and does NOT contain cover letter/portfolio)
    resume_field_index = -1
    for i, field in enumerate(fields):
        if i >= len(actions):
            break
        if field.alreadyFilled:
            continue
        search_text = f"{field.label} {field.name} {field.id}".lower()
        is_resume = any(ind in search_text for ind in resume_indicators)
        is_non_resume = any(ind in search_text for ind in non_resume_indicators)

        if is_resume and not is_non_resume:
            resume_field_index = i
            break

    # If no explicit resume field found, check if there is a generic file upload that is not a non-resume slot
    if resume_field_index == -1:
        for i, field in enumerate(fields):
            if i >= len(actions):
                break
            if field.alreadyFilled:
                continue
            search_text = f"{field.label} {field.name} {field.id}".lower()
            is_non_resume = any(ind in search_text for ind in non_resume_indicators)
            if (field.type == "file" or "upload" in search_text or "attach" in search_text) and not is_non_resume:
                resume_field_index = i
                break

    # Second pass: strictly enforce upload only on resume_field_index, and skip on all other file / upload slots
    for i, field in enumerate(fields):
        if i >= len(actions):
            break
        if field.alreadyFilled:
            continue

        search_text = f"{field.label} {field.name} {field.id}".lower()
        is_file_field = field.type == "file" or "upload" in search_text or "attach" in search_text
        is_non_resume = any(ind in search_text for ind in non_resume_indicators)

        if i == resume_field_index:
            current_action = actions[i]
            actions[i] = FieldAction(
                selector=current_action.selector,
                action="upload",
                value="resume",
                label=current_action.label,
                explanation="Uploaded candidate resume"
            )
        elif is_file_field or is_non_resume:
            # If this is a secondary file slot (cover letter, portfolio, transcripts) or non-resume slot,
            # ensure the candidate resume is NOT uploaded into it.
            if actions[i].action == "upload" or actions[i].value == "resume":
                current_action = actions[i]
                actions[i] = FieldAction(
                    selector=current_action.selector,
                    action="skip",
                    value="",
                    label=current_action.label,
                    explanation="Optional document slot left blank"
                )
            elif is_non_resume and field.type == "file" and not field.required:
                current_action = actions[i]
                actions[i] = FieldAction(
                    selector=current_action.selector,
                    action="skip",
                    value="",
                    label=current_action.label,
                    explanation="Optional document slot left blank"
                )

    return actions

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

    # Current date reference values
    now = datetime.now()
    cur_month_2digit = now.strftime("%m")
    cur_month_1digit = str(now.month)
    cur_month_name = now.strftime("%B")
    cur_day_2digit = now.strftime("%d")
    cur_day_1digit = str(now.day)
    cur_year_4digit = now.strftime("%Y")
    cur_date_standard = now.strftime("%m/%d/%Y")

    # 2. Build system prompt instruction
    system_prompt = f"""
You are an expert AI job application autofilling agent. Your task is to inspect a list of job application form fields (provided as a JSON list) and decide how to fill them out based on the candidate's profile context.

Here is the candidate's context profile:
=== CANDIDATE CONTEXT PROFILE ===
{candidate_context}
=== END CANDIDATE CONTEXT PROFILE ===

CURRENT DATE REFERENCE:
- Today's Date: {cur_date_standard} ({cur_month_name} {cur_day_1digit}, {cur_year_4digit})
- Current Month: "{cur_month_2digit}" (or "{cur_month_1digit}" / "{cur_month_name}")
- Current Day: "{cur_day_2digit}" (or "{cur_day_1digit}")
- Current Year: "{cur_year_4digit}"

Instructions:
1. CRITICAL COMPLETENESS RULE: You MUST return exactly one `FieldAction` in the `actions` array for EVERY single field present in the input `fields` array. If the input list contains N fields, your output `actions` list MUST contain exactly N items, in the exact same order. Do NOT leave out or omit any field under any circumstances. If a field should be skipped or left blank (e.g. because it is already filled, or it is optional and has no useful answer), you MUST include a FieldAction for it with action: "skip" and value: "".
2. PRIVACY, CONSENTS, TERMS & CANDIDATE DECLARATIONS (ALWAYS AFFIRMATIVE):
   - Forms frequently include Candidate Privacy Notices, Data Processing Consents, Cross-Border Transfer Consents, Third-Party Sharing Consents, Terms of Application, or Truthfulness/Accuracy Declarations.
   - The candidate ALWAYS gives full consent and agrees to all data processing, privacy notices, data transfer, candidate terms, and declarations so that the application is processed and not rejected.
   - For radio buttons, dropdowns, or multiple choice questions asking for consent, agreement, understanding, or acknowledgment: select the affirmative option verbatim (e.g., "Yes", "I Agree", "Agree", "I Consent", "Consent", "Accept", "I understand", etc.). NEVER answer "No", "Disagree", or "Decline" to privacy notices, data processing, third party transfer, or candidate declarations.
   - For standalone checkboxes for privacy policies or terms: set action to "check" and value to "true".
3. VOLUNTARY SELF-IDENTIFICATION (EEO / DIVERSITY):
   - Disability Status:
     * The candidate does NOT have a disability.
     * For disability self-identification questions (e.g. "Voluntary Self-Identification of Disability", "Disability Status", Form CC-305, etc.):
     * ALWAYS select the option indicating "No, I do not have a disability and have not had one in the past" or "No, I do not have a disability" or "No" verbatim from the options list.
     * NEVER select "Yes, I have a disability" or affirmative disability options.
   - Veteran Status: Candidate is not a protected veteran. Select "I am not a protected veteran" or "No".
   - Gender: "Male".
   - Race / Ethnicity: "Hispanic or Latino", "White (Hispanic)".
4. DATE FIELDS & SPLIT DATE INPUTS (MONTH / DAY / YEAR):
   - Form fields representing dates may appear as a single input (`type: "date"` or `type: "text"` with label/placeholder like "MM/DD/YYYY") or split into separate sub-inputs for Month, Day, and Year (e.g., label or ID containing "Month", "Day", "Year", "dateSectionMonth", "dateSectionDay", "dateSectionYear", "dateSignedOn", etc.).
   - Signature / Sign-Off / Application Dates (e.g. "Date Signed", "Signature Date", "Date", "Date Signed On", "Today's Date", or date inputs in self-identification / consent forms):
     * ALWAYS fill with TODAY'S DATE (even if marked `required: false`, dating form signatures is expected):
     * If split into separate Month, Day, Year inputs:
       - Month field: Provide current month number "{cur_month_2digit}" (or "{cur_month_1digit}", or "{cur_month_name}" if options are month names). Action: "type" (or "select" if dropdown).
       - Day field: Provide current day number "{cur_day_2digit}" (or "{cur_day_1digit}"). Action: "type" (or "select" if dropdown).
       - Year field: Provide current year "{cur_year_4digit}". Action: "type" (or "select" if dropdown).
     * If a single date input: Provide "{cur_date_standard}" (or "YYYY-MM-DD" for native date inputs).
   - Profile Dates (e.g. Graduation Date, Available Start Date):
     * Graduation Date: Candidate's graduation is 05/01/2027 (Month: "05", Day: "01", Year: "2027").
     * Start Date: Candidate's availability is May 2027 (Month: "05", Day: "01", Year: "2027").
     * If split into Month / Day / Year, populate the respective component.
5. Match each form field (by label, ID, name, options) to the most relevant information in the candidate context.
6. Required vs Optional Fields and Missing Data / "N/A":
   - OPTIONAL FIELDS (`required: false` or not required):
     * If the candidate profile contains a clear, useful, and applicable answer (for example, technical skills, LinkedIn/GitHub/website URLs, relevant experience, etc.), fill it accurately using "type", "select", "check", or "upload".
     * If the candidate profile does NOT have a useful answer, or the context lists "(N/A)", "None", empty, or no score/data for that field (for example, optional SAT/ACT/GRE scores when not taken, optional Alternate Phone, Apartment/Suite, Graduate GPA, optional second address, etc.):
       -> LEAVE IT BLANK!
       -> Set action: "skip" and value: "" (do NOT type "N/A", "None", or guess/fabricate a fallback value into optional fields; do NOT select "N/A" or other placeholder options in optional dropdowns).
   - REQUIRED FIELDS (`required: true`):
     * For required fields, you MUST provide a valid value so the candidate's form submission is not blocked. Never use action: "skip" on an unfilled required field.
     * If the candidate context has the information, match it accurately.
     * If the candidate context lists "(N/A)", no score, or missing data for a REQUIRED field (excluding privacy/consent which is always affirmative):
       - For dropdowns / multiple choice (`type: "select"` or `type: "radio"`): Look for an option representing "N/A", "Not Applicable", "None", "No", "I did not take this test", "Decline to answer", or similar, and select that option verbatim. If no such option exists, make an educated guess by selecting the most logical standard fallback option. Note that generic unselected placeholders (like "Select...", "Choose...") must NOT be selected.
       - For text inputs (`type: "text"`): Provide a sensible fallback or best guess based on candidate context rather than leaving a required field empty.
7. Determine the correct 'action' and 'value':
   - "type": Use for text, tel, email, textarea, or numbers. Provide the text value (e.g. "Tyler", "+1 201-962-5813", etc.).
   - "select": Use for dropdown selections, radio button groups (`type: "radio"`), and multiple choice questions. If the field has a list of 'options' and optionsMode is 'strict' (such as dropdowns, radio button groups, or multiple choice question options), you MUST select one of the options in that list EXACTLY as written, character-for-character (for example, if options are ["Yes", "No"], return "Yes" or "No"; if option is "3.8 out of 4.0", return "3.8 out of 4.0" verbatim). If the field has `multiple: true` (which is a multiple choice / multi-select checkbox group or dropdown field), you can select multiple matching options. To do this, format the `value` as a JSON-serialized list of strings (e.g. `'["Secret", "Top Secret"]'`) or a semicolon-separated string (e.g. `"Secret; Top Secret"`). If optionsMode is 'dynamic' (meaning it is a search typeahead lookup box): if the 'options' list is empty, provide the best search keyword based on context (e.g., "Rensselaer" or "Troy"); if the 'options' list is NOT empty, you MUST choose a search keyword that corresponds to or filters down to one of the options in that list (for example, if options include 'Top Secret' and 'Secret', and the candidate context says 'Active DoD Secret Clearance', you MUST return 'Secret' as the value/search keyword, NOT 'Active DoD Secret Clearance', so that the dropdown filter is successful).
   - "check": Use for standalone checkboxes or boolean questions. Set the value to "true" to select/check, or "false" to uncheck. For radio buttons and multiple choice groups, you can use "select" with the exact option label, or "check" with the option label.
   - "upload": Use for file uploads. ONLY the primary Resume / CV slot (e.g. labeled "Resume", "CV", "Resume/CV", "Attach Resume") should have action: "upload" and value: "resume". You MUST NEVER upload the resume to secondary or other upload slots such as "Cover Letter", "Portfolio", "Portfolio or Cover Letter", "Transcripts", "References", or "Additional Documents". For those other upload slots, use action: "skip" and value: "".
   - "skip": Use for fields that should be left blank/unmodified:
     * Any optional field (`required: false`) where the candidate has no useful answer / context is (N/A) or missing (except signature/date fields which are dated).
     * Any field already filled (`alreadyFilled: true`).
     * Optional file upload slots with no candidate document.
     When using "skip", always set action to "skip" and value to "".
8. Overwrite Protection: If a field is marked with `alreadyFilled: true` (meaning the user has already entered or selected a value in it), you MUST NOT attempt to overwrite it. Instead, you MUST set action to "skip" and value to "" for that field, and note "Field already filled" in the explanation.
9. Keep the explanations extremely brief and friendly (e.g., "Matched to email", "Optional field left blank", "Agreed to privacy policy", "Dated signature", "Selected clearance", "Uploaded candidate resume", etc.).
10. Return a structured JSON response matching the FillPlan schema.
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
        # Apply deterministic affirmative consent safeguard
        fill_plan.actions = apply_affirmative_consents_safeguard(payload.fields, fill_plan.actions)
        # Apply deterministic resume file upload safeguard
        fill_plan.actions = apply_resume_upload_safeguard(payload.fields, fill_plan.actions)
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

