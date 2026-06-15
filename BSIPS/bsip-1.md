---
bsip: 1
title: BSIP Purpose and Guidelines
description: Defines what a Bitsocial Improvement Proposal is, the proposal types and categories, and the process by which BSIPs are proposed, reviewed, and finalized.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Living
type: Meta
created: 2026-06-15
---

## What is a BSIP?

BSIP stands for **Bitsocial Improvement Proposal**. A BSIP is a design document that specifies a
part of the **Bitsocial protocol** — the open, decentralized protocol for serverless social media —
or a process around it. A BSIP should provide a concise technical specification and a rationale. The
BSIP author is responsible for building consensus within the community and documenting dissenting
opinions.

Because BSIPs are maintained as text files in a versioned repository, their revision history is the
historical record of each proposal.

## What is the Bitsocial protocol?

The Bitsocial protocol is the set of rules that independent Bitsocial clients, nodes, and services
share so they can interoperate without a central platform. It is intentionally broad: over time it
spans the peer-to-peer social core, the networking layer, developer-facing interfaces, the Bitsocial
Network appchain and its economic primitives, and the conventions applications agree on.

Today, much of the protocol is realized on top of
[PKC (Public Key Communities)](https://github.com/pkcprotocol/pkc-js), a deliberately barebones
peer-to-peer building block. PKC is an internal layer the protocol currently builds on; it is **not**
itself the Bitsocial protocol. BSIPs already describe behavior beyond PKC — for example `.bso` name
resolution, tipping, and pubsub voting — and the protocol is expected to grow well past PKC. When a
BSIP specifies behavior currently implemented through PKC, it should say so, but it specifies the
Bitsocial protocol, not PKC.

Centralized products built *on top of* Bitsocial are out of scope. A hosted RPC provider, a managed
build service such as Bitsocial Forge, or any swappable operator product is not the subject of a
BSIP. BSIPs describe what independent implementations must share.

## BSIP Rationale

BSIPs are the primary mechanism for proposing new features, collecting community input on an issue,
and documenting the design decisions that have gone into Bitsocial. They give implementers a way to
track which parts of the protocol exist, are proposed, or are final, so users can tell what a given
client or library actually supports.

## BSIP Types

There are three types of BSIP:

- A **Standards Track BSIP** describes any change that affects interoperability between independent
  Bitsocial implementations: a change to a data format or its validation, the networking layer, a
  shared developer interface, the appchain, or an application-level convention multiple clients rely
  on. Standards Track BSIPs are further divided into categories:

  - **Core**: the interoperability rules of the protocol itself — data formats and validation for
    communities, comments, votes, and comment updates; signatures; the anti-spam challenge exchange;
    and addressing. A client cannot interoperate without implementing the relevant Core BSIPs.
  - **Networking**: peer discovery and transport — HTTP routers, libp2p gossipsub pubsub, content
    transfer, and browser peer-to-peer.
  - **Interface**: developer-facing interfaces shared across clients — the RPC protocol and client
    SDK conventions.
  - **Appchain**: the Bitsocial Network (L2/appchain) economic layer — `.bso` naming, the token,
    tipping, awards, and on-chain standards.
  - **Application**: conventions that independent clients agree on above the protocol — anti-spam
    challenge interfaces, profile and identity schemas, community list formats, and media or link
    handling.

- A **Meta BSIP** describes a process around Bitsocial, or proposes a change to a process. Meta BSIPs
  apply to areas other than the protocol itself; they often require community consensus and, unlike
  Informational BSIPs, users are typically not free to ignore them. This document is a Meta BSIP.

- An **Informational BSIP** describes a Bitsocial design issue, or provides general guidelines or
  information, but does not propose a new feature. Informational BSIPs do not necessarily represent
  consensus, and implementers are free to ignore them.

A BSIP should contain a single key proposal or idea. The more focused the BSIP, the more successful
it tends to be. A change to one client does not need a BSIP; a change that affects multiple
implementations, or defines a standard for multiple apps, does.

A BSIP must be a clear and complete description of the proposed enhancement, must represent a net
improvement, and — where it includes an implementation — that implementation must be sound and must
not complicate the protocol unduly.

## BSIP Workflow

### Shepherding a BSIP

The parties involved are the *BSIP author* (you, the champion), the *BSIP editors*, and the wider
community of implementers and community operators.

Before writing a formal BSIP, vet the idea. Ask the community first to avoid spending effort on
something that will be rejected on prior grounds, and to gauge whether interest is commensurate with
the work involved and the number of parties who would have to conform to it. Open a discussion (a
GitHub issue in this repository, or another channel the community uses) and link it from the BSIP's
`discussions-to` header. Your role as champion is to write the BSIP in the style below, shepherd the
discussion, and build rough consensus around the idea.

For Core BSIPs, interoperability matters most: you will generally need either a reference
implementation or commitments from client and node maintainers to implement the change, before it can
become Final.

### BSIP Process

The following is the standardization process for all BSIPs:

- **Idea** — A pre-draft idea. Not tracked in this repository.
- **Draft** — The first formally tracked stage. A BSIP is merged by an editor into the repository
  once it is properly formatted.
- **Review** — The author marks the BSIP as ready for and requesting peer review.
- **Last Call** — The final review window before `Final`. The author opens a pull request setting a
  review end date (`last-call-deadline`), typically 14 days later. Necessary normative changes during
  this window send the BSIP back to `Review`.
- **Final** — The BSIP is a finished standard. It should only change to correct errata or add
  non-normative clarifications.
- **Stagnant** — Any BSIP in `Draft`, `Review`, or `Last Call` that is inactive for six months or
  more may be moved to `Stagnant`. It can be resurrected by an author or editor.
- **Withdrawn** — The author(s) have withdrawn the BSIP. This is final; the number is not reused. A
  later revival is considered a new proposal.
- **Living** — A special status for BSIPs designed to be continually updated and never reach
  finality, most notably this document, BSIP-1.

## What belongs in a successful BSIP?

Each BSIP should have the following parts:

- **Preamble** — The front-matter headers described below.
- **Abstract** — A short, multi-sentence technical summary. A reader should grasp the gist from the
  abstract alone.
- **Motivation** *(optional)* — Why the existing protocol is inadequate to address the problem. May
  be omitted if the motivation is evident.
- **Specification** — The technical specification, detailed enough that competing, interoperable
  implementations can be written from it.
- **Rationale** — Why these design decisions were made, what alternatives were considered, and the
  important objections raised in discussion.
- **Backwards Compatibility** *(optional)* — Any incompatibilities introduced, their severity, and
  how they are handled. Required when incompatibilities exist.
- **Reference Implementation** *(optional)* — A minimal implementation that aids understanding.
- **Security Considerations** — The security and abuse implications of the proposal. A BSIP cannot
  reach Final without a Security Considerations section the editors consider sufficient.
- **Copyright Waiver** — All BSIPs must be in the public domain. Include the exact wording:
  `Copyright and related rights waived via [CC0](../LICENSE.md).`

BSIPs should be written in [Markdown](https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet)
using [`bsip-template.md`](../bsip-template.md). It is recommended that specifications follow
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) for requirement keywords.

## BSIP Header Preamble

Each BSIP begins with an [RFC 822](https://www.ietf.org/rfc/rfc822.txt)-style header preamble,
enclosed by three hyphens (`---`). The headers appear in this order:

- `bsip` — the BSIP number (assigned by an editor; leave blank in a new submission).
- `title` — a few words, not a sentence; 44 characters or fewer; must not include the BSIP number.
- `description` — one short, full sentence; 140 characters or fewer; must not include the BSIP number.
- `author` — a comma-separated list of authors, each as `Name (@GitHubUsername)` or `Name <email>`.
- `discussions-to` — the URL of the discussion thread for this BSIP.
- `status` — one of `Draft`, `Review`, `Last Call`, `Final`, `Stagnant`, `Withdrawn`, or `Living`.
- `last-call-deadline` — the end date of the Last Call period (only while `status` is `Last Call`).
- `type` — `Standards Track`, `Meta`, or `Informational`.
- `category` — `Core`, `Networking`, `Interface`, `Appchain`, or `Application` (Standards Track only).
- `created` — the date the BSIP was created, in ISO 8601 (`yyyy-mm-dd`) format.
- `requires` *(optional)* — BSIP number(s) this one depends on.
- `withdrawal-reason` *(optional)* — for `Withdrawn` BSIPs, why it was withdrawn.

## Linking and auxiliary files

BSIPs may link to other BSIPs with a relative Markdown link, for example
`[BSIP-2](./bsip-2.md)`. Images and other auxiliary files for a BSIP should be placed in
`../assets/bsip-N/` and referenced with a relative link such as
`![diagram](../assets/bsip-1/diagram.svg)`. Prefer keeping examples and test vectors inline; use the
assets folder only when content is too large to inline.

## BSIP Editors

BSIP editors are maintainers who handle the administrative and editorial process. For each new BSIP
submission, an editor checks that it is sound, complete, and readable; reviews it for formatting,
spelling, and grammar; assigns a BSIP number; and merges it once it is ready. Editors do not pass
judgment on the merits of a proposal; they ensure it is well-formed. The current editors are listed
in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
