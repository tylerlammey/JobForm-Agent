import urllib.request
import json

BACKEND_URL = "http://127.0.0.1:8000"

payload = {
  "fields": [
    {
      "id": "languageSelectorButton",
      "name": "",
      "type": "select",
      "label": "English",
      "placeholder": "",
      "required": False,
      "options": [
        "Čeština (Česká republika)",
        "Deutsch (Deutschland)",
        "English",
        "English (Canada)",
        "English (United Kingdom)",
        "Español",
        "Français (Canada)",
        "Français (France)",
        "Italiano (Italia)",
        "Polski (Polska)",
        "Português (Brasil)",
        "Svenska (Sverige)",
        "ไทย (ประเทศไทย)",
        "日本語 (日本)",
        "简体中文 (中国)"
      ],
      "multiple": False,
      "optionsMode": "strict",
      "elementSelector": "[id=\"languageSelectorButton\"]",
      "alreadyFilled": True
    },
    {
      "id": "settingsSelectorButton",
      "name": "",
      "type": "select",
      "label": "Settings",
      "placeholder": "",
      "required": False,
      "options": [
        "Change Email"
      ],
      "multiple": False,
      "optionsMode": "strict",
      "elementSelector": "[id=\"settingsSelectorButton\"]",
      "alreadyFilled": True
    },
    {
      "id": "selfIdentifiedDisabilityData--disabilityForm",
      "name": "disabilityForm",
      "type": "select",
      "label": "Language*",
      "placeholder": "",
      "required": False,
      "options": [
        "Select One",
        "English",
        "Spanish"
      ],
      "multiple": False,
      "optionsMode": "strict",
      "elementSelector": "[id=\"selfIdentifiedDisabilityData--disabilityForm\"]",
      "alreadyFilled": True
    },
    {
      "id": "selfIdentifiedDisabilityData--name",
      "name": "name",
      "type": "text",
      "label": "Name*",
      "placeholder": "",
      "required": True,
      "elementSelector": "[id=\"selfIdentifiedDisabilityData--name\"]",
      "alreadyFilled": False
    },
    {
      "id": "selfIdentifiedDisabilityData--employeeId",
      "name": "employeeId",
      "type": "text",
      "label": "Employee ID (if applicable)",
      "placeholder": "",
      "required": False,
      "elementSelector": "[id=\"selfIdentifiedDisabilityData--employeeId\"]",
      "alreadyFilled": False
    },
    {
      "id": "selfIdentifiedDisabilityData--dateSignedOn-dateSectionMonth-input",
      "name": "",
      "type": "text",
      "label": "Month",
      "placeholder": "",
      "required": False,
      "elementSelector": "[id=\"selfIdentifiedDisabilityData--dateSignedOn-dateSectionMonth-input\"]",
      "alreadyFilled": False
    },
    {
      "id": "selfIdentifiedDisabilityData--dateSignedOn-dateSectionDay-input",
      "name": "",
      "type": "text",
      "label": "Day",
      "placeholder": "",
      "required": False,
      "elementSelector": "[id=\"selfIdentifiedDisabilityData--dateSignedOn-dateSectionDay-input\"]",
      "alreadyFilled": False
    },
    {
      "id": "selfIdentifiedDisabilityData--dateSignedOn-dateSectionYear-input",
      "name": "",
      "type": "text",
      "label": "Year",
      "placeholder": "",
      "required": False,
      "elementSelector": "[id=\"selfIdentifiedDisabilityData--dateSignedOn-dateSectionYear-input\"]",
      "alreadyFilled": False
    },
    {
      "id": "64cbff5f364f10000ae7a421cf210000-disabilityStatus",
      "name": "64cbff5f364f10000ae7a421cf210000-disabilityStatus",
      "type": "checkbox",
      "label": "Yes, I have a disability, or have had one in the past",
      "placeholder": "",
      "required": True,
      "options": [
        "Yes, I have a disability, or have had one in the past",
        "No, I do not have a disability and have not had one in the past",
        "I do not want to answer"
      ],
      "multiple": True,
      "optionsMode": "strict",
      "elementSelector": "[id=\"64cbff5f364f10000ae7a421cf210000-disabilityStatus\"]",
      "alreadyFilled": False
    }
  ]
}

req = urllib.request.Request(
    f"{BACKEND_URL}/api/fill-form",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)

with urllib.request.urlopen(req) as resp:
    res = json.loads(resp.read().decode("utf-8"))
    print(json.dumps(res, indent=2))
