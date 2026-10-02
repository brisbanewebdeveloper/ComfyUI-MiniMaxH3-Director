"""AI configuration is shared by connected contexts; loading it makes no requests."""
from comfy_api.latest import io

from ..core.analysis import ProviderConfig
from .context_nodes import CATEGORY

NGAI = io.Custom("NG_AI_PROVIDER")


class NGAIProvider(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGAIProvider", display_name="H3 AI Loader", category=CATEGORY,
                         description="Configure a local model server or an OpenAI-compatible API. Connect to a Context or the Connector to enable AI actions. No request runs when loading this node.",
                         inputs=[io.String.Input("source", default="local", tooltip="Which kind of provider the fields below belong to. The panel on the node shows the matching address and options."),
                                 io.Combo.Input("provider", options=["ollama", "lmstudio", "custom"], default="ollama"),
                                 io.String.Input("base_url", default="", tooltip="Local Ollama/LM Studio or compatible API address."),
                                 io.String.Input("model", default="", tooltip="Model served by your selected provider."),
                                 io.String.Input("api_key_env", default="", advanced=True, tooltip="Environment variable containing the key; never paste the key here."),
                                 io.Boolean.Input("vision", default=True, tooltip="Declare that the selected model accepts images."),
                                 io.Boolean.Input("audio", default=False, tooltip="Declare input_audio support; not supported by this Ollama transport."),
                                 io.Int.Input("timeout_seconds", default=120, min=5, max=900, advanced=True,
                                              tooltip="How long one analysis request may take before it is given up."),
                                 io.Int.Input("max_tokens", default=512, min=64, max=8192, advanced=True,
                                              tooltip="Upper bound for the answer length. A short description needs few tokens."),
                                 io.Int.Input("keep_alive", default=0, min=0, max=3600, advanced=True,
                                              tooltip="Seconds the provider keeps the model loaded. 0 releases it after every request."),
                                 io.Clip.Input("clip", display_name="CLIP", raw_link=True, lazy=True, optional=True,
                                               tooltip="Optional. H3 already needs a CLIP at the Connector; this port only confirms which encoder the graph runs with.")],
                         outputs=[NGAI.Output(display_name="AI provider")])

    @classmethod
    def execute(cls, **values):
        # `source` only steers the panel, and the CLIP port only declares the encoder H3 runs with.
        values.pop("source", None)
        values.pop("clip", None)
        config = ProviderConfig.from_dict({"schema_version": 1, **values})
        return io.NodeOutput(config)


NODES = [NGAIProvider]
