"""Shared detector contract. Span offsets are Python Unicode code points, end exclusive."""

import math

UNCERTAIN = "Can't tell — verify by calling back on a number you already have"
TACTICS = ("authority", "urgency", "details-as-proof", "reward", "fear")


def abstain(confidence=0.0):
    return {"label": None, "scam_type": None, "red_flags": [],
            "confidence": confidence, "message": UNCERTAIN}


def result_from_quotes(text, payload):
    """Validate vendor output and anchor every flag to a verbatim transcript quote."""
    if not isinstance(payload, dict):
        return abstain()
    confidence = payload.get("confidence")
    if (isinstance(confidence, bool) or not isinstance(confidence, (int, float))
            or not math.isfinite(confidence) or not 0 <= confidence <= 1):
        return abstain()
    if confidence < 0.6:
        return abstain(confidence)
    if payload.get("label") not in ("scam", "legit"):
        return abstain()
    scam_type = payload.get("scam_type")
    if scam_type is not None and (not isinstance(scam_type, str) or not scam_type.strip()):
        return abstain()
    flags = payload.get("red_flags")
    if not isinstance(flags, list):
        return abstain()
    anchored = []
    for flag in flags:
        if not isinstance(flag, dict) or flag.get("tactic") not in TACTICS:
            return abstain()
        quote = flag.get("text")
        if not isinstance(quote, str) or not quote or quote not in text:
            return abstain()
        start = flag.get("start")
        if start is None:
            # A vendor quote must identify one occurrence. Guessing the first can
            # highlight a player's question instead of the caller's demand.
            start = text.find(quote)
            if text.find(quote, start + 1) != -1:
                return abstain()
        elif (isinstance(start, bool) or not isinstance(start, int) or start < 0
              or text[start:start + len(quote)] != quote):
            return abstain()
        anchored.append({"tactic": flag["tactic"], "span": {
            "start": start, "end": start + len(quote), "text": quote,
        }})
    return {"label": payload["label"], "scam_type": scam_type if payload["label"] == "scam" else None,
            "red_flags": anchored, "confidence": float(confidence), "message": None}
