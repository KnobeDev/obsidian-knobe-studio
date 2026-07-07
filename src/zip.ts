/**
 * zip.ts — dependency-free, hardened ZIP reader for classroom intake (LMS
 * bulk downloads arrive as .zip). Reads text entries (.md / .knobe.md / .txt)
 * INTO MEMORY ONLY for verification — entries are never extracted to disk
 * under their archive names, which eliminates zip-slip as a write primitive.
 * Names are additionally sanitized for display, and decompression is bounded
 * so a zip bomb cannot exhaust memory.
 *
 * Threat model (students may be malicious, even by accident):
 *  - zip-slip ("../../x", absolute paths, backslashes): names are display
 *    strings only; sanitized to relative, separator-free segments.
 *  - zip bombs: per-file cap, whole-archive cap, entry-count cap, and a
 *    lying-header guard — if inflated bytes exceed the declared size, the
 *    entry is dropped, not trusted.
 *  - encrypted / exotic entries: skipped with a reason (only STORED and
 *    DEFLATE are read).
 *  - ZIP64 archives: rejected with a clear error rather than mis-parsed.
 *  - junk (__MACOSX/, .DS_Store, directories, images): skipped silently.
 *
 * Decompression uses the platform's DecompressionStream("deflate-raw")
 * (Chromium ≥103 / Node ≥21), so no third-party inflate code ships.
 */
import { TEXT_NAME_RE } from "./text-formats";

export interface ZipTextEntry {
  /** Sanitized display path (relative, forward slashes, no dot-dot). */
  path: string;
  /** Sanitized base file name (no separators). */
  name: string;
  text: string;
}

export interface ZipSkipped {
  path: string;
  reason: string;
}

export interface ZipReadResult {
  entries: ZipTextEntry[];
  skipped: ZipSkipped[];
}

export interface ZipLimits {
  maxEntries?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
}

const DEFAULTS: Required<ZipLimits> = {
  maxEntries: 2000,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
};

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** Sanitize an archive path into a safe, relative display path. */
export function sanitizeZipPath(raw: string): { path: string; name: string } {
  const segments = raw
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.replace(/[:*?"<>|]/g, "-").replace(/\.+$/g, (m) => (m === s ? "" : m)).trim())
    .filter((s) => s !== "" && s !== "." && s !== ".." && !/^\.+$/.test(s))
    .map((s) => s.replace(/\.\./g, "-"));
  const path = segments.join("/");
  const name = segments[segments.length - 1] ?? "untitled";
  return { path, name };
}

function isJunk(path: string): boolean {
  return path.startsWith("__MACOSX/") || /(^|\/)\.DS_Store$/.test(path) || /(^|\/)Thumbs\.db$/i.test(path);
}

/** Inflate raw-deflate bytes with a hard output bound; throws if exceeded. */
async function inflateBounded(comp: Uint8Array, maxOut: number): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([comp as BlobPart]).stream().pipeThrough(ds);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxOut) {
      await reader.cancel();
      throw new Error("inflated past its declared size");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  return out;
}

/**
 * Read the text entries of a ZIP archive, bounded and sanitized.
 * Throws only when the archive itself is unreadable; per-entry problems are
 * reported in `skipped` so one bad submission doesn't hide the rest.
 */
export async function readZipTextEntries(
  bytes: Uint8Array,
  limits: ZipLimits = {}
): Promise<ZipReadResult> {
  const caps = { ...DEFAULTS, ...limits };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Locate the End of Central Directory record (scan back past any comment).
  let eocd = -1;
  const scanFloor = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= scanFloor; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This file is not a readable ZIP archive (no end-of-central-directory record).");

  const totalCount = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (totalCount === 0xffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported; extract the zip and check the folder instead.");
  }

  const entries: ZipTextEntry[] = [];
  const skipped: ZipSkipped[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let totalBytes = 0;
  // Attempted work is budgeted too: an archive full of lying headers must
  // not get maxEntries × maxFileBytes of inflation attempts (CPU DoS) just
  // because each attempt ends up skipped.
  let attemptedBytes = 0;
  let pos = centralOffset;

  const count = Math.min(totalCount, caps.maxEntries);
  if (totalCount > caps.maxEntries) {
    skipped.push({ path: "(archive)", reason: "entry count exceeds the limit of " + caps.maxEntries + "; extra entries ignored" });
  }

  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== CENTRAL_SIG) {
      skipped.push({ path: "(archive)", reason: "central directory ended unexpectedly" });
      break;
    }
    const flags = view.getUint16(pos + 8, true);
    const method = view.getUint16(pos + 10, true);
    const compSize = view.getUint32(pos + 20, true);
    const uncompSize = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    // Attacker-controlled lengths: reject a record whose variable fields run
    // past the buffer instead of silently decoding a truncated name.
    if (pos + 46 + nameLen + extraLen + commentLen > bytes.length) {
      skipped.push({ path: "(archive)", reason: "corrupt central directory entry" });
      break;
    }
    const rawName = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;

    const { path, name } = sanitizeZipPath(rawName);
    if (!path || rawName.endsWith("/")) continue; // directory
    if (isJunk(rawName.replace(/\\/g, "/"))) continue;
    if (!TEXT_NAME_RE.test(name)) continue; // images and other binaries

    if ((flags & 0x0001) !== 0) {
      skipped.push({ path, reason: "encrypted entry (not extracted)" });
      continue;
    }
    if (method !== 0 && method !== 8) {
      skipped.push({ path, reason: "unsupported compression method " + method });
      continue;
    }
    if (uncompSize > caps.maxFileBytes || compSize > caps.maxFileBytes) {
      skipped.push({ path, reason: "larger than the per-file limit" });
      continue;
    }
    if (totalBytes + uncompSize > caps.maxTotalBytes) {
      skipped.push({ path, reason: "would exceed the whole-archive limit" });
      continue;
    }
    if (attemptedBytes + uncompSize > caps.maxTotalBytes * 2) {
      skipped.push({ path, reason: "archive exhausted the decompression work budget" });
      continue;
    }
    attemptedBytes += uncompSize;

    // Find the data behind the local header (central sizes are authoritative).
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_SIG) {
      skipped.push({ path, reason: "corrupt local header" });
      continue;
    }
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    if (dataStart + compSize > bytes.length) {
      skipped.push({ path, reason: "truncated entry data" });
      continue;
    }
    const comp = bytes.subarray(dataStart, dataStart + compSize);

    try {
      const data = method === 0 ? comp : await inflateBounded(comp, uncompSize);
      if (data.byteLength !== uncompSize) {
        skipped.push({ path, reason: "did not match its declared size (possible tampering)" });
        continue;
      }
      totalBytes += data.byteLength;
      entries.push({ path, name, text: new TextDecoder("utf-8", { fatal: false }).decode(data) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      skipped.push({
        path,
        reason: /declared size/.test(msg) ? "inflated past its declared size (zip-bomb guard)" : "could not decompress: " + msg,
      });
    }
  }

  return { entries, skipped };
}
