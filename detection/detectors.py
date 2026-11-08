"""Nemotron detectors, with vendors injected at the LLM and retrieval boundaries."""

from detection.result import result_from_quotes


class NemotronDetector:
    def __init__(self, llm, pool=None):
        self.llm = llm
        self.pool = pool
        self.name = "nemotron-retrieval" if pool is not None else "nemotron-zero-shot"

    def detect(self, text):
        examples = self.pool.nearest(text) if self.pool is not None else []
        return result_from_quotes(text, self.llm.classify(text, examples))
