"""Compile one chunk of a Director Context into what the model needs: the H3 prompt and the list of media to send, in label order.

The compiling itself is the legacy planner's (see legacy_bridge); this module turns its result into NG's own types, so nothing
above it depends on legacy dictionaries, and attaches NG's warnings.
"""
from dataclasses import dataclass

from ... import minimax_plan as plan
from . import fields, limits
from .chunks import Chunk, ContinuityPlan
from .context import DirectorContext, check_item
from .issues import Issue
from .legacy_bridge import build_timeline, decide_mode
from .media_labels import resolve_media_mentions, resolve_guide_mentions, resolve_lock_mentions, prompt_labels, read_prompt_labels
from .asset_prompt import apply_asset_relations
from .shot_bindings import scoped_context

KINDS = ("picture", "video", "audio", "lock", "first_frame", "last_frame", "keyframe", "continue_video")


@dataclass(frozen=True)
class MediaRef:
    kind: str
    ctx_id: str
    source: str
    start_f: int = 0
    length_f: int = 0
    trim_start_f: int = 0
    SCHEMA_VERSION = 1

    def to_dict(self):
        return {"schema_version": self.SCHEMA_VERSION, "kind": self.kind, "ctx_id": self.ctx_id, "source": self.source,
                "start_f": self.start_f, "length_f": self.length_f, "trim_start_f": self.trim_start_f}

    @classmethod
    def from_dict(cls, data, path="ref"):
        data = fields.need_dict(data, path)
        fields.check_version(data, path, cls.SCHEMA_VERSION)
        return cls(kind=fields.read_choice(data, "kind", path, KINDS, None), ctx_id=fields.read_str(data, "ctx_id", path),
                   source=fields.read_str(data, "source", path), start_f=int(fields.read_number(data, "start_f", path, 0)),
                   length_f=int(fields.read_number(data, "length_f", path, 0)), trim_start_f=int(fields.read_number(data, "trim_start_f", path, 0)))


@dataclass(frozen=True)
class CompiledChunk:
    index: int
    mode: str                  # t2va | fl2va | ref2va
    prompt: str
    refs: tuple = ()           # MediaRef in the order the labels <Picture N>/<Video N>/<Audio N> number them
    issues: tuple = ()
    prompt_labels: tuple = ()  # (native label, owning context ID); optional display metadata for v1 saves
    SCHEMA_VERSION = 1

    def of_kind(self, kind):
        return tuple(r for r in self.refs if r.kind == kind)

    def to_dict(self):
        return {"schema_version": self.SCHEMA_VERSION, "index": self.index, "mode": self.mode, "prompt": self.prompt,
                "refs": [r.to_dict() for r in self.refs], "issues": [i.to_dict() for i in self.issues],
                "prompt_labels": dict(self.prompt_labels)}

    @classmethod
    def from_dict(cls, data, path="compiled"):
        data = fields.need_dict(data, path)
        fields.check_version(data, path, cls.SCHEMA_VERSION)
        return cls(index=int(fields.read_number(data, "index", path, minimum=0)), mode=fields.read_choice(data, "mode", path, ("t2va", "fl2va", "ref2va"), None),
                   prompt=fields.read_str(data, "prompt", path),
                   refs=tuple(MediaRef.from_dict(d, "%s.refs[%d]" % (path, n)) for n, d in enumerate(fields.read_list(data, "refs", path))),
                   issues=tuple(Issue.from_dict(d) for d in fields.read_list(data, "issues", path)),
                   prompt_labels=read_prompt_labels(data, path))


def _picture_refs(result, mapping):
    refs = []
    for slot in result["ref_image_slots"]:
        if slot["source"] == "char":
            ctx = slot["image"].get("ng_item") or mapping.slot_items[slot["slot"]]
            refs.append(MediaRef("picture", ctx, slot["image"].get("name", "")))
        elif slot["source"] == "timeline":
            source = slot["event"]["seg"].get("imageFile", "")
            refs.append(MediaRef("picture", mapping.media_id(slot["event"]["seg"], source), source))
    return refs


def _anchor_refs(result, mapping):
    """One first frame and one last frame per chunk.

    H3's frame conditioning takes a single image per slot, so a project that set two last frames must not send two:
    the planner keeps both events for its own bookkeeping, but only the first of each role reaches the model. Which
    one was dropped is reported by `ng/core/context_checks.py` as `anchor_multiple`.
    """
    refs = []
    for kind in ("first_frame", "last_frame"):
        role = plan.ROLE_FIRST if kind == "first_frame" else plan.ROLE_LAST
        for event in result["events"]:
            source = event["seg"].get("imageFile", "")
            if event["role"] == role and source:
                ctx_id = event["seg"].get("ng_item") or mapping.anchor_id(role, source)
                refs.append(MediaRef(kind, ctx_id, source))
                break
    return refs


def _timed(kind, seg, key, mapping):
    source = seg.get(key, "")
    return MediaRef(kind, mapping.media_id(seg, source), source, int(seg.get("start", 0)) if kind == "lock" else 0,
                    int(seg.get("length", 0)), int(seg.get("trimStart", 0)))


def _media_refs(result, mapping):
    refs = _picture_refs(result, mapping)
    refs += [_timed("video", s, "videoFile", mapping) for s in result["ref_video_segs"]]
    refs += [_timed("audio", s, "audioFile", mapping) for s in result["ref_audio_segs"]]
    refs += [_timed("lock", s, "audioFile", mapping) for s in result["lock_audio_segs"]]
    return refs + _anchor_refs(result, mapping)


def _issues(context, chunk, result, continuity):
    # a continued chunk deliberately has no spoken line for a shot that began earlier (see legacy_bridge._shot_text)
    resumed = any(s.carried for s in chunk.shots)
    out = [Issue("planner", text, "chunk %d" % (chunk.index + 1)) for text in result["ref_warnings"]
           if not (resumed and "has no spoken line" in text)]
    for item in context.items:
        out.extend(check_item(item))
    if not context.idea.strip() and not any(s.text.strip() or any(line.text.strip() for line in s.spoken) for s in chunk.shots):
        out.append(Issue("no_text", "There is no text for this chunk; the prompt falls back to a bare placeholder.", "chunk %d" % (chunk.index + 1)))
    if context.prompt_override.strip():
        out.append(Issue("prompt_override", "Manual prompt replaces every chunk prompt; references and timing remain as planned."))
    return out


def _scene_guides(context, chunk):
    refs = []
    for item in context.items:
        if not item.source:
            continue
        if item.media == "image" and set(item.effective_usage) & {"keyframe", "storyboard"} and item.options.anchor_s >= 0:
            frame = int(round(item.options.anchor_s * limits.FPS))
            if chunk.story_start_f <= frame < chunk.story_end_f:
                refs.append(MediaRef("keyframe", item.id, item.source, frame - chunk.story_start_f + chunk.head_frames, 1))
        if item.media == "video" and "continue" in item.effective_usage and chunk.is_first:
            end = item.options.end_s or item.length_s
            start = max(item.options.start_s, end - 1.0) if end else item.options.start_s
            first = int(round(start * limits.FPS))
            length = max(1, min(limits.FPS, int(round(end * limits.FPS)) - first)) if end else limits.FPS
            refs.append(MediaRef("continue_video", item.id, item.source, 0, length, first))
    return refs


def _selected_audio(context, refs):
    selected = []
    for ref in refs:
        item = context.item(ref.ctx_id)
        if ref.kind == "audio" and item:
            start = max(ref.trim_start_f, int(round(item.options.start_s * limits.FPS)))
            end = int(round(item.options.end_s * limits.FPS)) if item.options.end_s else 0
            length = min(ref.length_f, max(0, end - start)) if end else ref.length_f
            ref = MediaRef(ref.kind, ref.ctx_id, ref.source, ref.start_f, length, start)
        selected.append(ref)
    return selected


def compile_chunk(context: DirectorContext, chunk: Chunk, continuity: ContinuityPlan) -> CompiledChunk:
    context, binding_issues = scoped_context(context, chunk)
    mode = decide_mode(context)
    tdata, mapping, voice_notes = build_timeline(context, chunk, mode)
    result = plan.plan_timeline(tdata, 0, chunk.sampled_frames, float(limits.FPS), use_custom_audio=True, use_custom_motion=True,
                                prepend_text=context.prepend_text, prompt_format="minimax")
    refs = _selected_audio(context, _media_refs(result, mapping)) + _scene_guides(context, chunk)
    related_prompt, relation_issues = apply_asset_relations(result, mapping, context, refs)
    prompt = resolve_media_mentions(related_prompt, context, refs)
    labels = prompt_labels(result, mapping, context, refs)
    prompt, guide_issues = (prompt, ()) if context.prompt_override.strip() else resolve_guide_mentions(prompt, context, refs, labels)
    prompt, lock_issues = (prompt, ()) if context.prompt_override.strip() else resolve_lock_mentions(prompt, context, refs)
    return CompiledChunk(index=chunk.index, mode=result["mode"], prompt=context.prompt_override.strip() or prompt, refs=tuple(refs),
                         issues=binding_issues + tuple(voice_notes) + relation_issues + guide_issues + lock_issues + tuple(_issues(context, chunk, result, continuity)),
                         prompt_labels=labels)

