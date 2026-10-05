"""Write out one render part's prompt with the connected HTTP provider (Ollama, OpenAI-compatible, ...)."""
from ... import minimax_media as legacy
from ..core.analysis import ProviderConfig
from ..core.fields import need_dict, read_list, read_number
from ..core.part_prompt import SYSTEM, write_tokens
from ..core.part_writer import brief, finish, write_prompt
from . import probe
from .analysis import endpoint, wire


async def write(payload):
    need_dict(payload, "request")
    config = ProviderConfig.from_dict(payload["provider"])
    director = need_dict(payload["director"], "director")
    facts = brief(director, read_list(payload, "contexts", "request"), int(read_number(payload, "part", "request", minimum=0)),
                  probe.duration_seconds)
    key = legacy.resolve_api_key({"api_key_env": config.api_key_env})
    try:
        entry, url, model = endpoint(config)
        answer = await legacy.vlm_generate([], write_prompt(facts), config.provider, url, model, api_key=key, auth=entry.auth,
                                           system_prompt=SYSTEM, **{**wire(config), "max_tokens": write_tokens(config.max_tokens)})
        return finish(answer, facts)
    except (ValueError, legacy.VLMError) as error:
        raise ValueError(str(error).replace(key, "[redacted]") if key else str(error)) from None
