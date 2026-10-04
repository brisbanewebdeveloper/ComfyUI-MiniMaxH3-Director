"""Validate an editable scene suggestion before it can change a user's project."""
import json
import re

from . import fields
from .shot_draft import current_records, draft_prompt, mention_rule, parse_draft, plain_mentions

# A shot list with action, camera and sung or spoken lines runs past 512 tokens for one 10 s scene, and a JSON
# answer cut off in the middle is worth nothing. Auto Direct therefore never asks for less than this.
DIRECT_TOKENS = 2048


def direct_tokens(max_tokens):
    return max(max_tokens, DIRECT_TOKENS)


def direction_prompt(idea, seconds, contexts, current_shots=""):
    meanings = [{"name": entry["widgets"].get("name", ""), "media": entry["media"],
                 "description": entry["widgets"].get("description", ""), "usage": entry["widgets"].get("usage", ""),
                 "speaker": entry["widgets"].get("speaker", ""), "context_id": entry["widgets"].get("context_id", ""),
                 "subject_ids": entry["widgets"].get("subject_ids", "")} for entry in contexts]
    records = current_records(current_shots, seconds)
    if not idea.strip() and not records:
        raise ValueError("Write an idea or an existing Shot before Auto Direct.")
    if records:
        return draft_prompt(idea, seconds, meanings, records)
    return ("Create at least one shot from the Idea, even when Contexts is empty. Return only JSON with shots (list of objects containing start_s, end_s, "
            "action, camera, dialogue), soundscape (string), music (string). All times are finite seconds in 0..%s, "
            "shots are ordered and non-overlapping. Cover the project duration. %ssubject_ids bind assets to Subjects identified by context_id; "
            "keep those meanings instead of inventing independent figures for linked assets. Do not claim generation or media analysis has occurred. "
            "Example structure: {\"shots\":[{\"start_s\":0,\"end_s\":%s,\"action\":\"Describe the idea's action\",\"camera\":\"Static\",\"dialogue\":\"\"}],\"soundscape\":\"Room tone\",\"music\":\"N/A\"}. "
            "Idea: %s\nContexts: %s" % (seconds, mention_rule(meanings), seconds, idea, json.dumps(meanings, ensure_ascii=False)))


def keep_manual_dialogue(suggested, current_shots, keep=""):
    """A scene proposal replaces action and camera, never a line the user wrote themselves.

    Dialogue is the one thing a director cannot invent twice. For a speaker the user wrote lines for, the user's lines
    take the place of the proposal's own lines for that speaker (gemma turned "@Mage says: Welcome back." into
    "@Mage says: Welcome... settle your spirit."); lines with no such place are appended to the last shot.
    `keep` holds the user's lines when the shots themselves are not sent (the Studio's split starts from the prompt).
    The result says which of the user's lines the proposal did not already contain.
    """
    spoken = _spoken_lines(current_shots)
    for line in (keep or "").splitlines():
        speaker = _speaker(line)
        if speaker:
            spoken.setdefault(speaker, []).append(line.strip())
    if not suggested or not spoken:
        return suggested, []
    lines, placed = [], set()
    for line in suggested.splitlines():
        speaker = None if _is_header(line) else _speaker(line)
        if speaker in spoken:
            if speaker not in placed:
                placed.add(speaker)
                lines.extend(spoken[speaker])
            continue
        lines.append(line)
    # Appended as further text of the last shot, which is how parse_shots reads a dialogue line; a separate
    # `end-end:` block would be an empty range and get dropped with an Issue.
    lines += [line for speaker, own in spoken.items() if speaker not in placed for line in own]
    proposed = [line.strip() for line in suggested.splitlines()]
    return "\n".join(lines), [line for own in spoken.values() for line in own if line not in proposed]


def _speaker(line):
    found = re.match(r"^\s*@?([\w-]+)\s+says:", line.strip(), re.IGNORECASE)
    return found.group(1).casefold() if found else None


def _spoken_lines(text):
    """The `@Name says:` lines of each shot block, keyed by the speaking name."""
    spoken, current = {}, None
    for line in (text or "").splitlines():
        if _is_header(line):
            current = []
            continue
        speaker = _speaker(line)
        if speaker and current is not None:
            spoken.setdefault(speaker, []).append(line.strip())
    return spoken


def _is_header(line):
    return re.match(r"^\s*(?:\d+:)?\d+(?:\.\d+)?s?\s*(?:-|–|—)\s*(?:\d+:)?\d+(?:\.\d+)?s?\s*(?::|\s)", line)


def parse_direction(text, seconds, contexts=None, current_shots=""):
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
    shots = fields.read_list(data, "shots", "direction")
    if not 1 <= len(shots) <= 64:
        raise ValueError("Auto Direct needs between 1 and 64 shots.")
    lines, end, dropped, adjusted = [], 0.0, [], False
    for number, shot in enumerate(shots):
        path = "direction.shots[%d]" % number
        fields.need_dict(shot, path)
        start = float(fields.read_number(shot, "start_s", path, minimum=0))
        stop = float(fields.read_number(shot, "end_s", path, minimum=0))
        if end >= seconds - 0.001:
            adjusted = True  # the shots before already fill the project
            break
        if stop <= start or stop <= end + 0.001:
            raise ValueError("Auto Direct returned a shot that ends before it starts or before the previous one; try again or edit manually.")
        # Small models round, leave gaps or stop early (Qwen3-VL 4B ended a 10 s project at 5 s). The shots are laid end
        # to end over the project instead of discarding the proposal; the user reviews it before it changes anything.
        placed = seconds if number == len(shots) - 1 else min(stop, seconds)
        adjusted = adjusted or abs(start - end) > 0.001 or abs(placed - stop) > 0.001
        start, stop = end, placed
        action = fields.read_str(shot, "action", path).strip()
        camera = fields.read_str(shot, "camera", path, "").strip()
        dialogue = fields.read_str(shot, "dialogue", path, "").strip()
        if not action:
            raise ValueError("Each suggested shot needs an action.")
        body = "\n".join(value for value in (action, "Camera: " + camera if camera else "", dialogue) if value)
        body, unknown = plain_mentions(body, contexts)
        dropped += [name for name in unknown if name not in dropped]
        lines.append("%.3f-%.3f: %s" % (start, stop, body))
        end = stop
    result = {"shots": "\n".join(lines), "soundscape": fields.read_str(data, "soundscape", "direction", ""),
              "music": fields.read_str(data, "music", "direction", "")}
    if dropped:
        result["unknown_mentions"] = dropped
    if adjusted:
        result["timing_adjusted"] = True
    return result


def finish_direction(text, seconds, contexts, current_shots, keep=""):
    suggestion = parse_direction(text, seconds, contexts, current_shots)
    if suggestion.get("format") != "h3-director-draft":
        suggestion["shots"], kept = keep_manual_dialogue(suggestion["shots"], current_shots, keep)
        if kept:
            suggestion["kept_dialogue"] = kept
    return suggestion
