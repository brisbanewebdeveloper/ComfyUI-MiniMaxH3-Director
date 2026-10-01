"""Cut tails out of H3 AV latents. Pure tensor work: no model, no VAE, no files."""
from ..core import pin


def split_av(latent):
    """(video [B,24,T,H,W], audio [B,32,2,A]) of an H3 AV latent dict."""
    samples = latent["samples"]
    if not getattr(samples, "is_nested", False):
        raise ValueError("expected an H3 AV latent (video and audio together), got a plain latent")
    video, audio = samples.unbind()
    return video, audio


def video_blocks(video, video_pin):
    """One single-step block per pinned latent step, cut straight out of the previous clip's latent (no decode, no re-encode)."""
    first = video_pin.start_step
    return [video[:1, :, first + k:first + k + 1].clone() for k in range(video_pin.steps)]


def audio_tail(audio, steps):
    return audio[:1, ..., audio.shape[-1] - steps:].clone()


def check_same_canvas(video, previous_video):
    """A latent cannot be resized, so a changed resolution in the middle of a chain must stop with both sizes named."""
    here, there = tuple(video.shape[3:]), tuple(previous_video.shape[3:])
    if here != there or video.shape[1] != previous_video.shape[1]:
        raise ValueError("the previous chunk was %dx%d but this one is %dx%d; a latent cannot be resized, so keep one resolution "
                         "for the whole project" % (there[1] * 16, there[0] * 16, here[1] * 16, here[0] * 16))


def video_steps(latent):
    return int(split_av(latent)[0].shape[2])


def trim_head(frames, wave, sample_rate, head_frames, fps):
    """Drop the pinned head from decoded picture and sound together, then cut the sound to the picture length."""
    frames = frames[head_frames:]
    wave = wave[..., int(round(head_frames / float(fps) * sample_rate)):]
    return frames, wave[..., :int(round(frames.shape[0] / float(fps) * sample_rate))]
