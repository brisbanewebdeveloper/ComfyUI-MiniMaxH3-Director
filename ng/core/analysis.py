"""Declared provider capabilities and editable analysis suggestions, independent of transport."""
import json
from dataclasses import dataclass
from urllib.parse import urlsplit

from . import fields
from . import providers
from .context import CONTENT_BY_MEDIA, CONTENT_KINDS

# The fields an analysis may fill. Everything else on a card stays the user's own text.
ANALYSIS_FIELDS = ("description", "content", "usage")

# Sampling bounds. A value outside them is a typo or a slider dragged too far, and passing it on
# would only come back as a provider error that says nothing about which field was wrong.
SAMPLING_RANGES = {"temperature": (0.0, 2.0), "top_p": (0.0, 1.0), "top_k": (0, 100), "min_p": (0.0, 1.0),
                   "frequency_penalty": (-2.0, 2.0), "presence_penalty": (-2.0, 2.0)}
# top_k is the one whole number among them; a slider that sends 30.5 is a broken control.
SAMPLING_WHOLE = ("top_k",)


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
    # Version 2 adds the sampling fields the panel now offers. They live here rather than in the
    # registry because a saved workflow has to carry the user's own values; the registry only says
    # which of them a given provider will actually accept.
    temperature: float = 0.3
    top_p: float = 0.9
    top_k: int = 40
    min_p: float = 0.0
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0
    seed: int = 0
    fixed_seed: bool = False
    SCHEMA_VERSION = 2

    def to_dict(self):
        return {"schema_version": self.SCHEMA_VERSION, "provider": self.provider, "base_url": self.base_url,
                "model": self.model, "api_key_env": self.api_key_env, "vision": self.vision, "audio": self.audio,
                "timeout_seconds": self.timeout_seconds, "max_tokens": self.max_tokens, "keep_alive": self.keep_alive,
                "temperature": self.temperature, "top_p": self.top_p, "top_k": self.top_k, "min_p": self.min_p,
                "frequency_penalty": self.frequency_penalty, "presence_penalty": self.presence_penalty,
                "seed": self.seed, "fixed_seed": self.fixed_seed}

    # A version 1 workflow only ever had the nine fields below. Reading one must not fail and must
    # not silently invent a sampling choice: an old config keeps the provider's own defaults,
    # which is what it was already using before these fields existed.
    VERSION_1_FIELDS = ("provider", "base_url", "model", "api_key_env", "vision", "audio",
                        "timeout_seconds", "max_tokens", "keep_alive")

    @classmethod
    def from_dict(cls, data, path="provider"):
        fields.need_dict(data, path)
        version = data.get("schema_version")
        if version == 1:
            # Take only the fields version 1 knew. Anything else in an old payload is not ours to
            # guess at, and dropping it here means a future field cannot be back-filled into an
            # old workflow by accident.
            data = {name: data[name] for name in cls.VERSION_1_FIELDS if name in data}
            data["schema_version"] = 2
        fields.check_version(data, path, cls.SCHEMA_VERSION)
        for key in ("vision", "audio", "fixed_seed"):
            if not isinstance(data.get(key, getattr(cls(), key)), bool):
                raise ValueError("%s.%s must be true or false." % (path, key))
        if set(data) - set(cls().to_dict()):
            raise ValueError("Provider settings contain unknown fields; keys belong in an environment variable.")
        address = fields.read_str(data, "base_url", path, "").strip()
        if address:
            url = urlsplit(address)
            if url.scheme not in ("http", "https") or not url.hostname or url.username is not None or url.password is not None or url.query or url.fragment:
                raise ValueError("Use an HTTP(S) base URL without credentials, query or fragment; keys belong in api_key_env.")
        sampling = {name: _sampling_number(data, name, path) for name in
                    ("temperature", "top_p", "top_k", "min_p", "frequency_penalty", "presence_penalty")}
        return cls(provider=fields.read_choice(data, "provider", path, tuple(providers.PROVIDERS), "ollama"),
                   base_url=address, model=fields.read_str(data, "model", path, ""),
                   api_key_env=fields.read_str(data, "api_key_env", path, ""), vision=data.get("vision", True),
                   audio=data.get("audio", False), fixed_seed=data.get("fixed_seed", False),
                   timeout_seconds=_whole_number(data, "timeout_seconds", path, 120, 5, 900),
                   max_tokens=_whole_number(data, "max_tokens", path, 512, 64, 8192),
                   keep_alive=_whole_number(data, "keep_alive", path, 0, 0, 3600),
                   seed=_whole_number(data, "seed", path, 0, 0, 2 ** 32 - 1), **sampling)


def _whole_number(data, key, path, default, minimum, maximum):
    """A setting the UI offers as a slider; a wrong type must say so instead of being coerced."""
    value = fields.read_number(data, key, path, default)
    if isinstance(value, float) and not value.is_integer():
        raise ValueError("%s.%s must be a whole number, got %r." % (path, key, value))
    value = int(value)
    if not minimum <= value <= maximum:
        raise ValueError("%s.%s must be between %d and %d, got %d." % (path, key, minimum, maximum, value))
    return value


def _sampling_number(data, key, path):
    """One sampling value, checked against its range. The bounds come from SAMPLING_RANGES and the
    registry must agree with them, so a field cannot be offered with a range nobody enforces."""
    low, high = SAMPLING_RANGES[key]
    value = fields.read_number(data, key, path, providers.DEFAULT_SETTINGS[key], minimum=low)
    if key in SAMPLING_WHOLE and isinstance(value, float) and not value.is_integer():
        raise ValueError("%s.%s must be a whole number, got %r." % (path, key, value))
    if value > high:
        raise ValueError("%s.%s must be between %s and %s, got %s." % (path, key, low, high, value))
    return int(value) if key in SAMPLING_WHOLE else value


@dataclass(frozen=True)
class AnalysisSuggestion:
    """What one analysis offers. `why` explains the choice so the panel can show it instead of a bare result."""
    description: str = ""
    content: str = ""
    usage: str = ""
    why: str = ""
    SCHEMA_VERSION = 1

    def to_dict(self):
        return {"schema_version": self.SCHEMA_VERSION, "description": self.description, "content": self.content,
                "usage": self.usage, "why": self.why}

    @classmethod
    def from_dict(cls, data, path="analysis"):
        fields.need_dict(data, path)
        fields.check_version(data, path, cls.SCHEMA_VERSION)
        if set(data) - set(cls().to_dict()):
            raise ValueError("The analysis contains unknown fields; ask again or write the card yourself.")
        return cls(description=fields.read_str(data, "description", path, "").strip(),
                   content=fields.read_choice(data, "content", path, CONTENT_KINDS, ""),
                   usage=fields.read_str(data, "usage", path, "").strip(),
                   why=fields.read_str(data, "why", path, "").strip())

    def offered(self):
        """Only the fields that really carry a value, so Apply never blanks a field it has nothing for."""
        return {name: value for name, value in ((key, getattr(self, key)) for key in ANALYSIS_FIELDS) if value}


def analysis_prompt(media, content):
    scope = {"image": "the image", "video": "three ordered stills from the first 15 seconds of a video; avoid inferring unseen motion",
             "audio": "the first 15 seconds of the audio", "text": "the supplied context text"}
    # Offer only the roles this medium can actually hold. Offering the full union is what let a
    # model answer "dialogue" for a picture: the value passed the parse and the card was unusable.
    allowed = ", ".join(CONTENT_BY_MEDIA[media])
    return ("Describe %s as a reference for a video director. Focus on %s. Return only JSON with "
            "description (one concise sentence), content (one of: %s), usage (optional, how the director should use it) "
            "and why (one short sentence naming the visible reason for that choice). Do not invent facts or rewrite the user's usage."
            % (scope[media], content or "observable features", allowed))


def parse_suggestion(text, media="text"):
    """Reads a provider answer. Extra keys are tolerated here on purpose: this is a model's reply, not saved data.
    `usage` is kept as free text because only the card knows which roles its medium offers.

    `media` decides which content roles the answer may name. Without it a picture could be called
    "dialogue" or "voice", which passes every check here and produces a card that means nothing.
    A role the medium cannot hold is reported by name instead of being thrown away silently.
    """
    if not isinstance(text, str):
        raise ValueError("The provider must return a JSON text suggestion.")
    allowed = CONTENT_BY_MEDIA.get(media) or CONTENT_KINDS
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else text
    try:
        data = json.loads(text)
    except json.JSONDecodeError as error:
        # A reasoning model can spend its whole token budget thinking and return nothing usable.
        # Saying "invalid JSON" hides that, so the message names the likelier cause.
        raise ValueError("The provider's answer was not readable JSON (%s). It may have run out of "
                         "Max tokens before answering; try more tokens or another model." % error.msg) from error
    fields.need_dict(data, "analysis")
    description = fields.read_str(data, "description", "analysis").strip()
    content = data.get("content")
    if content is not None and content not in allowed:
        raise ValueError("A %s card cannot be %s. Choose one of: %s." % (media, content, ", ".join(allowed)))
    if not description or len(description) > 2000:
        raise ValueError("Analysis needs a description of 1 to 2000 characters; try again or describe it manually.")
    why = fields.read_str(data, "why", "analysis", "").strip()
    if len(why) > 600:
        raise ValueError("The reason is longer than 600 characters; ask again or write it yourself.")
    return AnalysisSuggestion(description=description, content=content,
                              usage=fields.read_str(data, "usage", "analysis", "").strip(), why=why)
