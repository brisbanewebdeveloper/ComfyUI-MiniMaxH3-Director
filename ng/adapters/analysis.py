"""Reuse legacy text/vision transport. Audio uses the compatible input_audio message only when declared."""
import asyncio

import aiohttp
from PIL import Image

from ... import minimax_media as legacy
from ..core.analysis import ProviderConfig, analysis_prompt, parse_suggestion
from ..core.fields import need_dict
from . import preview_media


async def audio_generate(config, prompt, source, key):
    if config.provider == "ollama":
        raise ValueError("This Ollama transport has no audio input; choose an input_audio-compatible provider or describe the sound manually.")
    wav = await asyncio.to_thread(preview_media.audio_wav, source)
    defaults = legacy._PROVIDER_DEFAULTS[config.provider]
    url = legacy.normalize_base_url(config.base_url, defaults["url"])
    if not url or not config.model:
        raise ValueError("Set the provider's address and audio-capable model name.")
    payload = {"model": config.model, "stream": False, "max_tokens": 512, "messages": [{"role": "user", "content": [
        {"type": "text", "text": prompt}, {"type": "input_audio", "input_audio": {"data": wav, "format": "wav"}}]}]}
    async with aiohttp.ClientSession(headers=legacy._auth_headers(key)) as session:
        async with session.post(legacy.chat_completions_url(url), json=payload, timeout=aiohttp.ClientTimeout(total=120)) as response:
            if response.status in (401, 403):
                raise ValueError("The provider refused authentication; set api_key_env to a variable available to ComfyUI.")
            if response.status != 200:
                raise ValueError("Audio analysis failed (HTTP %d); check whether the model supports input_audio." % response.status)
            body = await response.json()
    try:
        return legacy.strip_thinking(body["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError):
        raise ValueError("The audio provider returned an unexpected response.")


def images(media, source):
    if media == "video":
        return preview_media.video_images(source)
    with Image.open(preview_media.require_path(source)) as image:
        return [preview_media.jpeg(image)]


async def analyze(payload):
    need_dict(payload, "request")
    config = ProviderConfig.from_dict(payload["provider"])
    media, widgets = payload["media"], payload["widgets"]
    need_dict(widgets, "context.widgets")
    if media not in ("image", "video", "audio", "text"):
        raise ValueError("Choose an image, video, audio or text context.")
    if media in ("image", "video") and not config.vision:
        raise ValueError("Enable vision for a model that accepts images, or describe this context manually.")
    if media == "audio" and not config.audio:
        raise ValueError("Enable audio for an input_audio-compatible model, or describe this sound manually.")
    prompt = analysis_prompt(media, widgets.get("content", ""))
    key = legacy.resolve_api_key({"api_key_env": config.api_key_env})
    try:
        if media == "audio":
            answer = await audio_generate(config, prompt, widgets.get("audio", ""), key)
        else:
            image_list = await asyncio.to_thread(images, media, widgets.get(media, "")) if media in ("image", "video") else []
            if media == "text":
                prompt += "\n\nContext text:\n" + widgets.get("text", "")
            defaults = legacy._PROVIDER_DEFAULTS[config.provider]
            url = legacy.normalize_base_url(config.base_url, defaults["url"])
            model = config.model or defaults["model"]
            answer = await legacy.vlm_generate(image_list, prompt, config.provider, url, model, api_key=key, max_tokens=512)
        return parse_suggestion(answer)
    except (ValueError, legacy.VLMError) as error:
        raise ValueError(str(error).replace(key, "[redacted]") if key else str(error)) from None
