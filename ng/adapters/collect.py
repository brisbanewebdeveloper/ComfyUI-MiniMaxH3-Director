"""Join the sampled chunks into one video: decode each, cut the pinned head off picture and sound together, concatenate.

The decoders are passed in, so the arithmetic is testable without a VAE. The sound is always taken from the delivered part of each chunk,
never from the pinned reconstruction at its start (E2/E6), and it is cut to exactly the picture length at every join so that Bild
and Ton cannot drift apart over many chunks (E6: 634 frames / 26.417 s, audio 26.417 s).

`write_video` does the same one chunk at a time straight into a file. A whole song does not fit in memory as one picture
tensor: 177 s at 768x1152 are 4248 frames, 45 GB in float32 and twice that while torch.cat joins them.
"""
from fractions import Fraction

import av
import torch

from ..core.issues import Issue
from ..core.limits import AUDIO_HZ, FPS
from . import latents


def _pad_to(wave, samples):
    short = samples - wave.shape[-1]
    if short <= 0:
        return wave, 0
    return torch.nn.functional.pad(wave, (0, short)), short


def delivered_chunks(chunk_latents, plan, decode_video, decode_audio, issues):
    """Each chunk's delivered (frames [n,H,W,3], waveform [1,C,S], sample rate), decoded only when it is asked for."""
    if len(chunk_latents) != len(plan.chunks):
        raise ValueError("the plan has %d chunks but %d were generated" % (len(plan.chunks), len(chunk_latents)))
    for latent, chunk in zip(chunk_latents, plan.chunks):
        video, audio = latents.validate_chunk(latent, chunk.sampled_frames, "Chunk %d" % (chunk.index + 1))
        # Keep owned outputs across subsequent VAE calls, including decoders that reuse their buffers.
        frames = decode_video(video).clone()
        decoded = decode_audio(audio)
        wave, rate = decoded["waveform"].clone(), int(decoded["sample_rate"])
        if frames.shape[0] != chunk.sampled_frames:
            raise ValueError("chunk %d decoded to %d frames but the plan sampled %d" % (chunk.index + 1, frames.shape[0], chunk.sampled_frames))
        frames, wave = latents.trim_head(frames, wave, rate, chunk.head_frames, FPS)
        # Use absolute story boundaries so fractional samples do not accumulate at the joins.
        samples = round(chunk.story_end_f / float(FPS) * rate) - round(chunk.story_start_f / float(FPS) * rate)
        wave, padded = _pad_to(wave[..., :samples], samples)
        # up to one audio step (25 ms) short is the grid's normal rounding (E11: 266 samples at 32 kHz = 8 ms), not worth a warning
        if padded > rate / float(AUDIO_HZ):
            issues.append(Issue("audio_short", "the sound of chunk %d was %d samples short and was padded with silence." % (chunk.index + 1, padded)))
        yield frames, wave, rate


def collect_chunks(chunk_latents, plan, decode_video, decode_audio):
    """chunk_latents: list of AV latents in chunk order. plan: SequencePlan. Returns (frames [N,H,W,3], audio dict, issues)."""
    pictures, waves, issues, rate = [], [], [], None
    for frames, wave, rate in delivered_chunks(chunk_latents, plan, decode_video, decode_audio, issues):
        pictures.append(frames)
        waves.append(wave)
    return torch.cat(pictures, 0), {"waveform": torch.cat(waves, -1), "sample_rate": rate}, tuple(issues)


def write_video(path, chunk_latents, plan, decode_video, decode_audio, crf=17):
    """The same join written chunk by chunk into an MP4 (H.264, AAC): only one chunk is ever decoded at a time."""
    issues, video_stream, audio_stream, sample = [], None, None, 0
    with av.open(path, mode="w", format="mp4") as output:
        for frames, wave, rate in delivered_chunks(chunk_latents, plan, decode_video, decode_audio, issues):
            layout = "stereo" if wave.shape[1] == 2 else "mono"
            if video_stream is None:
                video_stream = output.add_stream("libx264", rate=Fraction(FPS, 1))
                video_stream.width, video_stream.height = frames.shape[2], frames.shape[1]
                video_stream.pix_fmt = "yuv420p"
                video_stream.options = {"crf": str(crf)}
                audio_stream = output.add_stream("aac", rate=rate, layout=layout)
            for image in frames:
                frame = av.VideoFrame.from_ndarray((image * 255).clamp(0, 255).byte().cpu().numpy(), format="rgb24")
                output.mux(video_stream.encode(frame.reformat(format="yuv420p")))
            sound = av.AudioFrame.from_ndarray(wave[0].float().cpu().contiguous().numpy(), format="fltp", layout=layout)
            sound.sample_rate, sound.pts = rate, sample
            sample += wave.shape[-1]
            output.mux(audio_stream.encode(sound))
        if video_stream is None:
            raise ValueError("There is no chunk to collect.")
        output.mux(video_stream.encode(None))
        output.mux(audio_stream.encode(None))
    return tuple(issues)
