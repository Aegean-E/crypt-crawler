"""Unit tests for headless inspection configuration and viewports."""

import unittest
from tools.inspect_ui import VIEWPORTS


class TestInspectConfig(unittest.TestCase):
    def test_viewports_declared(self):
        self.assertIn("desktop", VIEWPORTS)
        self.assertIn("laptop", VIEWPORTS)
        self.assertIn("mobile", VIEWPORTS)

        self.assertEqual(VIEWPORTS["desktop"]["width"], 1920)
        self.assertEqual(VIEWPORTS["desktop"]["height"], 1080)
        self.assertEqual(VIEWPORTS["mobile"]["width"], 390)
        self.assertEqual(VIEWPORTS["mobile"]["height"], 844)


if __name__ == "__main__":
    unittest.main()
