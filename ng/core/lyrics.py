"""Timed lyrics of a song card and where the song sings them on the story.

The words live on the Audio card as LRC text ("[00:12.40] I still wait where your shadow stayed."), in seconds of the file;
an empty stamped line ends the line before it (a pause). Where the card plays exactly (lock or copy, on an audio lane, a
Shot or the whole project), each line is sung at a known story time, so every render part gets exactly the lines sung in
it instead of the whole song. The 27 s elf song put all eight lines into each of its three 9 s parts.
"""
import re
from dataclasses import dataclass

from .audio_timing import clip_windows, shot_windows
from .frames import seconds_to_frames

STAMP_RE = re.compile(r"^\s*\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]")
LANGUAGE_RE = re.compile(r"^\s*\[la:\s*([^\]]*)\]\s*$", re.IGNORECASE)
LAST_LINE_SECONDS = 4.0     # a final line without a closing stamp is taken to last this long
SINGER = "the singer"


@dataclass(frozen=True)
class LyricLine:
    start: float    # seconds in the file
    end: float
    text: str


def parse(text):
    """(language, lines) from LRC text. Lines without a stamp are not timed and are left out."""
    language, stamped = "", []
    for raw in (text or "").splitlines():
        found = LANGUAGE_RE.match(raw)
        if found:
            language = found.group(1).strip()
            continue
        times = []
        while True:
            stamp = STAMP_RE.match(raw)
            if not stamp:
                break
            times.append(int(stamp.group(1)) * 60 + float(stamp.group(2).replace(":", ".")))
            raw = raw[stamp.end():]
        stamped.extend((time, raw.strip()) for time in times)
    stamped.sort(key=lambda entry: entry[0])
    lines = []
    for index, (start, words) in enumerate(stamped):
        if not words:
            continue
        end = stamped[index + 1][0] if index + 1 < len(stamped) else start + LAST_LINE_SECONDS
        lines.append(LyricLine(start, max(end, start), words))
    return language, tuple(lines)


def stamp(seconds):
    minutes, rest = divmod(max(0.0, seconds), 60)
    return "[%02d:%05.2f]" % (minutes, rest)


def to_lrc(language, lines):
    """LRC text for lines; a pause longer than a second before the next line gets its own empty stamp."""
    out = ["[la:%s]" % language] if language else []
    for index, line in enumerate(lines):
        out.append("%s %s" % (stamp(line.start), line.text))
        following = lines[index + 1].start if index + 1 < len(lines) else None
        if following is None or following - line.end > 1.0:
            out.append(stamp(line.end))
    return "\n".join(out)


def _spans(context, item):
    """(story start f, story end f, file frame at story start) where this card plays its own signal."""
    lanes = clip_windows(context, ("lock", "copy"))
    if item.id in lanes:
        return lanes[item.id]
    if not set(item.effective_usage) & {"lock", "copy"}:
        return []
    source = seconds_to_frames(item.options.start_s)
    bound = (shot_windows(context) or {}).get(item.id)
    if bound is not None:
        return [(start, end, source + offset) for start, end, offset in bound]
    return [(0, seconds_to_frames(context.project_seconds), source)]


def sung_lines(context, chunk):
    """[(local frame where the line is sung, speaker item id, language, text)] for this chunk, in time order.

    A line belongs to the part where its middle is sung; a part's carried-over head was rendered by the part before."""
    out = []
    for item in context.by_media("audio"):
        language, lines = parse(item.options.lyrics)
        if not lines:
            continue
        for origin, end, offset in _spans(context, item):
            for line in lines:
                middle = origin + seconds_to_frames((line.start + line.end) / 2.0) - offset
                if origin <= middle < end and chunk.story_start_f <= middle < chunk.story_end_f:
                    local = middle - (chunk.story_start_f - chunk.head_frames)
                    out.append((local, item.speaker, language or "English", line.text))
    return sorted(out, key=lambda entry: entry[0])
