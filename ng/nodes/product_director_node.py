"""The product Director owns creative planning, with render execution downstream."""
from comfy_api.latest import io

from ..adapters.director_packets import DirectorResult, RenderSettings
from ..core.chunks import ContinuityPlan
from ..core.context import DirectorContext
from ..core.limits import PIN_AUDIO_DEFAULT
from ..core.project import plan_project
from .connector_node import NGInputs
from .context_nodes import CATEGORY
from .director_node import NGDirector
from .render_node import sampling_inputs

NGResult = io.Custom("NG_DIRECTOR_RESULT")


class NGH3Director(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGH3Director", display_name="H3 Director", category=CATEGORY,
                         description="Plan your project: idea, reusable contexts, editable scenes and timing. Connect Result to H3 Director Output; sampling remains in the downstream graph.",
                         inputs=[NGInputs.Input("context", display_name="context"),
                                 *NGDirector.define_schema().inputs[:-1],
                                 io.Combo.Input("style", options=["None", "Cinematic", "Anime", "Documentary", "Photorealistic"], default="None"),
                                 io.String.Input("prompt_override", multiline=True, default="", optional=True, advanced=True), *sampling_inputs()],
                         outputs=[NGResult.Output(display_name="result")])

    @classmethod
    def execute(cls, context, **values):
        director = DirectorContext(idea=values["idea"], project_seconds=values["project_seconds"],
                                   width=values["width"], height=values["height"], mode=values["mode"],
                                   shots_text=values["shots"], soundscape=values["soundscape"], music=values["music"],
                                   prepend_text=values.get("prepend_text", ""), items=context.contexts,
                                   style=values.get("style", ""), prompt_override=values.get("prompt_override", ""))
        continuity = ContinuityPlan(mode=values["continuity"], video_frames=int(values["pin_frames"]), audio_frames=PIN_AUDIO_DEFAULT)
        project = plan_project(director, values["chunk_seconds"], continuity)
        settings = RenderSettings(**{name: values[name] for name in RenderSettings.__dataclass_fields__ if name in values})
        return io.NodeOutput(DirectorResult(context, project, settings))


NODES = [NGH3Director]
