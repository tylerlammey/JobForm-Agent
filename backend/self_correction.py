"""
Self-correction retry loop: for fields whose value doesn't match one of that
field's own options (a common failure mode -- the LLM either hallucinates a
value or cross-contaminates from a neighboring question), re-queries the LLM
for just the broken fields with targeted feedback, up to a few attempts, then
falls back to a deterministic option choice if it still isn't fixed.
"""
import json
from typing import List

from schemas import ExtractedField, FieldAction, FillPlan
from llm_client import parse_structured
from prompts import build_retry_prompt


def is_option_valid(field: ExtractedField, action: FieldAction) -> bool:
    """
    Checks if an action's selected value exists in the field's options list
    and is not an unselected placeholder.
    """
    if not field.options or len(field.options) == 0:
        return True

    if action.action == "skip":
        return True

    if action.action == "select":
        val = action.value.strip()
        if not val:
            return not field.required

        # Placeholders are never valid selections
        placeholder_terms = ["select...", "select an option", "choose...", "choose an option", "please select", "please choose", "-- select --"]
        if val.lower() in placeholder_terms:
            return False

        # Multi-select dropdown or checkbox group
        if field.multiple:
            parsed_vals = []
            if val.startswith("[") and val.endswith("]"):
                try:
                    parsed_vals = json.loads(val)
                except Exception:
                    parsed_vals = [v.strip() for v in val.split(";")]
            elif ";" in val:
                parsed_vals = [v.strip() for v in val.split(";")]
            else:
                parsed_vals = [val]

            return all(v in field.options and v.lower() not in placeholder_terms for v in parsed_vals if v)
        else:
            # Single select must be exactly in options and not a placeholder
            return val in field.options and val.lower() not in placeholder_terms

    return True


def find_invalid_option_indices(fields: List[ExtractedField], actions: List[FieldAction]) -> List[int]:
    invalid_indices = []
    for i, field in enumerate(fields):
        if i >= len(actions):
            break
        if field.alreadyFilled:
            continue
        if not is_option_valid(field, actions[i]):
            invalid_indices.append(i)
    return invalid_indices


def retry_invalid_fields_with_llm(
    fields: List[ExtractedField],
    actions: List[FieldAction],
    candidate_context: str,
    max_retries: int = 3
) -> List[FieldAction]:
    """
    Identifies fields with invalid or cross-contaminated option values
    and re-runs ONLY those specific fields through the LLM with targeted feedback,
    capped at max_retries attempts.
    """
    for attempt in range(1, max_retries + 1):
        invalid_indices = find_invalid_option_indices(fields, actions)
        if not invalid_indices:
            break

        print(f"Self-correction retry attempt {attempt}/{max_retries} for {len(invalid_indices)} invalid field(s)...")

        sub_fields = [fields[i] for i in invalid_indices]
        problem_details = []
        for idx in invalid_indices:
            f = fields[idx]
            a = actions[idx]
            problem_details.append({
                "field_id": f.id,
                "label": f.label,
                "invalid_value_chosen": a.value,
                "available_options": f.options
            })

        try:
            retry_plan = parse_structured(
                system_prompt=build_retry_prompt(candidate_context),
                user_content=f"The previous attempt had these option errors:\n{json.dumps(problem_details, indent=2)}\n\nHere are the extracted fields to correct:\n{json.dumps([f.model_dump() for f in sub_fields], indent=2)}",
                output_model=FillPlan,
                temperature=0.0
            )

            corrected_actions = retry_plan.actions
            if len(corrected_actions) == len(invalid_indices):
                for k, orig_idx in enumerate(invalid_indices):
                    act = corrected_actions[k]
                    # Normalize action to select if field has options and action is not skip/check
                    if fields[orig_idx].options and act.action not in ["select", "skip", "check"]:
                        act.action = "select"
                    actions[orig_idx] = act
                    print(f"Patched field [{fields[orig_idx].id}] -> action: {actions[orig_idx].action}, value: '{actions[orig_idx].value}'")
        except Exception as e:
            print(f"Error during LLM retry attempt {attempt}: {e}")
            break

    # If any fields remain invalid after max_retries, apply a deterministic fallback from field.options
    remaining_invalid = find_invalid_option_indices(fields, actions)
    for idx in remaining_invalid:
        f = fields[idx]
        current_act = actions[idx]
        if f.options and len(f.options) > 0:
            fallback = next((opt for opt in f.options if any(na in opt.lower() for na in ["not applicable", "did not take", "n/a", "none", "no preference", "decline"])), None)
            if not fallback:
                fallback = next((opt for opt in f.options if not any(ph in opt.lower() for ph in ["select", "choose", "please"])), f.options[0])
            actions[idx] = FieldAction(
                selector=current_act.selector,
                action="select",
                value=fallback,
                label=current_act.label,
                explanation="Resolved to valid option fallback"
            )

    return actions
