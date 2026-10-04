export function frameSeconds(count,fps=24) {
  return String(Number((count/fps).toFixed(3)));
}

export function chunkRange(chunk,fps=24) {
  const start=chunk.story_start_f??Math.round(chunk.start_s*fps);
  return {start,end:chunk.story_end_f??start+chunk.delivered_frames};
}

export function timelineAxis(requestedSeconds,data) {
  const fps=data?.fps||24,requested=requestedSeconds*fps;
  const delivered=data?.total_frames??requested;
  return {fps,requested,delivered,frames:Math.max(requested,delivered,1),seconds:Math.max(requested,delivered,1)/fps};
}

export function reorderShot(shots,id,direction,duration) {
  const ordered=[...shots].sort((a,b)=>a.start-b.start),index=ordered.findIndex(shot=>shot.id===id),target=index+direction;
  if(index<0||target<0||target>=ordered.length)return {shots,error:""};
  const low=Math.min(index,target),first=ordered[low],second=ordered[low+1],gap=second.start-first.end;
  if(gap<0||first.end<=first.start||second.end<=second.start||first.start<0||second.end>duration)
    return {shots,error:"Repair overlapping or invalid shot times before reordering; an overlap will not be changed silently."};
  const secondEnd=first.start+second.end-second.start;
  ordered.splice(low,2,{...second,start:first.start,end:secondEnd},{...first,start:secondEnd+gap,end:second.end});
  return {shots:ordered,error:""};
}
