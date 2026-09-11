import os
from typing import Type, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai").strip().lower()
if LLM_PROVIDER in ("openai_compatible", "compatible"):
    LLM_PROVIDER = "openai"

OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "").strip() or None
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")

LLM_TIMEOUT_SECONDS = 180

_openai_client = None
_anthropic_client = None


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        _openai_client = OpenAI(base_url=OPENAI_BASE_URL, timeout=LLM_TIMEOUT_SECONDS) if OPENAI_BASE_URL else OpenAI(timeout=LLM_TIMEOUT_SECONDS)
    return _openai_client


def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        from anthropic import Anthropic
        _anthropic_client = Anthropic(timeout=LLM_TIMEOUT_SECONDS)
    return _anthropic_client


def parse_structured(system_prompt: str, user_content: str, output_model: Type[T], temperature: float = 0.1) -> T:
    """Sends system_prompt + user_content to whichever provider LLM_PROVIDER selects and returns the validated response."""
    if LLM_PROVIDER == "anthropic":
        client = _get_anthropic_client()
        response = client.messages.parse(
            model=ANTHROPIC_MODEL,
            max_tokens=8192,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
            output_format=output_model,
        )
        return response.parsed_output

    client = _get_openai_client()
    completion = client.beta.chat.completions.parse(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        response_format=output_model,
        temperature=temperature,
    )
    return completion.choices[0].message.parsed
