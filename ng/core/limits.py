"""Every constant NG depends on, in one place.

Reference limits come from the legacy planner, which took them from the model card; the frame grid and pin windows come from
ComfyUI's H3 layout and experiments E2/E4 (_notes/NG/03-experiments.md).
"""
from ... import minimax_plan as _plan

FPS = 24
AUDIO_HZ = 40
GRID_STEP = 17          # a sampled clip has 17k + 5 frames
GRID_OFFSET = 5
SAMPLED_MIN_FRAMES = _plan.TRAINED_MIN_FRAMES
SAMPLED_MAX_FRAMES = _plan.TRAINED_MAX_FRAMES

# Pin windows (frames of the previous clip's tail): whole numbers of video latent steps, so they can be cut out of a latent.
PIN_VIDEO_WINDOWS = (5, 22, 39, 56)
PIN_VIDEO_DEFAULT = 22
CONTINUE_VIDEO_FRAMES = 39  # 17k+5 video frames and 65 whole audio steps at 24/40 Hz
PIN_AUDIO_DEFAULT = 24   # one second; multiples of 3 frames land on the 40 Hz audio grid
PIN_AUDIO_MAX = 240

MAX_REF_IMAGES = _plan.MAX_REF_IMAGES
MAX_REF_VIDEOS = _plan.MAX_REF_VIDEOS
MAX_REF_AUDIOS = _plan.MAX_REF_AUDIOS
MAX_REF_FILES = _plan.MAX_REF_FILES

DEFAULT_CHUNK_SECONDS = 10.0
# Fitting a first/last frame picture to the canvas; every method returns the full canvas, which the latent needs.
RESIZE_METHODS = ("crop", "stretch to fit", "pad", "pad green")
# A new action asked for right after a join starts late: the pinned head holds the old action for about this long (E7: 2.4 s).
LATE_CHANGE_FRAMES = 60
# Above this many joins the sound visibly loses its highs (E6: >4 kHz share fell to a ninth over five joins).
AUDIO_DULLING_JOINS = 4

# Written into overall_soundscape when the user leaves it alone: the guide lists the field as
# required (base-en.txt §4.6). The text lives in the planner, because that is the place that
# writes the field, and two copies of a prompt string would drift apart.
DEFAULT_SOUNDSCAPE = _plan.SOUNDSCAPE_PLACEHOLDER
