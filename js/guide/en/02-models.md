# 2 · Models and files

Every workflow carries the download links of its models. When a file is missing, ComfyUI lists it when the workflow opens
and offers the download. Your files may have other names or lie in a subfolder; then choose them in the loader.

![The model loaders](../images/wf2-models.jpg)

## The H3 models (every workflow)

All from [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3), except the preview VAE.

| Node | File | Folder |
|---|---|---|
| Model: First / last frame | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | `models/diffusion_models` |
| Model: References | `minimax_h3_ref2va_pruned_int8_convrot.safetensors` | `models/diffusion_models` |
| Text encoder (type `minimax`) | `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | `models/text_encoders` |
| Video VAE | `minimax_h3_video_vae_fp16.safetensors` | `models/vae` |
| Audio VAE | `minimax_h3_audio_vae_fp32.safetensors` | `models/vae` |
| Preview VAE | `taeh3.safetensors` ([Kijai/MiniMax-H3-TAE](https://huggingface.co/Kijai/MiniMax-H3-TAE)) | `models/vae_approx` |

Only the model a render part needs is loaded. A text-only project never loads the References model; a project with
character pictures never loads the First / last frame model.

## Turbo LoRAs

| For | File | Folder | Steps |
|---|---|---|---|
| First / last frame | `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | `models/loras` | 8 |
| References | `minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors` | `models/loras` | 6 |

They are chosen in **Settings → Turbo**. A known LoRA brings its own steps, sampler and scheduler (with 4 steps the
References LoRA leaves a white veil; 6 are clean). Other LoRAs work too; then the Director's own steps are used.

## Extra models (only for some features)

The gear of a card, the Storyboard or the Settings shows which of these were found.

| Feature | File | Folder |
|---|---|---|
| Control video (Workflow 7, 8) | `minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors` | `models/model_patches` |
| Pose control video | `rt_detr_v4-x-hgnet_fp16.safetensors` | `models/diffusion_models` |
|  | `sdpose_wholebody_fp16.safetensors` | `models/checkpoints` |
| Depth control video | `moge_2_vitl_normal_fp16.safetensors` | `models/geometry_estimation` |
| Masks, place pictures (SAM3) | `sam3.1_multiplex_fp16.safetensors` | `models/checkpoints` |
| Drawing panels and places (Qwen Image 2.1) | `qwen_image_2.1_int8_convrot.safetensors` | `models/diffusion_models` |
|  | `qwen3vl_8b_int8_convrot.safetensors` | `models/text_encoders` |
|  | `qwen_image_2.1_vae_bf16.safetensors` | `models/vae` |
| Cutting out figures | `birefnet.safetensors` | `models/background_removal` |
| Timing lyrics (Whisper) | `small.pt` (needs the `openai-whisper` package) | `models/whisper` |

## Little VRAM?

- **Render part: 5 s** in the Settings: smaller parts need less memory.
- The int8 video VAE `minimax_h3_video_vae_int8_convrot.safetensors` instead of the fp16 one.
- A smaller **Resolution** (*Fast*: short side 480).
