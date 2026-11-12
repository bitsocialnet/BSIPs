---
bsip: 1
title: BSIP Purpose and Guidelines
description: Defines what a BSIP is, its types and categories, and how BSIPs are proposed, reviewed, and finalized.
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
itself the Bitsocial protocol. The protocol already includes behavior beyond PKC — for example `.bso`
name resolution, tipping, and pubsub voting — and is expected to grow well past PKC. When a
BSIP specifies behavior currently implemented through PKC, it should say so, but it specifies the
Bitsocial protocol, not PKC.

BSIPs are the normative description of the protocol; implementation documentation, such as
pkc-js's protocol notes, should link to the BSIP it implements rather than restate it. A disagreement
between a BSIP and the reference implementation is a defect in one of the two. It is resolved
explicitly, by changing the BSIP or the implementation, and never left standing. While a BSIP is a
Draft, either may be the one that changes. Once it has left Draft, implementations follow it: a change
to an implementation that alters a format, a validation rule, or another behavior a BSIP specifies
lands together with a pull request that updates the BSIP, and is released only once that pull request
is merged.

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
    transfer, and browser peer-to-peer. Networking BSIPs bind implementations that join the
    peer-to-peer network themselves; a client that reaches the network through a node, over the RPC
    protocol, relies on that node to implement them.
  - **Interface**: developer-facing interfaces shared across clients — the RPC protocol and client
    SDK conventions. Interface BSIPs bind the implementations that expose or consume the interface
    in question, and no others.
  - **Appchain**: the Bitsocial Network (L2/appchain) economic layer — `.bso` naming, the token,
    tipping, awards, and on-chain standards. Appchain BSIPs bind any implementation that reads or
    writes the on-chain state they define.
  - **Application**: conventions that independent clients agree on above the protocol — anti-spam
    challenge interfaces, profile and identity schemas, community list formats, and media or link
    handling. Application BSIPs are opt-in: a client may adopt any subset of them, and skipping one
    costs the client that convention and whatever depends on it, not its interoperability with the
    rest of the network. A client that claims to implement an Application BSIP must implement it as
    specified.

  Readers coming from Ethereum will recognize Application BSIPs as the counterpart of ERCs. An ERC is
  an EIP in the ERC category and shares the EIP number space, so ERC-20 and EIP-20 are the same
  document. BSIPs follow the same model and do not add a separate prefix: an Application BSIP is a
  BSIP, numbered like any other, and its category says how binding it is. Ethereum draws the line
  more sharply because a Core EIP is a hard fork that every node must adopt or split from the chain,
  while an ERC is an interface that contracts and wallets opt into. Outside the Appchain category,
  Bitsocial has no global consensus to fork, so the difference between Core and Application is one
  of degree, and the `category` header expresses it. If Application BSIPs ever need their own editors
  or repository, they can be split out the way ERCs were split from EIPs, keeping their numbers.

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
become Final or Living.

### BSIP Process

The following is the standardization process for all BSIPs:

- **Idea** — A pre-draft idea. Not tracked in this repository.
- **Draft** — The first formally tracked stage. A BSIP is merged by an editor into the repository
  once it is properly formatted.
- **Review** — The author marks the BSIP as ready for and requesting peer review.
- **Last Call** — The final review window before `Final` or `Living`. The author opens a pull request
  setting a review end date (`last-call-deadline`), typically 14 days later, and stating which of the
  two the BSIP is to become. Necessary normative changes during this window send the BSIP back to
  `Review`.
- **Final** — The BSIP is a finished standard. It should only change to correct errata, add
  non-normative clarifications, or record changes to facts it says it tracks
  ([Final or Living](#final-or-living)).
- **Stagnant** — Any BSIP in `Draft`, `Review`, or `Last Call` that is inactive for six months or
  more may be moved to `Stagnant`. It can be resurrected by an author or editor.
- **Withdrawn** — The author(s) have withdrawn the BSIP. This is final; the number is not reused. A
  later revival is considered a new proposal.
- **Living** — The BSIP is maintained indefinitely instead of reaching finality. This document,
  BSIP-1, is Living. A Standards Track BSIP becomes Living through Last Call, and afterwards changes
  only as [Living Standards Track BSIPs](#living-standards-track-bsips) allows. A Living BSIP does not
  become `Stagnant`.

### Final or Living

Ethereum's Standards Track EIPs end in Final because each change ships in a hard fork at a fixed
point, after which the old rules are history. Outside the Appchain category, the Bitsocial protocol
has no such points: it grows by additions that implementations ship continuously, and the records it
governs are signed and kept, so its rules have to go on accepting them. A Standards Track BSIP
therefore ends in one of two statuses:

- **Final** suits a BSIP whose subject cannot change once it ships. The clearest case is an Appchain
  BSIP that specifies an immutable contract: the deployed contract is the standard, so the BSIP
  completes Last Call and becomes Final before the contract is deployed. A later version is a new
  BSIP and a new deployment that clients choose to adopt.
- **Living** suits a BSIP whose subject grows by compatible additions, which outside the Appchain
  category is most of the protocol.

A Final BSIP that says it tracks a fact, such as the signers of a multisig, may be updated to record a
change to that fact, provided the change follows the rules the BSIP sets for it. Beyond errata and
non-normative clarifications, this is the only change a Final BSIP takes.

### Entering Last Call

A Standards Track BSIP may enter Last Call only when:

1. every BSIP it `requires` is in Last Call, Final, or Living, or enters Last Call with it;
2. no disagreement with the reference implementation is known, and the BSIP names the implementation
   release it describes;
3. a release of a client or node that people use ships that implementation release, or a later one
   that still conforms, so that the BSIP describes what the network does and not only what a
   repository does. For a BSIP that specifies an immutable contract, which is deployed only once the
   BSIP is Final, the contract's code and tests and the client changes that use it are ready instead;
4. where it defines a signed or content-addressed record, test vectors cover valid and invalid
   records, inline or in `assets/bsip-N/`, and both this repository's CI and the reference
   implementation's tests check them;
5. its open questions concern only possible additions, not how the current specification is to be
   read or implemented; and
6. its Security Considerations section is sufficient.

A change that a Living BSIP could not take later, because it is incompatible, is made before Last Call.

### Living Standards Track BSIPs

A Living Standards Track BSIP changes only compatibly. A revision MUST NOT make a record that was
valid under an earlier revision invalid, change what such a record means, or stop implementations that
conform to the earlier revision from interoperating with implementations that conform to the new one.
Adding optional members, record and publication types, methods, and error codes is compatible.

The one exception is a security fix, which may reject records or requests that an earlier revision
accepted. The BSIP's Backwards Compatibility section then says what stops working and from which
implementation release.

A change that is neither compatible nor a security fix needs a new BSIP, which says how readers tell
records made under the old rules from records made under the new ones.

Normative changes are made by pull request, as for a Draft, and are merged together with the
implementation change they describe ([What is the Bitsocial protocol?](#what-is-the-bitsocial-protocol)).
Each names, in Backwards Compatibility, the implementation release that introduced the behavior. The
repository history is the record of revisions, so an implementation that claims to implement a Living
BSIP says which revision, by date or commit.

### Deciding status

Authors propose status changes by pull request. Editors merge them when the BSIP meets the criteria
above and its discussion shows rough consensus among implementers and community operators. No vote
of token holders, on chain or off, decides a BSIP's status or contents. Status records whether
independent implementations can rely on a document, which a vote cannot establish, and a vote
weighted by holdings would let whoever buys enough tokens decide the protocol's rules.

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
  how they are handled. Required when incompatibilities exist. In a Living Standards Track BSIP, it
  also names the implementation release behind each normative change.
- **Reference Implementation** *(optional)* — A minimal implementation that aids understanding.
- **Security Considerations** — The security and abuse implications of the proposal. A BSIP cannot
  reach Final or Living without a Security Considerations section the editors consider sufficient.
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
