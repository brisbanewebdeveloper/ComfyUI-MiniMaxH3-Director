"""Ship ordinary workflows: the product chain with the guide, official model names with download links, consistent links,
and one custom sampling loop that closes its body."""
import json
from pathlib import Path
import unittest

from _pack import REPO, comfy_available

if comfy_available():
    from comfy_execution.validation import validate_loops

FOLDER = Path(REPO) / "example_workflows"
GUIDE = json.loads((Path(REPO) / "js" / "guide" / "guide.json").read_text(encoding="utf8"))
ADVANCED = "H3 Director - 8 Custom sampling (advanced)"


class ProductWorkflows(unittest.TestCase):
    def examples(self):
        for path in sorted(FOLDER.glob("H3 Director - *.json")):
            yield path.stem, json.loads(path.read_text(encoding="utf8"))

    def test_the_numbered_set_is_shipped(self):
        names = [label for label, _ in self.examples()]
        self.assertEqual(len(names), 8)
        self.assertIn(ADVANCED, names)
        self.assertTrue((FOLDER / "MiniMax H3 Director (Legacy).json").exists())

    def test_every_link_has_matching_native_slots_and_reciprocal_references(self):
        for label, workflow in self.examples():
            nodes = {node["id"]: node for node in workflow["nodes"]}
            links = {link[0]: link for link in workflow["links"]}
            self.assertEqual(len(links), len(workflow["links"]), label)
            for identifier, origin, slot, target, target_slot, type_ in links.values():
                output = nodes[origin]["outputs"][slot]
                input_ = nodes[target]["inputs"][target_slot]
                # the native loop's ports are wildcards ("*") in the frontend; the link carries the real type
                self.assertIn(output["type"], (type_, "*"), label)
                self.assertIn(input_["type"], (type_, "*"), label)
                self.assertEqual(input_["link"], identifier, label)
                self.assertIn(identifier, output["links"], label)

    def test_examples_use_the_product_chain_and_a_guide(self):
        chapters = {chapter["id"] for chapter in GUIDE["chapters"]}
        for label, workflow in self.examples():
            types = [node["type"] for node in workflow["nodes"]]
            for name in ("NGContextConnector", "NGH3Director", "NGGuide"):
                self.assertIn(name, types, label)
            guide = next(node for node in workflow["nodes"] if node["type"] == "NGGuide")
            self.assertIn(guide["widgets_values"][0], chapters, label)
            if label != ADVANCED:
                self.assertIn("NGProjectRender", types, label)
                self.assertTrue({"SaveVideo", "SaveImage"} & set(types), label)

    def test_models_carry_official_names_and_download_links(self):
        for label, workflow in self.examples():
            for node in workflow["nodes"]:
                if node["type"] not in ("UNETLoader", "CLIPLoader", "VAELoader", "LoraLoaderModelOnly"):
                    continue
                file = node["widgets_values"][0]
                self.assertNotIn("\\", file, label)
                self.assertNotIn("/", file, label)
                links = node["properties"]["models"]
                self.assertEqual(links[0]["name"], file, label)
                self.assertTrue(links[0]["url"].startswith("https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/"), label)
            text = json.dumps(workflow)
            self.assertNotIn("ng_lab", text, label)

    def test_the_custom_loop_closes_its_body_and_returns_the_last_sampler(self):
        workflow = dict(self.examples())[ADVANCED]
        nodes = {n["id"]: n for n in workflow["nodes"]}
        links = {link[0]: link for link in workflow["links"]}

        def source(identifier, name):
            port = next(p for p in nodes[identifier]["inputs"] if p["name"] == name)
            return links[port["link"]][1:3]
        self.assertEqual(source(20, "mode.list"), [6, 1], "chunks must originate at Director outside the loop")
        self.assertEqual(source(7, "result"), [6, 0])
        self.assertEqual(source(7, "loop_chunk"), [20, 3])
        self.assertEqual(source(7, "previous"), [20, 4])
        self.assertEqual(source(14, "latents"), [21, 0])
        self.assertEqual(source(14, "chunks"), [6, 1])
        for name in ("output_value", "next_iteration_value"):
            self.assertEqual(source(21, name), [12, 0])
        self.assertEqual(source(12, "latent_image"), [7, 3])

    @unittest.skipUnless(comfy_available(), "ComfyUI is not importable")
    def test_native_validation_keeps_noise_inside_the_loop(self):
        workflow = dict(self.examples())[ADVANCED]
        links = {link[0]: link for link in workflow["links"]}
        graph = {}
        for node in workflow["nodes"]:
            if node["type"] == "NGGuide":
                continue                    # a virtual node never reaches the server
            inputs = dict(node.get("widgets_values_named", {}))
            for port in node["inputs"]:
                if port["link"] is not None:
                    _, origin, slot, *_ = links[port["link"]]
                    inputs[port["name"]] = [str(origin), slot]
            graph[str(node["id"])] = dict(class_type=node["type"], inputs=inputs)
        validate_loops(graph, ["16"], graph.keys(), ["20"], ["21"])
        body = set(graph["20"]["_loop_body"])
        self.assertTrue({"7", "13", "12"} <= body)
        self.assertFalse({"6", "14", "15", "16"} & body)


if __name__ == "__main__":
    unittest.main()
