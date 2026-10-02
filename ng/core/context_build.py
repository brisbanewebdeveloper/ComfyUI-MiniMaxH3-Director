"""Build a ContextItem from what a context node's widgets say. Shared by the nodes and by the preview endpoint, so both name things alike."""
import os

from .context import ContextItem
from .issues import SchemaError
from .project import slug


def _clean_source(source):
    return source.replace(" [input]", "").strip()


def item_from_widgets(media, widgets, length_s=0.0):
    """`widgets` holds the node's widget values by name: name, description, content, usage, preserve and, per medium,
    image/video/audio (a file name), text, speaker."""
    if media not in ("image", "video", "audio", "text"):
        raise SchemaError("context.media", "choose image, video, audio or text")
    if not isinstance(widgets, dict):
        raise SchemaError("context.widgets", "expected an object")
    name = str(widgets.get("name", "")).strip()
    if media == "text":
        source = str(widgets.get("text", ""))
        label = name or source[:24].strip() or "note"
    else:
        source = _clean_source(str(widgets.get(media, "")))
        label = name or os.path.splitext(os.path.basename(source))[0] or media
    return ContextItem(id=str(widgets.get("context_id") or "%s_%s" % (media, slug(label))), name=label, media=media, source=source,
                       content=(widgets.get("content", ""),) if widgets.get("content") else (),
                       usage=(widgets.get("usage", ""),) if widgets.get("usage") else (),
                       preserve=widgets.get("preserve", "high"), description=str(widgets.get("description", "")).strip(),
                       speaker=str(widgets.get("speaker", "")).strip(), length_s=float(length_s), color=str(widgets.get("color", "")))
