// Reads what the Director and its context nodes currently say, straight from their widgets, for the live plan panel.

const CONTEXT_PREFIX = "NGContext";

export function restoredProviderValues(saved) {
  if(!Array.isArray(saved)||saved.length!==6||!["ollama","lmstudio","custom"].includes(saved[0]))return null;
  const names=["provider","base_url","model","api_key_env","vision","audio"];
  return {source:saved[0]==="custom"?"api":"local",timeout_seconds:120,max_tokens:512,keep_alive:0,
    ...Object.fromEntries(names.map((name,index)=>[name,saved[index]]))};
}

function widgetValues(node) {
  const values = {};
  for (const widget of node.widgets || []) {
    if (widget.name) values[widget.name] = widget.value;
  }
  return values;
}

function mediaOf(node) {
  const type = node.comfyClass || node.type || "";
  return ["NGContextImage", "NGContextVideo", "NGContextAudio", "NGContextText"].includes(type)
    ? type.slice(CONTEXT_PREFIX.length).toLowerCase() : null;
}

export function isContextNode(node) {
  return mediaOf(node) !== null;
}

export function upstreamNode(graph, input) {
  if (!input || input.link == null) return null;
  const link = graph.links?.[input.link] ?? graph.getLink?.(input.link);
  return link ? graph.getNodeById(link.origin_id) : null;
}

// The context nodes wired into the Director's autogrow inputs, in socket order.
export function readContexts(director) {
  if (director.comfyClass === "NGH3Director") {
    const connector = upstreamNode(director.graph, director.inputs?.find((input) => input.name === "context"));
    return connector?.comfyClass === "NGContextConnector" ? readContexts(connector) : [];
  }
  const found = [];
  for (const input of director.inputs || []) {
    if (!input.name.startsWith("contexts.") && !/^context_(image|video|audio|text)\./.test(input.name)) continue;
    const source = upstreamNode(director.graph, input);
    const media = source && mediaOf(source);
    if (media) found.push({ media, widgets: widgetValues(source) });
  }
  return found;
}

export function connectedProvider(node) {
  const direct = upstreamNode(node.graph, node.inputs?.find((input) => input.name === "ai_provider"));
  if (direct?.comfyClass === "NGAIProvider") {
    const config=widgetValues(direct);
    if(config.source==="local"&&config.local_backend==="disk") {
      if(!config.local_model)return null;
      return {source:"clip",loader_node_id:String(direct.id),model:config.local_model,local_type:config.local_type,
        vision:config.vision,audio:config.audio,max_tokens:config.max_tokens,timeout_seconds:config.timeout_seconds};
    }
    if(config.source==="clip") {
      const encoder=upstreamNode(direct.graph,direct.inputs?.find((input)=>input.name==="clip"));
      if(!encoder)return null;
      return {source:"clip",loader_node_id:String(direct.id),model:widgetValues(encoder).clip_name||"Connected CLIP",
        vision:config.vision,audio:config.audio,max_tokens:config.max_tokens,timeout_seconds:config.timeout_seconds};
    }
    const provider={schema_version:1};
    for(const key of ["provider","base_url","model","api_key_env","vision","audio","timeout_seconds","max_tokens","keep_alive"])
      if(config[key]!==undefined)provider[key]=config[key];
    return provider;
  }
  if (node.comfyClass === "NGH3Director") {
    const connector = upstreamNode(node.graph, node.inputs?.find((input) => input.name === "context"));
    return connector ? connectedProvider(connector) : null;
  }
  return null;
}

export function contextProvider(node) {
  const direct=connectedProvider(node);if(direct)return direct;
  const providers=[];
  for(const id of node.outputs?.[0]?.links||[]) {
    const link=node.graph?.links?.[id], target=link&&node.graph.getNodeById(link.target_id);
    if(target?.comfyClass==="NGContextConnector") {
      const provider=connectedProvider(target);if(provider)providers.push(provider);
    }
  }
  const unique=[...new Map(providers.map((provider)=>[JSON.stringify(provider),provider])).values()];
  return unique.length===1?unique[0]:null;
}

export function relatedContexts(node) {
  const found=new Map();
  for(const id of node.outputs?.[0]?.links||[]) {
    const link=node.graph?.links?.[id],target=link&&node.graph.getNodeById(link.target_id);
    if(target?.comfyClass!=="NGContextConnector")continue;
    for(const entry of readContexts(target))found.set(entry.widgets.context_id||entry.widgets.name,entry);
  }
  return [...found.values()];
}

export function readPayload(director) {
  return { director: widgetValues(director), contexts: readContexts(director) };
}
