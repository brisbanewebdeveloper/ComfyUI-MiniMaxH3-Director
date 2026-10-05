"""AI: split into shots. The Prompt becomes timed Shots with real spoken lines, plus one Look that every render part shares.

The earlier split answered in timed text with the dialogue as a prose line ("@Mage says: My master ..."), so a song of eight
lines became one sung line and seven lines of prose, all in one Shot over three render parts (elf song, 2026-10-05).
"""
import json
import re

from . import fields
from .shot_draft import plain_mentions

DELIVERIES = ("says", "sings", "whispers", "shouts", "murmurs")
FORMAT = "h3-director-shots"
DELIMITERS = re.compile(r"[\r\n\[\]():]")


def _seconds(value):
    return ("%.1f" % value).rstrip("0").rstrip(".")


def _mentions(meanings):
    """The @names the answer may use, spelled out; with a placeholder ("@Name") Qwen3-VL 4B wrote "@Name" into the shots."""
    names = [entry["name"] for entry in meanings if entry.get("name")]
    if not names:
        return "There is no Content to mention: write no @ mentions."
    return "Mention Content only by these exact names: %s." % ", ".join("@" + name for name in names)


def split_prompt(idea, seconds, meanings, parts=(), sung=()):
    """parts: [(start s, end s)] of the render parts; sung: [(start s, end s, song name, words)] placed by the compiler."""
    rules = [
        "Split the Idea into shots for a %s second video. Return only JSON: "
        '{"look":"...","shots":[{"start_s":0,"end_s":4,"action":"...","camera":"...","lines":[{"speaker":"","delivery":"says",'
        '"language":"English","text":"..."}]}],"soundscape":"...","music":"..."}.' % _seconds(seconds),
        "look: one or two English sentences with what every shot shares: visual style, place, light. No action, no spoken words.",
        "action: English, what is visible in this shot: who does what, where, with which expression. " + _mentions(meanings),
        "camera: one English sentence starting with The camera, e.g. The camera pushes in with small amplitude at slow speed.",
        # base-en 4.2: "A cut should introduce new information ... If only the distance or a slight angle needs to change,
        # prefer camera motion." Split by line, the elf song became nine static shots of the same face.
        "Start a new shot only when the view changes: another framing, angle, place or time. A slow change of distance or "
        "angle stays inside one shot as camera movement.",
        "lines: each line the Idea gives to be spoken or sung, word for word in its own language, one entry per line, in the shot "
        "where it is heard. speaker is the exact Content name of who says it, or empty for a narrator; delivery is one of %s. "
        "Invent no words; use [] when nobody speaks." % ", ".join(DELIVERIES),
        "Shots are ordered, do not overlap and together cover 0 to %s s." % _seconds(seconds),
        "subject_ids bind assets to Subjects identified by context_id; keep those meanings instead of inventing independent "
        "figures for linked assets.",
        "soundscape: one or two English sentences of ambient and physical sound, no speech. music: the score only the audience hears "
        "(instruments, tempo), or N/A.",
        "Do not claim generation or media analysis has occurred.",
    ]
    if len(parts) > 1:
        rules.append("The video is rendered in parts: %s. A shot may run across a part boundary; a cut fits best at one."
                     % ", ".join("%s-%s s" % (_seconds(a), _seconds(b)) for a, b in parts))
    if sung:
        rules.append("These sung lines are already placed at their times, so do NOT put them into lines; let the action follow them: %s."
                     % "; ".join('%s-%s s "%s"' % (_seconds(a), _seconds(b), words) for a, b, _, words in sung))
    return " ".join(rules) + "\nIdea: %s\nContexts: %s" % (idea, json.dumps(meanings, ensure_ascii=False))


def _sentence(text):
    return text if text.endswith((".", "!", "?")) else text + "."


def _norm(text):
    return " ".join(re.findall(r"\w+", text.lower()))


def _owner(speaker, contexts):
    """(speaker_id, voice) for a line: a named Content speaks with its own voice, anyone else is a described narrator."""
    name = speaker.strip().lstrip("@").casefold()
    for entry in contexts or ():
        widgets = entry.get("widgets", {})
        if name and widgets.get("name", "").casefold() == name and widgets.get("context_id"):
            return widgets["context_id"], "a narrator"
    voice = " ".join(DELIMITERS.sub(" ", speaker.lstrip().lstrip("@")).split())
    return "", voice or "a narrator"


def _lines(raw, path, contexts, sung):
    out = []
    for number, line in enumerate(fields.read_list(raw, "lines", path) if isinstance(raw, dict) else ()):
        here = "%s.lines[%d]" % (path, number)
        fields.need_dict(line, here)
        speaker_id, voice = _owner(fields.read_str(line, "speaker", here, ""), contexts)
        delivery = fields.read_str(line, "delivery", here, "says").strip().lower()
        language = " ".join(DELIMITERS.sub(" ", fields.read_str(line, "language", here, "English")).split()) or "English"
        for words in fields.read_str(line, "text", here, "").splitlines():
            if words.strip() and _norm(words) not in sung:
                out.append({"schema_version": 1, "text": words.strip(), "speaker_id": speaker_id, "voice": voice,
                            "language": language, "delivery": delivery if delivery in DELIVERIES else "says"})
    return out


def _keep(shots, keep, contexts):
    """The user's own lines ("@Mage says: ...", "Narrator says: ...") replace the AI's lines of that speaker, in the shot
    where the AI first gave that speaker a line, else in the last shot. Returns the user's lines the AI did not have."""
    own = {}
    for line in (keep or "").splitlines():
        found = re.match(r"^\s*@?([^:]+?)\s+says:\s*(.+)$", line)
        if found:
            name = found.group(1).strip()
            own.setdefault(("" if name.casefold() == "narrator" else name).casefold(), []).append(found.group(2).strip())
    if not own:
        return []
    names = {entry["widgets"].get("context_id"): entry["widgets"].get("name", "").casefold() for entry in contexts or ()}
    key = lambda line: names.get(line["speaker_id"], "") if line["speaker_id"] else ""
    proposed = {_norm(line["text"]) for shot in shots for line in shot["spoken"]}
    for speaker, texts in own.items():
        target = next((shot for shot in shots if any(key(line) == speaker for line in shot["spoken"])), shots[-1])
        for shot in shots:
            shot["spoken"] = [line for line in shot["spoken"] if key(line) != speaker]
        speaker_id, voice = _owner(speaker, contexts) if speaker else ("", "a narrator")
        target["spoken"] += [{"schema_version": 1, "text": text, "speaker_id": speaker_id, "voice": voice, "language": "English",
                              "delivery": "says"} for text in texts]
    return [text for texts in own.values() for text in texts if _norm(text) not in proposed]


def parse_split(data, seconds, contexts=None, keep="", sung=()):
    """A checked Shot document from the AI's answer; nothing in it changes the project until the user accepts it."""
    raw = fields.read_list(data, "shots", "direction")
    if not 1 <= len(raw) <= 64:
        raise ValueError("Auto Direct needs between 1 and 64 shots.")
    sung_words = {_norm(words) for _, _, _, words in sung}
    shots, end, dropped, adjusted = [], 0.0, [], False
    for number, shot in enumerate(raw):
        path = "direction.shots[%d]" % number
        fields.need_dict(shot, path)
        start = float(fields.read_number(shot, "start_s", path, minimum=0))
        stop = float(fields.read_number(shot, "end_s", path, minimum=0))
        if end >= seconds - 0.001:
            adjusted = True  # the shots before already fill the project
            break
        if stop <= start or stop <= end + 0.001:
            raise ValueError("Auto Direct returned a shot that ends before it starts or before the previous one; try again or edit manually.")
        # Small models round, leave gaps or stop early; the shots are laid end to end over the project instead.
        placed = seconds if number == len(raw) - 1 else min(stop, seconds)
        adjusted = adjusted or abs(start - end) > 0.001 or abs(placed - stop) > 0.001
        action = fields.read_str(shot, "action", path).strip()
        if not action:
            raise ValueError("Each suggested shot needs an action.")
        camera = fields.read_str(shot, "camera", path, "").strip()
        text, unknown = plain_mentions(" ".join(_sentence(v) for v in (action, camera) if v), contexts)
        dropped += [name for name in unknown if name not in dropped]
        shots.append({"id": "ai-%d" % (number + 1), "start": round(end, 3), "end": round(placed, 3), "text": text, "media": [],
                      "spoken": _lines(shot, path, contexts, sung_words), "locked_fields": [], "draft": None})
        end = placed
    kept = _keep(shots, keep, contexts)
    look = fields.read_str(data, "look", "direction", "").strip()
    result = {"shots": json.dumps({"format": FORMAT, "schema_version": 1, "shots": shots, "look": look}, ensure_ascii=False),
              "look": look, "soundscape": fields.read_str(data, "soundscape", "direction", ""),
              "music": fields.read_str(data, "music", "direction", "")}
    if kept:
        result["kept_dialogue"] = kept
    if dropped:
        result["unknown_mentions"] = dropped
    if adjusted:
        result["timing_adjusted"] = True
    return result
