import itertools
from types import SimpleNamespace

from isnad_worker.pipeline import transcribe
from isnad_worker.pipeline.transcribe import Word


def interaction(words: list[tuple[str, str, str, str]]) -> SimpleNamespace:
    """A transcription answer: (text, speaker, start, end) word annotations."""
    notes = [
        SimpleNamespace(type="word_info", text=t, speaker=s, start_offset=a, end_offset=b)
        for t, s, a, b in words
    ]
    content = SimpleNamespace(type="text", text=" ".join(w[0] for w in words), annotations=notes)
    return SimpleNamespace(steps=[SimpleNamespace(type="model_output", content=[content])])


def test_short_recordings_are_one_part():
    assert transcribe.cut_points(10 * 60_000, []) == [0, 10 * 60_000]


def test_long_recordings_are_cut_in_the_middle_of_a_pause_before_the_limit():
    limit = transcribe.MAX_PART_MS
    quiet = [
        (limit - 200_000, limit - 199_000),
        (limit - 40_000, limit - 39_000),
        (limit + 5_000, limit + 6_000),
    ]
    points = transcribe.cut_points(2 * limit + 60_000, quiet)
    assert points[1] == limit - 39_500  # the last pause inside the window, not one past the limit
    assert points[-1] == 2 * limit + 60_000
    assert all(b - a <= limit for a, b in itertools.pairwise(points))


def test_without_a_pause_the_cut_falls_on_the_limit():
    assert transcribe.cut_points(transcribe.MAX_PART_MS + 1, [])[1] == transcribe.MAX_PART_MS


def test_words_carry_timings_shifted_onto_the_whole_recording():
    words = transcribe.words_of(
        interaction([("استقبلت", "spk:0", "0s", "0.800s"), ("دبي", "spk:0", "0.800s", "1.300s")]),
        shift_ms=60_000,
    )
    assert [(w.text, w.start_ms, w.end_ms) for w in words] == [
        ("استقبلت", 60_000, 60_800),
        ("دبي", 60_800, 61_300),
    ]


def test_word_times_keep_reading_order_and_stay_inside_their_part():
    words = transcribe.words_of(
        interaction(
            [
                ("أ", "spk:0", "1s", "2s"),
                ("ب", "spk:0", "0.500s", "0.900s"),  # a timestamp that goes backwards
                ("ج", "spk:0", "9.900s", "12s"),  # runs past the end of the part
            ]
        ),
        shift_ms=600_000,
        length_ms=10_000,
    )
    assert [w.text for w in words] == ["أ", "ب", "ج"]
    assert [w.start_ms for w in words] == [601_000, 601_000, 609_900]
    assert words[-1].end_ms == 610_000


def test_one_voice_gets_no_speaker_labels_and_several_get_numbers():
    single = [Word("a", 0, 1, speaker="spk:0"), Word("b", 1, 2, speaker="spk:0")]
    transcribe._speaker_labels(single)
    assert [w.speaker for w in single] == [None, None]
    several = [Word("a", 0, 1, speaker="spk:1"), Word("b", 1, 2, speaker="spk:0")]
    transcribe._speaker_labels(several)
    assert [w.speaker for w in several] == ["S1", "S2"]


def test_segments_end_at_sentences_speaker_changes_and_long_pauses():
    words = [
        Word("نما", 0, 1000),
        Word("الاقتصاد", 1000, 2500),
        Word("3.8%.", 2500, 4500),  # sentence end after 4.5 s
        Word("وشكلت", 4600, 5200),
        Word("القطاعات", 5200, 6000),
        Word("نعم", 6100, 6500, speaker="S2"),  # another voice
        Word("بعد", 9000, 9500, speaker="S2"),  # a long pause
    ]
    segments = transcribe.segments_from_words(words)
    assert [s.text for s in segments] == ["نما الاقتصاد 3.8%.", "وشكلت القطاعات", "نعم", "بعد"]
    assert (segments[0].start_ms, segments[0].end_ms) == (0, 4500)
    assert segments[2].speaker == "S2"


def test_short_sentences_stay_together():
    words = [Word("مساء", 0, 600), Word("الخير.", 600, 1300), Word("ونبدأ", 1500, 2100)]
    assert [s.text for s in transcribe.segments_from_words(words)] == ["مساء الخير. ونبدأ"]


class Refused(Exception):
    status_code = 400


class Dropped(Exception):
    pass


def test_parts_are_retried_after_a_dropped_connection(monkeypatch):
    monkeypatch.setattr(transcribe.time, "sleep", lambda s: None)
    calls = []

    def part():
        calls.append(1)
        if len(calls) < 2:
            raise Dropped("Server disconnected without sending a response.")
        return ["ok"]

    assert transcribe._with_retries(part) == ["ok"]
    assert len(calls) == 2


def test_a_rejected_request_fails_at_once():
    import pytest

    from isnad_worker.jobs import PermanentError

    calls = []

    def part():
        calls.append(1)
        raise Refused("API key not valid")

    with pytest.raises(PermanentError):
        transcribe._with_retries(part)
    assert len(calls) == 1
