"""Measured sampling settings of known turbo LoRAs. With Turbo on, a render part whose model carries a known LoRA renders
with that LoRA's steps, sampler and scheduler; an unknown LoRA, or Turbo off, keeps the Director's own settings. A video
that mixes FL2VA and Ref2VA parts so gives each part the values of its own LoRA.

The table is js/ng/turbo_profiles.json, which the Studio reads as well."""
import json
import os

PATH = os.path.join(os.path.dirname(__file__), "..", "..", "js", "ng", "turbo_profiles.json")
FIELDS = ("steps", "sampler_name", "scheduler")

with open(PATH, encoding="utf-8") as file:
    PROFILES = {name.lower(): profile for name, profile in json.load(file).items()}


def profile(lora_name):
    """The known profile of a LoRA file (any folder, any case), or None."""
    base = os.path.splitext(os.path.basename(str(lora_name).replace("\\", "/")))[0].lower()
    return PROFILES.get(base)


def part_settings(mode, settings):
    """The settings one render part samples with; mode is the part's H3 model ("fl2va" or "ref2va")."""
    known = profile(settings.get("turbo_lora_" + mode, "none")) if settings.get("turbo") else None
    return {**settings, **{name: known[name] for name in FIELDS}} if known else settings
