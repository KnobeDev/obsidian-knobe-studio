/**
 * Behaviors the vendored engine gained upstream after the 25 vectors were
 * written (knobe-protocol f5a463c, 1f398e7, 657745e, 9a0df2c). The drift
 * guard proves the bytes match; these prove the plugin sees the behavior.
 * Strings are built from code points so no escape is rewritten in transit.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { safe, verify } from "../src/engine/knobe-core.js";

const BACKSLASH = String.fromCharCode(0x5c);
const NBSP = String.fromCharCode(0xa0);
const LONE_SURROGATE = String.fromCharCode(0xd800);
const GRIN = String.fromCodePoint(0x1f600);

const minimalValid = (): string =>
  readFileSync(join(__dirname, "vectors", "minimal-valid.knobe.md"), "utf-8");

/** A KNOBE whose block encodes exactly this JSON text. */
const knobeOf = (json: string): string =>
  "# Test\n\n-----BEGIN KNOBE B64-----\n"
  + Buffer.from(json, "utf-8").toString("base64")
  + "\n-----END KNOBE B64-----\n";

const REQUIRED_FIELDS =
  '"attribution":{"sources":[{"author":"Vitest","contribution":"test"}]},'
  + '"content_type":"original","created_date":"2026-11-05","license":"CC BY 4.0",'
  + '"privacy_level":"public","quarantine_status":"quarantine","spec_version":"1.0",'
  + '"summary":"s","title":"t"';

describe("verify() after the upstream engine fixes", () => {
  test("an overflowing number is reported unreadable instead of throwing", async () => {
    const report = await verify(knobeOf("{" + REQUIRED_FIELDS + ',"n":1e400}'));
    expect(report.state).toBe("unreadable");
  });

  test("a lone surrogate escape is rejected with a reason that names it", async () => {
    const escaped = BACKSLASH + "ud800";
    const report = await verify(knobeOf("{" + REQUIRED_FIELDS + ',"note":"' + escaped + '"}'));
    expect(report.state).toBe("unreadable");
    expect(report.reason).toContain("unpaired surrogate");
  });

  test("non-ASCII whitespace inside the base64 block makes it unreadable", async () => {
    const text = minimalValid().replace("eyJhdHRy", "eyJh" + NBSP + "dHRy");
    expect((await verify(text)).state).toBe("unreadable");
  });

  test("ASCII spaces and tabs inside the base64 block are still ignored", async () => {
    const text = minimalValid().replace("eyJhdHRy", "eyJh \tdHRy");
    expect((await verify(text)).state).toBe("verified");
  });

  test("a null payload_hash is reported as stored null, not as empty", async () => {
    const report = await verify(knobeOf("{" + REQUIRED_FIELDS + ',"payload_hash":null}'));
    expect(report.state).toBe("failed");
    expect(report.stored).toBeNull();
  });
});

describe("safe() display escaping", () => {
  test("a lone surrogate is shown as its escape", () => {
    expect(safe("a" + LONE_SURROGATE + "b")).toBe("a" + BACKSLASH + "ud800b");
  });

  test("the limit counts code points, so astral characters are not split", () => {
    expect(safe(GRIN.repeat(3), 2)).toBe(GRIN + GRIN + "…");
  });

  test("a null limit keeps the whole text", () => {
    const long = "x".repeat(400);
    expect(safe(long, null)).toBe(long);
  });

  test("BigInts render as digits, alone or inside an object", () => {
    expect(safe(12345678901234567890n)).toBe("12345678901234567890");
    expect(safe({ n: 1n })).toBe('{"n":"1"}');
  });

  test("a prototype-less object that cannot be serialized never throws", () => {
    // The cycle makes JSON.stringify throw; the missing prototype is what
    // made the old String() fallback throw too. Both are needed.
    const cyclic = Object.create(null) as Record<string, unknown>;
    cyclic.self = cyclic;
    expect(safe(cyclic)).toBe("[object Object]");
  });
});
