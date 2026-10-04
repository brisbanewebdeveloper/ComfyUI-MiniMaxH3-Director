// Nodes saved at an older, smaller size (the compact Director, the former Context nodes) grow to their full card once on
// load. What lies right of or below a grown node moves along, so nothing overlaps; nodes in one column move only once,
// and a group around a grown node grows with it.
const pending = new Map(); // node -> its saved [width, height]

export function noteGrowth(node, before) { pending.set(node, before); }

// grown: [[node, [savedWidth, savedHeight]], ...] with each node already at its new size.
export function makeRoom(graph, grown) {
  const nodes = graph._nodes || graph.nodes || [], groups = graph._groups || graph.groups || [], all = [...nodes, ...groups];
  const encloses = (group, node, before) => group.pos[0] <= node.pos[0] && group.pos[1] <= node.pos[1]
    && group.pos[0] + group.size[0] >= node.pos[0] + before[0] && group.pos[1] + group.size[1] >= node.pos[1] + before[1];
  const columns = [];
  for (const entry of [...grown].sort((a, b) => a[0].pos[0] - b[0].pos[0])) {
    const column = columns.find((members) => Math.abs(members[0][0].pos[0] - entry[0].pos[0]) < 20);
    if (column) column.push(entry); else columns.push([entry]);
  }
  for (const members of columns) {
    const mine = new Set(members.map(([node]) => node)), x = members[0][0].pos[0];
    const dx = Math.max(0, ...members.map(([node, before]) => node.size[0] - before[0]));
    const right = x + Math.min(...members.map(([, before]) => before[0])) - 10, width = Math.max(...members.map(([node]) => node.size[0]));
    for (const item of all) if (!mine.has(item) && item.pos[0] >= right) item.pos[0] += dx;
    for (const group of groups) if (members.some(([node, before]) => encloses(group, node, before))) group.size[0] += dx;
    for (const [node, before] of members.sort((a, b) => a[0].pos[1] - b[0].pos[1])) {
      const dy = Math.max(0, node.size[1] - before[1]), below = node.pos[1] + before[1] - 10;
      for (const item of all)
        if (item !== node && item.pos[1] >= below && item.pos[0] < x + width && item.pos[0] + item.size[0] > x) item.pos[1] += dy;
      for (const group of groups) if (encloses(group, node, before)) group.size[1] += dy;
    }
  }
}

window.comfyAPI?.app?.app?.registerExtension?.({
  name: "mmxd.ng.layout_growth",
  afterConfigureGraph() {
    const graph = window.comfyAPI.app.app.graph;
    const grown = [...pending].filter(([node]) => node.graph === graph);
    pending.clear();
    if (grown.length) { makeRoom(graph, grown); graph.setDirtyCanvas?.(true, true); }
  },
});
