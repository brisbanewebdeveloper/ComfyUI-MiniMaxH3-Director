# Native AI in H3 Director NG

Use a generative text/vision encoder for assistance. The H3 conditioning CLIP remains a separate connection at the Context Connector.

Open `example_workflows/H3 Director NG - native AI.json` for a minimal Load CLIP → AI Loader → Text Context example. Choose your installed model, then use **Analyze** on the Context. This example needs no H3 diffusion model.

1. Add **Load CLIP** and choose an installed generative encoder. The development test uses `qwen3vl_4b_bf16.safetensors` with type `stable_diffusion`; choose the loader type appropriate to your model.
2. Connect CLIP to **H3 AI Loader**, then select **CLIP / Encoder**.
3. Connect the AI provider to a Context for **Analyze**, or to the Context Connector for **Auto Direct**. Contexts can inherit one unambiguous downstream Connector provider.
4. Run the explicit action, review the answer, then Apply. **Cancel AI** stops this action. A successful native source badge names the tested action and medium.

Alternatively select **Local → disk**, an installed text encoder and its native loader type. This creates the CLIPLoader only inside the AI job. **Local → server**, **API** and **Custom** retain compatible HTTP transports. No credentials or model weights enter the saved workflow.

Connecting or restoring nodes loads no assistant model. Rendering creates no assistant request. Native AI actions queue only the AI Loader's upstream graph and native Generate Text; ComfyUI handles model memory and interruption. Native timeout, token limit and declared image/audio capabilities are effective settings. Server-only keep-alive and environment-key fields are hidden for native sources.

Images are bounded to 1024×1024 for native analysis. Video analysis uses three ordered stills from at most the first 15 seconds; it cannot observe full motion. Audio analysis uses at most 15 seconds and requires an encoder accepting ComfyUI AUDIO. Selecting a capability cannot add support to an incompatible model.

Replies must satisfy the JSON schema. Auto Direct requires at least one shot, ordered continuous coverage of the entire duration and only connected @Context names. Invalid answers cannot be applied. Editing the context, project or AI source invalidates pending Apply.

Analysis proposes a description, a supported content choice, an optional usage and a short reason for the choice. **Manual / Assist / Auto** sit above the Create area: Manual sends nothing, Assist fills a card only after you press Apply, and Auto lets the assistant plan a whole scene – Apply is still required. The mode is saved with the workflow.

Every suggestion shows one checkbox per offered field. Apply writes only the ticked ones, so a role you chose yourself stays. A suggested role the medium does not offer is reported instead of being mapped to something else.

**Analyze all contexts** asks for every usable card in one go and reports how many were analyzed, which failed and why the rest were skipped. It deliberately does not write any card: each suggestion is reviewed and applied on its own card.

Auto Direct replaces the suggested shots, soundscape and music. Dialogue you typed yourself is kept and named in the panel, so a proposal cannot silently delete a line a character says. Editing the context, project or AI source invalidates a pending Apply.

The native path is verified with one installed model (Qwen3VL 4B). Nothing here is a guarantee about other encoders or output quality.
