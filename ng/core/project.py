"""Plan a whole project: shots, chunks and the compiled prompt of every chunk, with every correction collected as an Issue.

This is what the Director node does with its inputs, kept free of ComfyUI so it can be tested and reused by a preview endpoint.
"""
import json
import math
import re
from dataclasses import dataclass, replace

from . import frames, limits
from .chunks import ContinuityPlan, SequencePlan, plan_chunks
from .compile import compile_chunk
from .context import USAGE_BY_MEDIA, ContextItem, DirectorContext
from .context_checks import check_context, check_guide_times
from .issues import Issue
from .legacy_bridge import decide_mode
from .shots import auto_shots, parse_shots
from .subjects import resolve_subjects
from .shot_document import has_shots, read_document
from .audio_timing import clip_issues, covers, locked_spans

CANVAS_MULTIPLE = 32
H3_SHORT_EDGE, H3_MAX_PIXELS = 768, 768 * 1344
DEFAULT_CANVAS = (1344, 768)


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_") or "item"


def resolve_speakers(items):
    """A speaker is written as a name or an id; store ids. Returns (items, issues)."""
    by_name = {i.name.casefold(): i.id for i in items}
    ids = {i.id for i in items}
    out, issues = [], []
    for item in items:
        speaker = item.speaker.strip()
        if speaker and speaker not in ids:
            found = by_name.get(speaker.casefold())
            if found is None:
                issues.append(Issue("speaker_unknown", "names '%s' as the speaker, but no context item has that name." % speaker, item.name))
            item = ContextItem.from_dict({**item.to_dict(), "speaker": found or ""})
        out.append(item)
    return tuple(out), issues


def snap_canvas(width, height):
    snapped = tuple(max(CANVAS_MULTIPLE, int(round(v / float(CANVAS_MULTIPLE))) * CANVAS_MULTIPLE) for v in (width, height))
    issues = []
    if snapped != (width, height):
        issues.append(Issue("canvas_snapped", "The size %dx%d was changed to %dx%d: H3 needs multiples of %d."
                            % (width, height, snapped[0], snapped[1], CANVAS_MULTIPLE)))
    return snapped, issues


def h3_canvas(width, height):
    """H3's own canvas for a source picture, as comfy_extras.nodes_minimax_h3.adapt_canvas: 768 short edge, 768*1344 area, /32."""
    ratio = width / float(height)
    w, h = (H3_SHORT_EDGE * ratio, H3_SHORT_EDGE) if ratio >= 1.0 else (H3_SHORT_EDGE, H3_SHORT_EDGE / ratio)
    if w * h > H3_MAX_PIXELS:
        scale = math.sqrt(H3_MAX_PIXELS / (w * h))
        w, h = w * scale, h * scale
    return tuple(max(CANVAS_MULTIPLE, int(round(v / CANVAS_MULTIPLE)) * CANVAS_MULTIPLE) for v in (w, h))


def auto_canvas(context, image_size):
    """Width or height 0 asks for the size of the first picture: the first frame if there is one, else the first image."""
    if context.width > 0 and context.height > 0:
        return context, []
    images = [i for i in context.by_media("image") if i.source]
    source = next((i for i in images if "first_frame" in i.effective_usage), images[0] if images else None)
    size = image_size(source.source) if source and image_size else None
    if size:
        width, height = h3_canvas(*size)
        issue = Issue("canvas_from_image", "The video is %dx%d, taken from '%s'." % (width, height, source.name))
    else:
        width, height = DEFAULT_CANVAS
        issue = Issue("canvas_default", "No picture to take the size from; the video is %dx%d." % DEFAULT_CANVAS)
    return replace(context, width=width, height=height), [issue]


@dataclass(frozen=True)
class ProjectPlan:
    context: DirectorContext
    plan: SequencePlan
    compiled: tuple
    issues: tuple


@dataclass(frozen=True)
class ChunkJob:
    """One chunk of a planned project: what travels through the loop, one per iteration."""
    project: ProjectPlan
    index: int

    @property
    def chunk(self):
        return self.project.plan.chunks[self.index]

    @property
    def compiled(self):
        return self.project.compiled[self.index]


def jobs(project: ProjectPlan):
    return [ChunkJob(project, n) for n in range(len(project.plan.chunks))]


_CHUNK_REF = re.compile(r"chunk (\d+)$")


def _merge(issues, chunk_count):
    """One entry per distinct problem: the same text found in several chunks is listed once, with the chunks it applies to."""
    order, numbers, first = [], {}, {}
    for issue in issues:
        match = _CHUNK_REF.match(issue.ref)
        key = (issue.code, issue.text, None if match else issue.ref)
        if key not in first:
            first[key], numbers[key] = issue, []
            order.append(key)
        if match:
            numbers[key].append(int(match.group(1)))
    out = []
    for key in order:
        found = sorted(set(numbers[key]))
        ref = key[2] if key[2] is not None else ("" if len(found) == chunk_count else "chunk " + ", ".join(map(str, found)))
        out.append(Issue(first[key].code, first[key].text, ref))
    return tuple(out)


def _prepare(context):
    related, relationship_issues = resolve_subjects(context.items)
    items, issues = resolve_speakers(related)
    (width, height), canvas_issues = snap_canvas(context.width, context.height)
    ctx = DirectorContext.from_dict({**context.to_dict(), "items": [i.to_dict() for i in items], "width": width, "height": height})
    # Structured scenes diagnose roles after selecting their chunk's bindings.
    checks = check_context(ctx) if read_document(ctx.shots_text) is None else []
    return ctx, relationship_issues + issues + canvas_issues + checks


def _opens_on_picture(context, shot):
    """A First frame picture is bound to the shot, by the binding's role or, for a plain binding, by the card's usage."""
    for binding in shot.media:
        item = context.item(binding.context_id)
        if item and item.media == "image" and item.source:
            roles = (binding.role,) if binding.role in USAGE_BY_MEDIA["image"] else item.effective_usage
            if "first_frame" in roles:
                return True
    return False


def _opening_cuts(context, shots, total):
    """Render-part starts for shots that open on their own First frame picture: (cut frames, {shot id: cut}, issues).

    Inside a pinned part H3 takes such a picture as the end of the running take and cuts after it (measured 2026-10-11:
    picture hit at its frame, cut one frame later). A part of its own puts the picture on frame 0, where the model is
    trained to start from it. A part starts on H3's grid, so the shot start moves to the nearest grid frame."""
    shortest = frames.snap_up(limits.SAMPLED_MIN_FRAMES)
    cuts, moved, issues, previous = [], {}, [], 0
    for shot in shots:
        if shot.start_f <= 0 or not _opens_on_picture(context, shot):
            continue
        cut = previous + frames.snap_nearest(shot.start_f - previous)
        if cut - previous < shortest or total - cut < shortest:
            issues.append(Issue("opening_too_close", "opens on a First frame picture but is too close to the previous opening "
                                "or the end for a render part of its own; the picture is used inside the running part.", "shot %d" % shot.index))
            continue
        cuts.append(cut)
        previous = cut
        if cut != shot.start_f:
            moved[shot.id] = cut
            issues.append(Issue("opening_moved", "starts at %.2fs instead of %.2fs so that its First frame picture opens a render part."
                                % (frames.frames_to_seconds(cut), frames.frames_to_seconds(shot.start_f)), "shot %d" % shot.index))
    return cuts, moved, issues


def _move_shot_starts(shots_text, moved):
    """The shots document with the given shots starting at a new frame; the shot before each one ends there."""
    data = json.loads(shots_text)
    records = sorted(data["shots"], key=lambda r: float(r["start"]))
    for before, record in zip([None] + records[:-1], records):
        if record["id"] not in moved:
            continue
        old, new = float(record["start"]), frames.frames_to_seconds(moved[record["id"]])
        if before is not None and (float(before["end"]) >= new or abs(float(before["end"]) - old) < 1e-6):
            before["end"] = new
        record["start"] = new
    return json.dumps(data)


def _fl2va_pictures(context):
    """FL2VA has no reference slots: with the mode set to fl2va, a Reference picture opens its shot (or the video) as First frame."""
    if context.mode != "fl2va":
        return context, []
    items, names = [], []
    for item in context.items:
        usage = item.effective_usage
        if item.media == "image" and item.source and "reference" in usage and not set(usage) & {"first_frame", "last_frame", "keyframe", "storyboard"}:
            item = replace(item, usage=usage + ("first_frame",))     # still the figure the text names
            names.append(item.name)
        items.append(item)
    issues = [Issue("reference_as_first_frame", "FL2VA has no reference pictures; these open their shot (or the video) as "
                    "First frame: %s." % ", ".join(names))] if names else []
    return replace(context, items=tuple(items)), issues


def plan_project(context: DirectorContext, chunk_seconds, continuity: ContinuityPlan, image_size=None) -> ProjectPlan:
    context, canvas_issues = auto_canvas(context, image_size)
    context, fallback_issues = _fl2va_pictures(context)
    canvas_issues = canvas_issues + fallback_issues
    context, issues = _prepare(context)
    issues = canvas_issues + issues
    total = frames.seconds_to_frames(context.project_seconds)
    cuts = ()
    if has_shots(context.shots_text):
        shots, shot_issues = parse_shots(context.shots_text, total)
        if continuity.head and decide_mode(context) == "fl2va":
            cuts, moved, opening_issues = _opening_cuts(context, shots, total)
            issues = issues + opening_issues
        else:
            moved = {}
        if moved:
            context = replace(context, shots_text=_move_shot_starts(context.shots_text, moved))
            shots, shot_issues = parse_shots(context.shots_text, total)
    else:
        shots, shot_issues = auto_shots(context.idea, total), ()
    chunk_frames = frames.seconds_to_frames(chunk_seconds or limits.DEFAULT_CHUNK_SECONDS)
    plan = plan_chunks(total, chunk_frames, continuity, shots, cuts)
    # A song locked over the whole video is put back into every part from its file, so a long chain does not dull it
    # (elf song: 0.97-0.98 against the song in every part). A last second past the song's end is no chain.
    if covers(locked_spans(context), plan.total_frames, limits.FPS):
        plan = replace(plan, issues=tuple(i for i in plan.issues if i.code != "audio_dulling"))
    compiled = tuple(compile_chunk(context, chunk, continuity) for chunk in plan.chunks)
    issues = list(issues) + list(shot_issues) + list(plan.issues) + check_guide_times(context, plan.total_frames) + clip_issues(context)
    for one in compiled:
        issues.extend(one.issues)       # the same problem repeats per chunk; _merge lists it once
    return ProjectPlan(context=context, plan=plan, compiled=compiled, issues=_merge(issues, len(plan.chunks)))


def describe(project: ProjectPlan) -> str:
    """Plain-text summary of the plan, for a preview node."""
    plan = project.plan
    lines = ["%d chunk(s), %.2fs in total (%d frames), continuity: %s" % (
        len(plan.chunks), frames.frames_to_seconds(plan.total_frames), plan.total_frames, plan.continuity.mode)]
    for chunk, compiled in zip(plan.chunks, project.compiled):
        lines.append("  chunk %d: %.2f-%.2fs, %d frames (sampled %d, head %d), %s, %d reference(s), %d shot(s)" % (
            chunk.index + 1, frames.frames_to_seconds(chunk.story_start_f), frames.frames_to_seconds(chunk.story_end_f),
            chunk.delivered_frames, chunk.sampled_frames, chunk.head_frames, compiled.mode, len(compiled.refs), len(chunk.shots)))
    return "\n".join(lines)
