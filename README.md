[![License: CC0-1.0](https://img.shields.io/badge/license-CC0--1.0-lightgrey.svg)](./LICENSE.md)

# Bitsocial Improvement Proposals (BSIPs)

Bitsocial Improvement Proposals (BSIPs) are the design documents that specify the
**Bitsocial protocol**: the open, decentralized protocol for serverless social media that
anyone can implement. A BSIP provides a concise technical specification and a rationale, so
that independent clients, nodes, and services can interoperate without depending on any single
company or codebase.

If you are new here, **start with [BSIP-1](./BSIPS/bsip-1.md)**, which defines what a BSIP is
and how the process works.

> A website at `bsips.bitsocial.net` (mirroring [eips.ethereum.org](https://eips.ethereum.org/))
> is planned. Until then, this repository is the canonical source.

## Scope: what belongs in a BSIP

BSIPs cover the **decentralized** Bitsocial protocol as a whole. As the protocol grows, this
spans several layers:

- the peer-to-peer social core (communities, comments, votes, moderation, anti-spam),
- the networking layer that discovers peers and moves content,
- the developer interfaces (RPC, SDKs) that clients share,
- the Bitsocial Network appchain and its economic primitives (`.bso` names, token, tipping, awards),
- and application-level conventions that independent clients agree on.

> **Bitsocial protocol vs. PKC.** Today most of the Bitsocial protocol is implemented on top of
> [PKC (Public Key Communities)](https://github.com/pkcprotocol/pkc-js), a deliberately barebones
> peer-to-peer building block. PKC is an internal layer the protocol currently builds on — it is
> **not** itself "the Bitsocial protocol." The Bitsocial protocol already extends beyond PKC (for
> example `.bso` name resolution, tipping, and pubsub voting) and is expected to grow much larger
> over time. BSIPs specify the Bitsocial protocol; they reference PKC only where a layer is
> currently realized through it.

**Out of scope.** Centralized products built *on top of* Bitsocial are not BSIPs. A hosted RPC
provider, a managed build/CI service such as Bitsocial Forge, a proprietary moderation backend, or
any service users could swap out without changing the protocol does not belong here. BSIPs describe
the rules independent implementations must share, not any one operator's product.

## BSIP types and categories

Every BSIP has a **type**, and Standards Track BSIPs additionally have a **category**. See
[BSIP-1](./BSIPS/bsip-1.md) for the authoritative definitions.

| Type | Meaning |
| --- | --- |
| **Standards Track** | A change that affects interoperability between independent implementations. |
| **Meta** | A process or governance change around Bitsocial or the BSIP process itself. |
| **Informational** | A design issue, guideline, or general information; non-binding. |

| Standards Track category | Covers |
| --- | --- |
| **Core** | Interoperability rules of the protocol: data formats and validation for communities, comments, votes, and comment updates; signatures; the anti-spam challenge exchange; addressing. |
| **Networking** | Peer discovery and transport: HTTP routers, libp2p gossipsub pubsub, content transfer, and browser peer-to-peer. |
| **Interface** | Developer-facing interfaces shared across clients: the RPC protocol and client SDK conventions. |
| **Appchain** | The Bitsocial Network (L2/appchain) economic layer: `.bso` naming, the token, tipping, awards, and on-chain standards. |
| **Application** | Conventions independent clients agree on above the protocol: anti-spam challenge interfaces, profile/identity schemas, community list formats, and media/link handling. |

## Status

A BSIP moves through the following lifecycle (defined in full in [BSIP-1](./BSIPS/bsip-1.md)):

**Idea → Draft → Review → Last Call → Final**, with **Stagnant**, **Withdrawn**, and **Living**
as additional states.

## All BSIPs

| Number | Title | Type | Category | Status |
| --- | --- | --- | --- | --- |
| [BSIP-1](./BSIPS/bsip-1.md) | BSIP Purpose and Guidelines | Meta | — | Living |
| [BSIP-2](./BSIPS/bsip-2.md) | Comments | Standards Track | Core | Draft |
| [BSIP-3](./BSIPS/bsip-3.md) | Communities and Pages | Standards Track | Core | Draft |
| [BSIP-4](./BSIPS/bsip-4.md) | Publishing and Challenges | Standards Track | Core | Draft |
| [BSIP-5](./BSIPS/bsip-5.md) | Comment Updates | Standards Track | Core | Draft |
| [BSIP-6](./BSIPS/bsip-6.md) | Votes | Standards Track | Core | Draft |

## Contributing

Read [BSIP-1](./BSIPS/bsip-1.md) and [`CONTRIBUTING.md`](./CONTRIBUTING.md), then open a pull
request that adds your draft using [`bsip-template.md`](./bsip-template.md). Discussion happens in
the repository's issues and pull requests.

## License

All BSIPs are in the public domain via [CC0 1.0 Universal](./LICENSE.md).
