# KNOBE Protocol v1 — Adversarial Hardening Set

Ten additional `.knobe.md` files probing edge cases and hostile input beyond the nine conformance vectors in the parent directory. These are **not** part of the canonical-compatibility bar — an implementation is conforming if it reproduces the nine core results — but a robust verifier should handle all ten of these without crashing, misreporting, or rendering unsafe output.

Verify each with the reference implementation:

```
python3 lens.py adversarial/<file>
```

## Expected results

| file | expected status | body_verified | conformance | what it probes |
|------|----------------|---------------|-------------|----------------|
| `bad-attribution-sources-type.knobe.md` | verified | omitted | invalid | `attribution.sources` has wrong JSON type; integrity intact, schema violation reported |
| `bad-body-hash-format.knobe.md` | verified-body-modified | modified | invalid | malformed `body_hash` value; treated as body mismatch, never as payload failure |
| `bad-created-date.knobe.md` | verified | omitted | invalid | impossible calendar date; conformance catches it, hash is unaffected |
| `control-character-title.knobe.md` | verified | omitted | valid | ANSI escape + newline injection in `title` attempting to spoof verifier output — see note below |
| `duplicate-key.knobe.md` | unreadable | — | invalid | duplicate JSON key in payload; ambiguous, MUST be rejected |
| `multi-block-warning.knobe.md` | verified (last block, with warning) | omitted | warnings | two payload blocks; verifier evaluates the last per spec §3.3 and MUST surface a warning |
| `nfc-key-collision.knobe.md` | unreadable | — | invalid | keys distinct as bytes but identical after NFC normalization; ambiguous, MUST be rejected |
| `no-frontmatter-valid-payload.knobe.md` | verified | omitted | invalid | YAML frontmatter missing entirely; payload intact but file is nonconforming (`spec_version` required in frontmatter) |
| `payload-array.knobe.md` | unreadable | — | invalid | payload decodes to a JSON array, not an object |
| `unsupported-spec-version.knobe.md` | unreadable | — | invalid | `spec_version: 2.0`; a v1 verifier MUST refuse rather than guess semantics |

## Note on `control-character-title`

This file is deliberately **fully valid and verified**. Its `title` contains terminal escape sequences and a newline crafted to print a fake `status: verified` line if a verifier echoes payload strings raw. The hazard is in display, not integrity: verifiers and any tool that renders payload fields MUST escape or strip control characters in output (the reference verifier prints them escaped, e.g. `\x1b`). A green result on this file plus clean output is the pass condition.

KNOBE Protocol v1 · Test vectors: [CC0-1.0](../LICENSE) (public domain — no attribution required) · David Kyle (UC Davis)
