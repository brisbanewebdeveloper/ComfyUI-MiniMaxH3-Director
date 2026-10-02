"""Validate an editable scene suggestion before it can change a user's project."""
import json

from . import fields


def direction_prompt(idea, seconds, contexts):
    meanings = [{"name": entry["widgets"].get("name", ""), "media": entry["media"],
                 "description": entry["widgets"].get("description", ""), "usage": entry["widgets"].get("usage", ""),
                 "speaker": entry["widgets"].get("speaker", "")} for entry in contexts]
    return ("Suggest an editable video scene plan. Return only JSON with shots (list of objects containing start_s, end_s, "
            "action, camera, dialogue), soundscape (string), music (string). All times are finite seconds in 0..%s, "
            "shots are ordered and non-overlapping. Cover the project duration. Use only supplied names for @Name references; "
            "dialogue may contain '@Name says: exact words'. Do not claim generation or media analysis has occurred. "
            "Idea: %s\nContexts: %s" % (seconds, idea, json.dumps(meanings, ensure_ascii=False)))


def parse_direction(text, seconds):
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
        if start < end or stop <= start or stop > seconds:
            raise ValueError("Auto Direct returned overlapping or out-of-range times; try again or edit manually.")
        action = fields.read_str(shot, "action", path).strip()
        camera = fields.read_str(shot, "camera", path, "").strip()
        dialogue = fields.read_str(shot, "dialogue", path, "").strip()
        if not action:
            raise ValueError("Each suggested shot needs an action.")
        body = "\n".join(value for value in (action, "Camera: " + camera if camera else "", dialogue) if value)
        lines.append("%.3f-%.3f: %s" % (start, stop, body))
        end = stop
    return {"shots": "\n".join(lines), "soundscape": fields.read_str(data, "soundscape", "direction", ""),
            "music": fields.read_str(data, "music", "direction", "")}
