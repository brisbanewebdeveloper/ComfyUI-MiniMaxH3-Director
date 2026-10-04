// The Studio's two AI actions over the existing /ng/direct route: split the Prompt into shots, and
// suggest a better text per shot. Nothing changes until the user presses Accept.
import { aiAction } from "./ng_ai_request.js";
import { connectedProvider, readContexts } from "./ng_read.js";
import { values } from "./ng_widgets.js";
import { readProject, writeProject, clipToFit } from "./h3s_model.js";

// A failed or empty answer stays on screen until it is dismissed; the user may have scrolled away meanwhile.
function failure(error, provider) {
  if (error.message === "AI action cancelled.") return { text: "AI cancelled, nothing changed.", error: false };
  const slow = /did not answer within/i.test(error.message) ? ` The AI Loader's Timeout is ${provider.timeout_seconds || 120} s; a large model may need more.` : "";
  return { text: `AI failed: ${error.message}${slow}`, error: true };
}

// What an answer was asked about. If any of it changed while the AI worked, the answer no longer fits and is dropped.
// Shots are left out for text proposals: their own shot's text is checked on Accept, and accepting one text must not
// invalidate the proposals for the other shots.
export function basis(node, withShots = true) {
  const now = values(node);
  return JSON.stringify([now.idea, withShots ? now.shots : null, now.project_seconds, now.mode, now.soundscape, now.music,
    readContexts(node), connectedProvider(node)]);
}

export function studioAI(S, app, api, done) {
  let controller = null, serial = 0;

  async function run(kind, shots) {
    const provider = connectedProvider(S.node);
    if (!provider || S.busy) return null;
    controller = new AbortController();
    const mine = ++serial;
    S.busy = kind; S.aiStarted = Date.now(); S.aiTimeout = provider.timeout_seconds || 120; S.notice = null; done();
    const before = basis(S.node);
    try {
      const payload = { director: { ...values(S.node), shots: shots === null ? "" : writeProject({ shots, audio: [], lanes: [] }) },
        contexts: readContexts(S.node), provider, mode: "auto" };
      const data = await aiAction(app, api, "direct", payload, controller.signal);
      if (mine !== serial) return null;
      if (basis(S.node) !== before) {
        S.notice = { text: "The project changed while the AI was working, so its answer no longer fits and was discarded. Ask again.", error: false };
        return null;
      }
      return data.suggestion;
    } catch (error) {
      if (mine === serial) S.notice = failure(error, provider);
      return null;
    } finally {
      if (mine === serial) { S.busy = ""; controller = null; done(); }
    }
  }

  return {
    async split() {
      const suggestion = await run("split", null);
      if (!suggestion) return;
      const proposed = clipToFit(readProject(suggestion.shots || "").shots, S.values.project_seconds);
      S.ghosts = proposed.map(({ start, end, text }) => ({ start, end, text }));
      S.ghostSound = { soundscape: suggestion.soundscape || "", music: suggestion.music || "" };
      S.ghostBasis = basis(S.node, true);
      if (!S.ghosts.length) S.notice = { text: "The AI answered, but proposed no shots. Try again or split by hand.", error: true };
      else {
        const notes = [suggestion.timing_adjusted && "Its shot times were laid end to end over the whole project",
          suggestion.unknown_mentions?.length && `${suggestion.unknown_mentions.map((name) => "@" + name).join(", ")} is no Content here and stays a plain word`];
        if (notes.some(Boolean)) S.notice = { text: `${notes.filter(Boolean).join("; ")}. Check the proposal before you accept it.`, error: false };
      }
      done();
    },
    async suggest(shotId) {
      const suggestion = await run("suggest", S.shots);
      if (!suggestion) return;
      // A stored text lock (locked_fields) still protects a shot from AI text, even without a lock control in the Studio.
      const open = new Map(S.shots.filter((shot) => !(shot.locked_fields || []).includes("text")).map((shot) => [shot.id, shot.text]));
      const texts = (suggestion.patches || []).filter((patch) => open.has(patch.shot_id) && typeof patch.fields?.text === "string" && patch.fields.text.trim());
      for (const patch of texts) { S.suggestions[patch.shot_id] = patch.fields.text.trim(); (S.suggestionBase ||= {})[patch.shot_id] = open.get(patch.shot_id); }
      S.suggestionBasis = basis(S.node, false);
      if (!S.suggestions[shotId]) S.notice = { text: "The AI answered, but suggested no new text for this shot.", error: true };
      done();
    },
    cancel() { serial++; controller?.abort(); controller = null; S.busy = ""; S.notice = { text: "AI cancelled, nothing changed.", error: false }; done(); },
    dispose() { serial++; controller?.abort(); },
  };
}
