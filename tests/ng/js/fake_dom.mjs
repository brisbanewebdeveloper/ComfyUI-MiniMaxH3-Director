// Just enough DOM for the Studio views to build and for a test to find, read and click their parts.
class FakeNode {}
class FakeText extends FakeNode {
  constructor(text) { super(); this.text = String(text); }
  get innerText() { return this.text; }
  all() { return []; }
}
class FakeElement extends FakeNode {
  constructor(tag) {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.dataset = {}; this.attributes = {};
    this.className = ""; this.value = ""; this.disabled = false; this.hidden = false; this.title = "";
    const self = this;
    this.classList = { add: (c) => { if (!self.classList.contains(c)) self.className = `${self.className} ${c}`.trim(); },
      remove: (c) => { self.className = self.className.split(" ").filter((x) => x && x !== c).join(" "); },
      contains: (c) => self.className.split(" ").includes(c) };
  }
  append(...nodes) { for (const node of nodes) this.children.push(typeof node === "string" ? new FakeText(node) : node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  get textContent() { return this.innerText; }
  set textContent(value) { this.children = [new FakeText(value)]; }
  get innerText() { return this.children.map((child) => child.innerText).join(" ").replace(/\s+/g, " ").trim(); }
  all() { return [this, ...this.children.flatMap((child) => child.all())]; }
  find(predicate) { return this.all().filter((node) => node !== this && predicate(node)); }
  byClass(name) { return this.find((node) => node.classList.contains(name)); }
  byTag(tag) { return this.find((node) => node.tagName === tag.toUpperCase()); }
  button(text) { return this.find((node) => node.tagName === "BUTTON" && node.innerText.startsWith(text))[0]; }
  getBoundingClientRect() { return { left: 0, x: 0, width: 1000, top: 0, y: 0, height: 40 }; }
  setPointerCapture() {}
  closest() { return null; }
}

export function installDom() {
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (_ns, tag) => new FakeElement(tag),
    createTextNode: (text) => new FakeText(text),
    getElementById: () => null, head: new FakeElement("head"), body: new FakeElement("body"),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  };
  globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
}
