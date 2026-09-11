"""
Provider-agnostic structured-output LLM client.

main.py needs one thing from an LLM: send a system prompt + user content,
get back a validated Pydantic model. This module is the only place that
knows whether that request goes to OpenAI, Anthropic, or an OpenAI-compatible
third party (OpenRouter, DeepSeek, Groq, Together, etc.), selected via
LLM_PROVIDER in backend/.env (defaults to "openai" so existing setups are
unaffected). Swapping providers never touches main.py.

Anthropic's Messages API has its own request/response shape, so it gets its
own branch below. Everything else -- OpenAI itself, and any third party that
speaks the same "OpenAI-compatible" chat completions schema -- shares a
single client, just pointed at a different OPENAI_BASE_URL with a different
OPENAI_API_KEY/OPENAI_MODEL. That covers most non-Anthropic providers,
including the cheaper open-weight models (DeepSeek, Qwen, Llama, etc.)
available through an OpenRouter key.
"""
import os
from typing import Type, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai").strip().lower()
# "openai_compatible" is just a more honest name for the same code path when
# the configured key/URL isn't actually OpenAI -- accepted as an alias.
if LLM_PROVIDER in ("openai_compatible", "compatible"):
    LLM_PROVIDER = "openai"

OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "").strip() or None
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")

# Caps how long we'll wait on a hung LLM provider -- without this, a stalled
# upstream request could tie up a FastAPI worker indefinitely even after the
# extension's own client-side fetch has already given up and shown an error.
LLM_TIMEOUT_SECONDS = 180

_openai_client = None
_anthropic_client = None


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        # Reads OPENAI_API_KEY from environment -- when OPENAI_BASE_URL points
        # at a third-party provider, this is whatever key that provider gave
        # you, not necessarily an OpenAI key. Only imported/instantiated when
        # this provider is actually selected, so an anthropic-only setup
        # never needs this key at all.
        _openai_client = OpenAI(base_url=OPENAI_BASE_URL, timeout=LLM_TIMEOUT_SECONDS) if OPENAI_BASE_URL else OpenAI(timeout=LLM_TIMEOUT_SECONDS)
    return _openai_client


def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        from anthropic import Anthropic
        # Reads ANTHROPIC_API_KEY from environment.
        _anthropic_client = Anthropic(timeout=LLM_TIMEOUT_SECONDS)
    return _anthropic_client


def parse_structured(system_prompt: str, user_content: str, output_model: Type[T], temperature: float = 0.1) -> T:
    """
    Sends system_prompt + user_content to whichever provider LLM_PROVIDER
    selects and returns the response validated against output_model.
    """
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
