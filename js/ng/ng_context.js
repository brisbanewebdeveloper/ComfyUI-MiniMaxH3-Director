// The frontend gives an audio-upload widget its player only for a fixed list of core node names, and the upload widget
// looks the player up by name while it is being built, so the player has to exist BEFORE it. Without this the audio
// context node cannot even be constructed.
const { app } = window.comfyAPI.app;

function withPlayerBeforeUpload(required) {
  const ordered = {};
  for (const [name, definition] of Object.entries(required)) {
    if (name === "upload") ordered.audioUI = ["AUDIO_UI", {}];
    ordered[name] = definition;
  }
  if (!ordered.audioUI) ordered.audioUI = ["AUDIO_UI", {}];
  return ordered;
}

app.registerExtension({
  name: "mmxd.ng.context_audio",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeType.prototype.comfyClass === "NGContextAudio") {
      nodeData.input.required = withPlayerBeforeUpload(nodeData.input.required);
    }
  },
});
