"""Reference pictures in First / last frame mode.

MiniMax trains the fl2va checkpoint on text plus first / last frame only, but its conditioning takes reference pictures next to
the frames (GeekatplayStudio's storyboard pack does the same). Real tests 2026-10-12, same seed with and without: an elf portrait
kept her face and staff up to a close-up; Aurelia's character sheet brought the gear emblem on her back and her leg armour,
neither visible in the first frame, and nothing of the sheet's layout reached the video. So a Reference picture stays a
reference in fl2va: it never becomes the First frame (the user's choice, 2026-10-12).

The frame pictures keep <Picture 1> / <Picture 2> as the fl2va prompt already names them; the references follow them."""
from .media_ref import MediaRef

MAX_PICTURES = 9            # H3's reference limit; the frame pictures count too
FRAME_ROLES = {"first_frame", "last_frame", "keyframe", "storyboard"}


def reference_items(context, refs):
    """Image cards used as figure / look references in this chunk, in card order, within H3's picture limit."""
    frames = sum(1 for ref in refs if ref.kind in ("first_frame", "last_frame"))
    out = []
    for item in context.by_media("image"):
        usage = set(item.effective_usage)
        if item.source and "reference" in usage and not usage & FRAME_ROLES:
            out.append(item)
    return out[:max(0, MAX_PICTURES - frames)]


def add_references(prompt, context, refs):
    """(prompt, refs) with each reference picture appended to `refs` and named in the prompt after the frame pictures."""
    items = reference_items(context, refs)
    if not items:
        return prompt, refs
    first = 1 + sum(1 for ref in refs if ref.kind in ("first_frame", "last_frame"))
    lines = ["The appearance of %s (face, hair, outfit and props) comes from <Picture %d>, a reference picture that is not a frame "
             "of the video." % (item.name, number) for number, item in enumerate(items, first)]
    added = tuple(MediaRef("picture", item.id, item.source) for item in items)
    if prompt.startswith("For the target video"):
        head, sep, rest = prompt.partition("\n\n")
        prompt = head + " " + " ".join(lines) + sep + rest
    else:
        prompt = " ".join(lines) + "\n\n" + prompt
    return prompt, list(refs) + list(added)
