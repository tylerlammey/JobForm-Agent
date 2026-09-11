import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(override=True)

key = os.environ.get("OPENAI_API_KEY", "")
base_url = os.environ.get("OPENAI_BASE_URL", "").strip() or None
model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

print("OPENAI_API_KEY loaded:")
print(f"  - Length: {len(key)}")
print(f"  - Starts with: '{key[:15]}...'")
print(f"OPENAI_BASE_URL: {base_url or '(unset -- using OpenAIs own API)'}")
print(f"OPENAI_MODEL: {model}")

client = OpenAI(base_url=base_url) if base_url else OpenAI()

try:
    print(f"Testing connection to {base_url or 'OpenAI'}...")
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "Ping"}],
        max_tokens=50
    )
    content = response.choices[0].message.content
    if content is not None and content.strip():
        print("[SUCCESS] Response:", content.strip())
    else:
        print("[SUCCESS] Request succeeded, but this model returned no visible text for such a short prompt.")
        print("Full response object for reference:")
        print(response)
except Exception as e:
    print("[ERROR] Error calling the API:")
    print(f"  - Exception type: {type(e).__name__}")
    print(f"  - Message: {str(e)}")
