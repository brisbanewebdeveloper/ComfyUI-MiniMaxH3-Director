// Native sampling and loop events remain owned by ComfyUI; only their display belongs here.
export function belongsToNode(value, nodeId) {
  return value != null && (String(value) === String(nodeId) || String(value).startsWith(String(nodeId) + "."));
}

export function attachProgress(node, api, status, preview, roots=()=>[node.id]) {
  let running = false, iteration = "", url = null;
  const listeners = [];
  const on = (name, fn) => { api.addEventListener(name, fn); listeners.push([name, fn]); };
  const owns = (...ids) => ids.some((id) => roots().some((root)=>belongsToNode(id,root)));
  on("executing", (event) => {
    // The frontend API converts the backend payload into the displayed node ID (or null on completion).
    if (owns(event.detail)) { running = true; status.textContent = iteration || "Rendering…"; }
    else if (event.detail === null && running) { running = false; status.textContent = "Render finished · see Save Video"; }
  });
  on("progress_text", (event) => {
    if (!owns(event.detail?.nodeId)) return;
    iteration = event.detail.text; status.textContent = iteration; running = true;
  });
  on("progress", (event) => {
    if (!owns(event.detail?.node)) return;
    running = true;
    const percent = Math.round(event.detail.value / event.detail.max * 100);
    status.textContent = `${iteration || "Rendering"} · ${percent}%`;
  });
  on("b_preview_with_metadata", (event) => {
    const data = event.detail;
    if (!owns(data?.nodeId, data?.displayNodeId, data?.parentNodeId, data?.realNodeId)) return;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(data.blob); preview.src = url; preview.hidden = false;
  });
  for (const name of ["execution_error", "execution_interrupted"]) {
    on(name, (event) => {
      if (!running && !owns(event.detail?.node_id)) return;
      running = false; iteration = "";
      status.textContent = name === "execution_interrupted" ? "Render interrupted" : "Render failed · check ComfyUI error";
    });
  }
  return {
    planning(text) { if (!running) status.textContent = text; },
    dispose() { listeners.forEach(([name, fn]) => api.removeEventListener(name, fn)); if (url) URL.revokeObjectURL(url); },
  };
}
