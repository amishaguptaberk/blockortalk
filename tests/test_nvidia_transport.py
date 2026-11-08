import io
import json
import unittest
import urllib.error
import contextlib
from email.utils import formatdate

from detection.detectors import NemotronDetector
from detection.nvidia import NvidiaClient, NvidiaEmbeddings


class Clock:
    def __init__(self):
        self.now = 0.0

    def monotonic(self):
        return self.now

    def time(self):
        return 1_700_000_000 + self.now

    def sleep(self, seconds):
        self.now += seconds


def answer():
    result = {"label": "legit", "scam_type": None, "confidence": 0.9, "red_flags": []}
    return io.BytesIO(json.dumps({"choices": [{"message": {"tool_calls": [{"function": {
        "name": "classify_call", "arguments": json.dumps(result),
    }}]}}]}).encode())


class NvidiaTransportTests(unittest.TestCase):
    def test_embedding_batch_stops_at_the_first_terminal_failure(self):
        from detection.nvidia import NvidiaError
        clock = Clock()
        starts = []
        def endpoint(request, timeout):
            starts.append(clock.monotonic())
            raise urllib.error.HTTPError(request.full_url, 429, "limited", {}, io.BytesIO())
        client = NvidiaClient({"NVIDIA_API_KEY": "fake"}, clock=clock, opener=endpoint, jitter=lambda: 0)
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaisesRegex(NvidiaError, "HTTP 429"):
            NvidiaEmbeddings(client).embed([str(i) for i in range(32)], "passage")
        self.assertEqual(starts, [0, 30, 90, 210, 450, 750])

    def test_malformed_vendor_message_abstains_and_legitimate_type_is_null(self):
        for message in (None, [], "invalid", {"tool_calls": []}, {"tool_calls": [{"function": {
                "name": "classify_call", "arguments": json.dumps({"label": "legit", "scam_type": "None",
                "confidence": 0.9, "red_flags": []}),
        }}]}):
            with self.subTest(message=message):
                def endpoint(request, timeout):
                    return io.BytesIO(json.dumps({"choices": [{"message": message}]}).encode())
                client = NvidiaClient({"NVIDIA_API_KEY": "fake"}, clock=Clock(), opener=endpoint)
                result = NemotronDetector(client).detect("hello")
                self.assertIsNone(result["scam_type"])
                self.assertEqual(result["label"], "legit" if isinstance(message, dict) and message.get("tool_calls") else None)

    def test_parallel_callers_do_not_burst(self):
        from concurrent.futures import ThreadPoolExecutor
        clock = Clock()
        starts = []
        def endpoint(request, timeout):
            starts.append(clock.monotonic())
            return answer()
        client = NvidiaClient({"NVIDIA_API_KEY": "fake"}, clock=clock, opener=endpoint)
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(NemotronDetector(client).detect, ["a", "b", "c", "d"]))
        self.assertEqual([r["label"] for r in results], ["legit"] * 4)
        self.assertEqual(starts, [0, 2, 4, 6])

    def test_exhausted_retries_keep_cooldown_for_the_next_client_and_redact_errors(self):
        from detection.nvidia import NvidiaError
        clock = Clock()
        starts = []
        def unavailable(request, timeout):
            starts.append(clock.monotonic())
            raise urllib.error.HTTPError(request.full_url, 429, "private body", {}, io.BytesIO(b"private body"))
        client = NvidiaClient({"NVIDIA_API_KEY": "fake"}, clock=clock, opener=unavailable, jitter=lambda: 0)
        with self.assertRaises(NvidiaError) as error:
            NemotronDetector(client).detect("hello")
        self.assertEqual(str(error.exception), "NVIDIA /chat/completions HTTP 429")
        self.assertEqual(starts, [0, 30, 90, 210, 450, 750])
        def available(request, timeout):
            starts.append(clock.monotonic())
            return answer()
        second = NvidiaClient({"NVIDIA_API_KEY": "fake"}, clock=clock, opener=available)
        self.assertEqual(NemotronDetector(second).detect("hello")["label"], "legit")
        self.assertEqual(starts[-1], 1050)

    def test_invalid_retry_header_falls_back_to_increasing_waits_with_jitter(self):
        clock = Clock()
        starts = []
        def endpoint(request, timeout):
            starts.append(clock.monotonic())
            if len(starts) < 3:
                raise urllib.error.HTTPError(request.full_url, 429, "limited",
                                             {"Retry-After": "not a date"}, io.BytesIO())
            return answer()
        client = NvidiaClient({"NVIDIA_API_KEY": "fake"}, clock=clock, opener=endpoint, jitter=lambda: 1)
        self.assertEqual(NemotronDetector(client).detect("hello")["label"], "legit")
        self.assertEqual(starts, [0, 37.5, 112.5])

    def test_permanent_errors_are_not_retried_and_invalid_budgets_are_rejected(self):
        from detection.nvidia import NvidiaError
        for value in ("0", "-1", "nan", "inf", "invalid"):
            with self.subTest(rpm=value), self.assertRaises(ValueError):
                NvidiaClient({"NVIDIA_API_KEY": "fake", "NVIDIA_DETECTOR_RPM": value})
        clock = Clock()
        starts = []
        def endpoint(request, timeout):
            starts.append(clock.monotonic())
            raise urllib.error.HTTPError(request.full_url, 401, "private", {}, io.BytesIO())
        client = NvidiaClient({"NVIDIA_API_KEY": "fake"}, clock=clock, opener=endpoint)
        with self.assertRaisesRegex(NvidiaError, "HTTP 401"):
            NemotronDetector(client).detect("hello")
        self.assertEqual(starts, [0])

    def test_a_second_client_can_lower_the_budget_without_an_early_request(self):
        clock = Clock()
        starts = []
        def endpoint(request, timeout):
            starts.append(clock.monotonic())
            return answer()
        first = NvidiaClient({"NVIDIA_API_KEY": "fake"}, clock=clock, opener=endpoint)
        NemotronDetector(first).detect("first")
        second = NvidiaClient({"NVIDIA_API_KEY": "fake", "NVIDIA_DETECTOR_RPM": "10"},
                              clock=clock, opener=endpoint)
        NemotronDetector(second).detect("second")
        self.assertEqual(starts, [0, 6])

    def test_retry_after_accepts_http_dates_and_fractional_seconds(self):
        for header in ("90.5", formatdate(1_700_000_090, usegmt=True)):
            with self.subTest(header=header):
                clock = Clock()
                starts = []

                def endpoint(request, timeout):
                    starts.append(clock.monotonic())
                    if len(starts) == 1:
                        raise urllib.error.HTTPError(request.full_url, 503, "unavailable",
                                                     {"Retry-After": header}, io.BytesIO())
                    return answer()

                client = NvidiaClient({"NVIDIA_API_KEY": "fake"}, clock=clock,
                                      opener=endpoint, jitter=lambda: 0)
                self.assertEqual(NemotronDetector(client).detect("hello")["label"], "legit")
                self.assertEqual(starts, [0, 90.5 if header == "90.5" else 90])

    def test_chat_and_embeddings_share_request_pacing_across_clients(self):
        clock = Clock()
        starts = []

        def endpoint(request, timeout):
            starts.append(clock.monotonic())
            if request.full_url.endswith("/embeddings"):
                return io.BytesIO(json.dumps({"data": [{"index": 0, "embedding": [1.0] * 1024}]}).encode())
            return answer()

        first = NvidiaClient({"NVIDIA_API_KEY": "fake"}, clock=clock, opener=endpoint)
        second = NvidiaClient({"NVIDIA_API_KEY": "fake"}, clock=clock, opener=endpoint)
        self.assertEqual(NemotronDetector(first).detect("first")["label"], "legit")
        self.assertEqual(len(NvidiaEmbeddings(second).embed(["query"], "query")[0]), 1024)
        self.assertEqual(NemotronDetector(second).detect("third")["label"], "legit")
        self.assertEqual(starts, [0, 2, 4])

    def test_retry_after_longer_than_thirty_seconds_is_honored(self):
        clock = Clock()
        starts = []

        def endpoint(request, timeout):
            starts.append(clock.monotonic())
            if len(starts) == 1:
                raise urllib.error.HTTPError(request.full_url, 429, "limited",
                                             {"Retry-After": "90"}, io.BytesIO(b"private body"))
            return answer()

        client = NvidiaClient({"NVIDIA_API_KEY": "fake"}, clock=clock, opener=endpoint, jitter=lambda: 0)
        self.assertEqual(NemotronDetector(client).detect("We will not ask for a code.")["label"], "legit")
        self.assertEqual(starts, [0, 90])


if __name__ == "__main__":
    unittest.main()
