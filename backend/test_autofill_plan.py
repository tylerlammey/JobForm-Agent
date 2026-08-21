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
    },
    {
        "id": "work_auth_radio",
        "name": "work_auth",
        "type": "radio",
        "label": "Are you legally authorized to work in the United States?*",
        "placeholder": "",
        "required": True,
        "options": ["Yes", "No"],
        "optionsMode": "strict",
        "elementSelector": 'input[name="work_auth"]'
    },
    {
        "id": "sponsorship_radio",
        "name": "sponsorship",
        "type": "radio",
        "label": "Will you now or in the future require visa sponsorship?*",
        "placeholder": "",
        "required": True,
        "options": ["Yes", "No"],
        "optionsMode": "strict",
        "elementSelector": 'input[name="sponsorship"]'
    },
    {
        "id": "relocation_radio",
        "name": "relocate",
        "type": "radio",
        "label": "Are you willing to relocate for this position?*",
        "placeholder": "",
        "required": True,
        "options": ["Yes", "No", "Depends on location"],
        "optionsMode": "strict",
        "elementSelector": 'input[name="relocate"]'
    },
    {
        "id": "privacy_understand_radio",
        "name": "privacy_understand",
        "type": "radio",
        "label": "I understand the purposes for which my personal data will be collected during application stage.*",
        "placeholder": "",
        "required": True,
        "options": ["Yes", "No"],
        "optionsMode": "strict",
        "elementSelector": 'input[name="privacy_understand"]'
    },
    {
        "id": "privacy_consent_radio",
        "name": "privacy_consent",
        "type": "radio",
        "label": "I hereby consent to sharing and provision of my Personal Information to third parties, including transfer to other countries, as described in the Candidate Privacy Notice.*",
        "placeholder": "",
        "required": True,
        "options": ["Yes", "No"],
        "optionsMode": "strict",
        "elementSelector": 'input[name="privacy_consent"]'
    },
    {
        "id": "resume_file_input",
        "name": "resume",
        "type": "file",
        "label": "Attach Resume/CV*",
        "placeholder": "",
        "required": True,
        "elementSelector": "#resume_file_input"
    },
    {
        "id": "cover_letter_input",
        "name": "cover_letter",
        "type": "file",
        "label": "Cover Letter (Optional)",
        "placeholder": "",
        "required": False,
        "elementSelector": "#cover_letter_input"
    },
    {
        "id": "portfolio_or_cover_letter",
        "name": "portfolio_cover",
        "type": "file",
        "label": "Portfolio or Cover Letter",
        "placeholder": "",
        "required": False,
        "elementSelector": "#portfolio_or_cover_letter"
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

        # Check SAT (Optional field with N/A context -> should skip / leave blank)
        sat_act = next((a for a in actions if a["selector"] == "#sat_select"), None)
        if sat_act and sat_act["action"] == "skip":
            print("[PASS] SAT Score -> correctly skipped / left blank for optional field with N/A context")
        else:
            print(f"[FAIL] SAT Score (Expected action: 'skip', got: {sat_act})")
            all_passed = False

        # Check ACT (Optional field with N/A context -> should skip / leave blank)
        act_act = next((a for a in actions if a["selector"] == "#act_select"), None)
        if act_act and act_act["action"] == "skip":
            print("[PASS] ACT Score -> correctly skipped / left blank for optional field with N/A context")
        else:
            print(f"[FAIL] ACT Score (Expected action: 'skip', got: {act_act})")
            all_passed = False

        # Check GRE (Optional field with N/A context -> should skip / leave blank)
        gre_act = next((a for a in actions if a["selector"] == "#gre_select"), None)
        if gre_act and gre_act["action"] == "skip":
            print("[PASS] GRE Score -> correctly skipped / left blank for optional field with N/A context")
        else:
            print(f"[FAIL] GRE Score (Expected action: 'skip', got: {gre_act})")
            all_passed = False
            
        # Check Alternate Phone (Optional field with N/A context -> should skip / leave blank)
        alt_phone_act = next((a for a in actions if a["selector"] == "#alternate_phone"), None)
        if alt_phone_act and alt_phone_act["action"] == "skip":
            print("[PASS] Alternate Phone -> correctly skipped / left blank for optional field with N/A context")
        else:
            print(f"[FAIL] Alternate Phone (Expected action: 'skip', got: {alt_phone_act})")
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
            
            valid_candidate_skills = {"Python", "MATLAB", "VBA", "C++", "HTML/CSS"}
            matched_candidate_skills = [s for s in parsed_vals if s in valid_candidate_skills]
            if len(matched_candidate_skills) >= 2:
                print(f"[PASS] Multiple Choice Select -> correctly selected multiple candidate skills: {matched_candidate_skills}")
            else:
                print(f"[FAIL] Multiple Choice Select (Expected at least 2 candidate skills in {parsed_vals})")
                all_passed = False
        else:
            print(f"[FAIL] Multiple Choice Select (Expected select action for #skills_select, got: {skills_act})")
            all_passed = False
            
        # Check Radio Group Multiple Choice Questions
        work_auth_act = next((a for a in actions if a["selector"] == 'input[name="work_auth"]'), None)
        if work_auth_act and work_auth_act["value"] == "Yes":
            print(f"[PASS] Work Auth Radio -> correctly matched 'Yes' ({work_auth_act['explanation']})")
        else:
            print(f"[FAIL] Work Auth Radio (Expected 'Yes', got: {work_auth_act})")
            all_passed = False

        sponsorship_act = next((a for a in actions if a["selector"] == 'input[name="sponsorship"]'), None)
        if sponsorship_act and sponsorship_act["value"] == "No":
            print(f"[PASS] Visa Sponsorship Radio -> correctly matched 'No' ({sponsorship_act['explanation']})")
        else:
            print(f"[FAIL] Visa Sponsorship Radio (Expected 'No', got: {sponsorship_act})")
            all_passed = False

        relocation_act = next((a for a in actions if a["selector"] == 'input[name="relocate"]'), None)
        if relocation_act and relocation_act["value"] == "Yes":
            print(f"[PASS] Relocation Radio -> correctly matched 'Yes' ({relocation_act['explanation']})")
        else:
            print(f"[FAIL] Relocation Radio (Expected 'Yes', got: {relocation_act})")
            all_passed = False

        # Check Privacy Policy & Candidate Consent Radios
        privacy_und_act = next((a for a in actions if a["selector"] == 'input[name="privacy_understand"]'), None)
        if privacy_und_act and privacy_und_act["value"] == "Yes":
            print(f"[PASS] Privacy Understanding Radio -> correctly matched 'Yes' ({privacy_und_act['explanation']})")
        else:
            print(f"[FAIL] Privacy Understanding Radio (Expected 'Yes', got: {privacy_und_act})")
            all_passed = False

        privacy_con_act = next((a for a in actions if a["selector"] == 'input[name="privacy_consent"]'), None)
        if privacy_con_act and privacy_con_act["value"] == "Yes":
            print(f"[PASS] Privacy Consent Radio -> correctly matched 'Yes' ({privacy_con_act['explanation']})")
        else:
            print(f"[FAIL] Privacy Consent Radio (Expected 'Yes', got: {privacy_con_act})")
            all_passed = False

        # Check File Uploads (Resume vs Optional Cover Letter)
        resume_act = next((a for a in actions if a["selector"] == "#resume_file_input"), None)
        if resume_act and resume_act["action"] == "upload" and resume_act["value"] == "resume":
            print(f"[PASS] Resume Upload -> correctly mapped to action 'upload' and value 'resume' ({resume_act['explanation']})")
        else:
            print(f"[FAIL] Resume Upload (Expected action: 'upload', value: 'resume', got: {resume_act})")
            all_passed = False

        cover_act = next((a for a in actions if a["selector"] == "#cover_letter_input"), None)
        if cover_act and cover_act["action"] == "skip":
            print(f"[PASS] Optional Cover Letter -> correctly skipped ({cover_act['explanation']})")
        else:
            print(f"[FAIL] Optional Cover Letter (Expected action: 'skip', got: {cover_act})")
            all_passed = False

        portfolio_cover_act = next((a for a in actions if a["selector"] == "#portfolio_or_cover_letter"), None)
        if portfolio_cover_act and portfolio_cover_act["action"] == "skip":
            print(f"[PASS] Portfolio or Cover Letter -> correctly skipped ({portfolio_cover_act['explanation']})")
        else:
            print(f"[FAIL] Portfolio or Cover Letter (Expected action: 'skip', got: {portfolio_cover_act})")
            all_passed = False

        if not all_passed:
            print("\n[RESULT] One or more mapping checks failed!")
            import sys
            sys.exit(1)
        else:
            print("\n[RESULT] All mapping checks passed successfully!")

except Exception as e:
    print(f"Error executing test: {e}")
