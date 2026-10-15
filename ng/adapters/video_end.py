"""The final original frame before the card's selected end, without resampling away its motion."""
import av
import torch

from ... import minimax_media as legacy
from ... import minimax_plan as plan
from .paths import input_path


def last_frame(source, start_s, end_s):
    path = input_path(source)
    if not path:
        raise ValueError("Choose an existing continuation video: %s" % source)
    chosen = None
    with av.open(path) as container:
        stream = container.streams.video[0]
        stream.thread_type = "AUTO"
        origin = float(stream.start_time * stream.time_base) if stream.start_time is not None else (container.start_time or 0) / av.time_base
        seek = max(start_s, end_s - 1) if end_s else start_s
        container.seek(int((origin + seek) / stream.time_base), stream=stream, backward=True)
        for frame in container.decode(stream):
            time = float(frame.time) - origin if frame.time is not None else None
            if time is None or time < start_s - 1e-7:
                continue
            if end_s and time >= end_s - 1e-7:
                break
            chosen = frame
        if chosen is None:
            raise ValueError("No video frame in the selected range of '%s'; choose an earlier source end or a wider range." % source)
        width, height = legacy._decode_target_size(chosen.width, chosen.height, plan.REF_VIDEO_SHORT_EDGE,
                                                   int(plan.REF_VIDEO_SHORT_EDGE ** 2 * plan.REF_VIDEO_ASPECT_BUDGET))
        rgb = legacy._video_frame_array(chosen, width, height)
    return torch.from_numpy(rgb).unsqueeze(0)
