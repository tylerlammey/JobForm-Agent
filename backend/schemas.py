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
    optionsMode: Optional[str] = None
    elementSelector: str
    alreadyFilled: Optional[bool] = None
    frameId: Optional[int] = None


class FieldInputPayload(BaseModel):
    fields: List[ExtractedField]


class FieldAction(BaseModel):
    selector: str
    action: str
    value: str
    label: str
    explanation: str


class FillPlan(BaseModel):
    actions: List[FieldAction]
