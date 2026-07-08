import { describe, expect, test } from "vitest";
import { compareVersions, decideCompanionAction } from "../src/companion-logic";

describe("compareVersions", () => {
  test("orders dotted numeric versions", () => {
    expect(compareVersions("0.2.0", "0.1.0")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.2.0")).toBeLessThan(0);
    expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
  });

  test("compares numerically, not lexically", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
  });

  test("missing segments count as zero", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.0")).toBeGreaterThan(0);
  });
});

describe("decideCompanionAction — when the bundled Instructor Studio is written", () => {
  test("fresh vault: never installed, not present → install", () => {
    expect(
      decideCompanionAction({ installedVersion: null, lastInstalledByUs: null, embeddedVersion: "0.2.0" })
    ).toBe("install");
  });

  test("user uninstalled it: absent but we installed it before → skip (respect removal)", () => {
    expect(
      decideCompanionAction({ installedVersion: null, lastInstalledByUs: "0.2.0", embeddedVersion: "0.2.0" })
    ).toBe("skip");
  });

  test("older copy present (manually installed or from an old bundle) → update", () => {
    expect(
      decideCompanionAction({ installedVersion: "0.1.0", lastInstalledByUs: null, embeddedVersion: "0.2.0" })
    ).toBe("update");
    expect(
      decideCompanionAction({ installedVersion: "0.1.0", lastInstalledByUs: "0.1.0", embeddedVersion: "0.2.0" })
    ).toBe("update");
  });

  test("same version present → skip (no rewrite churn on every startup)", () => {
    expect(
      decideCompanionAction({ installedVersion: "0.2.0", lastInstalledByUs: "0.2.0", embeddedVersion: "0.2.0" })
    ).toBe("skip");
  });

  test("newer copy present (dev build or newer release) → skip, never downgrade", () => {
    expect(
      decideCompanionAction({ installedVersion: "0.3.0", lastInstalledByUs: null, embeddedVersion: "0.2.0" })
    ).toBe("skip");
  });
});
