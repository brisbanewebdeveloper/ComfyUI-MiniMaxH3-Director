"""Attach the shared H3 TAEHV preview to a native sampler's model."""
from comfy_api.latest import io

from ...minimax_preview import execute_preview, preview_schema
from .context_nodes import CATEGORY


class NGH3Preview(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return preview_schema("NGH3Preview", "H3 Live Preview", CATEGORY)

    @classmethod
    def execute(cls, model, **values):
        return execute_preview(cls, model, **values)


NODES = [NGH3Preview]
