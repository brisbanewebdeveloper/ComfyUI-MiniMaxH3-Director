// German headings for the plan's notes. The detail stays the planner's own sentence, so nothing is lost in translation.
const TITLES = {
  anchor_multiple: "Mehrere Start-/Endbilder", voice_unbound: "Stimme ohne Figur", voice_extra_take: "Weitere Stimmprobe",
  usage_unknown: "Unbekannte Verwendung", usage_pending: "Zeitpunkt fehlt", text_empty: "Leere Textkarte",
  subject_target_invalid: "Zuordnung ungültig", speaker_unknown: "Sprecher unbekannt", source_shared: "Datei mehrfach genutzt",
  source_missing: "Datei fehlt", shots_preamble: "Text ohne Zeit", shot_speaker_unknown: "Sprecher nicht verbunden",
  shot_speaker_unbound: "Sprecher ohne Bild", shot_role_unknown: "Rolle passt nicht", shot_overlap: "Shots überlappen",
  shot_gap: "Lücke zwischen Shots", shot_empty_range: "Shot ohne Länge", shot_context_unknown: "Content nicht verbunden",
  shot_clipped: "Shot gekürzt", shot_after_end: "Shot nach Projektende", reference_disabled: "Bei Start-/Endbild nicht genutzt",
  prompt_override: "Prompt von Hand aktiv", planner: "Hinweis des Compilers", no_text: "Kein Text", no_continuity: "Harte Schnitte",
  length_snapped: "Länge an H3-Raster angepasst", late_change: "Wechsel kurz nach einer Naht", guide_outside_project: "Zeitpunkt außerhalb",
  content_unknown: "Unbekannter Inhalt", canvas_snapped: "Größe auf 32er-Raster", canvas_from_image: "Größe aus Bild",
  canvas_default: "Standardgröße", audio_short: "Ton zu kurz", audio_roles: "Mehrere Ton-Rollen", audio_dulling: "Ton wird dumpfer",
  audio_clip_unknown: "Tonclip ohne Audio-Content", audio_clip_clipped: "Tonclip gekürzt", audio_clip_after_end: "Tonclip nach Projektende",
  asset_relation_unavailable: "Zuordnung nicht möglich",
};

export function issueLine(issue) {
  const title = TITLES[issue.code] || "Hinweis";
  return `${title}${issue.ref ? ` (${issue.ref})` : ""}: ${issue.text}`;
}
