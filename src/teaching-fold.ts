/**
 * teaching-fold.ts — the Teaching Studio dashboard used to be a separate
 * plugin, "KNOBE Teaching Studio" (id knobe-teaching-studio): Studio 0.3.3 and
 * earlier wrote it into the vault and enabled it, and 0.3.4 offered it as a
 * separate download. From 0.4.0 it is a view inside Studio that stays off
 * until the user turns it on. Studio never touches the old plugin; it only
 * tells upgrading vaults, once, that the old copy can go. Pure, so it is
 * unit-tested without Obsidian.
 */

export interface FoldSettings {
  /** Show the Teaching Studio dashboard (ribbon button and command). Off until the user turns it on. */
  teachingStudio: boolean;
  /** True once the one-time notice about the retired plugin has been shown, or on a fresh install. */
  retiredCompanionNoticed: boolean;
}

export const FOLD_DEFAULTS: FoldSettings = {
  teachingStudio: false,
  retiredCompanionNoticed: false,
};

/** The one-time notice. It names controls by their accessible names, and when
 * the Teaching Studio is off it says how to turn it on instead of pointing at
 * a ribbon button and command that aren't there. */
export function retiredCompanionNotice(teachingOn: boolean): string {
  const open = teachingOn
    ? "Open it with the \"Open Teaching Studio dashboard\" ribbon button or command."
    : "It starts off: turn it on with the \"Turn on and open Teaching Studio\" button on the Studio dashboard, or in the KNOBE Studio (KnobeDev) settings.";
  return (
    "KNOBE Teaching Studio is now built into KNOBE Studio. " + open +
    " If the separate KNOBE Teaching Studio plugin is still installed, turn it off and uninstall it in Settings, under Community plugins."
  );
}

/**
 * Whether to show the one-time notice, from the settings Obsidian loaded
 * (null on a fresh install, which never had the separate plugin). Any vault
 * upgrading from 0.3.x may still have it: 0.3.3 and earlier installed it, and
 * 0.3.4 users may have added it by hand.
 */
export function shouldNoticeRetiredCompanion(saved: Readonly<Record<string, unknown>> | null): boolean {
  return saved !== null && saved.retiredCompanionNoticed !== true;
}
