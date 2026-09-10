"""High-level generation pipeline: seed + preset -> meshes + report."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional

from frontier import attributes as attrs
from frontier.leaves import LeafMeshData, build_leaf_mesh
from frontier.meshing import Mesh, build_tree_mesh
from frontier.presets import apply_lod, get_preset
from frontier.skeleton import Skeleton, build_skeleton
from frontier.validate import validate_mesh


@dataclass
class GenerateResult:
    skeleton: Skeleton
    bark: Mesh
    bark_normals: object = None
    bark_uv: object = None
    bark_wind: Dict = field(default_factory=dict)
    leaves: Optional[LeafMeshData] = None
    report: Dict = field(default_factory=dict)
    preset: str = ""
    seed: int = 0
    lod: int = 0


def generate_tree(preset: str = "oak", seed: int = 1, lod: int = 0,
                  skel_override: Optional[Dict] = None,
                  mesh_override: Optional[Dict] = None,
                  leaf_override: Optional[Dict] = None,
                  ring_override: Optional[Dict] = None) -> GenerateResult:
    skel_params, ring_params, mesh_opts, leaf_params = get_preset(preset)
    # User shape first; LOD simplification derives from it (relative scaling).
    if skel_override:
        skel_params.update(skel_override)
    if mesh_override:
        mesh_opts.update(mesh_override)
    if leaf_override:
        leaf_params.update(leaf_override)
    if ring_override:
        ring_params.update(ring_override)
    skel_params, ring_params, mesh_opts, leaf_params = apply_lod(
        skel_params, ring_params, mesh_opts, leaf_params, lod
    )

    skel = build_skeleton(skel_params, seed, ring_params)
    bark = build_tree_mesh(skel, mesh_opts)
    normals = attrs.compute_normals(bark)
    uv = attrs.compute_uvs(bark, skel)
    wind = attrs.compute_wind(bark, skel, seed=seed)
    report = validate_mesh(bark)
    report.update(
        {
            "preset": preset,
            "seed": seed,
            "lod": lod,
            "skeleton_nodes": len(skel.nodes),
            "max_depth": skel.max_depth(),
            "height": float(skel.height()),
            "guard_flipped": bark.flipped_by_guard,
        }
    )
    leaves = None
    if leaf_params.get("enabled"):
        leaves = build_leaf_mesh(skel, leaf_params, seed=seed)

    return GenerateResult(
        skeleton=skel,
        bark=bark,
        bark_normals=normals,
        bark_uv=uv,
        bark_wind=wind,
        leaves=leaves,
        report=report,
        preset=preset,
        seed=seed,
        lod=lod,
    )
