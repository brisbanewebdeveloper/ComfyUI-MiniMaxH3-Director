import { h } from "./h3s_dom.js";
import { timeView, zoomView, fitRange } from "./h3s_time.js";

export function timelineNavigation(S, actions) {
  const view = timeView(S.timeline);
  const change = (next) => actions.setTimeline(next);
  return h("div", { class: "h3s-row h3s-time-tools", role: "toolbar", "aria-label": "Timeline navigation" },
    h("strong", {}, "Timeline"),
    h("span", { class: "h3s-lbl" }, "Shots · Audio · Control"),
    h("span", { class: "h3s-grow" }),
    h("button", { class: "h3s-btn small", "aria-label": "Zoom out timeline", disabled: view.zoom <= 1,
      onclick: () => change(zoomView(view, view.zoom / 2)) }, "−"),
    h("output", { class: "h3s-time-zoom", "aria-label": "Timeline zoom" }, `${Math.round(view.zoom * 100)}%`),
    h("button", { class: "h3s-btn small", "aria-label": "Zoom in timeline", disabled: view.zoom >= 32,
      onclick: () => change(zoomView(view, view.zoom * 2)) }, "+"),
    h("button", { class: "h3s-btn small", onclick: () => change(timeView()), title: "Show the whole project" }, "Fit project"),
    h("button", { class: "h3s-btn small", disabled: !S.selectedRange,
      onclick: () => change(fitRange(S.selectedRange, Math.max(S.duration, S.plan?.total_s || 0))),
      title: "Zoom to the selected shot, audio clip or control clip" }, "Fit selection"));
}

// Rebuilding the Studio for a plan response or selection must not return a zoomed timeline to its start.
export function restoreTimeline(root, S) {
  const viewport = root.querySelector(".h3s-time-scroll");
  if (viewport) viewport.scrollLeft = timeView(S.timeline).scroll * Math.max(0, viewport.scrollWidth - viewport.clientWidth);
}

export function rememberTimeline(S, view) {
  S.timeline = timeView(view);
  if (S.node?.properties) S.node.properties.ng_timeline = { ...S.timeline };
}
