"""Package the tested native loop graph without taking sampling out of ComfyUI."""
import json

from comfy_execution.graph_utils import GraphBuilder
from comfy_execution.validation import validate_loops


def turbo_models(graph, inputs, settings):
    """Turbo puts the chosen few-step LoRA on each connected H3 model, as the official MiniMax H3 templates do."""
    if not settings.get("turbo"):
        return inputs
    out = dict(inputs)
    for name in ("model_fl2va", "model_ref2va"):
        lora = settings.get("turbo_lora_" + name[len("model_"):], "none")
        if out.get(name) is not None and lora != "none":
            # NGTurboLora leaves out pieces that do not fit (a full-model LoRA on a pruned H3 model logged 51 errors per step)
            out[name] = graph.node("NGTurboLora", "turbo_" + name, model=out[name], lora_name=lora, strength=1.0).out(0)
    return out


# Everything in the render settings that changes the sampled latent.
RESUME_SETTINGS = ("seed", "steps", "sampler_name", "scheduler", "shift_video", "shift_audio", "turbo", "turbo_lora_fl2va",
                   "turbo_lora_ref2va", "ref_image_size", "resize_method", "control_strength", "control_start", "control_end")


def render_sequence(inputs, settings):
    graph = GraphBuilder()
    inputs = turbo_models(graph, inputs, settings)
    start = graph.node("StartLoop", "start", mode="List", **{"mode.list": inputs["chunks"]}, cache_iterations=False)
    conditioning = graph.node("NGChunkConditioning", "conditioning", chunk=start.out(3), previous=start.out(4),
                              clip=inputs["clip"], vae=inputs["vae"], audio_vae=inputs["audio_vae"],
                              shift_video=settings["shift_video"], shift_audio=settings["shift_audio"],
                              ref_image_size=settings.get("ref_image_size", "match"), resize_method=settings.get("resize_method", "crop"))
    for name in ("model_fl2va", "model_ref2va"):
        if inputs.get(name) is not None:
            conditioning.set_input(name, inputs[name])
    model = conditioning.out(0)
    if inputs.get("model_patch") is not None:
        model = graph.node("NGControlChunk", "control", model=model, chunk=start.out(3), vae=inputs["vae"],
                           model_patch=inputs["model_patch"], strength=settings.get("control_strength", 1.0),
                           start_percent=settings.get("control_start", 0.0), end_percent=settings.get("control_end", 1.0)).out(0)
    if inputs.get("preview_vae") is not None or inputs.get("preview"):
        # H3 Render Sequence previews each part with the Context Connector's preview VAE or the installed taeh3 decoder
        preview = graph.node("NGH3Preview", "preview", model=model, max_resolution=768, preview_fps=24.0,
                             jpeg_quality=90, every_n_steps=1, max_preview_overhead=25, suppress_default_preview=True)
        if inputs.get("preview_vae") is not None:
            preview.set_input("vae", inputs["preview_vae"])
        model = preview.out(0)
    noise = graph.node("NGChunkNoise", "noise", chunk=start.out(3), seed=settings["seed"])
    sampled_with = json.dumps({key: settings.get(key) for key in RESUME_SETTINGS}, sort_keys=True)
    # per part: a known turbo LoRA on the part's model brings its own steps, sampler and scheduler (core/turbo_profiles.py)
    sampling = graph.node("NGChunkSampling", "sampling", chunk=start.out(3), model=model, settings=sampled_with)
    guider = graph.node("BasicGuider", "guider", model=model, conditioning=conditioning.out(1))
    sample = graph.node("SamplerCustomAdvanced", "sample", noise=noise.out(0), guider=guider.out(0),
                       sampler=sampling.out(0), sigmas=sampling.out(1), latent_image=conditioning.out(2))
    part = sample.out(0)
    if settings.get("resume", True):
        # a finished part is kept on disk and reused after a crash (adapters/resume.py)
        part = graph.node("NGResumeChunk", "resume", chunk=start.out(3), sampled=part, settings=sampled_with).out(0)
    # pictures of this part that later shots take their place from (core/places.py); a pass-through for every other part
    part = graph.node("NGPlaceStill", "place", chunk=start.out(3), sampled=part, vae=inputs["vae"], models=settings.get("models", "")).out(0)
    end = graph.node("EndLoop", "end", output_value=part, next_iteration_value=part, accumulate=True)
    collect = graph.node("NGCollect", "collect", latents=end.out(0), chunks=inputs["chunks"],
                         vae=inputs["vae"], audio_vae=inputs["audio_vae"])
    if settings.get("resume", True) and settings.get("resume_delete_done", True):
        collect.set_input("resume_settings", sampled_with)
    video = graph.node("CreateVideo", "video", images=collect.out(0), audio=collect.out(1), fps=24.0)
    expanded = graph.finalize()
    # Expanded graphs do not pass through the top-level loop validator again.
    validate_loops(expanded, [video.id, collect.id], expanded.keys(), [start.id], [end.id])
    return expanded, (video.out(0), collect.out(0), collect.out(1), collect.out(2))


def director_sequence(planning, inputs, settings):
    graph = GraphBuilder()
    director = graph.node("NGDirector", "plan", **planning)
    expanded, outputs = render_sequence({**inputs, "chunks": director.out(0)}, settings)
    return {**graph.finalize(), **expanded}, (*outputs, director.out(2), director.out(1))
