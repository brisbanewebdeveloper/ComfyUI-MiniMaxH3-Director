"""Execution packets retain graph links so only the chosen H3 model is evaluated."""
from dataclasses import dataclass

from comfy_execution.graph_utils import GraphBuilder

from ..core.analysis import ProviderConfig
from .ai_provider import NativeAIProvider
from ..core.project import jobs
from .render_graph import render_sequence


@dataclass(frozen=True)
class DirectorInputs:
    clip: object
    vae: object
    audio_vae: object
    model_fl2va: object = None
    model_ref2va: object = None
    contexts: tuple = ()
    ai_provider: ProviderConfig | NativeAIProvider | None = None

    def links(self):
        return {name: getattr(self, name) for name in ("clip", "vae", "audio_vae", "model_fl2va", "model_ref2va")}


@dataclass(frozen=True)
class RenderSettings:
    seed: int = 0
    steps: int = 20
    sampler_name: str = "res_multistep"
    scheduler: str = "simple"
    shift_video: float = 12.0
    shift_audio: float = 3.0

    def values(self):
        return {name: getattr(self, name) for name in self.__dataclass_fields__}


@dataclass(frozen=True)
class DirectorResult:
    inputs: DirectorInputs
    project: object
    settings: RenderSettings


def prepare_output(result, chunk_index, previous=None):
    chunks = jobs(result.project)
    if not 0 <= chunk_index < len(chunks):
        raise ValueError("Choose a chunk from 0 to %d." % (len(chunks) - 1))
    graph = GraphBuilder()
    inputs = result.inputs.links()
    inputs = {name: value for name, value in inputs.items() if value is not None}
    conditioning = graph.node("NGChunkConditioning", "conditioning", chunk=chunks[chunk_index], previous=previous,
                              **inputs, shift_video=result.settings.shift_video, shift_audio=result.settings.shift_audio)
    negative = graph.node("ConditioningZeroOut", "negative", conditioning=conditioning.out(1))
    context = result.project.context
    outputs = (conditioning.out(0), conditioning.out(1), negative.out(0), conditioning.out(2),
               24.0, context.width, context.height, conditioning.out(3), result)
    return graph.finalize(), outputs


def render_project(result):
    graph = GraphBuilder()
    chunks = graph.node("NGProjectChunks", "chunks", sequence=result)
    expanded, outputs = render_sequence({**result.inputs.links(), "chunks": chunks.out(0)}, result.settings.values())
    return {**graph.finalize(), **expanded}, outputs
