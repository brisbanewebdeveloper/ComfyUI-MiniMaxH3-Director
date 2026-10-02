import types
import unittest

from _pack import comfy_available, load_full_pack

HAVE_COMFY = comfy_available()
LEGACY_IDS = ("MiniMaxH3DirectorCS", "MiniMaxH3PreviewOverrideCS", "MiniMaxH3RetakeStitchCS", "MiniMaxH3EnhancePromptCS", "MiniMaxH3SaveLastFrameCS")
NG_IDS = ("NGContextImage", "NGContextVideo", "NGContextAudio", "NGContextText", "NGDirector", "NGChunkConditioning", "NGCollect")


@unittest.skipUnless(HAVE_COMFY, "ComfyUI is not importable")
class Registration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = load_full_pack()

    def test_ng_nodes_are_registered_next_to_the_legacy_ones(self):
        mappings = self.pack.NODE_CLASS_MAPPINGS
        for node_id in LEGACY_IDS + NG_IDS:
            self.assertIn(node_id, mappings)
        self.assertTrue(all(not n.endswith("CS") for n in NG_IDS))

    def test_the_old_director_is_marked_legacy_without_changing_its_id(self):
        schema = self.pack.NODE_CLASS_MAPPINGS["MiniMaxH3DirectorCS"].GET_SCHEMA()
        self.assertEqual(schema.display_name, "MiniMax H3 Director (Legacy)")
        self.assertEqual(schema.category, "MiniMax H3/Legacy")
        self.assertTrue(schema.description.startswith("LEGACY"))
        self.assertEqual(self.pack.NODE_DISPLAY_NAME_MAPPINGS["MiniMaxH3DirectorCS"], "MiniMax H3 Director (Legacy)")

    def test_display_names_exist(self):
        for node_id in NG_IDS:
            self.assertTrue(self.pack.NODE_DISPLAY_NAME_MAPPINGS[node_id].startswith("NG "), node_id)

    def test_schemas_have_unique_input_ids_and_a_category(self):
        for node_id in NG_IDS:
            schema = self.pack.NODE_CLASS_MAPPINGS[node_id].GET_SCHEMA()
            ids = [i.id for i in schema.inputs]
            self.assertEqual(len(ids), len(set(ids)), node_id)
            self.assertEqual(schema.category, "MiniMax H3/NG")

    def test_loop_nodes_take_and_give_what_the_loop_needs(self):
        director = self.pack.NODE_CLASS_MAPPINGS["NGDirector"].GET_SCHEMA()
        self.assertTrue(director.outputs[0].is_output_list)
        chunk = self.pack.NODE_CLASS_MAPPINGS["NGChunkConditioning"].GET_SCHEMA()
        self.assertEqual([o.display_name for o in chunk.outputs], ["model", "positive", "latent", "prompt"])
        self.assertTrue(self.pack.NODE_CLASS_MAPPINGS["NGCollect"].GET_SCHEMA().is_input_list)


@unittest.skipUnless(HAVE_COMFY, "ComfyUI is not importable")
class Execution(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = load_full_pack()
        cls.nodes = cls.pack.NODE_CLASS_MAPPINGS
        cls.context_nodes = __import__("sys").modules["mmxd_full_pack.ng.nodes.context_nodes"]

    def out(self, node_id, **kw):
        return self.nodes[node_id].execute(**kw).args

    def test_image_context(self):
        (item,) = self.out("NGContextImage", image="refs/alice.png [input]", name="Alice", description="a woman ", content="character",
                           usage="reference", preserve="high")
        self.assertEqual((item.id, item.source, item.media, item.description), ("image_alice", "refs/alice.png", "image", "a woman"))

    def test_name_falls_back_to_the_file(self):
        (item,) = self.out("NGContextImage", image="refs/old castle.png", name="", description="", content="location", usage="reference", preserve="low")
        self.assertEqual((item.name, item.id), ("old castle", "image_old_castle"))

    def test_audio_context_reads_its_length_and_speaker(self):
        saved = self.context_nodes.probe.duration_seconds
        self.context_nodes.probe.duration_seconds = lambda source: 7.5
        try:
            (item,) = self.out("NGContextAudio", audio="v.wav", name="V", description="", content="voice", usage="voice", preserve="high", speaker=" Alice ")
        finally:
            self.context_nodes.probe.duration_seconds = saved
        self.assertEqual((item.length_s, item.speaker, item.usage), (7.5, "Alice", ("voice",)))

    def test_replacing_a_file_changes_the_cache_key_of_its_context_node(self):
        import os
        import folder_paths
        path = os.path.join(folder_paths.get_input_directory(), "ng_stamp_test.png")
        try:
            with open(path, "wb") as f:
                f.write(b"first")
            node = self.nodes["NGContextImage"]
            before = node.fingerprint_inputs(image="ng_stamp_test.png")
            self.assertEqual(before, node.fingerprint_inputs(image="ng_stamp_test.png [input]"))
            with open(path, "wb") as f:
                f.write(b"second version")
            self.assertNotEqual(before, node.fingerprint_inputs(image="ng_stamp_test.png"))
        finally:
            if os.path.exists(path):
                os.remove(path)
        self.assertEqual(self.nodes["NGContextAudio"].fingerprint_inputs(audio="not there.wav"), "missing")

    def test_text_context_keeps_the_text(self):
        (item,) = self.out("NGContextText", text="Keep the camera slow.", name="", description="", content="rules", usage="style", preserve="high")
        self.assertEqual((item.media, item.source), ("text", "Keep the camera slow."))

    def test_director_plans_a_sixty_second_project(self):
        (alice,) = self.out("NGContextImage", image="alice.png", name="Alice", description="a woman", content="character", usage="reference", preserve="high")
        chunks, warnings, plan = self.out("NGDirector", idea="Alice walks through a station.", shots="", project_seconds=60.0, chunk_seconds=10.0,
                                          width=768, height=1152, mode="auto", continuity="video_audio", pin_frames="22", soundscape="", music="",
                                          contexts={"context_1": alice})
        self.assertGreaterEqual(len(chunks), 6)
        self.assertTrue(all(j.compiled.mode == "ref2va" for j in chunks))
        self.assertIn("chunk 1:", plan)
        self.assertIn("joins", warnings)

    def test_director_without_contexts(self):
        chunks, warnings, plan = self.out("NGDirector", idea="A dog runs.", shots="", project_seconds=8.0, chunk_seconds=0.0, width=768, height=1152,
                                          mode="auto", continuity="none", pin_frames="22", soundscape="", music="")
        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0].compiled.mode, "t2va")

    def test_lazy_model_choice_follows_the_chunks_mode(self):
        node = self.nodes["NGChunkConditioning"]
        unc = __import__("sys").modules["mmxd_full_pack.ng.nodes.chunk_node"].UNCONNECTED
        ref = types.SimpleNamespace(compiled=types.SimpleNamespace(mode="ref2va"))
        fl = types.SimpleNamespace(compiled=types.SimpleNamespace(mode="t2va"))
        self.assertEqual(node.check_lazy_status(chunk=ref, model_fl2va=None, model_ref2va=None), ["model_ref2va"])
        self.assertEqual(node.check_lazy_status(chunk=fl, model_fl2va=None, model_ref2va=None), ["model_fl2va"])
        self.assertEqual(node.check_lazy_status(chunk=ref, model_fl2va=None, model_ref2va=unc), ["model_fl2va"])
        self.assertEqual(node.check_lazy_status(chunk=ref, model_fl2va=object(), model_ref2va=unc), [])
        self.assertEqual(node.check_lazy_status(chunk=ref, model_fl2va=unc, model_ref2va=unc), [])


if __name__ == "__main__":
    unittest.main()
