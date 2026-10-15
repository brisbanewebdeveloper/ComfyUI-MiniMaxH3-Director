"""Use native H3 guide conditioning for timed images and video continuation."""
from ..core.compile import MediaRef
from . import media, video_end


def video_soundtracks(job):
    tracks = {}
    for number, ref in enumerate(job.compiled.of_kind("video"), 1):
        item = job.project.context.item(ref.ctx_id)
        if item and item.options.video_audio == "reference":
            sound = MediaRef("audio", ref.ctx_id, ref.source, length_f=ref.length_f, trim_start_f=ref.trim_start_f)
            tracks["ref_video_audio_%d" % number] = media.load_audio(sound)
    return tracks or None


def apply_guides(mm, job, positive, latent, vae):
    roles = ("keyframe", "first_frame", "last_frame") if job.compiled.mode == "ref2va" else ("keyframe",)
    guides = [(ref, media.load_picture(ref), ref.start_f) for ref in job.compiled.refs if ref.kind in roles]
    for ref in job.compiled.of_kind("continue_video"):
        item = job.project.context.item(ref.ctx_id)
        ends = [end for end in (item.options.end_s, item.length_s) if end > 0]
        guides.append((ref, video_end.last_frame(ref.source, item.options.start_s, min(ends) if ends else 0), ref.start_f))
    for _ref, image, frame in guides:
        output = mm.MiniMaxH3AddGuide.execute(positive=positive, latent=latent, frame_idx=frame, vae=vae, image=image)
        positive = getattr(output, "args", output)[0]
    return positive
