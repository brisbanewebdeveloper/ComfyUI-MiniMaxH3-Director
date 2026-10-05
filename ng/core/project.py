"""Plan a whole project: shots, chunks and the compiled prompt of every chunk, with every correction collected as an Issue.

This is what the Director node does with its inputs, kept free of ComfyUI so it can be tested and reused by a preview endpoint.
"""
import math
import re
from dataclasses import dataclass, replace

from . import frames, limits
from .chunks import ContinuityPlan, SequencePlan, plan_chunks
from .compile import compile_chunk
from .context import ContextItem, DirectorContext
from .context_checks import check_context, check_guide_times
from .issues import Issue
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


def plan_project(context: DirectorContext, chunk_seconds, continuity: ContinuityPlan, image_size=None) -> ProjectPlan:
    context, canvas_issues = auto_canvas(context, image_size)
    context, issues = _prepare(context)
    issues = canvas_issues + issues
    total = frames.seconds_to_frames(context.project_seconds)
    if has_shots(context.shots_text):
        shots, shot_issues = parse_shots(context.shots_text, total)
    else:
        shots, shot_issues = auto_shots(context.idea, total), ()
    chunk_frames = frames.seconds_to_frames(chunk_seconds or limits.DEFAULT_CHUNK_SECONDS)
    plan = plan_chunks(total, chunk_frames, continuity, shots)
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
