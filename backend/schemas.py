from pydantic import BaseModel
from typing import List, Optional


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
    frameId: Optional[int] = None


class FieldInputPayload(BaseModel):
    fields: List[ExtractedField]


class FieldAction(BaseModel):
    selector: str
    action: str        # "type" | "select" | "check" | "upload" | "skip"
    value: str          # Text to type, select option text, or check boolean
    label: str          # Original field label
    explanation: str    # Brief rationale for verification


class FillPlan(BaseModel):
    actions: List[FieldAction]
