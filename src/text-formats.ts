/**
 * text-formats.ts — which files KNOBE Studio can read directly.
 *
 * KNOBE seals and verifies UTF-8 TEXT: the engine hashes the text of a note.
 * So any text-based document format works as-is — Markdown (Notion, Obsidian,
 * general), LaTeX source (Overleaf .tex), HTML exports, plain text, CSV, and
 * lightweight-markup formats. These need no conversion; you can seal them and
 * a cohort check will read them (an unsealed one shows as "unreadable", which
 * is the correct signal that a submission was never sealed).
 *
 * BINARY documents (.docx, .pdf, .pptx, .odt, images) are NOT text and cannot
 * be sealed directly — their bytes aren't the human-readable content. Those
 * require a conversion step to Markdown/text first (Pandoc, LibreOffice, and
 * similar), which is deliberately outside this plugin: KNOBE is a text
 * integrity tool, not a document converter.
 */

/** Text/document extensions KNOBE can read directly (no conversion needed). */
export const TEXT_NAME_RE = /\.(md|markdown|mdx|knobe|txt|text|tex|latex|html?|org|rst|adoc|asciidoc|csv|tsv|json|ya?ml|bib)$/i;

export function isTextName(name: string): boolean {
  return TEXT_NAME_RE.test(name);
}

/** Common binary document types, recognized only to explain why they're skipped. */
export const BINARY_DOC_RE = /\.(docx?|pptx?|xlsx?|odt|odp|ods|pdf|pages|key|rtf|epub|png|jpe?g|gif|webp|tiff?|heic|zip|gz|tar)$/i;

export function conversionHintFor(name: string): string | null {
  return BINARY_DOC_RE.test(name)
    ? "binary document — convert to Markdown or text first (e.g. Pandoc/LibreOffice), then seal"
    : null;
}
