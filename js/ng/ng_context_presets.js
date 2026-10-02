import { element, values, applyValues, request } from "./ng_widgets.js";
import { section } from "./ng_editor_fields.js";

export function presetEditor(node,media,api,status) {
  const root=section("▣ Preset"), name=element("input"), choices=element("select"), tools=element("div","ng-tools");
  name.placeholder="Preset name";name.setAttribute("aria-label","Preset name");choices.setAttribute("aria-label","Context presets");
  name.value=node.properties.ng_preset_name||"";
  const save=element("button","","Save"), saveAs=element("button","","Save As"), load=element("button","","Load");
  tools.append(name,choices,save,saveAs,load);root.append(tools);
  async function refresh() {
    const data=await request(api,"/ng/presets?media="+media);choices.replaceChildren();
    data.names.forEach((label)=>{const option=element("option","",label);option.value=label;choices.append(option);});load.disabled=!data.names.length;
    if(data.names.includes(node.properties.ng_preset_name))choices.value=node.properties.ng_preset_name;
  }
  save.onclick=async()=>{try{
    const data=await request(api,"/ng/presets",{media,name:name.value,widgets:values(node)});node.properties.ng_preset_name=data.name;
    await refresh();status.textContent=`Saved ${data.name}. Saving this name again replaces the preset.`;
  }catch(error){status.textContent=error.message;}};
  saveAs.onclick=()=>{name.value="";name.focus();status.textContent="Enter a new preset name, then Save.";};
  load.onclick=async()=>{try{const data=await request(api,"/ng/preset?"+new URLSearchParams({media,name:choices.value}));
    applyValues(node,data.widgets);node.properties.ng_preset_name=choices.value;name.value=choices.value;status.textContent=`Loaded ${choices.value}.`;
  }catch(error){status.textContent=error.message;}};
  refresh().catch((error)=>status.textContent=error.message);
  return {root,sync(){name.value=node.properties.ng_preset_name||"";refresh().catch((error)=>status.textContent=error.message);}};
}
