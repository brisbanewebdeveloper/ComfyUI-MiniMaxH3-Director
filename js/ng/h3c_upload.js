// The card owns its file picker: some frontend versions expose the native video upload as a selector, not a button callback.
import { h } from "./h3s_dom.js";

export function videoUpload(S, actions) {
  const input = h("input", { type: "file", accept: "video/*", "aria-label": "Upload video", hidden: true,
    onchange: (event) => { const file = event.target.files?.[0]; if (file) actions.uploadVideo(file); } });
  return h("span", { class: "h3c-row" }, input,
    h("button", { class: "h3c-btn", disabled: Boolean(S.busy), onclick: () => input.click() }, "Upload"));
}

export async function uploadVideo(api, file) {
  const data = new FormData();
  data.append("image", file); data.append("type", "input"); data.append("subfolder", "h3-video");
  const response = await api.fetchApi("/upload/image", { method: "POST", body: data });
  if (!response.ok) throw new Error("Video upload failed. Choose a video file and try again.");
  const saved = await response.json();
  return [saved.subfolder, saved.name].filter(Boolean).join("/");
}
