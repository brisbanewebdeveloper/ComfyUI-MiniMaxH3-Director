"""The final prompt of one render part: written out by an AI from the compiled one, or edited by hand, and checked.

The compiler's prompt is always valid H3 notation but terse. MiniMax's own pipeline (H3-Context-IR, not released) turns
free-form input into long, detailed prompts; this is our version of that last step. The AI writes only what is prose -
the description body and the two sound fields. Everything the planner computed stays the planner's: the alignment line,
subject_definitions, summary, retention_analysis, the shot markers and cut times, every <d> line and speaker ID, and the
labels. An answer that changes any of those is refused and the compiled prompt stays.

A part's own prompt is stored in the shot document with the key of the compiled prompt it was written from. When the
plan changes (timing, shots, media, Look), the key no longer matches, the compiled prompt is used and the user is told.
"""
import hashlib
import re

SECTIONS = ("subject_definitions", "summary", "retention_analysis", "detailed_description", "integrated_multimodal_description",
            "overall_soundscape", "non_diegetic_music")
HEADER_RE = re.compile(r"(?m)^(%s):[ \t]*" % "|".join(SECTIONS))
ANSWER_RE = re.compile(r"(?mi)^\s*\**\s*(description|detailed_description|integrated_multimodal_description|overall_soundscape|non_diegetic_music)\s*\**\s*:[ \t]*")
DIALOGUE_RE = re.compile(r"<d>.*?</d>", re.S)
CUT_RE = re.compile(r"\[Shot (\d+)\](?:\s*At (\d{2}:\d{2}\.\d{3}))?")
LABEL_RE = re.compile(r"<(?:Subject|Picture|Video|Audio) \d+>")
SPEAKER_RE = re.compile(r"\(S\d+(?:,\s*S\d+)*\)")
NESTED_RE = re.compile(r"\b(?:%s)\s*:" % "|".join(SECTIONS))
WRITE_TOKENS = 2048
MIN_WORDS = 40
SYSTEM = ("You write the description of one render part of a MiniMax H3 video. You keep the planner's structure, cut times, "
          "labels and spoken or sung lines exactly, and make the description concrete, visual and detailed. You answer with the "
          "three labelled fields only.")


def prompt_key(prompt):
    return hashlib.sha1(prompt.encode("utf-8")).hexdigest()[:12]


def write_tokens(max_tokens):
    return max(max_tokens, WRITE_TOKENS)


def split_sections(prompt):
    """(text before the first section, {section: body}) of a compiled prompt; bodies keep their own line breaks."""
    found = list(HEADER_RE.finditer(prompt))
    head = prompt[:found[0].start()].strip() if found else prompt.strip()
    sections = {}
    for index, match in enumerate(found):
        end = found[index + 1].start() if index + 1 < len(found) else len(prompt)
        sections[match.group(1)] = prompt[match.end():end].strip()
    return head, sections


def vocal_lines(body):
    """Each planned spoken or sung line with the speaker clause in front of it ("<Subject 1> (S1) sings, <d>...</d>")."""
    out, start = [], 0
    for match in DIALOGUE_RE.finditer(body):
        before = body[start:match.start()]
        clause = re.split(r"(?:[.!?]|\]|</d>)\s+", before)[-1].strip()
        out.append((clause + " " + match.group(0)).strip())
        start = match.end()
    return out


def _body_name(sections):
    return "detailed_description" if "detailed_description" in sections else "integrated_multimodal_description"


def request(compiled, mode, seconds, story="", figures="", continues=False, part=(1, 1)):
    """The user turn for the writer: rules, the compiled draft, and the story and figures as material for detail only."""
    head, sections = split_sections(compiled)
    body = sections.get(_body_name(sections), "")
    labels = sorted(set(LABEL_RE.findall(compiled)))
    reference = mode == "ref2va"
    rules = [
        "Rewrite the description of part %d of %d of a MiniMax H3 video (%s, %.2f s). Return exactly these three labelled fields "
        "and nothing else:\ndescription: ...\noverall_soundscape: ...\nnon_diegetic_music: ..." % (part[0], part[1], mode.upper(), seconds),
        "description: " + ("start with one or two sentences of the overall visual style, then [Shot 1]." if reference
                           else "start with [Shot 1], then the visual style and the opening composition in one sentence, then what happens."),
        "Keep every shot marker and cut time exactly as in the draft (for example [Shot 2] At 00:04.500, the camera cuts to ...); add no cuts.",
        "Copy every <d>...</d> block exactly as written in the draft, with its speaker in front of it, in the same order. "
        "Add no other spoken or sung words and never write lyrics outside <d>.%s" % (
            " The lines, each to be written exactly like this where it is heard:\n" + "\n".join("- " + line for line in vocal_lines(body))
            if DIALOGUE_RE.search(body) else ""),
        ("Use only these labels: %s, and keep the speaker IDs such as (S1)." % ", ".join(labels)) if labels
        else "Use no <...> labels; keep the speaker IDs such as (S1).",
        "The draft is only a skeleton: write new sentences of your own, two or three for every shot, describing what is visible "
        "and audible: appearance, position in the frame, actions and small movements, facial expression, light, and the camera "
        "movement as a sentence with amplitude and speed (e.g. The camera pushes in with small amplitude at slow speed). Only the "
        "shot markers, the labels and the lines above are taken over word for word. About 250 to 400 words. English, except inside <d>.",
        "overall_soundscape: one to three English sentences of ambience and physical sounds; no speech, no singing.",
        "non_diegetic_music: the score only the audience hears (instruments, tempo, dynamics), or N/A.",
        "The story and the figures below are material for detail only; they never change times, cuts or words.",
    ]
    if continues:
        rules.append("This part continues the previous part: open by continuing the same action, do not introduce the scene again.")
    draft = "\n".join(part_ for part_ in (head, "description: " + body, "overall_soundscape: " + sections.get("overall_soundscape", ""),
                                          "non_diegetic_music: " + sections.get("non_diegetic_music", "")) if part_)
    out = "\n".join(rules) + "\n\nDraft:\n" + draft
    if reference and sections.get("subject_definitions"):
        out += "\n\nFigures:\n" + sections["subject_definitions"]
    elif figures.strip():
        out += "\n\nFigures:\n" + figures.strip()
    if story.strip():
        out += "\n\nStory:\n" + story.strip()
    return out


def _answer_fields(text):
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).removeprefix("assistant\n").strip()
    if text.startswith("```"):
        text = "\n".join(line for line in text.splitlines() if not line.startswith("```"))
    found = list(ANSWER_RE.finditer(text))
    fields = {}
    for index, match in enumerate(found):
        end = found[index + 1].start() if index + 1 < len(found) else len(text)
        name = match.group(1).lower()
        name = "description" if name in ("detailed_description", "integrated_multimodal_description") else name
        fields.setdefault(name, " ".join(text[match.end():end].split()))
    return fields


def _words(text):
    return re.findall(r"\w+", text.lower())


def _lines_back(written, body):
    """A description that left every spoken or sung line out gets each one back at the end of the shot it belongs to
    (qwen3.5:9b wrote a fine 300-word part without its two lyric lines)."""
    owner = {}
    for line, match in zip(vocal_lines(body), DIALOGUE_RE.finditer(body)):
        shots = CUT_RE.findall(body[:match.start()])
        owner.setdefault(shots[-1][0] if shots else "1", []).append(line)
    pieces = re.split(r"(?=\[Shot \d+\])", written)
    out = []
    for piece in pieces:
        number = re.match(r"\[Shot (\d+)\]", piece)
        lines = owner.get(number.group(1), []) if number else []
        out.append(" ".join([piece.rstrip()] + lines) + (" " if piece.endswith(" ") else "") if lines else piece)
    return "".join(out)


def repair(written, body):
    """Put back what a model reliably gets slightly wrong, where the plan says unambiguously what it must be.

    Measured with Ollama qwen3.5:9b on the elf song (2026-10-05): "[Shot 1] At 00:00.000," for the first shot (the guide
    gives it no time), "(S1) sings" without the "<Subject 1>" in front, and a lyric line with changed punctuation. Anything
    else - a moved cut, a changed or extra word, a lost line - is not repaired; the answer is refused instead."""
    written = re.sub(r"\[Shot 1\]\s*At 00:00\.000,?\s*", "[Shot 1] ", written)
    times = dict(CUT_RE.findall(body))
    written = re.sub(r"\[Shot (\d+)\](?!\s*At )", lambda m: "[Shot %s] At %s," % (m.group(1), times[m.group(1)])
                     if times.get(m.group(1)) else m.group(0), written)
    if not DIALOGUE_RE.search(written) and DIALOGUE_RE.search(body) and CUT_RE.findall(written) == CUT_RE.findall(body):
        written = _lines_back(written, body)
    for speaker, owner in {m.group(2): m.group(1) for m in re.finditer(r"(<(?:Subject|Audio) \d+>) (\(S\d+\))", body)}.items():
        written = re.sub(r"(?<!%s )%s" % (re.escape(owner), re.escape(speaker)), "%s %s" % (owner, speaker), written)
    # A line whose speaker clause was dropped ("As she sings, <d>...") gets the planned speaker right in front of it.
    planned = [re.search(r"(?:<(?:Subject|Audio) \d+> )?\(S[\d,\s]+\)", line) for line in vocal_lines(body)]
    pieces, out, start = list(DIALOGUE_RE.finditer(written)), [], 0
    if len(pieces) == len(planned):
        for match, speaker in zip(pieces, planned):
            clause = re.split(r"(?:[.!?]|\]|</d>)\s+", written[start:match.start()])[-1]
            out.append(written[start:match.start()])
            if speaker and "(S" not in clause:
                out.append(speaker.group(0) + " ")
            out.append(match.group(0))
            start = match.end()
        written = "".join(out) + written[start:]
    planned, found = DIALOGUE_RE.findall(body), DIALOGUE_RE.findall(written)
    if len(planned) == len(found) and all(_words(a) == _words(b) for a, b in zip(planned, found)):
        pieces = DIALOGUE_RE.split(written)
        written = "".join(piece + (planned[index] if index < len(planned) else "") for index, piece in enumerate(pieces))
    return written


def check(compiled, answer):
    """(final prompt, problems). With problems the final prompt is None and the compiled prompt is to be kept."""
    head, sections = split_sections(compiled)
    name = _body_name(sections)
    body = sections.get(name, "")
    fields = _answer_fields(answer)
    written = repair(fields.get("description", ""), body)
    problems = []
    if len(written.split()) < MIN_WORDS:
        problems.append("the description is missing or shorter than %d words" % MIN_WORDS)
    if CUT_RE.findall(written) != CUT_RE.findall(body):
        problems.append("the shot markers or cut times differ from the plan")
    if name == "integrated_multimodal_description" and not written.startswith("[Shot 1]"):
        problems.append("the description does not start with [Shot 1]")
    if DIALOGUE_RE.findall(written) != DIALOGUE_RE.findall(body):
        problems.append("the spoken or sung lines (<d>) are not exactly the planned ones")
    if not set(LABEL_RE.findall(written)) <= set(LABEL_RE.findall(compiled)):
        problems.append("it uses labels the plan does not have: %s" % ", ".join(sorted(set(LABEL_RE.findall(written)) - set(LABEL_RE.findall(compiled)))))
    if not {l for l in LABEL_RE.findall(body) if l.startswith("<Subject")} <= set(LABEL_RE.findall(written)):
        problems.append("a planned subject label is missing")
    if not set(SPEAKER_RE.findall(body)) <= set(SPEAKER_RE.findall(written)):
        problems.append("a speaker ID such as (S1) is missing")
    if NESTED_RE.search(written):
        problems.append("it nests another prompt section inside the description")
    if problems:
        return None, problems
    parts = [head] if head else []
    for key in ("subject_definitions", "summary", "retention_analysis"):
        if key in sections:
            parts.append("%s:%s%s" % (key, "\n" if key != "summary" else " ", sections[key]))
    parts.append("%s: %s" % (name, written))
    for key in ("overall_soundscape", "non_diegetic_music"):
        value = fields.get(key) or sections.get(key, "")
        if value:
            parts.append("%s: %s" % (key, value))
    return "\n\n".join(parts), []
