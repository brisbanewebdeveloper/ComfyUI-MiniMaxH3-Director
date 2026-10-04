// The Studio's two AI actions over the existing /ng/direct route: split the Prompt into shots, and
// suggest a better text per shot. Nothing changes until the user presses Übernehmen.
import { aiAction } from "./ng_ai_request.js";
import { connectedProvider, readContexts } from "./ng_read.js";
import { values } from "./ng_widgets.js";
import { readProject, writeProject, clipToFit } from "./h3s_model.js";

export function studioAI(S, app, api, done) {
  let controller = null, serial = 0;

  async function run(kind, shots) {
    const provider = connectedProvider(S.node);
    if (!provider || S.busy) return null;
    controller = new AbortController();
    const mine = ++serial;
    S.busy = kind; done();
    try {
      const payload = { director: { ...values(S.node), shots: shots === null ? "" : writeProject({ shots, audio: [], lanes: [] }) },
        contexts: readContexts(S.node), provider, mode: "auto" };
      const data = await aiAction(app, api, "direct", payload, controller.signal);
      return mine === serial ? data.suggestion : null;
    } catch (error) {
      if (mine === serial) S.toast = error.message === "AI action cancelled." ? "KI abgebrochen, nichts geändert." : `KI: ${error.message}`;
      return null;
    } finally {
      if (mine === serial) { S.busy = ""; controller = null; done(); }
    }
  }

  return {
    async split() {
      const suggestion = await run("split", null);
      if (!suggestion?.shots) return;
      const proposed = clipToFit(readProject(suggestion.shots).shots, S.values.project_seconds);
      S.ghosts = proposed.map(({ start, end, text }) => ({ start, end, text }));
      S.ghostSound = { soundscape: suggestion.soundscape || "", music: suggestion.music || "" };
      if (!S.ghosts.length) S.toast = "Die KI hat keine Shots vorgeschlagen.";
      done();
    },
    async suggest(shotId) {
      const suggestion = await run("suggest", S.shots);
      if (!suggestion) return;
      const texts = (suggestion.patches || []).filter((patch) => typeof patch.fields?.text === "string" && patch.fields.text.trim());
      for (const patch of texts) S.suggestions[patch.shot_id] = patch.fields.text.trim();
      if (!S.suggestions[shotId]) S.toast = "Die KI hat für diesen Shot keinen neuen Text vorgeschlagen.";
      done();
    },
    cancel() { serial++; controller?.abort(); controller = null; S.busy = ""; S.toast = "KI abgebrochen, nichts geändert."; done(); },
    dispose() { serial++; controller?.abort(); },
  };
}
