"""Ship ordinary workflows with consistent native ports and connected render paths."""
import json
from pathlib import Path
import unittest

from _pack import REPO


class ProductWorkflows(unittest.TestCase):
    def examples(self):
        for label in ("text studio", "image and voice", "native sampler"):
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
            self.assertEqual([port["type"] for port in output["outputs"]],
                             ["MODEL", "CONDITIONING", "CONDITIONING", "LATENT", "FLOAT", "INT", "INT", "STRING", "NG_DIRECTOR_RESULT"])
            if label == "native sampler":
                self.assertIn("SamplerCustomAdvanced", types)
                self.assertNotIn("NGProjectRender", types)
            else:
                self.assertIn("NGProjectRender", types)
                self.assertIsNotNone(output["outputs"][8]["links"])


if __name__ == "__main__":
    unittest.main()
