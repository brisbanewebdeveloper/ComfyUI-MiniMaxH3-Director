"""Turn one free-text note into the English H3 prompt block, in any language.

The Text card holds a scene the user described however they wanted to. This is what rewrites
it into the block the model actually reads, so "a girl plays with a red ball" and its English
equivalent reach the same result.

What this deliberately does NOT write is the section structure. `subject_definitions`,
`retention_analysis`, `integrated_multimodal_description` and the reference numbering are all
emitted by the Director's own compiler (see ng/core/compile.py), and a prompt that carried a
second set would nest structure inside structure and renumber the media cards' references
against the ones they already own. That is the same collision minimax_enhance.py refuses to
create, which is why its `clean_prompt` guards are reused here instead of a second parser being
written for the same problem.
"""
from ... import minimax_enhance as enhance
from ... import minimax_media as legacy
from ..core.analysis import ProviderConfig
from ..core.fields import need_dict, read_number, read_str
from .analysis import endpoint, wire

PRESETS = (enhance.PRESET_GLOBAL, enhance.PRESET_STORYBOARD)
# The card and the wire speak in short names ("global", "storyboard"); the enhance node names the
# same two blocks in full. The mapping lives here so a name can only ever be one of the two the
# system prompts actually exist for - a typo would otherwise fall through to the global prompt and
# quietly ask for the wrong block.
SHORT = {"global": enhance.PRESET_GLOBAL, "storyboard": enhance.PRESET_STORYBOARD}
# The model's own prompt-writing guide states the accepted range as 4-15 seconds. A note carries
# no duration of its own, so it is asked for rather than guessed: a storyboard timed for 60s
# produces cut times the model will not honour.
MIN_SECONDS, MAX_SECONDS = 4.0, 15.0
DEFAULT_SECONDS = 8.0


def preset_of(value):
    """The enhance node's own preset name for a short card name, and back."""
    if value in SHORT.values():
        return value
    return SHORT.get(value, enhance.PRESET_GLOBAL)


def note_prompt(note, seconds, preset):
    """The user half of the request: the note, and what the answer has to become."""
    if not note.strip():
        raise ValueError("Write the scene in the editor first; the AI rewrites that text.")
    if not MIN_SECONDS <= seconds <= MAX_SECONDS:
        raise ValueError("H3 takes %g to %g seconds, got %g." % (MIN_SECONDS, MAX_SECONDS, seconds))
    storyboard = preset_of(preset) == enhance.PRESET_STORYBOARD
    return ("The note below is a video the user described, in whatever language they wrote it in. "
            "Rewrite it as the %s of a %.1f second video. Keep every concrete detail the note names. "
            "Invent only what the H3 format needs and the note leaves open.\n\nNote:\n%s"
            % ("shot-by-shot storyboard, with [Shot N] markers and cut times" if storyboard
               else "opening scene-and-style block", seconds, note.strip()))


async def build(payload):
    """The HTTP-provider path: a note in, a prompt block out."""
    need_dict(payload, "request")
    config = ProviderConfig.from_dict(payload["provider"])
    note = read_str(payload, "note", "request", "")
    seconds = float(read_number(payload, "seconds", "request", DEFAULT_SECONDS, minimum=0.1))
    preset = read_str(payload, "preset", "request", enhance.PRESET_GLOBAL)
    # The card sends the short name ("global"); the enhance node's full name is accepted as well.
    # Checking only the full names refused every build the card asked for.
    if preset not in PRESETS and preset not in SHORT:
        raise ValueError("Choose %s or %s." % PRESETS)
    preset = preset_of(preset)
    prompt = note_prompt(note, seconds, preset)
    key = legacy.resolve_api_key({"api_key_env": config.api_key_env})
    # The system prompt is the enhance node's own, unmodified. The schema framing that the other
    # NG actions append would be wrong here: this answer is prose that goes into the prompt, and
    # asking for JSON would turn it back into something that needs parsing.
    system = enhance.system_for(preset, 0)
    try:
        # Address, model and auth come from the provider registry, as for Analyze; the local defaults know only three.
        entry, url, model = endpoint(config)
        answer = await legacy.vlm_generate([], prompt, config.provider, url, model, api_key=key, auth=entry.auth,
                                           system_prompt=system, **wire(config))
        return {"prompt": clean(answer, preset)}
    except (ValueError, legacy.VLMError) as error:
        raise ValueError(str(error).replace(key, "[redacted]") if key else str(error)) from None


def clean(answer, preset):
    """The one cleanup path, shared with the enhance node so both cannot drift apart."""
    preset = preset_of(preset)
    text = answer.removeprefix("assistant\n").strip()
    if not text:
        raise ValueError("The AI returned an empty prompt. Try again, or write the note in more detail.")
    cleaned = enhance.clean_prompt(text, preset, 0)
    # Qwen3-VL 4B answered a global block with nothing but its Audio and Music lines; saved as the prompt, the
    # figure and the action of the note were gone.
    if not any(line.strip() and not line.lower().startswith(("audio:", "sound:", "sfx:", "music:", "score:")) for line in cleaned.splitlines()):
        raise ValueError("The AI wrote only the sound lines and no description. Try again, or use a larger model "
                         "(Qwen3-VL 4B often does this; Ollama gemma e4b wrote complete blocks).")
    return cleaned