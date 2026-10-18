"""Write the Place pictures (core/places.py) inside the render loop: right after a part is sampled, the frames that later
shots take their place from are decoded and saved to ComfyUI's input folder, where the later part loads them like any
picture card.

Only a window of the part is decoded: the video VAE decodes 17-frame clips of 5 steps and blends each clip with the one
before, so the window starts one clip early (as collect.delivered_pictures does for the whole video)."""
import os

import numpy as np
from PIL import Image

import folder_paths

from ..core import pin
from ..core.places import in_chunk
from .collect import VAE_CLIP_FRAMES, VAE_CLIP_STEPS
from .latents import split_av


def path_of(place):
    return os.path.join(folder_paths.get_input_directory(), *place.source.split("/"))


def window(local_frame, total_steps):
    """(first step, stop step, index of the frame in the decoded window) for one frame of a part's sampled timeline."""
    clip = local_frame // VAE_CLIP_FRAMES
    start = max(clip - 1, 0) * VAE_CLIP_STEPS
    stop = min((clip + 1) * VAE_CLIP_STEPS + 2, total_steps)
    return start, stop, local_frame - start // VAE_CLIP_STEPS * VAE_CLIP_FRAMES


def write(job, latent, decode_video):
    """Save every Place picture this part shows. Returns the written paths."""
    wanted = in_chunk(job.project.places, job.chunk)
    if not wanted:
        return []
    video, _ = split_av(latent)
    written = []
    for place, local in wanted:
        start, stop, index = window(local, video.shape[2])
        frames = decode_video(video[:, :, start:stop])
        if not 0 <= index < frames.shape[0] or frames.shape[0] != pin.pixel_frames(stop - start):
            raise ValueError("the place picture of %s: frame %d is not in the %d decoded frames" % (place.source_id, index, frames.shape[0]))
        target = path_of(place)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        picture = (frames[index].float().clamp(0, 1) * 255).round().byte().cpu().numpy()
        Image.fromarray(np.ascontiguousarray(picture)).save(target)
        written.append(target)
    return written
