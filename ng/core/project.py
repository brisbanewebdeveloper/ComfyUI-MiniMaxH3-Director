"""Plan a whole project: shots, chunks and the compiled prompt of every chunk, with every correction collected as an Issue.

This is what the Director node does with its inputs, kept free of ComfyUI so it can be tested and reused by a preview endpoint.
"""
import re
from dataclasses import dataclass

from . import frames, limits
from .chunks import ContinuityPlan, SequencePlan, plan_chunks
from .compile import CompiledChunk, compile_chunk
from .context import ContextItem, DirectorContext
from .issues import Issue
from .shots import auto_shots, parse_shots

CANVAS_MULTIPLE = 32


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_") or "item"


def resolve_speakers(items):
    """A speaker is written as a name or an id; store ids. Returns (items, issues)."""
    by_name = {i.name.lower(): i.id for i in items}
    ids = {i.id for i in items}
    out, issues = [], []
    for item in items:
        speaker = item.speaker.strip()
        if speaker and speaker not in ids:
            found = by_name.get(speaker.lower())
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


@dataclass(frozen=True)
class ProjectPlan:
    context: DirectorContext
    plan: SequencePlan
    compiled: tuple
    issues: tuple

    def chunk_issues(self, index):
        return tuple(i for i in self.issues if i.ref.startswith("chunk %d" % (index + 1)))


def _dedupe(issues):
    seen, out = set(), []
    for issue in issues:
        key = (issue.code, issue.text, issue.ref)
        if key not in seen:
            seen.add(key)
            out.append(issue)
    return tuple(out)


def _prepare(context):
    items, issues = resolve_speakers(context.items)
    (width, height), canvas_issues = snap_canvas(context.width, context.height)
    ctx = DirectorContext.from_dict({**context.to_dict(), "items": [i.to_dict() for i in items], "width": width, "height": height})
    return ctx, issues + canvas_issues


def plan_project(context: DirectorContext, chunk_seconds, continuity: ContinuityPlan) -> ProjectPlan:
    context, issues = _prepare(context)
    total = frames.seconds_to_frames(context.project_seconds)
    if context.shots_text.strip():
        shots, shot_issues = parse_shots(context.shots_text, total)
    else:
        shots, shot_issues = auto_shots(context.idea, total), ()
    chunk_frames = frames.seconds_to_frames(chunk_seconds or limits.DEFAULT_CHUNK_SECONDS)
    plan = plan_chunks(total, chunk_frames, continuity, shots)
    compiled = tuple(compile_chunk(context, chunk, continuity) for chunk in plan.chunks)
    issues = list(issues) + list(shot_issues) + list(plan.issues)
    for one in compiled:
        issues.extend(one.issues)       # item problems repeat per chunk; _dedupe keeps one of each
    return ProjectPlan(context=context, plan=plan, compiled=compiled, issues=_dedupe(issues))


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
