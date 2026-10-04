"""Package the tested native loop graph without taking sampling out of ComfyUI."""
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
            out[name] = graph.node("LoraLoaderModelOnly", "turbo_" + name, model=out[name], lora_name=lora, strength_model=1.0).out(0)
    return out


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
    noise = graph.node("NGChunkNoise", "noise", chunk=start.out(3), seed=settings["seed"])
    sampler = graph.node("KSamplerSelect", "sampler", sampler_name=settings["sampler_name"])
    scheduler = graph.node("BasicScheduler", "scheduler", model=conditioning.out(0), scheduler=settings["scheduler"],
                           steps=settings["steps"], denoise=1.0)
    guider = graph.node("BasicGuider", "guider", model=conditioning.out(0), conditioning=conditioning.out(1))
    sample = graph.node("SamplerCustomAdvanced", "sample", noise=noise.out(0), guider=guider.out(0),
                       sampler=sampler.out(0), sigmas=scheduler.out(0), latent_image=conditioning.out(2))
    end = graph.node("EndLoop", "end", output_value=sample.out(0), next_iteration_value=sample.out(0), accumulate=True)
    collect = graph.node("NGCollect", "collect", latents=end.out(0), chunks=inputs["chunks"],
                         vae=inputs["vae"], audio_vae=inputs["audio_vae"])
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
