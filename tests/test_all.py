"""Frontier test suite: topology guarantees + wind payload + exports."""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from frontier.generate import generate_tree
from frontier.validate import assert_valid


class TestTopology(unittest.TestCase):
    def test_all_presets_valid(self):
        for preset in ["sapling", "oak", "pine", "birch", "colony"]:
            for seed in [1, 2]:
                with self.subTest(preset=preset, seed=seed):
                    r = generate_tree(preset, seed=seed)
                    rep = assert_valid(r.bark, preset)
                    self.assertEqual(rep["euler"], 2, "must be genus 0")
                    self.assertTrue(rep["single_component"])
                    self.assertFalse(r.bark.flipped_by_guard, "winding must be outward by construction")

    def test_lods_valid(self):
        for lod in [1, 2]:
            r = generate_tree("oak", seed=5, lod=lod)
            assert_valid(r.bark, f"oak lod{lod}")

    def test_many_seeds_sapling(self):
        for seed in range(10, 20):
            r = generate_tree("sapling", seed=seed)
            assert_valid(r.bark, f"sapling seed={seed}")

    def test_wind_payload_ranges(self):
        r = generate_tree("oak", seed=3)
        w = r.bark_wind
        for key in ["weight", "phase", "flutter", "level01", "ao"]:
            a = w[key]
            self.assertTrue(((a >= 0) & (a <= 1)).all(), key)
        self.assertEqual(w["color"].shape, (r.report["verts"], 4))
        self.assertEqual(w["pivot"].shape, (r.report["verts"], 3))
        # trunk base ~rigid, twig tips ~free
        self.assertLess(float(w["weight"].min()), 0.15)
        self.assertGreater(float(w["weight"].max()), 0.85)

    def test_exports_roundtrip(self):
        from frontier.export_gltf import write_glb
        from frontier.export_obj import write_obj

        r = generate_tree("sapling", seed=4)
        with tempfile.TemporaryDirectory() as d:
            p1 = os.path.join(d, "t.glb")
            p2 = os.path.join(d, "t.obj")
            write_glb(p1, r)
            write_obj(p2, r)
            self.assertGreater(os.path.getsize(p1), 1000)
            self.assertGreater(os.path.getsize(p2), 1000)
            with open(p1, "rb") as f:
                self.assertEqual(f.read(4), b"glTF")


if __name__ == "__main__":
    unittest.main(verbosity=2)
