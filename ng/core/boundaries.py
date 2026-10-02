"""Move chunk boundaries so a new shot does not begin right after a join (experiment E7).

The pinned picture holds the previous action for about 2.5 s, so a shot that starts less than that after a boundary comes late. Either the
boundary moves earlier, so the held stretch ends where the shot should begin, or later, so the join falls inside the new shot. Boundaries only move in whole
17-frame steps, which keeps every chunk on the frame grid, and the total length never changes.
"""
from . import frames, limits

STEP = limits.GRID_STEP


def _candidates(boundary, shot_start):
    """Boundary shifts that fix a shot starting `shot_start - boundary` frames after it: earlier, or later, in whole steps."""
    lead = limits.LATE_CHANGE_FRAMES
    earlier = -(-(boundary - (shot_start - lead)) // STEP) * STEP
    later = -(-((shot_start + lead) - boundary) // STEP) * STEP
    return sorted((-earlier, later), key=abs)


def _fits(lengths, k, delta, head):
    low_a, high_a = frames.delivered_bounds(0 if k == 0 else head)
    low_b, high_b = frames.delivered_bounds(head)
    return low_a <= lengths[k] + delta <= high_a and low_b <= lengths[k + 1] - delta <= high_b


def align_to_shots(lengths, head, shots):
    """Returns new delivered lengths with the same total. Boundaries that are fine are left alone."""
    lengths = list(lengths)
    starts = [s.start_f for s in shots if s.start_f > 0]
    for k in range(len(lengths) - 1):
        boundary = sum(lengths[:k + 1])
        late = [t for t in starts if 0 <= t - boundary < limits.LATE_CHANGE_FRAMES]
        if not late:
            continue
        for delta in _candidates(boundary, late[0]):
            if _fits(lengths, k, delta, head):
                lengths[k] += delta
                lengths[k + 1] -= delta
                break
    return lengths
