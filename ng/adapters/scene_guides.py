"""Use native H3 guide conditioning for timed images and video continuation."""
from ..core.compile import MediaRef
from . import media


def video_soundtracks(job):
    tracks = {}
    for number, ref in enumerate(job.compiled.of_kind("video"), 1):
        item = job.project.context.item(ref.ctx_id)
        if item and item.options.video_audio == "reference":
            sound = MediaRef("audio", ref.ctx_id, ref.source, length_f=ref.length_f, trim_start_f=ref.trim_start_f)
            tracks["ref_video_audio_%d" % number] = media.load_audio(sound)
    return tracks or None


def apply_guides(mm, job, positive, latent, vae):
    guides = [(ref, media.load_picture(ref), ref.start_f) for ref in job.compiled.of_kind("keyframe")]
    guides += [(ref, media.load_video(ref)[-1:].clone(), ref.start_f) for ref in job.compiled.of_kind("continue_video")]
    for _ref, image, frame in guides:
        output = mm.MiniMaxH3AddGuide.execute(positive=positive, latent=latent, frame_idx=frame, vae=vae, image=image)
        positive = getattr(output, "args", output)[0]
    return positive
