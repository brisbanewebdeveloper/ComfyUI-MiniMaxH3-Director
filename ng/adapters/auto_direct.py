"""Explicit Auto Direct uses the existing provider transport and returns a proposal."""
from ... import minimax_media as legacy
from ..core.analysis import ProviderConfig
from ..core.auto_direct import direction_prompt, parse_direction
from ..core.fields import need_dict, read_number, read_list, read_str


async def direct(payload):
    need_dict(payload, "request")
    config = ProviderConfig.from_dict(payload["provider"])
    director = need_dict(payload["director"], "director")
    seconds = float(read_number(director, "project_seconds", "director", minimum=0.1))
    idea = read_str(director, "idea", "director").strip()
    if not idea:
        raise ValueError("Write an idea before Auto Direct.")
    contexts = read_list(payload, "contexts", "request")
    prompt = direction_prompt(idea, seconds, contexts)
    key = legacy.resolve_api_key({"api_key_env": config.api_key_env})
    defaults = legacy._PROVIDER_DEFAULTS[config.provider]
    url = legacy.normalize_base_url(config.base_url, defaults["url"])
    try:
        answer = await legacy.vlm_generate([], prompt, config.provider, url, config.model or defaults["model"],
                                          api_key=key, max_tokens=config.max_tokens,
                                          timeout=config.timeout_seconds, keep_alive=config.keep_alive)
        return parse_direction(answer, seconds, contexts)
    except (ValueError, legacy.VLMError) as error:
        raise ValueError(str(error).replace(key, "[redacted]") if key else str(error)) from None
