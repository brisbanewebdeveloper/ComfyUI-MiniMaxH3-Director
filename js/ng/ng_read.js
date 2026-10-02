// Reads what the Director and its context nodes currently say, straight from their widgets, for the live plan panel.

const CONTEXT_PREFIX = "NGContext";

function widgetValues(node) {
  const values = {};
  for (const widget of node.widgets || []) {
    if (widget.name) values[widget.name] = widget.value;
  }
  return values;
}

function mediaOf(node) {
  const type = node.comfyClass || node.type || "";
  return type.startsWith(CONTEXT_PREFIX) ? type.slice(CONTEXT_PREFIX.length).toLowerCase() : null;
}

export function isContextNode(node) {
  return mediaOf(node) !== null;
}

function upstreamNode(graph, input) {
  if (input.link == null) return null;
  const link = graph.links?.[input.link] ?? graph.getLink?.(input.link);
  return link ? graph.getNodeById(link.origin_id) : null;
}

// The context nodes wired into the Director's autogrow inputs, in socket order.
export function readContexts(director) {
  const found = [];
  for (const input of director.inputs || []) {
    if (!input.name.startsWith("contexts.")) continue;
    const source = upstreamNode(director.graph, input);
    const media = source && mediaOf(source);
    if (media) found.push({ media, widgets: widgetValues(source) });
  }
  return found;
}

export function readPayload(director) {
  return { director: widgetValues(director), contexts: readContexts(director) };
}
