import unittest

from _pack import module

context = module("ng.core.context")
issues = module("ng.core.issues")


def item(**kw):
    base = dict(id="ctx_0001", name="Alice", media="image", source="refs/alice.png", content=("character",),
                usage=("reference",), preserve="high", description="a young woman in a red coat")
    base.update(kw)
    return context.ContextItem(**base)


class Items(unittest.TestCase):
    def test_roundtrip(self):
        a = item(speaker="ctx_0002", color="#88aaff")
        self.assertEqual(context.ContextItem.from_dict(a.to_dict()), a)

    def test_defaults_per_medium(self):
        self.assertEqual(item(usage=()).effective_usage, ("reference",))
        self.assertEqual(item(media="audio", usage=()).effective_usage, ("voice",))
        self.assertEqual(item(media="video", usage=()).effective_usage, ("motion",))
        self.assertEqual(item(media="text", usage=()).effective_usage, ("style",))

    def test_unknown_values_are_reported_not_mapped(self):
        problems = context.check_item(item(content=("character", "hat"), usage=("reference", "voice")))
        self.assertEqual({p.code for p in problems}, {"content_unknown", "usage_unknown"})
        self.assertIn("Alice", str(problems[0]))

    def test_missing_source_and_empty_text(self):
        self.assertEqual([p.code for p in context.check_item(item(source=""))], ["source_missing"])
        self.assertEqual([p.code for p in context.check_item(item(media="text", source=" ", usage=()))], ["text_empty"])

    def test_bad_data_names_the_path(self):
        with self.assertRaises(issues.SchemaError) as e:
            context.ContextItem.from_dict({"schema_version": 1, "id": "a", "name": "x", "media": "gif"}, "items[3]")
        self.assertTrue(str(e.exception).startswith("items[3].media"))
        with self.assertRaises(issues.SchemaError) as e:
            context.ContextItem.from_dict({"schema_version": 2}, "items[0]")
        self.assertIn("schema_version", str(e.exception))


class Director(unittest.TestCase):
    def test_roundtrip_with_items(self):
        d = context.DirectorContext(idea="a walk", project_seconds=30, items=(item(), item(id="ctx_0002", name="Bob")))
        self.assertEqual(context.DirectorContext.from_dict(d.to_dict()), d)

    def test_duplicate_ids_are_refused(self):
        data = context.DirectorContext(items=(item(), item(name="Other"))).to_dict()
        with self.assertRaises(issues.SchemaError):
            context.DirectorContext.from_dict(data)

    def test_duplicate_names_are_refused_for_mentions(self):
        data = context.DirectorContext(items=(item(), item(id="other", name="ALICE"))).to_dict()
        with self.assertRaisesRegex(issues.SchemaError, "name used twice"):
            context.DirectorContext.from_dict(data)

    def test_lookup_helpers(self):
        d = context.DirectorContext(items=(item(), item(id="ctx_0002", name="Voice", media="audio", usage=("voice",))))
        self.assertEqual(d.item("ctx_0002").name, "Voice")
        self.assertIsNone(d.item("nope"))
        self.assertEqual([i.name for i in d.by_media("audio")], ["Voice"])

    def test_invalid_numbers(self):
        with self.assertRaises(issues.SchemaError):
            context.DirectorContext.from_dict({"schema_version": 1, "project_seconds": 0})
        with self.assertRaises(issues.SchemaError):
            context.DirectorContext.from_dict({"schema_version": 1, "mode": "sideways"})


if __name__ == "__main__":
    unittest.main()
