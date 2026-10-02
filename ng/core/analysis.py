"""Declared provider capabilities and editable analysis suggestions, independent of transport."""
import json
from dataclasses import dataclass
from urllib.parse import urlsplit

from . import fields
from .context import CONTENT_KINDS


@dataclass(frozen=True)
class ProviderConfig:
    provider: str = "ollama"
    base_url: str = ""
    model: str = ""
    api_key_env: str = ""
    vision: bool = True
    audio: bool = False
    timeout_seconds: int = 120
    max_tokens: int = 512
    keep_alive: int = 0
    SCHEMA_VERSION = 1

    def to_dict(self):
        return {"schema_version": self.SCHEMA_VERSION, "provider": self.provider, "base_url": self.base_url,
                "model": self.model, "api_key_env": self.api_key_env, "vision": self.vision, "audio": self.audio,
                "timeout_seconds": self.timeout_seconds, "max_tokens": self.max_tokens, "keep_alive": self.keep_alive}

    @classmethod
    def from_dict(cls, data, path="provider"):
        fields.need_dict(data, path)
        fields.check_version(data, path, cls.SCHEMA_VERSION)
        for key in ("vision", "audio"):
            if not isinstance(data.get(key, getattr(cls(), key)), bool):
                raise ValueError("%s.%s must be true or false." % (path, key))
        if set(data) - set(cls().to_dict()):
            raise ValueError("Provider settings contain unknown fields; keys belong in an environment variable.")
        address = fields.read_str(data, "base_url", path, "").strip()
        if address:
            url = urlsplit(address)
            if url.scheme not in ("http", "https") or not url.hostname or url.username is not None or url.password is not None or url.query or url.fragment:
                raise ValueError("Use an HTTP(S) base URL without credentials, query or fragment; keys belong in api_key_env.")
        return cls(provider=fields.read_choice(data, "provider", path, ("ollama", "lmstudio", "custom"), "ollama"),
                   base_url=address, model=fields.read_str(data, "model", path, ""),
                   api_key_env=fields.read_str(data, "api_key_env", path, ""), vision=data.get("vision", True), audio=data.get("audio", False),
                   timeout_seconds=_whole_number(data, "timeout_seconds", path, 120, 5, 900),
                   max_tokens=_whole_number(data, "max_tokens", path, 512, 64, 8192),
                   keep_alive=_whole_number(data, "keep_alive", path, 0, 0, 3600))


def _whole_number(data, key, path, default, minimum, maximum):
    """A setting the UI offers as a slider; a wrong type must say so instead of being coerced."""
    value = fields.read_number(data, key, path, default)
    if isinstance(value, float) and not value.is_integer():
        raise ValueError("%s.%s must be a whole number, got %r." % (path, key, value))
    value = int(value)
    if not minimum <= value <= maximum:
        raise ValueError("%s.%s must be between %d and %d, got %d." % (path, key, minimum, maximum, value))
    return value


def analysis_prompt(media, content):
    scope = {"image": "the image", "video": "three ordered stills from the first 15 seconds of a video; avoid inferring unseen motion",
             "audio": "the first 15 seconds of the audio", "text": "the supplied context text"}
    return ("Describe %s as a reference for a video director. Focus on %s. Return only JSON with "
            "description (one concise sentence) and content (one of: %s). Do not invent facts or rewrite the user's usage."
            % (scope[media], content or "observable features", ", ".join(CONTENT_KINDS)))


def parse_suggestion(text):
    if not isinstance(text, str):
        raise ValueError("The provider must return a JSON text suggestion.")
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else text
    data = json.loads(text)
    fields.need_dict(data, "analysis")
    description = fields.read_str(data, "description", "analysis").strip()
    content = fields.read_choice(data, "content", "analysis", CONTENT_KINDS, None)
    if not description or len(description) > 2000:
        raise ValueError("Analysis needs a description of 1 to 2000 characters; try again or describe it manually.")
    return {"description": description, "content": content}
