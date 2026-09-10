"""Frontier — single-mesh procedural tree generator with fused-branch topology.

Top-level pipeline lives in :mod:`frontier.generate`.
"""

from frontier.generate import generate_tree, GenerateResult

__all__ = ["generate_tree", "GenerateResult"]

__version__ = "0.1.0"
