// Stable IDs retain the relationship when a visible context name is changed.
const escape=(value)=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");

export function renameReferences(text,previous,entries) {
  const current=new Map(entries.map((entry)=>[entry.widgets.context_id,entry.widgets.name]));
  const replacements=new Map(Object.entries(previous||{}).filter(([id,name])=>name&&current.get(id)&&name!==current.get(id))
    .map(([id,name])=>[name.toLocaleLowerCase(),current.get(id)]));
  if(!replacements.size)return text;
  const names=[...replacements.keys()].sort((a,b)=>b.length-a.length);
  const pattern=new RegExp(`@(${names.map(escape).join("|")})(?![\\p{L}\\p{N}_])`,"giu");
  return text.replace(pattern,(_,name)=>"@"+replacements.get(name.toLocaleLowerCase()));
}

export function referenceParts(text,entries) {
  const names=new Map();
  for(const entry of entries) for(const name of [entry.widgets.name,entry.widgets.context_id]) if(name)names.set(name.toLocaleLowerCase(),entry);
  const known=[...names.keys()].sort((a,b)=>b.length-a.length).map(escape);
  const pattern=new RegExp(`@(${[...known,"[\\p{L}\\p{N}_-]+"].join("|")})(?![\\p{L}\\p{N}_])`,"giu");
  const result=[];let cursor=0;
  for(const match of text.matchAll(pattern)) {
    result.push({text:text.slice(cursor,match.index)});
    result.push({text:match[0],entry:names.get(match[1].toLocaleLowerCase()),unknown:!names.has(match[1].toLocaleLowerCase())});
    cursor=match.index+match[0].length;
  }
  result.push({text:text.slice(cursor)});return result;
}

export function renderReferences(root,text,entries,element) {
  root.replaceChildren();
  for(const part of referenceParts(text,entries)) {
    const span=element("span",part.unknown?"ng-reference-unknown":part.entry?"ng-text-token":"",part.text);
    if(part.entry){span.title=`${part.entry.widgets.name} · ${part.entry.widgets.context_id}`;
      const color=part.entry.widgets.color;if(/^#[0-9a-f]{6}$/i.test(color))span.style.color=color;}
    if(part.unknown)span.title="Connect a context with this name or ID.";
    root.append(span);
  }
}
