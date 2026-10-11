"""The product Director owns creative planning, with render execution downstream."""
import folder_paths
from comfy_api.latest import io

from ..adapters.director_packets import DirectorResult, RenderSettings
from ..core.chunks import ContinuityPlan
from ..core.context import DirectorContext
from ..core.limits import PIN_AUDIO_DEFAULT
from ..adapters.probe import image_size
from ..core.limits import RESIZE_METHODS
from ..core.project import jobs, plan_project
from .connector_node import NGInputs
from .context_nodes import CATEGORY
from .director_node import NGChunk, NGDirector
from .render_node import sampling_inputs

NGResult = io.Custom("NG_DIRECTOR_RESULT")


def turbo_inputs():
    """Turbo: a few-step LoRA per H3 model plus fewer steps; the Studio sets the steps when it is switched."""
    loras = folder_paths.get_filename_list("loras")

    def preferred(kind):
        # Only an H3 turbo LoRA qualifies: a turbo LoRA for another model (Flux, Wan, ...) would load and do harm.
        turbo = [n for n in loras if "turbo" in n.lower() and ("h3" in n.lower() or "minimax" in n.lower())]
        named = [n for n in turbo if kind in n.lower()]
        generic = [n for n in turbo if "fl2v" not in n.lower() and "ref2v" not in n.lower()]
        # Prefer files converted for ComfyUI: the raw training checkpoints carry other key names.
        return sorted(named or generic or ["none"], key=lambda n: "comfy" not in n.lower())[0]
    return [io.Boolean.Input("turbo", default=False, advanced=True,
                             tooltip="Apply the turbo LoRA below to the H3 model. The official templates use 4 steps and CFG 1."),
            io.Combo.Input("turbo_lora_fl2va", options=["none", *loras], default=preferred("fl2v"), advanced=True,
                           tooltip="Turbo LoRA for the FL2VA model (start/end frame and text)."),
            io.Combo.Input("turbo_lora_ref2va", options=["none", *loras], default=preferred("ref2v"), advanced=True,
                           tooltip="Turbo LoRA for the Ref2VA model (references).")]


class NGH3Director(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGH3Director", display_name="H3 Director", category=CATEGORY,
                         description="Plan your project: idea, reusable contexts, editable scenes and timing. Connect Result to H3 Director Output; sampling remains in the downstream graph.",
                         inputs=[NGInputs.Input("context", display_name="context"),
                                 *NGDirector.define_schema().inputs[:-1],
                                 io.Combo.Input("style", options=["None", "Cinematic", "Anime", "Documentary", "Photorealistic"], default="None"),
                                 io.String.Input("prompt_override", multiline=True, default="", optional=True, advanced=True), *sampling_inputs(),
                                 *turbo_inputs(),
                                 io.Combo.Input("resize_method", options=list(RESIZE_METHODS), default="crop", advanced=True,
                                                tooltip="How a first or last frame picture is fitted to the video size."),
                                 io.Combo.Input("ref_image_size", options=["match", "max"], default="match", advanced=True,
                                                tooltip="Reference pictures at the video's pixel area (fast) or a 2048 px short edge (more identity, slower).")],
                         outputs=[NGResult.Output(display_name="result"), NGChunk.Output(display_name="chunks", is_output_list=True)])

    @classmethod
    def execute(cls, context, **values):
        text_inputs = {name: "" if values.get(name) is None else values[name]
                       for name in ("prepend_text", "prompt_override")}
        director = DirectorContext(idea=values["idea"], project_seconds=values["project_seconds"],
                                   width=values["width"], height=values["height"], mode=values["mode"],
                                   shots_text=values["shots"], soundscape=values["soundscape"], music=values["music"],
                                   items=context.contexts, style=values.get("style", ""), **text_inputs)
        continuity = ContinuityPlan(mode=values["continuity"], video_frames=int(values["pin_frames"]), audio_frames=PIN_AUDIO_DEFAULT)
        project = plan_project(director, values["chunk_seconds"], continuity, image_size)
        settings = RenderSettings(**{name: values[name] for name in RenderSettings.__dataclass_fields__ if name in values})
        return io.NodeOutput(DirectorResult(context, project, settings), jobs(project))


NODES = [NGH3Director]
