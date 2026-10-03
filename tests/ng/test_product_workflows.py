"""Ship ordinary workflows with consistent native ports and connected render paths."""
import json
from pathlib import Path
import unittest

from _pack import REPO, comfy_available

if comfy_available():
    from comfy_execution.validation import validate_loops


class ProductWorkflows(unittest.TestCase):
    def examples(self):
        for label in ("text studio", "image and voice", "native sampler", "native chunk loop", "two sampler chunk loop"):
            path = Path(REPO) / "example_workflows" / ("H3 Director NG - " + label + ".json")
            yield label, json.loads(path.read_text(encoding="utf8"))

    def test_every_link_has_matching_native_slots_and_reciprocal_references(self):
        for label, workflow in self.examples():
            nodes = {node["id"]: node for node in workflow["nodes"]}
            links = {link[0]: link for link in workflow["links"]}
            self.assertEqual(len(links), len(workflow["links"]), label)
            for identifier, origin, slot, target, target_slot, type_ in links.values():
                output = nodes[origin]["outputs"][slot]
                input_ = nodes[target]["inputs"][target_slot]
                self.assertEqual((output["type"], input_["type"]), (type_, type_), label)
                self.assertEqual(input_["link"], identifier, label)
                self.assertIn(identifier, output["links"], label)
            for node in nodes.values():
                for input_ in node["inputs"]:
                    if input_["link"] is not None:
                        self.assertIn(input_["link"], links, label)

    def test_examples_use_the_product_chain_and_native_sampler_outputs(self):
        for label, workflow in self.examples():
            types = {node["type"]: node for node in workflow["nodes"]}
            for name in ("NGContextConnector", "NGH3Director", "NGDirectorOutput", "SaveVideo"):
                self.assertIn(name, types, label)
            self.assertNotIn("NGDirectorStudio", types)
            output = types["NGDirectorOutput"]
            self.assertEqual([port["type"] for port in output["outputs"][:9]],
                             ["MODEL", "CONDITIONING", "CONDITIONING", "LATENT", "FLOAT", "INT", "INT", "STRING", "NG_DIRECTOR_RESULT"])
            if label in ("native sampler", "native chunk loop", "two sampler chunk loop"):
                self.assertIn("SamplerCustomAdvanced", types)
                self.assertNotIn("NGProjectRender", types)
            else:
                self.assertIn("NGProjectRender", types)
                self.assertIsNotNone(output["outputs"][8]["links"])

    def test_chunk_loop_examples_close_the_body_and_return_the_last_sampler(self):
        for label, workflow in self.examples():
            if "chunk loop" not in label:
                continue
            nodes = {n["id"]: n for n in workflow["nodes"]}
            links = {link[0]: link for link in workflow["links"]}
            def source(identifier, name):
                port = next(p for p in nodes[identifier]["inputs"] if p["name"] == name)
                return links[port["link"]][1:3]
            self.assertEqual(source(20, "mode.list"), [6, 1], "chunks must originate at Director outside the loop")
            self.assertEqual(source(7, "result"), [6, 0])
            self.assertEqual(source(7, "loop_chunk"), [20, 3])
            self.assertEqual(source(7, "previous"), [20, 4])
            self.assertNotIn("NGProjectChunks", {n["type"] for n in nodes.values()})
            self.assertNotIn("NGPrepareChunk", {n["type"] for n in nodes.values()})
            self.assertNotIn("NGChunkNoise", {n["type"] for n in nodes.values()})
            self.assertEqual(len([n for n in nodes.values() if n["type"] == "NGDirectorOutput"]), 1)
            self.assertEqual(source(14, "latents"), [21, 0])
            self.assertEqual(source(14, "chunks"), [6, 1])
            final = 23 if label == "two sampler chunk loop" else 12
            for name in ("output_value", "next_iteration_value"):
                self.assertEqual(source(21, name), [final, 0])
            self.assertTrue(nodes[21]["widgets_values_named"]["accumulate"])
            self.assertEqual(nodes[11]["widgets_values_named"]["cfg"], 1.0)
            self.assertFalse(nodes[7]["widgets_values_named"]["apply_sigma_shift"])
            self.assertEqual(nodes[13]["type"], "RandomNoise")
            self.assertEqual(source(13, "noise_seed"), [7, 9])
            self.assertEqual(source(12, "noise"), [13, 0])
            self.assertEqual(source(12, "latent_image"), [7, 3])
            self.assertEqual(source(10, "model"), source(11, "model"))
            self.assertEqual(len([n for n in nodes.values() if n["type"] == "SamplerCustomAdvanced"]), 2 if final == 23 else 1)
            if final == 23:
                self.assertEqual(source(23, "latent_image"), [12, 0], "continue the noisy output, not the x0 estimate")
                self.assertEqual(source(23, "noise"), [24, 0])
                self.assertEqual(nodes[24]["type"], "DisableNoise")
                self.assertEqual(source(12, "sigmas"), [22, 0])
                self.assertEqual(source(23, "sigmas"), [22, 1])

    @unittest.skipUnless(comfy_available(), "ComfyUI is not importable")
    def test_native_validation_keeps_single_output_and_noise_inside_the_loop(self):
        for label, workflow in self.examples():
            if "chunk loop" not in label:
                continue
            links = {link[0]: link for link in workflow["links"]}
            graph = {}
            for node in workflow["nodes"]:
                inputs = dict(node.get("widgets_values_named", {}))
                for port in node["inputs"]:
                    if port["link"] is not None:
                        _, origin, slot, *_ = links[port["link"]]
                        inputs[port["name"]] = [str(origin), slot]
                graph[str(node["id"])] = dict(class_type=node["type"], inputs=inputs)
            validate_loops(graph, ["16"], graph.keys(), ["20"], ["21"])
            body = set(graph["20"]["_loop_body"])
            self.assertTrue({"7", "13", "12"} <= body, label)
            self.assertFalse({"6", "14", "15", "16"} & body, label)


if __name__ == "__main__":
    unittest.main()
