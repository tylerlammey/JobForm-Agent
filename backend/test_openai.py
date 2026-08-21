import os
from dotenv import load_dotenv
from openai import OpenAI

# Load the environment variables from the .env file
load_dotenv(override=True)

key = os.environ.get("OPENAI_API_KEY", "")
print("OPENAI_API_KEY loaded:")
print(f"  - Length: {len(key)}")
print(f"  - Starts with: '{key[:15]}...'")

client = OpenAI()

try:
    print("Testing connection to OpenAI...")
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Ping"}],
        max_tokens=5
    )
    print("[SUCCESS] OpenAI Response:", response.choices[0].message.content.strip())
except Exception as e:
    print("[ERROR] Error calling OpenAI:")
    print(f"  - Exception type: {type(e).__name__}")
    print(f"  - Message: {str(e)}")
