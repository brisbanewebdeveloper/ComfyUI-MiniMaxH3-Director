"""A shot set in the place of an earlier shot ("Place like Shot 1"): a picture of the earlier shot, taken from our own
render, becomes a Place card of the later shot.

Real test 2026-10-18 (tavern -> market square -> back into the tavern, same seed): without the picture H3 invented
another room, with it the tavern came back with its bar, copper pots, wagon-wheel chandelier and fireplace. The picture
also brings its camera: a later "reverse angle" kept the old view. The idea comes from ATAS (arXiv 2610.20571), which keeps
a memory of every place; this is its 2D form.

The picture exists only once the earlier shot is rendered, so the later shot starts a render part of its own (a join: the
pin stays, the shot runs on from the one before) and the picture is written inside the render loop, right after the part
that holds it (adapters/places.py). Plain arithmetic and plan data here; no files, no tensors."""
import hashlib
import json
from dataclasses import dataclass

from . import frames
from .issues import Issue
from .shot_document import read_document

PREFIX = "h3place_"
FOLDER = "h3-director-places"
PICTURE_AT_S = 1.0          # into the earlier shot: its place is set up, its camera has barely moved (the test used 1.0 s)
DESCRIPTION = "the place where this scene happens, exactly as it looked earlier in the film"


@dataclass(frozen=True)
class Place:
    target_id: str          # the shot that returns to the place
    source_id: str          # the shot whose render shows the place
    context_id: str         # the Place card the plan adds
    source: str             # its picture, relative to ComfyUI's input folder
    frame: int              # story frame of the picture


def is_place(context_id):
    return str(context_id or "").startswith(PREFIX)


def wanted(shots_text):
    """{target shot id: source shot id} as the shots ask for it (field `place_from`)."""
    out = {}
    for record in read_document(shots_text) or ():
        source = record.get("place_from")
        if isinstance(source, str) and source.strip():
            out[record["id"]] = source.strip()
    return out


def links(shots_text, shots):
    """The usable links in shot order, and the issues of the others. A source must be another shot that starts earlier."""
    asked, by_id, issues, out = wanted(shots_text), {shot.id: shot for shot in shots}, [], {}
    for shot in shots:
        source = asked.get(shot.id)
        if source is None:
            continue
        earlier = by_id.get(source)
        if earlier is None:
            issues.append(Issue("place_unknown", "takes its place from a shot that no longer exists; no place picture is used.",
                                "shot %d" % shot.index))
        elif earlier.start_f >= shot.start_f:
            issues.append(Issue("place_later", "takes its place from Shot %d, which does not come before it; no place picture is used."
                                % earlier.index, "shot %d" % shot.index))
        else:
            out[shot.id] = source
    return out, issues


def picture_frame(source_shot, target_start_f):
    """The story frame shown on the Place card: PICTURE_AT_S into the earlier shot, inside it and before the later shot."""
    length = source_shot.end_f - source_shot.start_f
    frame = source_shot.start_f + min(frames.seconds_to_frames(PICTURE_AT_S), max(length // 2, 0))
    return max(source_shot.start_f, min(frame, source_shot.end_f - 1, target_start_f - 1))


def plan_places(context, shots, chosen):
    """Place records for `chosen` ({target: source}) over the final shots."""
    by_id, out = {shot.id: shot for shot in shots}, []
    for target_id, source_id in chosen.items():
        target, source = by_id.get(target_id), by_id.get(source_id)
        if target is None or source is None:
            continue
        # one file per project and shot pair, so two Directors in one workflow do not share pictures
        key = hashlib.sha1(json.dumps([context.shots_text, context.width, context.height, source_id, target_id]).encode()).hexdigest()[:12]
        out.append(Place(target_id=target_id, source_id=source_id, context_id=PREFIX + source_id,
                         source="%s/%s.png" % (FOLDER, key), frame=picture_frame(source, target.start_f)))
    return tuple(out)


def add_cards(context, places, shots):
    """The context with a Place card per place, bound to its later shot as a reference."""
    if not places:
        return context
    from dataclasses import replace
    from .context import ContextItem
    labels = {shot.id: shot.index for shot in shots}
    items, have = list(context.items), {item.id for item in context.items}
    data = json.loads(context.shots_text)
    for place in places:
        if place.context_id not in have:
            have.add(place.context_id)
            items.append(ContextItem(id=place.context_id, name="Place of Shot %d" % labels.get(place.source_id, 0), media="image",
                                     source=place.source, content=("location",), usage=("reference",), preserve="high",
                                     description=DESCRIPTION))
        for record in data["shots"]:
            if record["id"] == place.target_id:
                media = record.setdefault("media", [])
                if not any(binding.get("context_id") == place.context_id for binding in media):
                    media.append({"schema_version": 1, "context_id": place.context_id, "role": "reference"})
    return replace(context, items=tuple(items), shots_text=json.dumps(data))


def in_chunk(places, chunk):
    """(place, frame index in the chunk's sampled latent timeline) for the pictures this chunk shows."""
    out = []
    for place in places:
        if chunk.story_start_f <= place.frame < chunk.story_end_f:
            out.append((place, place.frame - chunk.story_start_f + chunk.head_frames))
    return out
