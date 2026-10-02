"""The plan as plain data for the editor's live panel: no media is loaded and nothing is rendered."""
from . import frames
from .chunks import ContinuityPlan
from .context import DirectorContext
from .context_build import item_from_widgets
from .issues import SchemaError
from .limits import DEFAULT_SOUNDSCAPE, PIN_AUDIO_DEFAULT
from .project import plan_project

DIRECTOR_DEFAULTS = {"idea": "", "shots": "", "project_seconds": 10.0, "chunk_seconds": 0.0, "width": 768, "height": 1152, "mode": "auto",
                     "continuity": "video_audio", "pin_frames": "22", "soundscape": DEFAULT_SOUNDSCAPE, "music": "", "prepend_text": ""}


def _items(contexts, probe):
    items = []
    for entry in contexts or []:
        media, widgets = entry.get("media"), entry.get("widgets") or {}
        length = probe(widgets.get(media, "")) if probe and media in ("audio", "video") else 0.0
        items.append(item_from_widgets(media, widgets, length))
    return tuple(items)


def _name(context, ref):
    found = context.item(ref.ctx_id)
    return found.name if found else ref.source


def _chunk_view(chunk, compiled, context):
    return {"index": chunk.index, "start_s": round(frames.frames_to_seconds(chunk.story_start_f), 3),
            "end_s": round(frames.frames_to_seconds(chunk.story_end_f), 3), "delivered_frames": chunk.delivered_frames,
            "sampled_frames": chunk.sampled_frames, "head_frames": chunk.head_frames, "mode": compiled.mode, "prompt": compiled.prompt,
            "refs": [{"kind": r.kind, "ctx_id": r.ctx_id, "name": _name(context, r)} for r in compiled.refs]}


def plan_preview(payload, probe=None):
    """payload: {"director": {widget values}, "contexts": [{"media": "image", "widgets": {...}}, ...]}. Never raises on bad user input."""
    values = {**DIRECTOR_DEFAULTS, **(payload.get("director") or {})}
    try:
        context = DirectorContext(idea=values["idea"], project_seconds=float(values["project_seconds"]), width=int(values["width"]),
                                  height=int(values["height"]), mode=values["mode"], shots_text=values["shots"], soundscape=values["soundscape"],
                                  music=values["music"], prepend_text=values["prepend_text"], items=_items(payload.get("contexts"), probe))
        continuity = ContinuityPlan(mode=values["continuity"], video_frames=int(values["pin_frames"]), audio_frames=PIN_AUDIO_DEFAULT)
        project = plan_project(context, float(values["chunk_seconds"]), continuity)
    except (SchemaError, KeyError, ValueError, TypeError) as error:
        return {"ok": False, "error": str(error)}
    return {"ok": True, "total_s": round(frames.frames_to_seconds(project.plan.total_frames), 3), "total_frames": project.plan.total_frames,
            "mode": project.compiled[0].mode, "chunks": [_chunk_view(c, k, project.context) for c, k in zip(project.plan.chunks, project.compiled)],
            "issues": [i.to_dict() for i in project.issues]}
