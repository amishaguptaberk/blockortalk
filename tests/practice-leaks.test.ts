import { describe, expect, it } from "vitest";
import { leakedSecrets, soundsSafe } from "../lib/practice/leaks";

const SECRETS = [
  { label: "Gift-card code", value: "4729" },
  { label: "Date of birth", value: "March 14, 1991" },
  { label: "Home address", value: "418 Pecan Hollow Drive, Plano, Texas" },
  { label: "one-time code", value: "551 274" },
];

describe("practice leak check", () => {
  it("catches secrets however they are said", () => {
    expect(leakedSecrets("sure, it's four seven two nine", SECRETS)).toEqual(["Gift-card code"]);
    expect(leakedSecrets("I was born march fourteenth 1991", SECRETS)).toEqual(["Date of birth"]);
    expect(leakedSecrets("418 pecan hollow", SECRETS)).toEqual(["Home address"]);
    expect(leakedSecrets("the code is 551-274", SECRETS)).toEqual(["one-time code"]);
  });

  it("does not flag safe replies", () => {
    expect(leakedSecrets("I don't share codes, I'll call back on the number in my app", SECRETS)).toEqual([]);
  });

  it("recognizes a safe action", () => {
    for (const said of ["I'll call Nimbus back on the number in my app", "I'm hanging up now", "I don't share codes", "no thanks"]) {
      expect(soundsSafe(said), said).toBe(true);
    }
    expect(soundsSafe("okay, what do you need?")).toBe(false);
  });
});
