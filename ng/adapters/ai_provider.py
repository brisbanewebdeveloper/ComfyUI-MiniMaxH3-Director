"""A native AI provider holds a loader link, never a loaded model or a model cache."""
from dataclasses import dataclass

from ..core.analysis import ProviderConfig


@dataclass(frozen=True)
class NativeAIProvider:
    clip: object
    config: ProviderConfig
    local_model: str = ""
    local_type: str = "stable_diffusion"


def provider_from_values(source, clip, values):
    backend = values.pop("local_backend", "server")
    model = values.pop("local_model", "")
    model_type = values.pop("local_type", "stable_diffusion")
    config = ProviderConfig.from_dict({"schema_version": 1, **values})
    if source == "local" and backend == "disk":
        if not model:
            raise ValueError("Choose an installed generative text encoder under Local / Load from disk.")
        return NativeAIProvider(None, config, model, model_type)
    if source == "clip":
        if clip is None:
            raise ValueError("Connect a generative Load CLIP node to the AI Loader's CLIP input.")
        return NativeAIProvider(clip, config)
    if source not in ("local", "api", "custom"):
        raise ValueError("Choose Local, API, CLIP / Encoder or Custom.")
    return config
