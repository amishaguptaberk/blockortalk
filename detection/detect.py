"""Production retrieval detector: read a transcript from stdin and emit the shared JSON result."""

import json
import sys

from detection.corpus import load_real_corpus
from detection.runtime import open_detectors


def main():
    text = sys.stdin.read()
    if not text.strip():
        print("A transcript on stdin is required", file=sys.stderr)
        return 1
    with open_detectors(load_real_corpus()) as detectors:
        print(json.dumps(detectors[-1].detect(text)))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Detection failed ({type(error).__name__}); check pool indexing, environment and endpoints.",
              file=sys.stderr)
        raise SystemExit(1)
