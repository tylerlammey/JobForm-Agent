import os


def load_candidate_context() -> str:
    """
    Reads the candidate's profile markdown, checked in `backend/me/context.md`
    (falling back to `backend/context.md` for setups that haven't moved it
    yet). Raises FileNotFoundError with a clear message if neither exists --
    callers decide how to surface that to the user.
    """
    context_path = os.path.join(os.path.dirname(__file__), "me", "context.md")
    if not os.path.exists(context_path):
        context_path = os.path.join(os.path.dirname(__file__), "context.md")

    if not os.path.exists(context_path):
        raise FileNotFoundError(f"Candidate context file not found at expected path: {context_path}")

    with open(context_path, "r", encoding="utf-8") as f:
        return f.read()
