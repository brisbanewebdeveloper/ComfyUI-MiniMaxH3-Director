"""The four context nodes: a picture, a clip, a sound or a note, each saying what it MEANS for the video.

They only describe; the Director decides what is sent. Every node returns an NG_CONTEXT, a ContextItem the Director gathers.
"""
import os

import folder_paths
from comfy_api.latest import io

from ..adapters import probe
from ..core.context import PRESERVE, USAGE_BY_MEDIA, ContextItem
from ..core.project import slug

NGContext = io.Custom("NG_CONTEXT")
CATEGORY = "MiniMax H3 NG"
CONTENT_BY_MEDIA = {
    "image": ("character", "face", "animal", "object", "outfit", "prop", "environment", "location", "style", "pose", "composition"),
    "video": ("motion", "camera_motion", "action", "effect", "style"),
    "audio": ("voice", "dialogue", "music", "ambience", "sound_effect"),
    "text": ("style", "rules", "environment", "character"),
}


def _files(kinds):
    folder = folder_paths.get_input_directory()
    os.makedirs(folder, exist_ok=True)
    return sorted(folder_paths.filter_files_content_types(os.listdir(folder), kinds))


def _common_inputs(media):
    return [
        io.String.Input("name", default="", tooltip="What the Director and your shot text call this. Write @name in a shot to point at it."),
        io.String.Input("description", multiline=True, default="", tooltip="One sentence about what this is (identity, look). It is written into the prompt."),
        io.Combo.Input("content", options=list(CONTENT_BY_MEDIA[media]), tooltip="What is in it."),
        io.Combo.Input("usage", options=list(USAGE_BY_MEDIA[media]), tooltip="What the model should do with it."),
        io.Combo.Input("preserve", options=list(PRESERVE), default="high", tooltip="How closely the result should stay true to it."),
    ]


def _item(media, name, source, content, usage, preserve, description, speaker="", length_s=0.0):
    clean = source.replace(" [input]", "").strip()
    label = name.strip() or os.path.splitext(os.path.basename(clean))[0] or media
    return ContextItem(id="%s_%s" % (media, slug(label)), name=label, media=media, source=clean, content=(content,), usage=(usage,),
                       preserve=preserve, description=description.strip(), speaker=speaker.strip(), length_s=length_s)


class NGContextImage(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGContextImage", display_name="NG Context Image", category=CATEGORY,
                         description="A picture and what it means: a character, an outfit, a place, a first frame.",
                         inputs=[io.Combo.Input("image", options=_files(["image"]), upload=io.UploadType.image)] + _common_inputs("image"),
                         outputs=[NGContext.Output()])

    @classmethod
    def execute(cls, image, name, description, content, usage, preserve):
        return io.NodeOutput(_item("image", name, image, content, usage, preserve, description))


class NGContextVideo(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGContextVideo", display_name="NG Context Video", category=CATEGORY,
                         description="A clip used as a motion or camera reference (2-15 s).",
                         inputs=[io.Combo.Input("video", options=_files(["video"]), upload=io.UploadType.video)] + _common_inputs("video"),
                         outputs=[NGContext.Output()])

    @classmethod
    def execute(cls, video, name, description, content, usage, preserve):
        return io.NodeOutput(_item("video", name, video, content, usage, preserve, description,
                                   length_s=probe.duration_seconds(video.replace(" [input]", ""))))


class NGContextAudio(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGContextAudio", display_name="NG Context Audio", category=CATEGORY,
                         description="A sound: a character's voice, a song to keep exactly (lock) or copy, a music style.",
                         inputs=[io.Combo.Input("audio", options=_files(["audio", "video"]), upload=io.UploadType.audio)] + _common_inputs("audio") + [
                             io.String.Input("speaker", default="", tooltip="Voice only: the name of the character who speaks with this voice.")],
                         outputs=[NGContext.Output()])

    @classmethod
    def execute(cls, audio, name, description, content, usage, preserve, speaker):
        return io.NodeOutput(_item("audio", name, audio, content, usage, preserve, description, speaker=speaker,
                                   length_s=probe.duration_seconds(audio.replace(" [input]", ""))))


class NGContextText(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGContextText", display_name="NG Context Text", category=CATEGORY,
                         description="A note that applies to the whole video: style, camera rules, world.",
                         inputs=[io.String.Input("text", multiline=True, default="")] + _common_inputs("text"),
                         outputs=[NGContext.Output()])

    @classmethod
    def execute(cls, text, name, description, content, usage, preserve):
        return io.NodeOutput(ContextItem(id="text_%s" % slug(name or text[:24]), name=name.strip() or text[:24].strip() or "note", media="text",
                                         source=text, content=(content,), usage=(usage,), preserve=preserve, description=description.strip()))


NODES = [NGContextImage, NGContextVideo, NGContextAudio, NGContextText]
