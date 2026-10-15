"""A continuation consumes hidden source context, never another copy on the story timeline."""
import unittest

from _pack import module
from test_shot_scope_contract import plan, shot

ctx, opts = module('ng.core.context'), module('ng.core.context_options')
chunks, project = module('ng.core.chunks'), module('ng.core.project')
continuation = module('ng.core.continuation')


def video(**changes):
    return ctx.ContextItem('v','Singing','video','source.mp4',usage=('continue',),length_s=5.875,
                           options=opts.ContextOptions(video_audio='reference'),**changes)


class ContinuationPlan(unittest.TestCase):
    def test_source_context_is_hidden_and_delivered_duration_is_planned_independently(self):
        result = project.plan_project(ctx.DirectorContext(items=(video(),),project_seconds=4.25),6,chunks.ContinuityPlan())
        part = result.plan.chunks[0]
        self.assertEqual((part.continuation_id,part.head_frames,part.delivered_frames,part.sampled_frames),('v',39,102,141))
        self.assertEqual(result.compiled[0].of_kind('video'),())
        self.assertEqual([(r.start_f,r.length_f,r.trim_start_f) for r in result.compiled[0].of_kind('continue_video')],[(0,39,102)])
        self.assertNotIn('reference_disabled',{i.code for i in result.issues})
        self.assertEqual(chunks.Chunk.from_dict(part.to_dict()),part)

    def test_later_continuation_opens_its_own_part_without_carrying_previous_shot_media(self):
        other = ctx.ContextItem('old','Other subject','image','old.png',usage=('reference',))
        records = [shot('old',0,6,[('old','reference')]),shot('next',6,10,[('v','continue')])]
        result = plan(records,(other,video()),10,10,chunks.ContinuityPlan())
        selected = [(part,compiled) for part,compiled in zip(result.plan.chunks,result.compiled) if part.continuation_id]
        self.assertEqual(len(selected),1)
        part,compiled = selected[0]
        self.assertEqual(part.head_frames,39)
        self.assertEqual(compiled.of_kind('continue_video')[0].start_f,0)
        self.assertNotIn('old',{r.ctx_id for r in compiled.refs})
        self.assertEqual({s.shot_id for s in part.shots},{'next'})

    def test_short_and_selected_source_ranges_use_native_prefix_lengths(self):
        for duration,count in ((.1,1),(.3,5),(1,22),(1.625,39),(4,39)):
            item = ctx.ContextItem('v','Short','video','v.mp4',usage=('continue',),length_s=duration)
            self.assertEqual(continuation.prefix_frames(item),count)

    def test_sound_does_not_make_a_continue_clip_a_general_video_reference(self):
        self.assertFalse(video().uses_video_reference)
        self.assertTrue(ctx.ContextItem('m','Motion','video','v.mp4',usage=('motion','continue')).uses_video_reference)

    def test_original_song_offset_is_kept_with_its_own_hidden_audio_history(self):
        song = ctx.ContextItem('song','Song','audio','song.mp3',usage=('lock',),length_s=180,
                               options=opts.ContextOptions(start_s=5.875))
        result = project.plan_project(ctx.DirectorContext(items=(video(),song),project_seconds=4.25),6,chunks.ContinuityPlan())
        lock = result.compiled[0].of_kind('lock')[0]
        self.assertEqual((lock.start_f,lock.trim_start_f,lock.length_f),(0,102,141))
        self.assertEqual(lock.trim_start_f + result.plan.chunks[0].head_frames,141)

    def test_first_picture_with_separate_locked_sound_keeps_its_existing_fl2va_path(self):
        picture = ctx.ContextItem('image','First','image','first.png',usage=('first_frame',))
        song = ctx.ContextItem('song','Song','audio','song.mp3',usage=('lock',),length_s=180,
                               options=opts.ContextOptions(start_s=5.875))
        result = project.plan_project(ctx.DirectorContext(items=(picture,song),project_seconds=4.25),6,chunks.ContinuityPlan())
        part,compiled = result.plan.chunks[0],result.compiled[0]
        self.assertEqual((part.head_frames,part.continuation_id,compiled.mode),(0,'','fl2va'))
        self.assertEqual(compiled.of_kind('first_frame')[0].start_f,0)
        self.assertEqual(compiled.of_kind('lock')[0].trim_start_f,141)
        self.assertFalse(compiled.of_kind('continue_video'))

    def test_first_picture_anchors_new_footage_after_the_known_video_tail(self):
        picture = ctx.ContextItem('image','First','image','first.png',usage=('first_frame',))
        result = project.plan_project(ctx.DirectorContext(items=(video(),picture),project_seconds=4.25),6,chunks.ContinuityPlan())
        compiled = result.compiled[0]
        self.assertFalse(compiled.of_kind('first_frame'))
        self.assertEqual(compiled.of_kind('keyframe')[0].start_f,39)
        self.assertEqual(compiled.of_kind('continue_video')[0].start_f,0)
