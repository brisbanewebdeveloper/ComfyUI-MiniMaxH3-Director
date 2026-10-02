"""Build explicit AI jobs with ComfyUI's Generate Text, using its model management."""
import json

from comfy_execution.graph_utils import GraphBuilder

from ..core.analysis import analysis_prompt, parse_suggestion
from ..core.auto_direct import direction_prompt, parse_direction
from ..core.fields import need_dict, read_number, read_str
from .ai_provider import NativeAIProvider


def request_prompt(action, payload, config):
    need_dict(payload, "AI request")
    if action == "direct":
        director = need_dict(payload["director"], "director")
        seconds = read_number(director, "project_seconds", "director", minimum=0.1)
        idea = read_str(director, "idea", "director").strip()
        if not idea:
            raise ValueError("Write an idea before Auto Direct.")
        return direction_prompt(idea, seconds, payload["contexts"]), None
    if action != "analyze":
        raise ValueError("Choose Analyze or Auto Direct.")
    media, widgets = payload["media"], need_dict(payload["widgets"], "context.widgets")
    if media not in ("image", "video", "audio", "text"):
        raise ValueError("Choose an image, video, audio or text context.")
    if media in ("image", "video") and not config.vision:
        raise ValueError("Enable vision only for a CLIP model that accepts images.")
    if media == "audio" and not config.audio:
        raise ValueError("Enable audio only for a CLIP model that accepts audio.")
    prompt = analysis_prompt(media, widgets.get("content", ""))
    if media == "text":
        prompt += "\n\nContext text:\n" + widgets.get("text", "")
    return prompt, media if media != "text" else None


def native_request(provider, action, request_json):
    if not isinstance(provider, NativeAIProvider):
        raise ValueError("Select CLIP / Encoder on the connected H3 AI Loader.")
    payload = json.loads(request_json)
    prompt, media = request_prompt(action, payload, provider.config)
    graph = GraphBuilder()
    clip = provider.clip
    if provider.local_model:
        clip = graph.node("CLIPLoader", clip_name=provider.local_model, type=provider.local_type, device="default").out(0)
    inputs = dict(clip=clip, prompt=prompt, max_length=provider.config.max_tokens,
                  sampling_mode="off", thinking=False, use_default_template=True,
                  system_prompt="You are a video director's assistant. Follow the requested JSON schema exactly. Return a complete, nonempty JSON object, without a preface or markdown.")
    if media:
        source = payload["widgets"].get(media, "")
        loaded = graph.node("NGAIReadMedia", media=media, source=source)
        inputs["image" if media in ("image", "video") else "audio"] = loaded.out(0 if media != "audio" else 1)
    generated = graph.node("TextGenerate", **inputs)
    result = graph.node("NGAIResult", text=generated.out(0), action=action, request_json=request_json)
    return graph.finalize(), result.out(0)


def parse_result(text, action, request_json):
    payload = json.loads(request_json)
    # Generic Qwen CLIP tokenizers can decode the assistant role header with the answer.
    text = text.removeprefix("assistant\n").strip()
    if action == "analyze":
        return parse_suggestion(text)
    return parse_direction(text, float(payload["director"]["project_seconds"]), payload["contexts"])
