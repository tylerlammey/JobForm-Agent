import os
from datetime import date
from typing import Optional

import openpyxl
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from openpyxl.styles import Font
from pydantic import BaseModel

router = APIRouter()

TRACKER_PATH = os.environ.get(
    "APPLICATIONS_XLSX_PATH",
    os.path.join(os.path.dirname(__file__), "data", "Application_Tracker.xlsx"),
)

# --- Hardcoded template: the bundled Application_Tracker.xlsx layout ---
HARDCODED_FILENAME = "Application_Tracker.xlsx"
HARDCODED_SHEET = "Applications"
HARDCODED_HEADER_ROW = 3
HARDCODED_DATA_START_ROW = 4
HARDCODED_HEADERS = [
    "Company", "Role / Title", "Location", "Remote?", "Source", "Date Applied",
    "Deadline", "Status", "Priority", "Contact / Referral", "Stipend / Pay",
    "Next Step", "Follow-up Date", "Job Link", "Notes",
]

# Canonical field order, positionally aligned with HARDCODED_HEADERS (A-O).
COLUMN_ORDER = [
    "company", "role", "location", "remote", "source", "date_applied",
    "deadline", "status", "priority", "contact", "stipend", "next_step",
    "follow_up_date", "job_link", "notes",
]

# Header text variants accepted when matching an arbitrary user-provided sheet
# in generic (soft-coded) mode.
FIELD_ALIASES = {
    "company": ["company", "company name", "employer"],
    "role": ["role", "role / title", "title", "position", "job title"],
    "location": ["location", "city"],
    "remote": ["remote?", "remote", "work type"],
    "source": ["source"],
    "date_applied": ["date applied", "applied date", "application date", "date"],
    "deadline": ["deadline"],
    "status": ["status", "application status"],
    "priority": ["priority"],
    "contact": ["contact / referral", "contact", "referral"],
    "stipend": ["stipend / pay", "pay", "salary", "stipend"],
    "next_step": ["next step", "next steps"],
    "follow_up_date": ["follow-up date", "follow up date", "followup date"],
    "job_link": ["job link", "link", "url"],
    "notes": ["notes", "comments"],
}

MIN_HEADER_MATCHES = 2
HEADER_SCAN_ROWS = 10

# Presentation tweaks applied when writing a row -- a raw Job Link URL made
# rows unreadable, and a narrow Company column clipped longer names.
JOB_LINK_DISPLAY_TEXT = "Job Link"
HYPERLINK_FONT = Font(color="0563C1", underline="single")
COMPANY_COLUMN_MIN_WIDTH = 10.0
COMPANY_COLUMN_MAX_WIDTH = 50.0


class ApplicationLogEntry(BaseModel):
    company: str
    role: Optional[str] = None
    location: Optional[str] = None
    remote: Optional[str] = None
    source: Optional[str] = None
    date_applied: Optional[str] = None
    deadline: Optional[str] = None
    status: Optional[str] = "Applied"
    priority: Optional[str] = None
    contact: Optional[str] = None
    stipend: Optional[str] = None
    next_step: Optional[str] = None
    follow_up_date: Optional[str] = None
    job_link: Optional[str] = None
    notes: Optional[str] = None
    # Set by the client to confirm a write in generic mode even though no
    # "Company"-like column was found (see _append_generic).
    force: bool = False
    # Optional per-request override so a user can point at their own
    # spreadsheet from the popup instead of the server-configured default
    # (TRACKER_PATH / APPLICATIONS_XLSX_PATH). Absolute path on the same
    # machine the backend runs on -- everything else about how the row gets
    # written (hardcoded vs generic mode, header matching) is unchanged.
    sheet_path: Optional[str] = None


def _entry_values(entry: ApplicationLogEntry) -> dict:
    values = entry.model_dump(exclude={"force"})
    if not values.get("date_applied"):
        values["date_applied"] = date.today().isoformat()
    return values


def _looks_like_url(value) -> bool:
    return str(value).strip().lower().startswith(("http://", "https://"))


def _write_field_value(ws, row: int, col_index: int, field_name: str, value) -> None:
    """Writes one field into its cell, both writer modes go through this so
    the presentation tweaks below only need to live in one place:
    - job_link: shown as short "Job Link" text with the real URL kept as the
      cell's hyperlink target, instead of a long raw URL stretching the row.
    - company: the column's width grows (never shrinks) to fit whatever's
      been written, so names don't get visually clipped in Excel.
    """
    cell = ws.cell(row=row, column=col_index)

    if field_name == "job_link" and value and _looks_like_url(value):
        cell.value = JOB_LINK_DISPLAY_TEXT
        cell.hyperlink = value
        cell.font = HYPERLINK_FONT
    else:
        cell.value = value

    if field_name == "company" and value:
        col_letter = cell.column_letter
        desired_width = min(max(len(str(value)) + 2, COMPANY_COLUMN_MIN_WIDTH), COMPANY_COLUMN_MAX_WIDTH)
        current_width = ws.column_dimensions[col_letter].width
        if current_width is None or desired_width > current_width:
            ws.column_dimensions[col_letter].width = desired_width


# --- Hardcoded writer: unchanged behavior from the original implementation ---

def _is_hardcoded_template(wb, path: str) -> bool:
    """True only if the filename matches AND the sheet actually has the exact
    expected structure -- protects against someone else's differently laid out
    file coincidentally sharing the template's filename."""
    if os.path.basename(path) != HARDCODED_FILENAME:
        return False
    if HARDCODED_SHEET not in wb.sheetnames:
        return False
    ws = wb[HARDCODED_SHEET]
    actual = [ws.cell(row=HARDCODED_HEADER_ROW, column=c).value for c in range(1, len(HARDCODED_HEADERS) + 1)]
    return actual == HARDCODED_HEADERS


def _find_next_empty_row_hardcoded(ws) -> int:
    for row in range(HARDCODED_DATA_START_ROW, ws.max_row + 1):
        if ws.cell(row=row, column=1).value in (None, ""):
            return row
    return ws.max_row + 1


def _append_hardcoded(wb, entry: ApplicationLogEntry) -> dict:
    ws = wb[HARDCODED_SHEET]
    row = _find_next_empty_row_hardcoded(ws)
    values = _entry_values(entry)
    for col_index, field_name in enumerate(COLUMN_ORDER, start=1):
        value = values.get(field_name)
        if value:
            _write_field_value(ws, row, col_index, field_name, value)
    return {"status": "ok", "row": row, "mode": "hardcoded"}


# --- Generic writer: best-effort header-name matching for arbitrary sheets ---

def _normalize(text) -> str:
    return str(text).strip().lower() if text is not None else ""


def _alias_field_for(header_text: str) -> Optional[str]:
    for field_name, aliases in FIELD_ALIASES.items():
        if header_text in aliases:
            return field_name
    return None


def _find_header_row(wb):
    """Scans every sheet's first HEADER_SCAN_ROWS rows for the row that matches
    the most known field aliases (a sheet literally named 'Applications' wins
    ties). Returns (worksheet, header_row) or (None, None) if nothing plausible
    is found. Deliberately does not require a 'Company' match specifically --
    that's checked separately so a sheet lacking it can still be located."""
    sheet_names = sorted(wb.sheetnames, key=lambda n: 0 if n.strip().lower() == "applications" else 1)
    best = None  # (match_count, worksheet, row)
    for sheet_name in sheet_names:
        ws = wb[sheet_name]
        for row in range(1, min(HEADER_SCAN_ROWS, ws.max_row) + 1):
            match_count = sum(
                1 for col in range(1, ws.max_column + 1)
                if _alias_field_for(_normalize(ws.cell(row=row, column=col).value))
            )
            if match_count >= MIN_HEADER_MATCHES and (best is None or match_count > best[0]):
                best = (match_count, ws, row)
    if best is None:
        return None, None
    return best[1], best[2]


def _build_header_map(ws, header_row: int) -> dict:
    header_map = {}
    for col in range(1, ws.max_column + 1):
        field_name = _alias_field_for(_normalize(ws.cell(row=header_row, column=col).value))
        if field_name and field_name not in header_map:
            header_map[field_name] = col
    return header_map


def _find_next_empty_row_generic(ws, header_row: int, matched_columns) -> int:
    for row in range(header_row + 1, ws.max_row + 1):
        if all(ws.cell(row=row, column=c).value in (None, "") for c in matched_columns):
            return row
    return ws.max_row + 1


def _append_generic(wb, entry: ApplicationLogEntry) -> dict:
    ws, header_row = _find_header_row(wb)
    if ws is None:
        raise ValueError(
            "Could not find a header row with recognizable columns (e.g. Company, Role, Status...) "
            "in this spreadsheet. Soft-coded matching isn't possible for this file's layout."
        )

    header_map = _build_header_map(ws, header_row)
    matched_fields = [f for f in COLUMN_ORDER if f in header_map]
    unmatched_fields = [f for f in COLUMN_ORDER if f not in header_map]

    if "company" not in header_map and not entry.force:
        # Don't write anything yet -- let the caller decide whether to push
        # the row anyway once they see what would and wouldn't be captured.
        return {
            "status": "needs_confirmation",
            "matched_fields": matched_fields,
            "unmatched_fields": unmatched_fields,
        }

    values = _entry_values(entry)
    fields_to_write = {f: values[f] for f in matched_fields if values.get(f)}
    if not fields_to_write:
        raise ValueError(
            "None of the fields you filled in matched a column in this spreadsheet -- nothing to log."
        )

    row = _find_next_empty_row_generic(ws, header_row, header_map.values())
    for field_name, value in fields_to_write.items():
        _write_field_value(ws, row, header_map[field_name], field_name, value)

    return {"status": "ok", "row": row, "mode": "generic", "unmatched_fields": unmatched_fields}


def append_application(entry: ApplicationLogEntry) -> dict:
    """Loads the existing workbook, appends one row via whichever strategy
    matches, and saves back to the same path. Never constructs a fresh
    workbook, so any manual edits, extra sheets, or formatting the user has
    added are preserved."""
    target_path = entry.sheet_path.strip() if entry.sheet_path and entry.sheet_path.strip() else TRACKER_PATH

    if not os.path.exists(target_path):
        raise FileNotFoundError(
            f"Tracker spreadsheet not found at {target_path}. Place your spreadsheet there, "
            "or set APPLICATIONS_XLSX_PATH to point to it."
        )

    try:
        wb = openpyxl.load_workbook(target_path)
    except PermissionError:
        raise PermissionError(
            f"{os.path.basename(target_path)} is open in another program (e.g. Excel). Close it and try again."
        )

    if _is_hardcoded_template(wb, target_path):
        result = _append_hardcoded(wb, entry)
    else:
        result = _append_generic(wb, entry)

    if result["status"] == "needs_confirmation":
        return result  # nothing written -- no save needed

    try:
        wb.save(target_path)
    except PermissionError:
        raise PermissionError(
            f"{os.path.basename(target_path)} is open in another program (e.g. Excel). Close it and try again."
        )

    return result


@router.get("/api/export-tracker")
async def export_tracker(path: Optional[str] = None):
    """Returns the tracker workbook as a downloadable file -- the server
    default, or a specific sheet_path the popup was pointed at, via ?path=."""
    target_path = path.strip() if path and path.strip() else TRACKER_PATH
    if not os.path.exists(target_path):
        raise HTTPException(
            status_code=404,
            detail=f"Tracker spreadsheet not found at {target_path}. Nothing to export yet."
        )
    return FileResponse(
        path=target_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=os.path.basename(target_path),
    )


@router.post("/api/log-application")
async def log_application(entry: ApplicationLogEntry):
    """Appends one row to the candidate's tracker spreadsheet (never overwrites)."""
    try:
        result = append_application(entry)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return result
