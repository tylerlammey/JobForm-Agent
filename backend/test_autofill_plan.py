import urllib.request
import json

BACKEND_URL = "http://127.0.0.1:8000"

# Mock extracted fields payload mimicking a real job application form
mock_fields = [
    {
        "id": "first_name",
        "name": "first_name",
        "type": "text",
        "label": "First Name*",
        "placeholder": "",
        "required": True,
        "elementSelector": "#first_name",
        "alreadyFilled": True
    },
    {
        "id": "email",
        "name": "email",
        "type": "text",
        "label": "Email*",
        "placeholder": "",
        "required": True,
        "elementSelector": "#email"
    },
    {
        "id": "gender_select",
        "name": "gender",
        "type": "select",
        "label": "Gender*",
        "placeholder": "",
        "required": True,
        "options": ["Select...", "Male", "Female", "Non-Binary", "Decline to Self-Identify"],
        "optionsMode": "strict",
        "elementSelector": "#gender_select"
    },
    {
        "id": "sat_select",
        "name": "sat_score",
        "type": "select",
        "label": "What is your SAT Score?",
        "placeholder": "",
        "required": False,
        "options": ["Select...", "1600", "1500", "1400", "1200", "N/A", "Not Applicable"],
        "optionsMode": "strict",
        "elementSelector": "#sat_select"
    },
    {
        "id": "act_select",
        "name": "act_score",
        "type": "select",
        "label": "What is your ACT Score?",
        "placeholder": "",
        "required": False,
        "options": ["Select...", "36", "35", "34", "30", "I did not take this test"],
        "optionsMode": "strict",
        "elementSelector": "#act_select"
    },
    {
        "id": "gre_select",
        "name": "gre_score",
        "type": "select",
        "label": "What is your GRE Score?",
        "placeholder": "",
        "required": False,
        "options": ["Select...", "340", "330", "320", "310", "300"],
        "optionsMode": "strict",
        "elementSelector": "#gre_select"
    },
    {
        "id": "disability_select",
        "name": "disability",
        "type": "select",
        "label": "Voluntary Self-Identification of Disability*",
        "placeholder": "",
        "required": True,
        "options": ["Select...", "Yes, I have a disability", "No, I do not have a disability", "I do not wish to answer"],
        "optionsMode": "strict",
        "elementSelector": "#disability_select"
    },
    {
        "id": "clearance_select",
        "name": "clearance_select",
        "type": "select",
        "label": "Active Security Clearance(s)*",
        "placeholder": "",
        "required": True,
        "options": [
            "Top Secret SCI with Polygraph",
            "Top Secret SCI/SAP",
            "Top Secret",
            "DOE Level Q",
            "Secret",
            "Expired Clearance",
            "Never held a clearance",
            "Do not wish to disclose"
        ],
        "multiple": True,
        "optionsMode": "dynamic",
        "elementSelector": "#clearance_select"
    },
    {
        "id": "clearance_checkbox",
        "name": "has_clearance",
        "type": "checkbox",
        "label": "Do you hold an active DoD Security Clearance?*",
        "placeholder": "",
        "required": True,
        "elementSelector": "#clearance_checkbox"
    },
    {
        "id": "skills_select",
        "name": "skills_select",
        "type": "select",
        "label": "Programming Languages & Software Skills",
        "placeholder": "",
        "required": False,
        "options": [
            "Python",
            "MATLAB",
            "VBA",
            "Excel",
            "C++",
            "Java",
            "HTML/CSS"
        ],
        "multiple": True,
        "optionsMode": "strict",
        "elementSelector": "#skills_select"
    },
    {
        "id": "alternate_phone",
        "name": "alt_phone",
        "type": "text",
        "label": "Alternate Phone",
        "placeholder": "",
        "required": False,
        "elementSelector": "#alternate_phone"
    }
]

payload = {
    "fields": mock_fields
}

print("Sending mock fields payload to FastAPI endpoint `/api/fill-form`...")
req = urllib.request.Request(
    f"{BACKEND_URL}/api/fill-form",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req) as response:
        res_data = json.loads(response.read().decode("utf-8"))
        print("\n=== AI MATCHING FILL PLAN GENERATED ===")
        print(json.dumps(res_data, indent=2))
        print("========================================\n")
        
        # Verify specific test assertions
        actions = res_data.get("actions", [])
        
        # Check Gender
        gender_act = next((a for a in actions if a["selector"] == "#gender_select"), None)
        if gender_act:
            print(f"Gender Action: {gender_act['action']} -> '{gender_act['value']}' ({gender_act['explanation']})")
            
        # Check Disability Status
        disability_act = next((a for a in actions if a["selector"] == "#disability_select"), None)
        if disability_act:
            print(f"Disability Action: {disability_act['action']} -> '{disability_act['value']}' ({disability_act['explanation']})")

        print("\n=== RUNNING SAT/ACT/GRE MAPPING SCENARIO CHECKS ===")
        all_passed = True

        # Verify completeness (exactly one action per field, matching input array length)
        expected_len = len(mock_fields)
        actual_len = len(actions)
        if expected_len == actual_len:
            print(f"[PASS] Completeness check -> output actions count ({actual_len}) matches input fields count ({expected_len}) exactly")
        else:
            print(f"[FAIL] Completeness check -> expected {expected_len} actions, got {actual_len}")
            all_passed = False
        
        # Check First Name Overwrite Protection (should be skipped since alreadyFilled is True)
        first_name_act = next((a for a in actions if a["selector"] == "#first_name"), None)
        if first_name_act and first_name_act["action"] == "skip":
            print("[PASS] Overwrite Protection -> correctly skipped pre-filled First Name field")
        else:
            print(f"[FAIL] Overwrite Protection (Expected skip for pre-filled First Name, got: {first_name_act})")
            all_passed = False

        # Check SAT (N/A verbatim)
        sat_act = next((a for a in actions if a["selector"] == "#sat_select"), None)
        if sat_act and sat_act["action"] == "select" and sat_act["value"] == "N/A":
            print("[PASS] SAT Score -> selected 'N/A' verbatim")
        else:
            print(f"[FAIL] SAT Score (Expected select 'N/A', got: {sat_act})")
            all_passed = False

        # Check ACT (I did not take this test)
        act_act = next((a for a in actions if a["selector"] == "#act_select"), None)
        if act_act and act_act["action"] == "select" and act_act["value"] == "I did not take this test":
            print("[PASS] ACT Score -> selected 'I did not take this test'")
        else:
            print(f"[FAIL] ACT Score (Expected select 'I did not take this test', got: {act_act})")
            all_passed = False

        # Check GRE (Now forced to guess/select fallback)
        gre_act = next((a for a in actions if a["selector"] == "#gre_select"), None)
        if gre_act and gre_act["action"] == "select":
            print(f"[PASS] GRE Score -> guessed select option '{gre_act['value']}'")
        else:
            print(f"[FAIL] GRE Score (Expected select action, got: {gre_act})")
            all_passed = False
            
        # Check Alternate Phone (Now forced to guess)
        alt_phone_act = next((a for a in actions if a["selector"] == "#alternate_phone"), None)
        if alt_phone_act and alt_phone_act["action"] == "type" and alt_phone_act["value"]:
            print(f"[PASS] Alternate Phone -> guessed typed value '{alt_phone_act['value']}'")
        else:
            print(f"[FAIL] Alternate Phone (Expected type action, got: {alt_phone_act})")
            all_passed = False

        # Check Dynamic Clearance Option Selection
        clearance_select_act = next((a for a in actions if a["selector"] == "#clearance_select"), None)
        if clearance_select_act and clearance_select_act["action"] == "select" and clearance_select_act["value"] == "Secret":
            print("[PASS] Dynamic Clearance Select -> matched verbatim option 'Secret'")
        else:
            print(f"[FAIL] Dynamic Clearance Select (Expected select 'Secret', got: {clearance_select_act})")
            all_passed = False

        # Check Multiple Choice Option Selection
        skills_act = next((a for a in actions if a["selector"] == "#skills_select"), None)
        if skills_act and skills_act["action"] == "select":
            val = skills_act["value"]
            import json
            parsed_vals = []
            if val.startswith("[") and val.endswith("]"):
                try:
                    parsed_vals = json.loads(val)
                except Exception:
                    pass
            elif ";" in val:
                parsed_vals = [v.strip() for v in val.split(";")]
            else:
                parsed_vals = [val.strip()]
            
            if "MATLAB" in parsed_vals and "VBA" in parsed_vals:
                print(f"[PASS] Multiple Choice Select -> correctly selected both 'MATLAB' and 'VBA'")
            else:
                print(f"[FAIL] Multiple Choice Select (Expected 'MATLAB' and 'VBA' in {parsed_vals})")
                all_passed = False
        else:
            print(f"[FAIL] Multiple Choice Select (Expected select action for #skills_select, got: {skills_act})")
            all_passed = False
            
        if not all_passed:
            print("\n[RESULT] One or more mapping checks failed!")
            import sys
            sys.exit(1)
        else:
            print("\n[RESULT] All mapping checks passed successfully!")

except Exception as e:
    print(f"Error executing test: {e}")
