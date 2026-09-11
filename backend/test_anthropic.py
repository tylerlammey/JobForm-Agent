import os
from dotenv import load_dotenv
from anthropic import Anthropic

# Load the environment variables from the .env file
load_dotenv(override=True)

key = os.environ.get("ANTHROPIC_API_KEY", "")
print("ANTHROPIC_API_KEY loaded:")
print(f"  - Length: {len(key)}")
print(f"  - Starts with: '{key[:15]}...'")

client = Anthropic()

try:
    print("Testing connection to Anthropic...")
    response = client.messages.create(
        model=os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5"),
        max_tokens=5,
        messages=[{"role": "user", "content": "Ping"}]
    )
    print("[SUCCESS] Anthropic Response:", response.content[0].text.strip())
except Exception as e:
    print("[ERROR] Error calling Anthropic:")
    print(f"  - Exception type: {type(e).__name__}")
    print(f"  - Message: {str(e)}")
