"""Unpack prepared native sampler values or render the whole planned sequence."""
from comfy_api.latest import io

from ..adapters.director_packets import prepare_output, render_project
from ..core.project import jobs
from .context_nodes import CATEGORY
from .director_node import NGChunk
from .product_director_node import NGResult
from .render_node import render_outputs


class NGDirectorOutput(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGDirectorOutput", display_name="H3 Director Output", category=CATEGORY,
                         description="Native sampler outputs for the selected chunk. For the full project, connect sequence to H3 Render Sequence. A continuation chunk needs previous latent.",
                         inputs=[NGResult.Input("result", display_name="input"),
                                 io.Int.Input("chunk_index", default=0, min=0, max=9999, advanced=True),
                                 io.Latent.Input("previous", optional=True, raw_link=True)],
                         outputs=[io.Model.Output(display_name="model"), io.Conditioning.Output(display_name="positive"),
                                  io.Conditioning.Output(display_name="negative"), io.Latent.Output(display_name="latent"),
                                  io.Float.Output(display_name="fps"), io.Int.Output(display_name="width"),
                                  io.Int.Output(display_name="height"), io.String.Output(display_name="prompt"),
                                  NGResult.Output(display_name="sequence")], enable_expand=True)

    @classmethod
    def execute(cls, result, chunk_index=0, previous=None):
        graph, outputs = prepare_output(result, chunk_index, previous)
        return io.NodeOutput(*outputs, expand=graph)


class NGProjectRender(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGProjectRender", display_name="H3 Render Sequence", category=CATEGORY,
                         description="Render the complete planned project through ComfyUI's native loop and sampler, with preview, progress and interrupt.",
                         inputs=[NGResult.Input("sequence")], outputs=render_outputs(), enable_expand=True)

    @classmethod
    def execute(cls, sequence):
        graph, outputs = render_project(sequence)
        return io.NodeOutput(*outputs, expand=graph)


class NGProjectChunks(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGProjectChunks", display_name="NG Project Chunks", category=CATEGORY + "/Expert",
                         inputs=[NGResult.Input("sequence")], outputs=[NGChunk.Output(is_output_list=True)])

    @classmethod
    def execute(cls, sequence):
        return io.NodeOutput(jobs(sequence.project))


NODES = [NGDirectorOutput, NGProjectRender, NGProjectChunks]
