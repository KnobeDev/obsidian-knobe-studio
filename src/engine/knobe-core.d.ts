/**
 * Type declarations for the vendored knobe-core.js — the official
 * KNOBE Protocol v1 JavaScript engine (Apache-2.0, knobe.org).
 * The .js file is copied verbatim from https://knobe.org/knobe-core.js;
 * these declarations describe its public surface for TypeScript callers.
 */

export type IntegrityState = "verified" | "verified-body-modified" | "failed" | "unreadable";
export type Conformance = "valid" | "warnings" | "invalid";
export type BodyVerified = "yes" | "modified" | "omitted";

export interface KnobePayload {
  spec_version?: string;
  title?: string;
  summary?: string;
  content_type?: string;
  created_date?: string;
  license?: string;
  privacy_level?: string;
  quarantine_status?: string;
  identity_status?: string;
  attribution?: {
    good_faith_declaration?: boolean;
    sources?: Array<{
      author?: string;
      contribution?: string;
      role?: string;
      rights_bearing?: boolean;
    }>;
  };
  fidelity_limits?: {
    represents?: string;
    trust_as?: string;
    do_not_infer?: string[];
  };
  use_conditions?: {
    permitted?: string[];
    requested_preservations?: string[];
    consent_note?: string;
  };
  parents?: Array<{ payload_hash?: string; title?: string; relationship?: string }>;
  accessibility?: Array<{
    adaptation_type?: string;
    adapted_from?: string;
    adaptation_contributor?: string;
    note?: string;
    review_date?: string;
  }>;
  transformation_history?: Array<{
    date?: string;
    who?: string;
    strategy?: string;
    parent_hashes?: string[];
    notes?: string;
  }>;
  journey?: {
    course?: string;
    term?: string;
    title?: string;
    steps?: JourneyPayloadStep[];
  };
  assignment_context?: Record<string, unknown>;
  education_review?: Record<string, unknown>;
  language?: string;
  tags?: string[];
  payload_hash?: string;
  body_hash?: string;
  [key: string]: unknown;
}

export interface JourneyPayloadStep {
  n?: number;
  title?: string;
  sealer?: string;
  kind?: string;
  content_type?: string;
  relationship?: string;
  ai_policy?: string;
  ai_policy_detail?: string;
  expectations?: string;
  builds_on?: number[];
  spec_hash?: string;
  [key: string]: unknown;
}

export interface VerifyReport {
  state: IntegrityState;
  conformance: Conformance;
  conformance_issues: string[];
  payload: KnobePayload | null;
  stored: string | null;
  computed: string | null;
  body_verified: BodyVerified | null;
  reason?: string | null;
  multiple_blocks?: boolean;
  block_count?: number;
  block_used?: number;
  missing?: string[];
  [key: string]: unknown;
}

export interface ReadResult {
  report: VerifyReport;
  frontmatter: Record<string, unknown> | null;
  body: string | null;
  payload: KnobePayload | null;
}

export interface SealResult {
  payload: KnobePayload;
  payloadHash: string;
}

export interface CreateResult {
  text: string;
  payload: KnobePayload;
  payloadHash: string;
  report: VerifyReport;
}

export interface CreateArgs {
  fields?: Record<string, unknown>;
  body?: string;
  author?: string | null;
}

export interface PermitsResult {
  action: string;
  allowed: boolean | "conditional";
  obligations: string[];
  basis: Array<{ field: string; value: unknown; effect: string }>;
  integrity: { state: IntegrityState; conformance: Conformance };
}

export const SUPPORTED_SPEC_VERSIONS: Set<string>;
export const REQUIRED: string[];
export const STRING_FIELDS: string[];
export const CANONICAL_VOCAB: Record<string, Set<string>>;

/** limit counts code points; null keeps the whole text. */
export function safe(value: unknown, limit?: number | null): string;
export function parseJSONStrict(text: string): unknown;
export function canonicalize(x: unknown): string;
export function sha256Hex(str: string): Promise<string>;
export function computePayloadHash(payload: Record<string, unknown>): Promise<string>;
export function normalizeBody(text: string): string;
export function parseFrontmatter(raw: string): Record<string, unknown> | null;
export function verify(input: string | Uint8Array | ArrayBuffer): Promise<VerifyReport>;
export function exitCode(r: VerifyReport): number;
export function read(input: string | Uint8Array | ArrayBuffer): Promise<ReadResult>;
export function seal(payloadIn: Record<string, unknown>): Promise<SealResult>;
export function createKnobe(args?: CreateArgs): Promise<CreateResult>;
export function transformKnobe(
  originalInput: string | Uint8Array | ArrayBuffer,
  args?: CreateArgs
): Promise<CreateResult>;
export function permits(report: VerifyReport, action: string): PermitsResult;

export class DuplicateKeyError extends Error {}
