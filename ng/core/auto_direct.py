"""Validate an editable scene suggestion before it can change a user's project."""
import json
import re

from . import fields


def direction_prompt(idea, seconds, contexts):
    meanings = [{"name": entry["widgets"].get("name", ""), "media": entry["media"],
                 "description": entry["widgets"].get("description", ""), "usage": entry["widgets"].get("usage", ""),
                 "speaker": entry["widgets"].get("speaker", "")} for entry in contexts]
    return ("Create at least one shot from the Idea, even when Contexts is empty. Return only JSON with shots (list of objects containing start_s, end_s, "
            "action, camera, dialogue), soundscape (string), music (string). All times are finite seconds in 0..%s, "
            "shots are ordered and non-overlapping. Cover the project duration. Use only supplied names for @Name references; "
            "dialogue may contain '@Name says: exact words'. Do not claim generation or media analysis has occurred. "
            "Example structure: {\"shots\":[{\"start_s\":0,\"end_s\":%s,\"action\":\"Describe the idea's action\",\"camera\":\"Static\",\"dialogue\":\"\"}],\"soundscape\":\"Room tone\",\"music\":\"N/A\"}. "
            "Idea: %s\nContexts: %s" % (seconds, seconds, idea, json.dumps(meanings, ensure_ascii=False)))


def keep_manual_dialogue(suggested, current_shots):
    """A scene proposal replaces action and camera, never a line the user wrote themselves.

    Dialogue is the one thing a director cannot invent twice: if the proposal says nothing for a speaker who has
    a line in the current shots, that line is kept and the result says which ones were kept.
    """
    if not suggested or not current_shots:
        return suggested, []
    spoken = _spoken_lines(current_shots)
    said = _spoken_lines(suggested)
    missing = [line for speaker, lines in spoken.items() if speaker not in said for line in lines]
    if not missing:
        return suggested, []
    # Appended as further text of the last shot, which is how parse_shots reads a dialogue line; a separate
    # `end-end:` block would be an empty range and get dropped with an Issue.
    return "\n".join([suggested, *missing]), missing


def _spoken_lines(text):
    """The `@Name says:` lines of each shot block, keyed by the speaking name."""
    spoken, current = {}, None
    for line in (text or "").splitlines():
        if _is_header(line):
            current = []
            continue
        found = re.match(r"^\s*@?([\w-]+)\s+says:", line.strip(), re.IGNORECASE)
        if found and current is not None:
            spoken.setdefault(found.group(1).casefold(), []).append(line.strip())
    return spoken


def _is_header(line):
    return re.match(r"^\s*(?:\d+:)?\d+(?:\.\d+)?s?\s*(?:-|–|—)\s*(?:\d+:)?\d+(?:\.\d+)?s?\s*(?::|\s)", line)


def parse_direction(text, seconds, contexts=None):
    if not isinstance(text, str):
        raise ValueError("Auto Direct needs a JSON text response.")
    if text.strip().startswith("```"):
        text = "\n".join(text.strip().splitlines()[1:-1])
    data = fields.need_dict(json.loads(text), "direction")
    shots = fields.read_list(data, "shots", "direction")
    if not 1 <= len(shots) <= 64:
        raise ValueError("Auto Direct needs between 1 and 64 shots.")
    lines, end = [], 0.0
    for number, shot in enumerate(shots):
        path = "direction.shots[%d]" % number
        fields.need_dict(shot, path)
        start = float(fields.read_number(shot, "start_s", path, minimum=0))
        stop = float(fields.read_number(shot, "end_s", path, minimum=0))
        if abs(start - end) > 0.001 or stop <= start or stop > seconds + 0.001:
            raise ValueError("Auto Direct returned gaps, overlaps or out-of-range times; try again or edit manually.")
        action = fields.read_str(shot, "action", path).strip()
        camera = fields.read_str(shot, "camera", path, "").strip()
        dialogue = fields.read_str(shot, "dialogue", path, "").strip()
        if not action:
            raise ValueError("Each suggested shot needs an action.")
        body = "\n".join(value for value in (action, "Camera: " + camera if camera else "", dialogue) if value)
        if contexts is not None:
            names = {entry["widgets"].get("name", "").casefold() for entry in contexts}
            known = sorted((re.escape(name) for name in names if name), key=len, reverse=True)
            pattern = r"@(" + "|".join(known + [r"[\w-]+"]) + r")(?![\w])"
            for name in re.findall(pattern, body, re.IGNORECASE):
                if name.casefold() not in names:
                    raise ValueError("Auto Direct referenced an unknown context: @%s." % name)
        lines.append("%.3f-%.3f: %s" % (start, stop, body))
        end = stop
    if abs(end - seconds) > 0.001:
        raise ValueError("Auto Direct must cover the entire project without time gaps.")
    return {"shots": "\n".join(lines), "soundscape": fields.read_str(data, "soundscape", "direction", ""),
            "music": fields.read_str(data, "music", "direction", "")}
