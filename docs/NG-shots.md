# Structured shot contract · E43a

The existing `shots` String input accepts old timed text or a JSON document:

```json
{
  "format": "h3-director-shots",
  "schema_version": 1,
  "shots": [{
    "id": "shot-example",
    "start": 0,
    "end": 8,
    "text": "The woman enters the room.",
    "media": [{"schema_version": 1, "context_id": "ctx-woman", "role": "context"}],
    "spoken": [{"schema_version": 1, "speaker_id": "ctx-woman", "voice": "a calm narrator", "language": "German", "delivery": "says", "text": "Guten Morgen!"}],
    "locked_fields": ["spoken"],
    "draft": null
  }]
}
```

`start` and `end` are finite, nonnegative story seconds, converted to 24 fps
at compilation. IDs must be nonempty and unique. Editing, serialization, time
sorting and splitting a shot across chunks retain its ID. Old timed text receives
`legacy-shot-N` IDs in source order and is stored as JSON after its first edit;
an untouched old workflow keeps its original text. An empty widget uses the Idea.
An explicit JSON document with no shots describes no shots.

Media bindings contain Context IDs, never filenames or display names. `context`
inherits the card's usage; an explicit role overrides it for the intersecting
chunks. A context assigned anywhere is scoped to those shots; contexts with no
shot assignment remain global for backward compatibility. Intersections include
the pinned head and any extension of the chunk to H3's frame grid. Subject and
voice dependencies remain present. Reconnecting the same ID restores a binding;
unknown IDs and unsupported roles produce visible compiler issues. Unbinding the
last use makes that context global again.

First/last-frame and video-continue roles retain the existing project's boundary
semantics. They do not create conditioning anchors at an arbitrary interior shot
time. Inapplicable interior bindings report `shot_boundary_role`. Audio copy/lock
retains its source-window/story-origin semantics; assigning it does not yet move
the sound to the start of a shot. Audio placement and mixing remain open.

Spoken entries are separate from action text and media. The existing H3 compiler
receives their exact words, language and delivery, bound to the Subject owning
the image or a described narrator. Missing/non-Subject speakers use the described
narrator and produce an issue without losing the words. A carried shot retains
its action but does not repeat its dialogue. One entry represents one spoken
line. Voice/language/delivery fields cannot contain grammar delimiters or newlines.
Old inline dialogue still works. Avoid writing the same line in both places.

`locked_fields` protects `timing`, `text`, `media` and/or `spoken` from AI, while
manual editing stays possible. `draft` is a separate object and never compiles.
E43a persists these fields and blocks the old whole-scene Apply when bindings,
structured dialogue or protected fields are present. This is a preservation
guard, not the final per-field AI merge: ID-addressed drafts, conflict review and
selective Apply are still required in E46. Draft objects are not an AI result
contract yet. Simple scenes still accept the existing AI replacement workflow.

The live preview and execution use the same parser/compiler. Chunk serialization
includes `shot_id`, media, dialogue and locks as additive v1 fields; older saves
without them remain readable. Invalid JSON/version/field types never silently
fall back to legacy timed text. The editor retains the original data for repair.

E43 is not complete: bound-context native renders, ID-addressed AI drafts/Apply,
remaining role/placement contracts, richer media previews and timeline reorder
still need their subsequent validation. Existing native sampler and Legacy paths
are preserved.
