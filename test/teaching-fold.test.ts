import { describe, expect, test } from "vitest";
import {
  FOLD_DEFAULTS,
  retiredCompanionNotice,
  shouldNoticeRetiredCompanion,
} from "../src/teaching-fold";

describe("Teaching Studio setting", () => {
  test("starts off, so turning the guide on is the user's choice", () => {
    expect(FOLD_DEFAULTS.teachingStudio).toBe(false);
  });
});

describe("the one-time notice about the retired Teaching Studio plugin", () => {
  test("never shows on a fresh install, which never had the separate plugin", () => {
    // Arrange: Obsidian's loadData() returns null when the plugin has saved nothing
    const saved = null;

    // Act
    const show = shouldNoticeRetiredCompanion(saved);

    // Assert
    expect(show).toBe(false);
  });

  test("shows in any vault upgrading from 0.3.x, which may have the separate plugin", () => {
    expect(shouldNoticeRetiredCompanion({})).toBe(true);
    expect(shouldNoticeRetiredCompanion({ companionInstalledVersion: "0.3.2", demoMode: false })).toBe(true);
  });

  test("shows only once", () => {
    expect(shouldNoticeRetiredCompanion({ retiredCompanionNoticed: true })).toBe(false);
  });

  test("tells people what changed and where to uninstall the old plugin", () => {
    for (const on of [true, false]) {
      const text = retiredCompanionNotice(on);
      expect(text).toContain("built into KNOBE Studio");
      expect(text).toContain("turn it off and uninstall it in Settings, under Community plugins");
    }
  });

  test("points at the controls by name when the Teaching Studio is on", () => {
    expect(retiredCompanionNotice(true)).toContain('"Open Teaching Studio dashboard" ribbon button or command');
  });

  test("says it starts off and how to turn it on, without naming missing controls, when it is off", () => {
    const text = retiredCompanionNotice(false);
    expect(text).toContain("starts off");
    expect(text).toContain('"Turn on and open Teaching Studio" button on the Studio dashboard');
    expect(text).not.toContain("ribbon");
  });
});
