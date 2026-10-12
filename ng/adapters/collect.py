"""Join the sampled chunks into one video: the picture is decoded across the joins in latent space (the pinned head dropped), the sound
of each chunk is decoded with its head cut off, then both are concatenated.

The decoders are passed in, so the arithmetic is testable without a VAE. The sound is always taken from the delivered part of each chunk,
never from the pinned reconstruction at its start (E2/E6), and it is cut to exactly the picture length at every join so that Bild
and Ton cannot drift apart over many chunks (E6: 634 frames / 26.417 s, audio 26.417 s).

`write_video` does the same one chunk at a time straight into a file. A whole song does not fit in memory as one picture
tensor: 177 s at 768x1152 are 4248 frames, 45 GB in float32 and twice that while torch.cat joins them.
"""
from fractions import Fraction

import av
import torch

from ..core import pin
from ..core.issues import Issue
from ..core.limits import AUDIO_HZ, FPS
from . import latents

VAE_CLIP_STEPS, VAE_CLIP_FRAMES = 5, 17


def _pad_to(wave, samples):
    short = samples - wave.shape[-1]
    if short <= 0:
        return wave, 0
    return torch.nn.functional.pad(wave, (0, short)), short


def _joined_runs(videos, plan):
    """Chunks joined in latent space, as [(pieces, chunks)]. A pinned head is the regenerated copy of the previous chunk's tail and
    covers whole steps from a cycle start, so the steps after it continue the previous chunk's 1-4-4-4-4 rhythm unbroken.
    A chunk without a head is an independent clip and starts a new run."""
    runs = []
    for video, chunk in zip(videos, plan.chunks):
        if chunk.head_frames and runs:
            runs[-1][0].append(video[:, :, pin.steps_for_frames(chunk.head_frames):])
            runs[-1][1].append(chunk)
        else:
            runs.append(([video], [chunk]))
    return runs


def _steps(pieces, start, stop):
    out, at = [], 0
    for piece in pieces:
        if at < stop and start < at + piece.shape[2]:
            out.append(piece[:, :, max(start - at, 0):stop - at])
        at += piece.shape[2]
    return torch.cat(out, 2)


def delivered_pictures(videos, plan, decode_video):
    """Each chunk's delivered frames, decoded from its run's joined latent one window at a time.

    The video VAE decodes 17-frame clips of 5 steps and blends the first 5 frames of each clip with the previous clip's lookahead.
    Decoding every chunk alone ended it on an unblended lookahead and restarted the decoder on the regenerated head: a one-frame
    brightness and contrast jump at every join (measured on a real minute: up to +0.011 luma, +0.005 contrast). A window that starts
    one clip early and runs through the clip that covers the chunk's last frame gives the frames a decode of the whole run would."""
    final = plan.chunks[-1].index
    for pieces, run in _joined_runs(videos, plan):
        total, origin = sum(p.shape[2] for p in pieces), run[0].story_start_f
        for chunk in run:
            first = (chunk.story_start_f - origin) // VAE_CLIP_FRAMES
            last = (chunk.story_end_f - origin - 1) // VAE_CLIP_FRAMES
            start = max(first - 1, 0) * VAE_CLIP_STEPS
            stop = min((last + 1) * VAE_CLIP_STEPS + 2, total)
            frames = decode_video(_steps(pieces, start, stop))
            if frames.shape[0] != pin.pixel_frames(stop - start):
                raise ValueError("chunk %d: %d latent steps decoded to %d frames, expected %d"
                                 % (chunk.index + 1, stop - start, frames.shape[0], pin.pixel_frames(stop - start)))
            offset = chunk.story_start_f - origin - start // VAE_CLIP_STEPS * VAE_CLIP_FRAMES
            # Keep owned outputs across subsequent VAE calls, including decoders that reuse their buffers. After the last
            # chunk no call follows: a copy there only doubled the peak (one 12 s part: 3.1 GB more, out of memory).
            delivered = frames[offset:offset + chunk.delivered_frames]
            yield delivered if chunk.index == final else delivered.clone()


def delivered_chunks(chunk_latents, plan, decode_video, decode_audio, issues, *, restore_audio=None):
    """Each chunk's delivered (frames [n,H,W,3], waveform [1,C,S], sample rate), decoded only when it is asked for."""
    if len(chunk_latents) != len(plan.chunks):
        raise ValueError("the plan has %d chunks but %d were generated" % (len(plan.chunks), len(chunk_latents)))
    streams = [latents.validate_chunk(latent, chunk.sampled_frames, "Chunk %d" % (chunk.index + 1))
               for latent, chunk in zip(chunk_latents, plan.chunks)]
    pictures = delivered_pictures([video for video, _ in streams], plan, decode_video)
    for (_, audio), chunk, frames in zip(streams, plan.chunks, pictures):
        decoded = decode_audio(audio)
        wave, rate = decoded["waveform"].clone(), int(decoded["sample_rate"])
        wave = wave[..., int(round(chunk.head_frames / float(FPS) * rate)):]
        wave = wave[..., :int(round(chunk.delivered_frames / float(FPS) * rate))]
        # Use absolute story boundaries so fractional samples do not accumulate at the joins.
        samples = round(chunk.story_end_f / float(FPS) * rate) - round(chunk.story_start_f / float(FPS) * rate)
        wave, padded = _pad_to(wave[..., :samples], samples)
        if restore_audio is not None:
            wave = restore_audio(chunk.index, wave, rate)
        # up to one audio step (25 ms) short is the grid's normal rounding (E11: 266 samples at 32 kHz = 8 ms), not worth a warning
        if padded > rate / float(AUDIO_HZ):
            issues.append(Issue("audio_short", "the decoded sound of chunk %d was %d samples short." % (chunk.index + 1, padded)))
        yield frames, wave, rate


def collect_chunks(chunk_latents, plan, decode_video, decode_audio, *, restore_audio=None):
    """chunk_latents: list of AV latents in chunk order. plan: SequencePlan. Returns (frames [N,H,W,3], audio dict, issues)."""
    pictures, waves, issues, rate = [], [], [], None
    for frames, wave, rate in delivered_chunks(chunk_latents, plan, decode_video, decode_audio, issues, restore_audio=restore_audio):
        pictures.append(frames)
        waves.append(wave)
    return torch.cat(pictures, 0), {"waveform": torch.cat(waves, -1), "sample_rate": rate}, tuple(issues)


def write_video(path, chunk_latents, plan, decode_video, decode_audio, crf=17, *, restore_audio=None):
    """The same join written chunk by chunk into an MP4 (H.264, AAC): only one chunk is ever decoded at a time."""
    issues, video_stream, audio_stream, sample = [], None, None, 0
    with av.open(path, mode="w", format="mp4") as output:
        for frames, wave, rate in delivered_chunks(chunk_latents, plan, decode_video, decode_audio, issues, restore_audio=restore_audio):
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
