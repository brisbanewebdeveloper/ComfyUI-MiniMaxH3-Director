"""Pick up a render after a crash: every finished render part's raw latent is kept on disk and reused when the same plan is
queued again, so a run that died after hours only samples the parts it had not finished.

A part's key covers what it was made from: its own plan (chunk, prompt, references and the files behind them), the render
settings, and the keys of every part before it, because a continued part is pinned to the one before. Changing part 5
renders part 5 and everything after it again; parts 1 to 4 come from disk. The models themselves are not in the key: after
swapping a checkpoint, delete the folder. The folder is under ComfyUI's output folder, because ComfyUI empties its temp
folder at every start, which is exactly when a resume is needed."""
import hashlib
import json
import os
import time

import torch
import folder_paths
from comfy.nested_tensor import NestedTensor

from ..core.project import jobs
from .paths import input_path

FOLDER = "h3-director-resume"
KEEP_DAYS = 14


def folder():
    return os.path.join(folder_paths.get_output_directory(), FOLDER)


def _file(source):
    path = input_path(source) if source else None
    if not path or not os.path.isfile(path):
        return None
    stat = os.stat(path)
    return [stat.st_size, stat.st_mtime_ns]


def _own(job):
    compiled, chunk, context = job.compiled, job.chunk, job.project.context
    return {"chunk": chunk.to_dict(), "mode": compiled.mode, "prompt": compiled.prompt, "size": [context.width, context.height],
            "continuity": job.project.plan.continuity.mode,
            "refs": [[r.kind, r.ctx_id, r.source, r.start_f, r.length_f, r.trim_start_f, _file(r.source)] for r in compiled.refs]}


def part_key(job, settings):
    """Hex key of this part, chained over every part before it."""
    key = hashlib.sha256(json.dumps(settings, sort_keys=True, default=str).encode()).hexdigest()
    for earlier in jobs(job.project)[:job.index + 1]:
        key = hashlib.sha256((key + json.dumps(_own(earlier), sort_keys=True, default=str)).encode()).hexdigest()
    return key[:32]


def _path(key):
    return os.path.join(folder(), key + ".pt")


def has(key):
    return os.path.isfile(_path(key))


def load(key):
    data = torch.load(_path(key), map_location="cpu", weights_only=True)
    return {"samples": NestedTensor((data["video"], data["audio"]))}


def save(key, latent):
    os.makedirs(folder(), exist_ok=True)
    video, audio = latent["samples"].unbind()
    tmp = _path(key) + ".part"
    torch.save({"video": video.detach().cpu(), "audio": audio.detach().cpu()}, tmp)
    os.replace(tmp, _path(key))
    _prune()


def _prune():
    """Parts older than KEEP_DAYS are no run's resume any more."""
    limit = time.time() - KEEP_DAYS * 86400
    for name in os.listdir(folder()):
        path = os.path.join(folder(), name)
        if name.endswith(".pt") and os.path.getmtime(path) < limit:
            os.remove(path)
