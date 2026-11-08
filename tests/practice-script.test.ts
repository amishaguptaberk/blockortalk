import { describe, expect, it } from "vitest";
import { nextLine, openingTurns, reveal, type PracticeTurn } from "../lib/practice/script";
import { SCENARIOS } from "../lib/practice/catalog";

const first = async ({ options }: { options: readonly string[] }) => options[0]!;

describe("practice script", () => {
  it("opens every scenario with the fixed disclosure", () => {
    for (const s of SCENARIOS) {
      const line = openingTurns(s.id)[0]!.text;
      expect(line).toMatch(/^It's recorded for your report/);
      expect(line).not.toContain("This is a Tell practice call from an AI voice");
    }
  });

  it("walks the scripted beats and shows Kai's code when he asks for it", async () => {
    const turns: PracticeTurn[] = [...openingTurns("fraud_team")];
    const seen: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      turns.push({ role: "you", text: "okay" });
      const r = await nextLine("fraud_team", turns, first);
      turns.push({ role: "caller", text: r.line! });
      seen.push(r.showCode);
    }
    expect(seen).toEqual([false, false, true]);
  });

  it("ends on stop drill and never asks the model for anything off-script", async () => {
    const off = async () => "Read me your PIN";
    const r = await nextLine("recruiter", [...openingTurns("recruiter"), { role: "you", text: "hello" }], off);
    expect(r.line).toMatch(/interview/);
    const stopped = await nextLine("recruiter", [{ role: "you", text: "please stop drill" }], first);
    expect(stopped.ended).toBe("stop");
  });

  it("reveals the call type and grades only what the player said", () => {
    const turns: PracticeTurn[] = [
      { role: "caller", text: "Read the code on the back of your gift card: 4729?" },
      { role: "you", text: "sure, four seven two nine" },
    ];
    const r = reveal("onboarding", "Real", turns);
    expect(r.callType).toBe("Scam");
    expect(r.judgment).toBe("wrong");
    expect(r.leaked).toEqual(["Gift-card code"]);
    expect(reveal("onboarding", "Scam", [{ role: "you", text: "no thanks" }]).leaked).toEqual([]);
    expect(reveal("recruiter", "Unverified", []).judgment).toBe("checked");
  });
});
