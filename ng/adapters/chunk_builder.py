"""Turn one planned chunk into model conditioning: load its media, call the Core's H3 nodes, hold locked sound, pin the previous tail."""
import dataclasses
from dataclasses import dataclass

import torch

from ... import minimax_media as legacy
from ...minimax_core import core
from ...minimax_director import lock_audio_latent
from ..core.chunks import ContinuityPlan
from ..core.limits import FPS
from . import conditioning, media


@dataclass(frozen=True)
class BuiltChunk:
    positive: object
    latent: dict
    trim_frames: int
    dropped_anchors: tuple


def _first_two(out):
    args = getattr(out, "args", out)
    return args[0], args[1]


def _canvas_frame(tensor, width, height):
    return legacy.resize_image(tensor, width, height, "crop", 32)


def _reference_conditioning(mm, job, clip, vae, audio_vae, ref_image_size):
    compiled, ctx = job.compiled, job.project.context
    pictures = [media.load_picture(r) for r in compiled.of_kind("picture")]
    videos = [media.load_video(r) for r in compiled.of_kind("video")]
    audios = [media.load_audio(r) for r in compiled.of_kind("audio")]
    if audios and audio_vae is None:
        raise ValueError("audio references need the audio VAE: connect minimax_h3_audio_vae to 'audio_vae', "
                         "or remove the voice and audio items")
    return mm.MiniMaxH3ReferenceToVideo.execute(
        clip=clip, vae=vae, audio_vae=audio_vae, prompt=compiled.prompt, width=ctx.width, height=ctx.height,
        length=job.chunk.sampled_frames, ref_image_size=ref_image_size, ref_images=media.numbered("ref_image", pictures),
        ref_videos=media.numbered("ref_video", videos), ref_video_audios=None, ref_audios=media.numbered("ref_audio", audios))


def _frame_conditioning(mm, job, clip, vae):
    compiled, ctx = job.compiled, job.project.context

    def frame(kind):
        refs = compiled.of_kind(kind)
        return _canvas_frame(media.load_picture(refs[0]), ctx.width, ctx.height) if refs else None

    return mm.MiniMaxH3ImageToVideo.execute(clip=clip, vae=vae, prompt=compiled.prompt, width=ctx.width, height=ctx.height,
                                            length=job.chunk.sampled_frames, first_frame=frame("first_frame"), last_frame=frame("last_frame"))


def _locked_waveform(locks, sampled_frames, sample_rate):
    """All locked clips laid onto one silent track as long as the clip, at their positions."""
    track = torch.zeros(1, 2, int(round(sampled_frames / float(FPS) * sample_rate)))
    for ref in locks:
        audio = media.load_audio(ref)
        wave = audio["waveform"]
        if audio["sample_rate"] != sample_rate:
            wave = torch.nn.functional.interpolate(wave, scale_factor=sample_rate / float(audio["sample_rate"]), mode="linear")
        start = int(round(ref.start_f / float(FPS) * sample_rate))
        piece = wave[..., :max(track.shape[-1] - start, 0)]
        track[..., start:start + piece.shape[-1]] = piece[:, :2] if piece.shape[1] >= 2 else piece.expand(-1, 2, -1)
    return {"waveform": track, "sample_rate": sample_rate}


def _hold_locked_audio(mm, latent, locks, sampled_frames, audio_vae):
    if audio_vae is None:
        raise ValueError("an audio item is set to lock, which needs the audio VAE: connect minimax_h3_audio_vae to 'audio_vae'")
    mix = _locked_waveform(locks, sampled_frames, legacy.AUDIO_SR)
    encoded, _ = mm._encode_ref_audio(audio_vae, mix)
    spans = [(r.start_f / float(FPS), (r.start_f + r.length_f) / float(FPS)) for r in locks]
    return lock_audio_latent(latent, encoded, spans, mm.AUDIO_LATENT_FPS)


def build_chunk(job, clip, vae, audio_vae=None, previous=None, ref_image_size="match", mm=None) -> BuiltChunk:
    mm = mm or core()
    compiled = job.compiled
    if compiled.mode == "ref2va":
        out = _reference_conditioning(mm, job, clip, vae, audio_vae, ref_image_size)
    else:
        out = _frame_conditioning(mm, job, clip, vae)
    positive, latent = _first_two(out)
    continuity: ContinuityPlan = job.project.plan.continuity
    locks = compiled.of_kind("lock")
    if locks:
        latent = _hold_locked_audio(mm, latent, locks, job.chunk.sampled_frames, audio_vae)
        if continuity.mode == "video_audio":
            continuity = dataclasses.replace(continuity, mode="video")       # the locked sound wins over a pinned sound tail
    if not job.chunk.head_frames:
        return BuiltChunk(positive, latent, 0, ())
    positive, trim, dropped = conditioning.pin_previous(positive, latent, previous, continuity)
    return BuiltChunk(positive, latent, trim, dropped)
