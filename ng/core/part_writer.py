"""One render part's writing request and its checked answer, from the same plan the Studio shows."""
import json

from .context import DirectorContext
from .part_prompt import check, request
from .preview import plan_preview


def _without_own(director):
    """The plan as compiled: a part's own prompt must be written from the compiled one, never from an earlier own one."""
    text = director.get("shots", "") or ""
    if not text.lstrip().startswith("{"):
        return director
    data = json.loads(text)
    data.pop("part_prompts", None)
    return {**director, "shots": json.dumps(data)}


def brief(director, contexts, index, probe=None):
    view = plan_preview({"director": _without_own(director), "contexts": contexts}, probe=probe)
    if not view["ok"]:
        raise ValueError(view["error"])
    if not 0 <= index < len(view["chunks"]):
        raise ValueError("There is no render part %d; the plan has %d." % (index + 1, len(view["chunks"])))
    chunk = view["chunks"][index]
    context = DirectorContext.from_dict(view["director_context"])
    figures = "\n".join("%s: %s" % (item.name, item.description) for item in context.items
                        if item.media == "image" and item.description.strip())
    return {"index": index, "key": chunk["prompt_key"], "compiled": chunk["prompt"], "mode": chunk["mode"],
            "seconds": chunk["sampled_frames"] / 24.0, "continues": chunk["head_frames"] > 0, "parts": len(view["chunks"]),
            "story": context.idea, "figures": figures}


def write_prompt(facts):
    return request(facts["compiled"], facts["mode"], facts["seconds"], facts["story"], facts["figures"], facts["continues"],
                   (facts["index"] + 1, facts["parts"]))


def finish(answer, facts):
    """What the Studio shows for Accept: the checked prompt, or why the AI's version was refused (then nothing changes)."""
    text, problems = check(facts["compiled"], answer)
    return {"index": facts["index"], "key": facts["key"], "text": text or "", "problems": problems}
