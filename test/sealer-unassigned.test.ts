/**
 * The vendored sealer refuses payload text containing a code point that is
 * unassigned in the engine's own Unicode tables (knobe-protocol #33, landed
 * upstream in #34). NFC of such a character can change in a later Unicode
 * version, so verifiers could disagree about the seal. Every Seal button in
 * the plugin goes through createKnobe or transformKnobe, which reach the same
 * check through seal(). Strings are built from code points so no escape is
 * rewritten in transit.
 */
import { describe, expect, test } from "vitest";
import { createKnobe, seal, transformKnobe, verify } from "../src/engine/knobe-core.js";

// U+0378 is unassigned in every Unicode version to date.
const UNASSIGNED = String.fromCodePoint(0x378);
const E_ACUTE = String.fromCodePoint(0xe9);
const GRIN = String.fromCodePoint(0x1f600);
const CJK = String.fromCodePoint(0x6f22, 0x5b57);
const REFUSAL = /U\+0378, a character this software's Unicode version does not recognize/;

const fieldsWith = (title: string) => ({
  title,
  summary: "A sealed object created in a test.",
  created_date: "2026-11-08",
});

describe("sealer refuses code points unassigned in its Unicode tables", () => {
  test.each([
    ["a string value", { title: "x" + UNASSIGNED }],
    ["a key", { ["k" + UNASSIGNED]: "v" }],
    ["an array element", { tags: ["x" + UNASSIGNED] }],
    ["a nested object's key", { meta: { ["k" + UNASSIGNED]: "v" } }],
  ])("seal() refuses one in %s, naming the code point", async (_where, extra) => {
    await expect(seal({ spec_version: "1.0", ...extra })).rejects.toThrow(REFUSAL);
  });

  test("createKnobe refuses a title containing one (Create and Adapt panels)", async () => {
    await expect(
      createKnobe({ fields: fieldsWith("Draft " + UNASSIGNED), body: "Body.", author: "Vitest" })
    ).rejects.toThrow(REFUSAL);
  });

  test("transformKnobe refuses one in the derivative's fields (Transform panel)", async () => {
    const original = await createKnobe({ fields: fieldsWith("Parent"), body: "Source.", author: "Vitest" });
    await expect(
      transformKnobe(original.text, { fields: fieldsWith("Child " + UNASSIGNED), body: "Derived.", author: "Vitest" })
    ).rejects.toThrow(REFUSAL);
  });

  test("assigned text still seals and verifies: accented Latin, emoji and CJK", async () => {
    const r = await createKnobe({ fields: fieldsWith("Caf" + E_ACUTE + " " + GRIN + " " + CJK), body: "Body.", author: "Vitest" });
    const report = await verify(r.text);
    expect(report.state).toBe("verified");
    expect(report.body_verified).toBe("yes");
  });

  test("the body is not checked: it is hashed without Unicode normalization", async () => {
    const r = await createKnobe({ fields: fieldsWith("Plain title"), body: "Body " + UNASSIGNED + ".", author: "Vitest" });
    expect((await verify(r.text)).state).toBe("verified");
  });
});
