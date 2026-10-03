"""Build explicit AI jobs with ComfyUI's Generate Text, using its model management."""
import json

from comfy_execution.graph_utils import GraphBuilder

from ... import minimax_enhance as enhance
from ... import minimax_media as media
from ..core.analysis import analysis_prompt, parse_suggestion
from ..core.auto_direct import direction_prompt, keep_manual_dialogue, parse_direction
from ..core.fields import need_dict, read_number, read_str
from ..core.system_prompts import framed, for_node
from . import h3_prompt
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
    if action == "prompt":
        # The Text card's own action. It answers with prose that goes straight into the prompt,
        # not with the JSON the other two need, so it carries its own role and no schema framing.
        # The preset strings come from minimax_enhance so this cannot name a block that does not
        # exist there - a mismatch would silently fall back to the global system prompt.
        return h3_prompt.note_prompt(read_str(payload, "note", "request", ""),
                                     float(read_number(payload, "seconds", "request",
                                                       h3_prompt.DEFAULT_SECONDS, minimum=0.1)),
                                     h3_prompt.preset_of(payload.get("preset", "global"))), None
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
                  # The role comes from system_prompts.py and the schema framing from there too, so
                  # the two cannot be edited apart. Auto Direct plans, an Analyze describes: the same
                  # framing with the wrong role produced answers that read as the wrong task.
                  # "prompt" is the exception and carries no schema framing: its answer is prose
                  # destined for the prompt itself, so asking for JSON would only turn it into
                  # something to parse back out again.
                  system_prompt=(enhance.system_for(h3_prompt.preset_of(payload.get("preset", "global")), 0)
                                 if action == "prompt"
                                 else framed(for_node("director" if action == "direct" else "context", media))))
    if media:
        source = payload["widgets"].get(media, "")
        loaded = graph.node("NGAIReadMedia", media=media, source=source)
        inputs["image" if media in ("image", "video") else "audio"] = loaded.out(0 if media != "audio" else 1)
    generated = graph.node("TextGenerate", **inputs)
    result = graph.node("NGAIResult", text=generated.out(0), action=action, request_json=request_json)
    return graph.finalize(), result.out(0)


def parse_result(text, action, request_json):
    payload = json.loads(request_json)
    if action == "prompt":
        return h3_prompt.clean(text, payload.get("preset", "global"))
    # Generic Qwen CLIP tokenizers can decode the assistant role header with the answer.
    text = text.removeprefix("assistant\n").strip()
    if action == "analyze":
        # The medium decides which content roles the answer may name: a picture cannot be dialogue.
        return parse_suggestion(text, payload.get("media", "text")).to_dict()
    suggestion = parse_direction(text, float(payload["director"]["project_seconds"]), payload["contexts"])
    shots, kept = keep_manual_dialogue(suggestion["shots"], payload["director"].get("shots", ""))
    suggestion["shots"] = shots
    if kept:
        suggestion["kept_dialogue"] = kept
    return suggestion
