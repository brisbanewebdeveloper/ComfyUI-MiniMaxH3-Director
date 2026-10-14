// Small queued preprocessing graphs using the installed ComfyUI nodes. Keep their original frame rate.
import { comboOptions } from "./h3b_queue.js";

export async function controlSetup(api, kind, engine = "moge2") {
  if (kind === "canny") return {};
  if (kind === "mask") {
    const models = await comboOptions(api, "CheckpointLoaderSimple", "ckpt_name");
    const checkpoint = models.find((n) => /sam3\.1_multiplex_fp16\.safetensors$/i.test(n)) || models.find((n) => /sam3.*\.safetensors$/i.test(n));
    if (!checkpoint) throw new Error("Mask generation needs a SAM3 checkpoint, e.g. sam3.1_multiplex_fp16.safetensors (checkpoints), and ComfyUI's SAM3 Detect nodes.");
    return { checkpoint };
  }
  if (kind === "pose") {
    const [models, checkpoints] = await Promise.all([comboOptions(api, "UNETLoader", "unet_name"), comboOptions(api, "CheckpointLoaderSimple", "ckpt_name")]);
    const detector = models.find((n) => /rt_detr_v4-x-hgnet_fp16\.safetensors$/i.test(n));
    const pose = checkpoints.find((n) => /sdpose_wholebody_fp16\.safetensors$/i.test(n));
    if (!detector || !pose) throw new Error("Pose needs rt_detr_v4-x-hgnet_fp16.safetensors (diffusion_models) and sdpose_wholebody_fp16.safetensors (checkpoints).");
    return { detector, pose };
  }
  if (kind === "depth" && engine === "da3") {
    const models = await comboOptions(api, "DownloadAndLoadDepthAnythingV3Model", "model");
    const depth = models.find((n) => n === "da3_base.safetensors") || models.find((n) => /^da3.*\.safetensors$/.test(n));
    if (!depth) throw new Error("Depth Anything 3 needs the ComfyUI-DepthAnythingV3 nodes and a DA3 model.");
    return { depth, engine };
  }
  if (kind !== "depth") throw new Error("Choose Canny, Pose or Depth.");
  const models = await comboOptions(api, "LoadMoGeModel", "model_name");
  const depth = models.find((n) => /moge_2_vitl_normal_fp16\.safetensors$/i.test(n));
  if (!depth) throw new Error("Depth needs moge_2_vitl_normal_fp16.safetensors for ComfyUI's LoadMoGeModel, or choose installed Depth Anything 3.");
  return { depth, engine: "moge2" };
}

export function controlGraph(kind, source, setup, prefix) {
  if (kind === "mask") return maskGraph(source, setup, prefix);
  const node = (class_type, inputs) => ({ class_type, inputs });
  const graph = { load: node("LoadVideo", { file: source }), components: node("GetVideoComponents", { video: ["load", 0] }),
    batch: node("RebatchImages", { images: ["components", 0], batch_size: kind === "canny" ? 16 : 4 }) };
  let images;
  if (kind === "canny") {
    graph.edges = node("Canny", { image: ["batch", 0], low_threshold: 0.4, high_threshold: 0.8 });
    images = ["edges", 0];
  } else if (kind === "pose") {
    graph.detector = node("UNETLoader", { unet_name: setup.detector, weight_dtype: "default" });
    graph.boxes = node("RTDETR_detect", { model: ["detector", 0], image: ["batch", 0], threshold: 0.5, class_name: "person", max_detections: 2 });
    graph.pose = node("CheckpointLoaderSimple", { ckpt_name: setup.pose });
    graph.points = node("SDPoseKeypointExtractor", { model: ["pose", 0], vae: ["pose", 2], image: ["batch", 0], batch_size: 4, bboxes: ["boxes", 0] });
    graph.draw = node("SDPoseDrawKeypoints", { keypoints: ["points", 0], draw_body: true, draw_hands: true, draw_face: true, draw_feet: true,
      stick_width: 4, face_point_size: 2, score_threshold: 0.5, draw_head: true });
    images = ["draw", 0];
  } else if (kind === "depth" && setup.engine === "da3") {
    graph.depth = node("DownloadAndLoadDepthAnythingV3Model", { model: setup.depth, precision: "fp16", attention: "auto" });
    graph.infer = node("DepthAnything_V3", { da3_model: ["depth", 0], images: ["batch", 0], normalization_mode: "V2-Style" });
    images = ["infer", 0];
  } else if (kind === "depth") {
    graph.depth = node("LoadMoGeModel", { model_name: setup.depth });
    graph.infer = node("MoGeInference", { moge_model: ["depth", 0], image: ["batch", 0], resolution_level: 9, fov_x_degrees: 0,
      batch_size: 4, force_projection: true, apply_mask: true, refine_steps: 3 });
    graph.draw = node("MoGeRender", { moge_geometry: ["infer", 0], output: "depth" });
    images = ["draw", 0];
  } else throw new Error("Choose Canny, Pose or Depth.");
  graph.join = node("RebatchImages", { images, batch_size: 4096 });
  graph.video = node("CreateVideo", { images: ["join", 0], fps: ["components", 2] });
  graph.save = node("SaveVideo", { video: ["video", 0], filename_prefix: `h3-control/${prefix}_${kind}`, format: "mp4", "format.codec": "h264" });
  return graph;
}

function maskGraph(source, setup, prefix) {
  const node = (class_type, inputs) => ({ class_type, inputs });
  if (!setup.prompt?.trim()) throw new Error("Describe what to mask, e.g. person or red ball.");
  return {
    load: node("LoadVideo", { file: source }), components: node("GetVideoComponents", { video: ["load", 0] }),
    batch: node("RebatchImages", { images: ["components", 0], batch_size: 1 }),
    sam: node("CheckpointLoaderSimple", { ckpt_name: setup.checkpoint }),
    text: node("CLIPTextEncode", { clip: ["sam", 1], text: setup.prompt }),
    detect: node("SAM3_Detect", { model: ["sam", 0], image: ["batch", 0], conditioning: ["text", 0], threshold: 0.5,
      refine_iterations: 2, individual_masks: false }),
    image: node("MaskToImage", { mask: ["detect", 0] }),
    join: node("RebatchImages", { images: ["image", 0], batch_size: 4096 }),
    video: node("CreateVideo", { images: ["join", 0], fps: ["components", 2] }),
    save: node("SaveVideo", { video: ["video", 0], filename_prefix: `h3-control/${prefix}_mask`, format: "mp4", "format.codec": "h264" }),
  };
}
