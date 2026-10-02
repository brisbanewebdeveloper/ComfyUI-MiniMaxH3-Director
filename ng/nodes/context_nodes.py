"""The four context nodes: a picture, a clip, a sound or a note, each saying what it MEANS for the video.

They only describe; the Director decides what is sent. Every node returns an NG_CONTEXT, a ContextItem the Director gathers.
"""
import os

import folder_paths
from comfy_api.latest import io

from ..adapters import probe
from ..core.context import PRESERVE, USAGE_BY_MEDIA
from ..core.context_build import item_from_widgets
from ..core.analysis import ProviderConfig

NGContext = io.Custom("NG_CONTEXT")
CATEGORY = "MiniMax H3/NG"
NGAI = io.Custom("NG_AI_PROVIDER")
CONTENT_BY_MEDIA = {
    "image": ("character", "face", "animal", "object", "outfit", "prop", "environment", "location", "style", "pose", "composition"),
    "video": ("motion", "camera_motion", "environment", "shot_rhythm", "identity", "action", "effect", "style"),
    "audio": ("voice", "dialogue", "music", "ambience", "sound_effect"),
    "text": ("style", "rules", "environment", "character", "outfit", "camera_motion", "lighting", "action", "dialogue"),
}


def _files(kinds):
    folder = folder_paths.get_input_directory()
    os.makedirs(folder, exist_ok=True)
    files, _ = folder_paths.recursive_search(folder, excluded_dir_names=[".git"])
    return sorted(folder_paths.filter_files_content_types(files, kinds))


def _common_inputs(media):
    return [
        io.String.Input("name", default="", tooltip="What the Director and your shot text call this. Write @name in a shot to point at it."),
        io.String.Input("description", multiline=True, default="", tooltip="One sentence about what this is (identity, look). It is written into the prompt."),
        io.Combo.Input("content", options=list(CONTENT_BY_MEDIA[media]), tooltip="What is in it."),
        io.Combo.Input("usage", options=list(USAGE_BY_MEDIA[media]), tooltip="What the model should do with it."),
        io.Combo.Input("preserve", options=list(PRESERVE), default="high", tooltip="How closely the result should stay true to it."),
    ]


def _identity_inputs():
    return [io.String.Input("context_id", default="", optional=True, advanced=True,
                            tooltip="Persistent identity, assigned when a new card is created."),
            io.String.Input("color", default="", optional=True, advanced=True, tooltip="Optional context colour, #rrggbb."),
            io.String.Input("content_roles", default="", optional=True, advanced=True),
            io.String.Input("usage_roles", default="", optional=True, advanced=True),
            io.String.Input("context_options", default="", optional=True, advanced=True),
            NGAI.Input("ai_provider", display_name="AI provider", optional=True)]


def _widget_extras(extras):
    config = extras.pop("ai_provider", None)
    if config is not None and not isinstance(config, ProviderConfig):
        raise ValueError("Connect H3 AI Loader to AI provider.")
    return extras


class NGContextImage(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGContextImage", display_name="H3 Context Image", category=CATEGORY,
                         description="A picture and what it means: a character, an outfit, a place, a first frame.",
                         inputs=[io.Combo.Input("image", options=_files(["image"]), upload=io.UploadType.image)] + _common_inputs("image") + _identity_inputs(),
                         outputs=[NGContext.Output(display_name="context")])

    @classmethod
    def fingerprint_inputs(cls, image, **_):
        return probe.file_stamp(image)

    @classmethod
    def execute(cls, image, name, description, content, usage, preserve, context_id="", color="", **extras):
        return io.NodeOutput(item_from_widgets("image", dict(image=image, name=name, description=description, content=content,
                                                            usage=usage, preserve=preserve, context_id=context_id, color=color, **_widget_extras(extras))))


class NGContextVideo(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGContextVideo", display_name="H3 Context Video", category=CATEGORY,
                         description="A clip used as a motion or camera reference (2-15 s).",
                         inputs=[io.Combo.Input("video", options=_files(["video"]), upload=io.UploadType.video)] + _common_inputs("video") + _identity_inputs(),
                         outputs=[NGContext.Output(display_name="context")])

    @classmethod
    def fingerprint_inputs(cls, video, **_):
        return probe.file_stamp(video)

    @classmethod
    def execute(cls, video, name, description, content, usage, preserve, context_id="", color="", **extras):
        widgets = dict(video=video, name=name, description=description, content=content, usage=usage, preserve=preserve,
                       context_id=context_id, color=color, **_widget_extras(extras))
        return io.NodeOutput(item_from_widgets("video", widgets, probe.duration_seconds(video.replace(" [input]", ""))))


class NGContextAudio(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGContextAudio", display_name="H3 Context Audio", category=CATEGORY,
                         description="A sound: a character's voice, a song to keep exactly (lock) or copy, a music style.",
                         inputs=[io.Combo.Input("audio", options=_files(["audio", "video"]), upload=io.UploadType.audio)] + _common_inputs("audio") + [
                             io.String.Input("speaker", default="", tooltip="Voice only: the name of the character who speaks with this voice.")] + _identity_inputs(),
                         outputs=[NGContext.Output(display_name="context")])

    @classmethod
    def fingerprint_inputs(cls, audio, **_):
        return probe.file_stamp(audio)

    @classmethod
    def execute(cls, audio, name, description, content, usage, preserve, speaker, context_id="", color="", **extras):
        widgets = dict(audio=audio, name=name, description=description, content=content, usage=usage, preserve=preserve, speaker=speaker,
                       context_id=context_id, color=color, **_widget_extras(extras))
        return io.NodeOutput(item_from_widgets("audio", widgets, probe.duration_seconds(audio.replace(" [input]", ""))))


class NGContextText(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="NGContextText", display_name="H3 Context Text", category=CATEGORY,
                         description="A note that applies to the whole video: style, camera rules, world.",
                         inputs=[io.String.Input("text", multiline=True, default="")] + _common_inputs("text") + _identity_inputs(),
                         outputs=[NGContext.Output(display_name="context")])

    @classmethod
    def execute(cls, text, name, description, content, usage, preserve, context_id="", color="", **extras):
        return io.NodeOutput(item_from_widgets("text", dict(text=text, name=name, description=description, content=content,
                                                           usage=usage, preserve=preserve, context_id=context_id, color=color, **_widget_extras(extras))))


NODES = [NGContextImage, NGContextVideo, NGContextAudio, NGContextText]
