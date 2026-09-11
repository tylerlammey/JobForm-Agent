from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

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
    expose_headers=["Content-Disposition"],
)

from schemas import FieldInputPayload, FieldAction, FillPlan
from guardrails import apply_guardrails
from tracker import router as tracker_router
from llm_client import parse_structured, LLM_PROVIDER
from context_loader import load_candidate_context
from prompts import build_system_prompt
from self_correction import retry_invalid_fields_with_llm

app.include_router(tracker_router)


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

    try:
        candidate_context = load_candidate_context()
    except FileNotFoundError as e:
        return {
            "actions": [
                FieldAction(
                    selector="body",
                    action="skip",
                    value="",
                    label="System Error",
                    explanation=f"Error: {str(e)}"
                )
            ]
        }
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

    system_prompt = build_system_prompt(candidate_context)

    # Call the configured LLM provider (LLM_PROVIDER in backend/.env; defaults to OpenAI) for a Structured Outputs completion
    try:
        # Reads the active provider's API key from environment. If it is placeholder or missing, it will raise an error.
        fill_plan = parse_structured(
            system_prompt=system_prompt,
            user_content=f"Here are the form fields extracted from the page:\n{payload.model_dump_json()}",
            output_model=FillPlan,
            temperature=0.1  # Low temperature for highly deterministic matching
        )
        # Apply targeted LLM self-correction retry loop for any invalid/cross-contaminated options (up to 3 attempts)
        fill_plan.actions = retry_invalid_fields_with_llm(payload.fields, fill_plan.actions, candidate_context, max_retries=3)
        # Apply deterministic post-processing guardrails (see guardrails.py to add/remove one)
        fill_plan.actions = apply_guardrails(payload.fields, fill_plan.actions, candidate_context)
        print('\n\n', fill_plan)
        return fill_plan

    except Exception as e:
        error_msg = str(e)
        provider_name = "Anthropic" if LLM_PROVIDER == "anthropic" else "OpenAI"
        if "api_key" in error_msg.lower() or "auth" in error_msg.lower():
            explanation_str = f"Error: {provider_name} API key is missing or invalid. Please check backend/.env file."
        else:
            explanation_str = f"Error calling {provider_name} API: {error_msg}"

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
