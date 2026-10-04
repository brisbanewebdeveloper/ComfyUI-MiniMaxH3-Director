# Native AI in H3 Director NG

Use a generative text/vision encoder for assistance. The H3 conditioning CLIP remains a separate connection at the Context Connector.

Open `example_workflows/H3 Director NG - native AI.json` for a minimal Load CLIP → AI Loader → Text Context example. Choose your installed model, then use **Analyze** on the Context. This example needs no H3 diffusion model.

1. Add **Load CLIP** and choose an installed generative encoder. The development test uses `qwen3vl_4b_bf16.safetensors` with type `stable_diffusion`; choose the loader type appropriate to your model.
2. Connect CLIP to **H3 AI Loader**, then select **CLIP / Encoder**.
3. Connect the AI provider to a Context for **Analyze**, or to the Context Connector for the Studio's **AI: split into shots** and **AI: suggest / improve text**. Contexts can inherit one unambiguous downstream Connector provider.
4. Run the explicit action, review the answer, then Apply. **Cancel AI** stops this action. A successful native source badge names the tested action and medium.

Alternatively select **Local → disk**, an installed text encoder and its native loader type. This creates the CLIPLoader only inside the AI job. **Local → server**, **API** and **Custom** retain compatible HTTP transports. No credentials or model weights enter the saved workflow.

Connecting or restoring nodes loads no assistant model. Rendering creates no assistant request. Native AI actions queue only the AI Loader's upstream graph and native Generate Text; ComfyUI handles model memory and interruption. Native timeout, token limit and declared image/audio capabilities are effective settings. Server-only keep-alive and environment-key fields are hidden for native sources.

Images are bounded to 1024×1024 for native analysis. Video analysis uses three ordered stills from at most the first 15 seconds; it cannot observe full motion. Audio analysis uses at most 15 seconds and requires an encoder accepting ComfyUI AUDIO. Selecting a capability cannot add support to an incompatible model.

**Choose a generative model.** The H3 conditioning encoder (`qwen3vl_32b_minimax_h3_nvfp4_awq`) is not one: in E46 it needed about 589 s on 16 GB and answered with commas instead of JSON, so the Studio reports a timeout or an invalid answer. The tested working choice is a Qwen3VL 4B file (`qwen3vl_4b_bf16` / `qwen3vl_4b_fp8_scaled`). A slow model needs a higher **Timeout** on the AI Loader (default 120 s); the Studio shows the elapsed time against it while waiting.

Replies must satisfy the JSON schema. A shot split requires at least one shot, ordered continuous coverage of the entire duration and only connected @Context names. Invalid answers cannot be applied. Editing the context, project or AI source invalidates pending Apply.

Analysis on a Context card proposes a description, a supported content choice, an optional usage and a short reason. A suggested role the medium does not offer is reported instead of being mapped to something else.

In the Studio, **AI: split into shots** shows the proposal as dashed shots; **Accept** replaces the shots and sets the proposed ambience and music, **Discard** changes nothing. Audio lanes are never touched. **AI: suggest / improve text** shows a text for the selected shot with Accept/Discard. Dialogue you typed yourself is kept. While the AI works, a status at the bottom of the Studio shows the elapsed time and **Cancel**; a failure stays there until dismissed.

*Historical (before the Studio, 2026-10-04):* the Director had Manual/Assist/Auto modes, per-field checkboxes on Apply and **Analyze all contexts**. These controls are not in the Studio; the `/ng/analyze_all` route still exists.

The native path is verified with one installed model (Qwen3VL 4B). Nothing here is a guarantee about other encoders or output quality.

## Several voices for one figure

A figure can own more than one voice card. H3 has one voice slot per subject, so the first card fills that slot and every further card is still sent as an additional reference. Each further card is named in the plan's warnings, so a second take is never silently demoted to "some audio".

The **Speaker / Voice** menu only offers figures – image cards holding a file with the content role character, face or animal. It stores the context ID, not the name, because that is what the compiler resolves. A speaker that is no longer connected stays visible in the menu instead of disappearing from the workflow. When more than one voice card names the same figure, the card says which one fills the slot.

## First Frame and Last Frame

An image card set to **First Frame** opens the clip, one set to **Last Frame** closes it. A first frame only reaches the first chunk and a last frame only the last one, so a long project never sends the guide twice.

H3 takes exactly one image per frame role. If you set two Last Frames, only the first one is sent and the plan names the ones it ignored – the same for two First Frames. An image can be both a Reference and a Last Frame at once; the two roles stay independent.

Frame guides are matched by role, not by file name: two cards pointing at the same picture still each keep their own role. A frame guide also switches the run to the frame model (FL2VA); without it the planner would fall back to a text-only run and ignore the frame.

**Verified by rendering.** With the installed int8 FL2VA model, a 4-second run with a Last Frame ended 2.19 (mean pixel difference, 0 = identical) from the target picture, starting at 37.30; the same run without any context ended at 93.44. The model follows the frame. First Frame, interruption and the continuity-mode comparison have not been measured.
