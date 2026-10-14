# Control video on the Studio timeline

1. On **H3 Context Video**, choose **Use as: Control video**, then **Canny**, **Pose** or **Depth**.
2. Load a preprocessed control video, or load a normal video and press **Generate Canny/Pose/Depth**. Generation goes through
   ComfyUI's queue once. The saved result is copied from `output/h3-control` to `input/h3-control`; the card keeps its original
   video for comparison. Rendering reads the saved control file and does not rerun preprocessing.
3. Connect a native **ModelPatchLoader**, with `minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot`, to the Context
   Connector's optional `model_patch` input.
4. Drag the card onto the Director's **Control** lane. Move or trim clips with the mouse; select a clip to set its source
   offset in seconds. Multiple clips can follow each other, including clips of different kinds. Overlaps are rejected.
5. Set **Strength** in the Studio. Start with 1; 0.5 usually transfers less of the source figure's shape. Advanced **Start/End**
   are fractions of denoising, not video time. Strength 0 disables ControlNet.

Control works in both FL2VA and Ref2VA and uses no video-reference slot. The selected card range bounds the source; placing
a clip longer than that range holds its last frame and produces a warning. File offsets remain independent of story time.

## Render-part edges

Native H3 applies ControlNet to a whole render part. If a clip starts or ends inside a part, its first/last frame is held to
the part edges; a gap between clips holds the preceding clip's last frame. These holds can steer frames outside the clip's
drawn range. The Studio warns about partial coverage and lists the affected render parts. Shorter render parts reduce the
extension, within H3's trained minimum length and frame grid.

A part with no clip intersecting its delivered frames skips ControlNet, including its loader. A controlled part also gets
the correct control window for its pinned head. When a pinned head has no preceding control, the first available frame is
held back over it. No ComfyUI core modifications or custom diffusion implementation are needed.

Resume keys include the control file size/time, kind, selected source end, source offset, story window, strength and denoising
range. A change invalidates the first affected part and the parts after it. As with the existing resume feature, after changing
model or ControlNet checkpoint weights, clear `output/h3-director-resume` before resuming.

## Preprocessing requirements

- **Canny** uses ComfyUI's Canny with thresholds 0.4/0.8, in batches of 16.
- **Pose** needs `rt_detr_v4-x-hgnet_fp16.safetensors` under diffusion models and `sdpose_wholebody_fp16.safetensors` under
  checkpoints, plus ComfyUI's RT-DETR/SDPose nodes.
- **Depth** uses `moge_2_vitl_normal_fp16.safetensors` with ComfyUI's MoGe nodes. If **ComfyUI-DepthAnythingV3** is loaded,
  the card also offers that package's own DA3 nodes. Its loader can download its chosen model when absent.

If DA3 cannot load its model, the card keeps its current file and reports the package error; choose MoGe 2 or repair DA3.

Generated videos retain the source frame rate; the renderer resamples each requested window to H3's 24 fps. For sources over
4096 frames, split them into shorter clips before preprocessing. Several saved batches are reported as an error rather than
silently selecting only the first batch.

The existing **H3 Control Video (experimental)** node stays under **MiniMax H3/NG/Technical** for external samplers. Its mask
and inpainting inputs remain available there. Mask generation and inpainting on Context cards are a later phase.
