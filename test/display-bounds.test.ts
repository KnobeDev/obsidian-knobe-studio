/**
 * shown() must cost O(limit), not O(text): a hostile file can hold a 10 MB
 * title of control characters, each of which safe() expands to four
 * characters. The engine's safe() is wrapped to record what it is handed.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const seen: number[] = [];

vi.mock("../src/engine/knobe-core", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/engine/knobe-core")>();
  return {
    ...real,
    safe: (value: unknown, limit?: number | null) => {
      if (typeof value === "string") seen.push(Array.from(value).length);
      return real.safe(value, limit);
    },
  };
});

const { shown } = await import("../src/display");

describe("shown() on very long text", () => {
  beforeEach(() => {
    seen.length = 0;
  });

  test("escapes at most limit + 1 code points of a long string", () => {
    // Arrange
    const huge = "\u0001".repeat(1_000_000);

    // Act
    const out = shown(huge, 300);

    // Assert
    expect(Math.max(...seen)).toBeLessThanOrEqual(301);
    expect(out).toBe("\\x01".repeat(75) + "\u2026");
  });

  test("bounds the escaped JSON text of a long non-string value too", () => {
    const out = shown({ t: "\u202e".repeat(100_000) }, 20);
    expect(Math.max(...seen)).toBeLessThanOrEqual(21);
    expect(out).toBe('{"t":"\\u202e\\u202e\u2026');
  });

  test("a string exactly at the limit is shown whole, without an ellipsis", () => {
    expect(shown("x".repeat(300), 300)).toBe("x".repeat(300));
    expect(shown("x".repeat(301), 300)).toBe("x".repeat(300) + "\u2026");
  });

  test("a lone surrogate at the cut is dropped, not split mid-escape", () => {
    const lone = "ab" + String.fromCharCode(0xd800) + "cd";
    expect(shown(lone, 3)).toBe("ab" + String.fromCodePoint(0x2026));
    expect(shown(lone, 8)).toBe("ab\\ud800" + String.fromCodePoint(0x2026));
  });

  test("a surrogate pair at the cut is kept whole or dropped whole", () => {
    expect(shown("ab\u{1f600}cd", 3)).toBe("ab\u{1f600}\u2026");
    expect(shown("ab\u{1f600}", 3)).toBe("ab\u{1f600}");
  });
});
