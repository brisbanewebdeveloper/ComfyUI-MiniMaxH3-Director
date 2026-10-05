"""Validate an editable scene suggestion before it can change a user's project."""
import json

from . import fields
from .context import DirectorContext
from .lyrics import story_lines
from .preview import plan_preview
from .shot_draft import current_records, draft_prompt, parse_draft
from .split import parse_split, split_prompt

# A shot list with action, camera and sung or spoken lines runs past 512 tokens for one 10 s scene, and a JSON
# answer cut off in the middle is worth nothing. Auto Direct therefore never asks for less than this.
DIRECT_TOKENS = 2048


def direct_tokens(max_tokens):
    return max(max_tokens, DIRECT_TOKENS)


def timing_hints(director, contexts, probe=None):
    """Hard-cut render parts and the songs' timed lines, from the same plan the Studio shows: ([(start s, end s)],
    [(start s, end s, song, words)]). Parts are named only with Hard cuts: a continued part begins on the previous
    part's picture, so the planner itself moves a boundary away from a new shot (boundaries.py, E7); told to cut at the
    boundaries, the split put its cuts exactly where the pinned picture makes them come 2.5 s late."""
    view = plan_preview({"director": director, "contexts": contexts}, probe=probe)
    if not view["ok"]:
        return (), ()
    context = DirectorContext.from_dict(view["director_context"])
    hard = director.get("continuity") == "none"
    return (tuple((c["start_s"], c["end_s"]) for c in view["chunks"]) if hard else (),
            tuple((round(l.start_f / 24.0, 2), round(l.end_f / 24.0, 2), l.song, l.text) for l in story_lines(context)))


def _meanings(contexts):
    return [{"name": entry["widgets"].get("name", ""), "media": entry["media"],
             "description": entry["widgets"].get("description", ""), "usage": entry["widgets"].get("usage", ""),
             "speaker": entry["widgets"].get("speaker", ""), "context_id": entry["widgets"].get("context_id", ""),
             "subject_ids": entry["widgets"].get("subject_ids", "")} for entry in contexts]


def story(idea, contexts):
    """What the video is about: the Prompt, and every Text card used as Scene. Either place works for the AI."""
    notes = [entry["widgets"].get("text", "").strip() for entry in contexts
             if entry.get("media") == "text" and "scene" in _roles(entry["widgets"])]
    return "\n\n".join(text for text in [idea.strip(), *notes] if text)


def _roles(widgets):
    try:
        roles = json.loads(widgets.get("usage_roles") or "[]")
    except ValueError:
        roles = []
    return roles if isinstance(roles, list) and roles else [widgets.get("usage", "")]


def direction_prompt(idea, seconds, contexts, current_shots="", timing=((), ())):
    meanings = _meanings(contexts)
    records = current_records(current_shots, seconds)
    idea = story(idea, contexts)
    if not idea.strip() and not records:
        raise ValueError("Write the Prompt, or a Text card used as Scene, before AI: split into shots.")
    if records:
        return draft_prompt(idea, seconds, meanings, records)
    return split_prompt(idea, seconds, meanings, *timing)


def parse_direction(text, seconds, contexts=None, current_shots="", keep="", sung=()):
    if not isinstance(text, str):
        raise ValueError("Auto Direct needs a JSON text response.")
    if text.strip().startswith("```"):
        # A cut-off answer has no closing fence; its last line is content, not the fence.
        lines = text.strip().splitlines()[1:]
        text = "\n".join(lines[:-1] if lines and lines[-1].startswith("```") else lines)
    try:
        data = fields.need_dict(json.loads(text), "direction")
    except json.JSONDecodeError:
        if text.lstrip().startswith("{") and not text.rstrip().endswith("}"):
            raise ValueError("The AI's answer stopped before its JSON was complete. Raise Max tokens on the AI Loader "
                             "and try again.") from None
        raise ValueError("The AI did not return valid JSON. Retry with a generative model.") from None
    records = current_records(current_shots, seconds)
    if records:
        return parse_draft(data, records, seconds, contexts)
    return parse_split(data, seconds, contexts, keep, sung)

