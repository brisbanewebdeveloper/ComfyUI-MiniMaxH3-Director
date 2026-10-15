"""Hold the known video prefix using H3's native per-token noise mask."""
import torch
from comfy.nested_tensor import NestedTensor

from .latents import split_av


def hold_prefix(latent, positive):
    video, audio = split_av(latent)
    source = next(row["latent"] for row in reversed(positive[0][1].get("minimax_keyframes", ()))
                  if row.get("resolved_frame_index") == 0 and row.get("latent") is not None)
    video = video.clone()
    video[:, :, :source.shape[2]] = source.to(video)
    video_mask = torch.ones_like(video[:, :1])
    video_mask[:, :, :source.shape[2]] = 0
    audio_mask = latent["noise_mask"].unbind()[1] if "noise_mask" in latent else torch.ones_like(audio)
    return {**latent, "samples": NestedTensor((video, audio)), "noise_mask": NestedTensor((video_mask, audio_mask))}
