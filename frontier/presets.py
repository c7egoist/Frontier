"""Tuned species presets.

Each preset is ``(skeleton_params, ring_params, mesh_opts, leaf_params)``.
``lod_scale`` multiplies radial resolution + subdivision for cheap LODs.
"""

from __future__ import annotations

import copy

RINGS_LOD0 = {"trunk_n": 18, "tip_n": 5, "ring_gamma": 0.7}
RINGS_LOD1 = {"trunk_n": 12, "tip_n": 5, "ring_gamma": 0.8}
RINGS_LOD2 = {"trunk_n": 8, "tip_n": 4, "ring_gamma": 0.9}

MESH_DEFAULT = {
    "undulation": 0.03,
    "flare": True,
    "relax": 2,
    "collar_parent": 1.12,
    "collar_child": 1.06,
    "flutes": 9,
    "flute_amp": 0.055,
    "flute_twist": 1.4,
    "buttress_lobes": 6,
    "buttress_amp": 0.30,
}

LEAVES_OFF = {"enabled": False}


def _oak():
    skel = {
        "method": "recursive",
        "max_depth": 4,
        "trunk_len": 3.4,
        "trunk_radius": 0.26,
        "tip_radius": 0.014,
        "segs": 7,
        "len_decay": 0.62,
        "lat_ratio": 0.52,
        "branch_angle": 0.75,  # ~43 deg
        "branch_angle_spread": 0.20,
        "laterals": 1,
        "laterals2_prob": 0.45,
        "apical": 0.45,
        "phototropism": 0.05,
        "upright": 0.14,
        "tip_lift": 0.10,
        "gravitrop": 0.030,
        "curl": 0.16,
        "up_bias": 0.02,
        "subdiv_factor": 2.5,
    }
    leaves = {
        "enabled": True,
        "count": 1700,
        "size": 0.20,
        "size_spread": 0.07,
        "min_depth": 2,
        "cross": 2,
        "droop": 0.35,
    }
    return skel, copy.deepcopy(RINGS_LOD0), copy.deepcopy(MESH_DEFAULT), leaves


def _pine():
    skel = {
        "method": "recursive",
        "max_depth": 4,
        "trunk_len": 5.6,
        "trunk_radius": 0.20,
        "tip_radius": 0.012,
        "segs": 10,
        "len_decay": 0.55,
        "lat_ratio": 0.42,
        "branch_angle": 1.25,  # ~72 deg, near-horizontal whorls
        "branch_angle_spread": 0.12,
        "laterals": 1,
        "laterals2_prob": 0.0,
        "lateral_every": 2,
        "whorl": 2,
        "apical": 0.9,
        "phototropism": 0.03,
        "upright": 0.20,
        "tip_lift": 0.06,
        "gravitrop": 0.012,
        "curl": 0.07,
        "up_bias": 0.10,
        "envelope": "cone",
        "subdiv_factor": 2.5,
    }
    leaves = {
        "enabled": True,
        "count": 1200,
        "size": 0.24,
        "size_spread": 0.06,
        "min_depth": 2,
        "cross": 2,
        "droop": 0.15,
        "needle_tint": True,
    }
    return skel, copy.deepcopy(RINGS_LOD0), copy.deepcopy(MESH_DEFAULT), leaves


def _birch():
    skel = {
        "method": "recursive",
        "max_depth": 4,
        "trunk_len": 4.4,
        "trunk_radius": 0.15,
        "tip_radius": 0.010,
        "segs": 7,
        "len_decay": 0.60,
        "lat_ratio": 0.46,
        "branch_angle": 0.55,  # ~32 deg, fastigiate
        "branch_angle_spread": 0.14,
        "laterals": 1,
        "laterals2_prob": 0.30,
        "apical": 0.7,
        "phototropism": 0.08,
        "upright": 0.22,
        "tip_lift": 0.14,
        "gravitrop": 0.008,
        "curl": 0.10,
        "up_bias": 0.16,
        "subdiv_factor": 2.5,
    }
    leaves = {
        "enabled": True,
        "count": 1800,
        "size": 0.13,
        "size_spread": 0.05,
        "min_depth": 2,
        "cross": 2,
        "droop": 0.45,
    }
    return skel, copy.deepcopy(RINGS_LOD0), copy.deepcopy(MESH_DEFAULT), leaves


def _broadleaf_colony():
    skel = {
        "method": "colonization",
        "attractors": 1000,
        "trunk_len": 2.4,
        "trunk_radius": 0.22,
        "tip_radius": 0.012,
        "influence": 1.2,
        "kill_dist": 0.24,
        "step": 0.24,
        "envelope": "sphere",
        "crown_radius": 2.1,
        "crown_height": 2.6,
        "max_nodes": 3200,
        "max_iter": 170,
        "subdiv_factor": 2.5,
    }
    leaves = {
        "enabled": True,
        "count": 2000,
        "size": 0.18,
        "size_spread": 0.07,
        "min_depth": 3,
        "cross": 2,
        "droop": 0.35,
    }
    return skel, copy.deepcopy(RINGS_LOD0), copy.deepcopy(MESH_DEFAULT), leaves


def _sapling_test():
    """Tiny fast preset for unit tests."""
    skel = {
        "method": "recursive",
        "max_depth": 2,
        "trunk_len": 2.0,
        "trunk_radius": 0.16,
        "tip_radius": 0.02,
        "segs": 4,
        "len_decay": 0.6,
        "lat_ratio": 0.5,
        "branch_angle": 0.7,
        "branch_angle_spread": 0.15,
        "laterals": 1,
        "laterals2_prob": 0.2,
        "apical": 0.5,
        "phototropism": 0.05,
        "gravitrop": 0.02,
        "curl": 0.1,
        "subdiv_factor": 3.0,
    }
    leaves = {"enabled": False}
    return skel, {"trunk_n": 10, "tip_n": 5, "ring_gamma": 0.7}, copy.deepcopy(MESH_DEFAULT), leaves


PRESETS = {
    "oak": _oak,
    "pine": _pine,
    "birch": _birch,
    "colony": _broadleaf_colony,
    "sapling": _sapling_test,
}


def get_preset(name: str):
    if name not in PRESETS:
        raise KeyError(f"unknown preset {name!r}; choose from {sorted(PRESETS)}")
    return PRESETS[name]()


def apply_lod(skel_params, ring_params, mesh_opts, leaf_params, lod: int):
    """Return LOD-adjusted copies (lod 0 = full, 1, 2 = cheaper)."""
    skel_params = copy.deepcopy(skel_params)
    ring_params = copy.deepcopy(ring_params)
    mesh_opts = copy.deepcopy(mesh_opts)
    leaf_params = copy.deepcopy(leaf_params)
    if lod == 1:
        ring_params.update(RINGS_LOD1)
        skel_params["subdiv_factor"] = skel_params.get("subdiv_factor", 2.5) * 1.5
        skel_params["segs"] = max(int(skel_params.get("segs", 6)) - 1, 3)
        if skel_params.get("method") == "colonization":
            skel_params["step"] = skel_params.get("step", 0.24) * 1.3
        leaf_params["count"] = int(leaf_params.get("count", 0) * 0.55)
    elif lod >= 2:
        ring_params.update(RINGS_LOD2)
        skel_params["subdiv_factor"] = skel_params.get("subdiv_factor", 2.5) * 2.2
        skel_params["segs"] = max(int(skel_params.get("segs", 6)) - 1, 4)
        skel_params["laterals2_prob"] = skel_params.get("laterals2_prob", 0.3) * 0.7
        if skel_params.get("method") == "colonization":
            skel_params["step"] = skel_params.get("step", 0.24) * 1.7
        leaf_params["count"] = int(leaf_params.get("count", 0) * 0.28)
    return skel_params, ring_params, mesh_opts, leaf_params
