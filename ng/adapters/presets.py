"""Small atomic JSON files, scoped to the requesting ComfyUI user."""
import hashlib
import json
import os
import tempfile

from ..core.presets import ContextPreset


def _path(root, name):
    filename = "context_" + hashlib.sha256(name.encode("utf8")).hexdigest() + ".json"
    base = os.path.realpath(root)
    path = os.path.realpath(os.path.join(base, filename))
    if os.path.commonpath((base, path)) != base:
        raise ValueError("The preset file must stay inside the preset folder.")
    return path


def save(root, data):
    preset = ContextPreset.from_dict(data)
    os.makedirs(root, exist_ok=True)
    target = _path(root, preset.name)
    handle, temporary = tempfile.mkstemp(prefix=".context_", suffix=".tmp", dir=root)
    try:
        with os.fdopen(handle, "w", encoding="utf8") as stream:
            json.dump(preset.to_dict(), stream, ensure_ascii=False, indent=2)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.remove(temporary)
    return preset


def load(root, name):
    with open(_path(root, name), encoding="utf8") as stream:
        return ContextPreset.from_dict(json.load(stream))


def listing(root, media):
    if not os.path.isdir(root):
        return []
    records = []
    for filename in sorted(os.listdir(root)):
        if not filename.startswith("context_") or not filename.endswith(".json"):
            continue
        path = os.path.realpath(os.path.join(root, filename))
        if os.path.commonpath((os.path.realpath(root), path)) != os.path.realpath(root):
            raise ValueError("The preset file must stay inside the preset folder.")
        with open(path, encoding="utf8") as stream:
            preset = ContextPreset.from_dict(json.load(stream))
        if preset.item.media == media:
            records.append(preset.name)
    return sorted(records)
