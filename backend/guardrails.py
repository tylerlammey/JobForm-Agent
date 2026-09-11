import re
from typing import Callable, List, Optional

from schemas import ExtractedField, FieldAction


def apply_affirmative_consents_safeguard(fields: List[ExtractedField], actions: List[FieldAction], candidate_context: str = "") -> List[FieldAction]:
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


def apply_resume_upload_safeguard(fields: List[ExtractedField], actions: List[FieldAction], candidate_context: str = "") -> List[FieldAction]:
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

    # Some ATS platforms (Workday especially) don't label the upload slot
    # itself -- they pair one generic, reusable file input with a separate
    # "Document Type"/"Category" dropdown (options like "Resume", "Cover
    # Letter", "Transcript"). The checks above never catch this because the
    # file field's own label says nothing about what it's for. If a
    # neighboring type-selector was set to a non-resume category, make sure
    # the adjacent upload slot didn't get the resume anyway.
    document_type_hints = ["document type", "attachment type", "file type", "doc type", "category"]
    for i, field in enumerate(fields):
        if i >= len(actions):
            break
        search_text = f"{field.label} {field.name} {field.id}".lower()
        is_type_selector = bool(field.options) and any(hint in search_text for hint in document_type_hints)
        if not is_type_selector:
            continue

        chosen_value = (actions[i].value or "").lower()
        if not any(ind in chosen_value for ind in non_resume_indicators):
            continue

        for neighbor_i in (i - 1, i + 1):
            if 0 <= neighbor_i < len(fields) and neighbor_i < len(actions):
                neighbor_field = fields[neighbor_i]
                neighbor_action = actions[neighbor_i]
                if neighbor_field.type == "file" and (neighbor_action.action == "upload" or neighbor_action.value == "resume"):
                    actions[neighbor_i] = FieldAction(
                        selector=neighbor_action.selector,
                        action="skip",
                        value="",
                        label=neighbor_action.label,
                        explanation=f"Paired document-type selector was set to '{actions[i].value}', not resume -- left blank"
                    )

    return actions


# Line-level label patterns used to find each link in the candidate's own
# context.md text (see backend/me/context.example.md's "Personal Information"
# section) -- deliberately independent of any one person's actual URLs.
LINK_LABEL_PATTERNS = {
    "linkedin": [r"linkedin"],
    "github": [r"\bgithub\b"],
    "website": [r"\bwebsite\b", r"\bportfolio\b", r"\bpersonal site\b"],
}


def _extract_profile_url(candidate_context: str, label_patterns: List[str]) -> Optional[str]:
    """Finds the first line in the candidate's profile matching one of the given
    label patterns and pulls the URL out of it (e.g. "- **LinkedIn:** [x](https://...)")."""
    for line in candidate_context.splitlines():
        lower = line.lower()
        if any(re.search(pattern, lower) for pattern in label_patterns):
            match = re.search(r"https?://\S+", line)
            if match:
                return match.group(0).rstrip(").,]>\"'")
    return None


def apply_candidate_links_safeguard(fields: List[ExtractedField], actions: List[FieldAction], candidate_context: str = "") -> List[FieldAction]:
    """
    Ensures that text fields requesting social profiles / links (LinkedIn, Website / Portfolio, GitHub)
    are populated with the candidate's own URLs (parsed from their context.md), even if marked optional.
    """
    linkedin_url = _extract_profile_url(candidate_context, LINK_LABEL_PATTERNS["linkedin"])
    github_url = _extract_profile_url(candidate_context, LINK_LABEL_PATTERNS["github"])
    website_url = _extract_profile_url(candidate_context, LINK_LABEL_PATTERNS["website"])

    for i, field in enumerate(fields):
        if i >= len(actions):
            break
        if field.alreadyFilled:
            continue

        search_text = f"{field.label} {field.name} {field.id}".lower()

        # Don't apply to file upload inputs or checkboxes
        if field.type in ["file", "checkbox", "check"]:
            continue

        current_action = actions[i]
        if current_action.action != "skip" and current_action.value:
            continue  # LLM already filled this in -- don't override

        # LinkedIn
        if "linkedin" in search_text and linkedin_url:
            actions[i] = FieldAction(
                selector=current_action.selector,
                action="type",
                value=linkedin_url,
                label=current_action.label,
                explanation="Matched to LinkedIn profile"
            )
        # GitHub
        elif ("github" in search_text or "git_hub" in search_text) and github_url:
            actions[i] = FieldAction(
                selector=current_action.selector,
                action="type",
                value=github_url,
                label=current_action.label,
                explanation="Matched to GitHub profile"
            )
        # Personal Website / Portfolio
        elif any(w in search_text for w in ["website", "portfolio url", "personal site", "personal webpage", "online portfolio"]) and website_url:
            actions[i] = FieldAction(
                selector=current_action.selector,
                action="type",
                value=website_url,
                label=current_action.label,
                explanation="Matched to personal website/portfolio URL"
            )

    return actions


# Deterministic post-processing safeguards applied (in order) to every fill plan,
# after the LLM has produced its initial actions. To disable a safeguard, comment
# out or remove its entry here -- no changes needed elsewhere. To add a new one,
# write a `(fields, actions, candidate_context) -> actions` function above and
# append it below.
GUARDRAILS: List[Callable[[List[ExtractedField], List[FieldAction], str], List[FieldAction]]] = [
    apply_affirmative_consents_safeguard,
    apply_resume_upload_safeguard,
    apply_candidate_links_safeguard,
]


def apply_guardrails(fields: List[ExtractedField], actions: List[FieldAction], candidate_context: str = "") -> List[FieldAction]:
    """Runs every registered guardrail over the fill plan, in order."""
    for guardrail in GUARDRAILS:
        actions = guardrail(fields, actions, candidate_context)
    return actions
