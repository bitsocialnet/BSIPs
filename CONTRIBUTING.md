# Contributing to BSIPs

Thank you for helping specify the Bitsocial protocol. Please read
[BSIP-1](./BSIPS/bsip-1.md) first — it defines what a BSIP is, the types and categories, and the
full process. This file is the short, practical version.

## Before you write

1. **Vet the idea.** Open an [issue](https://github.com/bitsocialnet/BSIPs/issues) describing the
   problem and your proposed direction. Gauge interest and surface prior art before investing in a
   full draft. A change to a single client usually does not need a BSIP; a change that affects
   multiple implementations does.
2. **Keep it focused.** One BSIP should contain one key proposal.
3. **Pick the right type and category.** See the tables in [BSIP-1](./BSIPS/bsip-1.md) and the
   [README](./README.md). Remember BSIPs cover the *decentralized* protocol — not centralized
   products built on top of it.

## Writing the draft

1. Copy [`bsip-template.md`](./bsip-template.md).
2. Fill in the preamble. Leave the `bsip` number blank — an editor assigns it. Set `status: Draft`
   and point `discussions-to` at your issue or discussion thread.
3. Write the body. Include the **Specification** and **Security Considerations** sections; a BSIP
   cannot reach Final without the latter. Use concrete field names and examples that match the real
   wire format, and follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) keyword conventions.
4. Name the file `bsip-draft_<short_title>.md` (for example `bsip-draft_tipping.md`) until a number
   is assigned. Put any images or large test vectors in `assets/bsip-<n>/`.

## Submitting

1. Open a pull request adding your file.
2. Make sure your GitHub username or public email appears in the `author` header, in parentheses or
   angle brackets, so authorship can be verified.
3. An editor will review for soundness, completeness, and formatting, assign a number, and merge the
   Draft. Editorial review is about whether the BSIP is *well-formed*, not whether the idea is good —
   that is what the discussion and the Review stage are for.

## Updating an existing BSIP

- **Draft / Review** BSIPs can be updated freely by their authors via pull request.
- **Final** BSIPs may only change to fix errata or add non-normative clarifications.
- Status changes follow the lifecycle in [BSIP-1](./BSIPS/bsip-1.md).

## Style

- Markdown, wrapped at a reasonable width, American English spelling.
- Use relative links between BSIPs, e.g. `[BSIP-2](./bsip-2.md)`.
- Prefer inline examples (JSON/CBOR) over external links.
- Every BSIP ends with the exact copyright waiver:
  `Copyright and related rights waived via [CC0](../LICENSE.md).`

## BSIP Editors

Editors handle numbering, formatting review, and merges:

- Tommaso Casaburi (@tomcasaburi)

To propose adding or removing an editor, open a Meta BSIP or an issue.

## License

By contributing, you agree that your work is released into the public domain under
[CC0 1.0 Universal](./LICENSE.md).
