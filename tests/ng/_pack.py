"""Import the repo as a package without running its __init__ (which needs ComfyUI).

The folder name has a hyphen, so the pack is registered under a synthetic name. Relative imports inside `ng`
(for example `from ... import minimax_plan`) then resolve against the repo root exactly as they do inside ComfyUI.
"""
import importlib
import os
import sys
import types

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PACK = "mmxd_pack"


def load():
    if PACK not in sys.modules:
        module = types.ModuleType(PACK)
        module.__path__ = [REPO]
        sys.modules[PACK] = module
    return sys.modules[PACK]


def module(name):
    load()
    return importlib.import_module("%s.%s" % (PACK, name))


COMFY_ROOT = os.path.dirname(os.path.dirname(REPO))


def comfy_available():
    """Put the ComfyUI root on sys.path and report whether its tensor and layout modules import (they need torch)."""
    if COMFY_ROOT not in sys.path:
        sys.path.insert(0, COMFY_ROOT)
    try:
        importlib.import_module("comfy.nested_tensor")
        importlib.import_module("comfy.ldm.minimax.model")
    except Exception:
        return False
    return True
