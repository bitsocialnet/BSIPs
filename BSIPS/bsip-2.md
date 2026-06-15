---
bsip: 2
title: Comments
description: The format, addressing, and signing of Bitsocial comments — the posts and replies users publish to communities.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Draft
type: Standards Track
category: Core
created: 2026-06-15
---

## Abstract

A **comment** is the basic unit of user-authored content in Bitsocial. Posts and replies are both
comments: an object signed by an author and published to a community. Once accepted by a community,
a comment is stored as an immutable record addressed by its IPFS CID. This BSIP defines the comment
format, how comments are addressed and fetched, how posts and replies relate, and how comments are
signed and verified.

## Motivation

Independent Bitsocial clients must agree on exactly what a comment is — which fields exist, which are
author-set, which are community-set, and which bytes are signed — or they cannot display, validate,
or relay each other's content. This BSIP is the canonical description of that shared format.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Overview

A comment is created by an author, published to a community (see [BSIP-4](./bsip-4.md)), validated by
that community's node, and — if accepted — added to IPFS, where it becomes addressable by CID. The
object the author signs is the **comment**; the object stored on IPFS is the **comment record**,
which is the signed comment plus a small set of fields the community is allowed to set.

### Author-set fields

A comment is a JSON object. The author MAY set the following content fields, and MUST set at least
one of `title`, `content`, or `link`:

- `title` — string, the post title.
- `content` — string, the body text (Markdown).
- `link` — string URL, at most 2000 characters.
- `linkWidth`, `linkHeight` — positive numbers, the media dimensions of `link`, when known.
- `linkHtmlTagName` — string, a hint for how to embed `link` (for example `image`, `video`, `audio`).
- `flairs` — array of flair labels chosen by the author.
- `spoiler` — boolean.
- `nsfw` — boolean.
- `parentCid` — CID of the parent comment. Present on replies, absent on posts.
- `postCid` — CID of the root post of the thread. REQUIRED when `parentCid` is set.
- `quotedCids` — array of CIDs of comments this comment quotes or references.

Every comment also carries the common publication fields:

- `author` — the author object (see [Authors](#authors)).
- `timestamp` — integer Unix time in **seconds**.
- `protocolVersion` — string, the protocol version (currently `"1.0.0"`).
- `signature` — the signature object (see [Signatures](#signatures)).
- Community addressing — `communityPublicKey` and/or `communityName` (see
  [Community addressing](#community-addressing)).

Example comment as signed by the author:

```jsonc
{
  "title": "Why did the banana go to the doctor?",
  "content": "It wasn't peeling well.",
  "communityPublicKey": "12D3KooWBexQF4qDvyaxDgK4r2qPNk5z8s9b1eU5z2bnR6dExamPLe",
  "communityName": "jokes.bso",
  "author": { "name": "john.bso" },
  "timestamp": 1728174027,
  "protocolVersion": "1.0.0",
  "signature": {
    "type": "ed25519",
    "signature": "<base64>",
    "publicKey": "<base64>",
    "signedPropertyNames": ["title", "content", "communityPublicKey", "communityName", "author", "timestamp", "protocolVersion"]
  }
}
```

### Posts and replies

`depth` distinguishes posts from replies and is set on the comment record (not by the author):

- A **post** has `depth` 0, no `parentCid`, and no `postCid`.
- A **top-level reply** has `depth` 1, with `parentCid` and `postCid` both pointing at the post.
- A **nested reply** has `depth` 2 or greater, with `parentCid` pointing at its immediate parent and
  `postCid` pointing at the root post.

### Authors

The `author` object describes the author. All of its fields are OPTIONAL on the wire:

- `name` — the author's crypto domain name, if any (for example `john.bso`).
- `displayName` — a free-form display name.
- `previousCommentCid` — CID of the author's previous comment, forming a per-author chain.
- `wallets` — a record keyed by chain ticker, each mapping to a signed wallet address proof.
- `avatar` — an NFT avatar reference with a signed ownership proof.
- `flairs` — author-chosen flair labels.

An author's cryptographic identity is the `signature.publicKey` of their comment. The human-readable
**author address** is derived by clients as `author.name` when present, otherwise the IPNS name (a
libp2p PeerId string such as `12D3KooW…`) of the public key. The derived address is a runtime
convenience: it is **not** part of the signed wire object. A client MUST verify that any `name`
resolves to the comment's actual public key before trusting it; if resolution fails, the client MUST
fall back to the public-key address and MUST NOT treat the name as verified.

### Community addressing

A comment names the community it is published to using two fields:

- `communityPublicKey` — the community's IPNS public key (its cryptographic address). REQUIRED on
  new comments.
- `communityName` — the community's crypto domain name (for example `jokes.bso`), if it has one.
  OPTIONAL.

Clients MAY expose a single convenience `communityAddress` equal to `communityName` when present,
otherwise `communityPublicKey`. `communityAddress` is a runtime value only: it MUST NOT appear on the
wire and MUST NOT be signed. See [BSIP-3](./bsip-3.md) for community identity and resolution.

### The comment record (community-set fields)

When a community accepts a comment, its node MAY add the following fields before storing the record
on IPFS. These fields are part of the signed-by-author object **only** for those the author set;
fields added by the community are not covered by the author signature and MUST be treated as
community-asserted metadata:

- `depth` — REQUIRED. The reply depth, as described in [Posts and replies](#posts-and-replies).
- `previousCid` — CID of the previous comment in the community, forming a community-wide chain.
- `thumbnailUrl`, `thumbnailUrlWidth`, `thumbnailUrlHeight` — a generated thumbnail for `link`.
- `pseudonymityMode` — one of `per-post`, `per-reply`, or `per-author`, when the community enforces a
  pseudonymity policy.

The mutable counts, scores, replies, and moderation state associated with a comment are **not** part
of the comment record; they live in a separately signed **comment update** (see [BSIP-5](./bsip-5.md)).

### Fetching

A comment record is immutable and is fetched by its CID through the peer-to-peer network (for
example via an IPFS gateway at `https://<gateway>/ipfs/<cid>` during rollout, or directly from peers).
Because the CID is the hash of the content, a fetched comment is self-verifying against its address.

### Signatures

Every comment carries a `signature` object:

```jsonc
{
  "type": "ed25519",
  "signature": "<base64>",
  "publicKey": "<base64, 32 bytes>",
  "signedPropertyNames": ["...the signed field names..."]
}
```

The signed message is the [CBOR](https://www.rfc-editor.org/rfc/rfc8949) encoding of the comment
object restricted to the properties named in `signedPropertyNames`. Signing and verification MUST
follow these rules:

1. Only the properties listed in `signedPropertyNames` are included in the signed bytes.
2. A property listed in `signedPropertyNames` MUST NOT be `null` or `undefined`. This keeps the CBOR
   encoding deterministic and easy to verify.
3. The convenience and transport-only fields `signer`, `challengeRequest`, and `communityAddress` are
   never signed and never appear on the wire.
4. A verifier MUST ignore any field that is not listed in `signedPropertyNames`, because such a field
   could have been added by someone other than the author.
5. Verification re-derives the signed bytes strictly from the `signedPropertyNames` carried in the
   signature object — not from a hardcoded list — and checks the Ed25519 signature against
   `publicKey`. This allows records signed with a different set of fields to remain verifiable.

Comments are signed by their author. Wallet and NFT-avatar proofs inside `author` MAY use other
signature types (for example `eip191`) and are verified independently of the comment signature.

## Rationale

- **CBOR over a list of named, non-null fields** gives a canonical, language-independent byte string
  to sign, and lets the protocol evolve: new optional fields can be added without breaking the
  verification of older records, because verifiers trust the per-record `signedPropertyNames`.
- **Splitting author-set and community-set fields** keeps the author's signature meaningful: a
  community can attach `depth` or a thumbnail without being able to forge author content.
- **Separating mutable state into comment updates** ([BSIP-5](./bsip-5.md)) lets the immutable,
  CID-addressed comment stay stable while votes and replies accumulate.

## Backwards Compatibility

Some older records MAY carry the community address as a single combined field rather than as separate
`communityPublicKey` and `communityName`. An implementation that reads such records SHOULD treat a
value in crypto-domain form (for example ending in `.bso` or `.eth`) as `communityName`, and any
other value as `communityPublicKey`. Because verification uses each record's own `signedPropertyNames`,
records signed with a different set of fields remain verifiable.

## Security Considerations

- **Ignore unsigned fields.** A relaying peer can append arbitrary properties to a comment in transit.
  Verifiers MUST ignore anything not in `signedPropertyNames`, or they risk acting on forged data.
- **Name spoofing.** `author.name` and `communityName` are human-readable and MUST be resolved to the
  corresponding public key before display as verified; otherwise an attacker could publish under a
  name they do not control.
- **Content addressing.** A comment fetched by CID is integrity-protected by the hash, but the CID
  does not by itself prove authorship — the `signature` does. Always verify the signature, not just
  the CID.
- **Link handling.** `link`, `linkHtmlTagName`, and thumbnails describe remote media. Clients SHOULD
  treat them as untrusted input and apply their own embedding, sanitization, and privacy policy.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
