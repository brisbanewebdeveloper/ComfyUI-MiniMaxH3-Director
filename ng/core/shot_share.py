"""The part of a shot's action that one render part shows.

A shot longer than a render part was sent whole to every part it lies in: the first part played the whole action in its few
seconds and the next part played it again (real runs 2026-10-12: Aurelia walked away and back twice in a 20 s shot; in a
30 s storyboard each part replayed the shots its pinned head only finished). Each part now gets the action of its own share
of the shot's time:

- Time beats the user wrote ("2.5–5s: ...", seconds from the shot's start) go to the parts they fall in, re-timed to the part.
- Other text is cut into sentences and clauses ("..., then ...") and laid over the shot's time by length.
- A shot whose new frames all lie in the pinned head gets no action: those frames are already made."""
import math
import re

from .limits import FPS

HEAD_ONLY = "The shot from the preceding video ends here, without new action."
_BEAT = re.compile(r"(\d+(?:[.,]\d+)?)\s*s?\s*[–-]\s*(\d+(?:[.,]\d+)?)\s*s(?:ec(?:onds?)?)?\s*:\s*", re.IGNORECASE)
_PIECE = re.compile(r"(?<=[.!?;])\s+|(?<=,)\s+(?=then\b)")
# The AI writes a shot longer than this in time beats (split.py, shot_draft.py). The user's shot times never change: beats
# are seconds from the shot's own start, fitted to its real length (5 s, 10 s, 2.5 s ...).
BEAT_MIN_S = 5.0
MIN_OVERLAP_S = 0.25        # a beat or clause that only grazes a part (frame grid) stays with the part it belongs to


def beat_marks(seconds):
    """The time beats a shot of this length is written in, as the AI is asked for them: "0–5s, 5–10s" for 10 s, "" for a
    shot of BEAT_MIN_S or less. Equal beats, as many as the length needs at most BEAT_MIN_S each."""
    if seconds <= BEAT_MIN_S:
        return ""
    count = int(math.ceil(seconds / BEAT_MIN_S - 1e-9))
    ends = [round(seconds * (k + 1) / count, 1) for k in range(count)]
    return ", ".join("%s–%ss" % (_stamp(a), _stamp(b)) for a, b in zip([0.0] + ends[:-1], ends))


def _seconds(text):
    return float(text.replace(",", "."))


def _beats(text):
    """(preamble, [(start_s, end_s, text)]) when the text has two or more time beats, else None."""
    marks = list(_BEAT.finditer(text))
    if len(marks) < 2:
        return None
    beats = []
    for k, mark in enumerate(marks):
        end = marks[k + 1].start() if k + 1 < len(marks) else len(text)
        beats.append((_seconds(mark.group(1)), _seconds(mark.group(2)), text[mark.end():end].strip()))
    return text[:marks[0].start()].strip(), beats


def _stamp(value):
    return ("%.1f" % value).rstrip("0").rstrip(".")


def share(text, shot_start_f, shot_end_f, new_start_f, new_end_f, local_base_f):
    """`text` for the story frames [new_start_f, new_end_f) of a shot spanning [shot_start_f, shot_end_f). The part's own
    clip starts at story frame `local_base_f` (its pinned head included). Returns the text unchanged when the part holds
    the whole shot."""
    if shot_start_f < 0 or (new_start_f <= shot_start_f and new_end_f >= shot_end_f):
        return text
    if new_end_f <= new_start_f:
        return HEAD_ONLY
    length = float(shot_end_f - shot_start_f)
    lo, hi = (new_start_f - shot_start_f) / length, (new_end_f - shot_start_f) / length
    eps = MIN_OVERLAP_S * FPS / length
    beats = _beats(text)
    if beats:
        preamble, timed = beats
        seconds = length / FPS
        shift = (shot_start_f - local_base_f) / float(FPS)
        kept = ["%s–%ss: %s" % (_stamp(max(0.0, a + shift)), _stamp(max(0.0, b + shift)), body)
                for a, b, body in timed if min(b / seconds, hi) - max(a / seconds, lo) > eps]
        return " ".join(part for part in [preamble] + kept if part)
    pieces = [p.strip() for p in _PIECE.split(text.strip()) if p.strip()]
    if len(pieces) < 2:
        return text
    total, at, kept = float(sum(len(p) for p in pieces)), 0.0, []
    for piece in pieces:
        start, at = at, at + len(piece) / total
        if min(at, hi) - max(start, lo) > eps:
            kept.append(piece)
    return " ".join(kept) or pieces[-1]
