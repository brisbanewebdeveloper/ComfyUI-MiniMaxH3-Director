"""User-facing model ports and one render connection; the native graph does the work."""
from comfy_api.latest import io
from comfy.samplers import KSampler
from comfy_extras.nodes_custom_sampler import RandomNoise

from ..adapters.render_graph import render_sequence
from .context_nodes import CATEGORY
from .director_node import NGChunk


def model_inputs():
    return [io.Clip.Input("clip", raw_link=True, lazy=True), io.Vae.Input("vae", raw_link=True, lazy=True, display_name="video_vae"),
            io.Vae.Input("audio_vae", raw_link=True, lazy=True),
            io.Model.Input("model_fl2va", raw_link=True, lazy=True, optional=True),
            io.Model.Input("model_ref2va", raw_link=True, lazy=True, optional=True)]


def sampling_inputs():
    return [io.Int.Input("seed", default=0, min=0, max=0xffffffffffffffff, control_after_generate=True),
            io.Int.Input("steps", default=20, min=1, max=100, advanced=True),
            io.Combo.Input("sampler_name", options=KSampler.SAMPLERS, default="res_multistep", advanced=True),
            io.Combo.Input("scheduler", options=KSampler.SCHEDULERS, default="simple", advanced=True),
            io.Float.Input("shift_video", default=12.0, min=0.01, max=100.0, advanced=True),
            io.Float.Input("shift_audio", default=3.0, min=0.01, max=100.0, advanced=True)]


def render_outputs():
    return [io.Video.Output(display_name="video"), io.Image.Output(display_name="images"),
            io.Audio.Output(display_name="audio"), io.String.Output(display_name="render_warnings")]


def split_render_inputs(values):
    names = ("chunks", "clip", "vae", "audio_vae", "model_fl2va", "model_ref2va")
    inputs = {name: values[name] for name in names if name in values}
    if not any(inputs.get(name) for name in ("model_fl2va", "model_ref2va")):
        raise ValueError("Connect an H3 model to model_fl2va (text/frames) or model_ref2va (references).")
    settings = {name: values[name] for name in ("seed", "steps", "sampler_name", "scheduler", "shift_video", "shift_audio")}
    return inputs, settings


class NGRenderSequence(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGRenderSequence", display_name="NG Chunk Sequence", category=CATEGORY + "/Technical",
                         description="Connect the Director's chunks and your models. Renders and joins the entire sequence using native sampling, progress and interrupt.",
                         inputs=[NGChunk.Input("chunks", raw_link=True), *model_inputs(), *sampling_inputs()],
                         outputs=render_outputs(), enable_expand=True)

    @classmethod
    def execute(cls, **values):
        inputs, settings = split_render_inputs(values)
        expanded, outputs = render_sequence(inputs, settings)
        return io.NodeOutput(*outputs, expand=expanded)


class NGChunkNoise(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGChunkNoise", display_name="NG Chunk Noise", category=CATEGORY + "/Technical",
                         inputs=[NGChunk.Input("chunk"), io.Int.Input("seed", default=0, min=0, max=0xffffffffffffffff)],
                         outputs=[io.Noise.Output()])

    @classmethod
    def execute(cls, chunk, seed):
        job = chunk[0] if isinstance(chunk, list) else chunk
        return RandomNoise.execute(noise_seed=(int(seed) + job.index) % (1 << 64))


NODES = [NGRenderSequence, NGChunkNoise]
