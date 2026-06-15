---
bsip: 5
title: Comment Updates
description: The mutable, community-signed record that carries a comment's vote counts, replies, and moderation state separately from the immutable comment.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Draft
type: Standards Track
category: Core
created: 2026-06-15
requires: 2, 3
---

## Abstract

A **comment update** carries the mutable state of a comment — vote counts, reply count and reply
pages, moderation flags, and the author's community-side standing — separately from the immutable
comment record ([BSIP-2](./bsip-2.md)). Comment updates are signed by the **community owner** and
republished as the comment accumulates votes and replies. This BSIP defines the comment update format
and how it binds to its comment.

## Motivation

A comment record is content-addressed and therefore immutable: once published, its CID cannot change.
But votes, replies, and moderation decisions change over time. Putting that mutable state in a
separate, community-signed record lets the comment stay stable while its counts and status evolve, and
lets clients fetch "the current state of this comment" without re-fetching or invalidating the comment
itself.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHOULD", "SHOULD NOT", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Overview

For each comment, the community owner maintains a comment update and republishes it when the comment's
state changes (for example a new vote or reply). A comment update is bound to its comment by `cid` and
signed by the community owner — the same keypair that signs the community record ([BSIP-3](./bsip-3.md)).

### Fields

REQUIRED fields:

- `cid` — the CID of the comment this update describes. It is part of the signed data so an update
  cannot be transplanted onto a different comment.
- `upvoteCount` — non-negative integer.
- `downvoteCount` — non-negative integer.
- `replyCount` — non-negative integer; the total number of replies in the subtree (direct and
  indirect).
- `updatedAt` — integer Unix time in seconds for this version of the update.
- `protocolVersion` — string, currently `"1.0.0"`.
- `signature` — the community owner's signature (see [Signing](#signing)).

OPTIONAL fields:

- `childCount` — non-negative integer; direct children only.
- `number`, `postNumber` — positive integers; the community-assigned sequential number of the comment
  and of its root post.
- `replies` — a reply **pages** object ([BSIP-3, Pages](./bsip-3.md#pages)), sorted by reply sorts
  (`best`, `new`, `old`, `newFlat`, `oldFlat`).
- `lastChildCid` — CID of the most recent direct child.
- `lastReplyTimestamp` — timestamp of the most recent direct or indirect reply.
- `edit` — the most recent author edit of the comment. Its signature's public key MUST match the
  comment's author public key; an edit signed by a different key MUST be rejected.
- `flairs` — moderator-assigned flair labels, overriding author/edit flairs.
- `spoiler`, `nsfw`, `pinned`, `locked`, `archived`, `removed`, `approved` — booleans describing
  moderation and display state.
- `reason` — string explaining a moderation action.
- `author` — an object carrying only the `community` sub-object: the author's community-side standing
  (see [Author community standing](#author-community-standing)).

Example (abbreviated):

```jsonc
{
  "cid": "QmXnEICVkZBHKgjtj7Vt63HWq3ZfPjcGTSPs79oXtfEZxc",
  "upvoteCount": 10,
  "downvoteCount": 5,
  "replyCount": 3,
  "childCount": 3,
  "updatedAt": 1728174027,
  "lastChildCid": "Qm…",
  "lastReplyTimestamp": 1728450341,
  "replies": { "pages": { "best": { "comments": [/* { comment, commentUpdate } … */] } } },
  "protocolVersion": "1.0.0",
  "signature": {
    "type": "ed25519",
    "signature": "<base64>",
    "publicKey": "<base64, 32 bytes>",
    "signedPropertyNames": ["cid", "upvoteCount", "downvoteCount", "replyCount", "childCount", "updatedAt", "lastChildCid", "lastReplyTimestamp", "replies", "protocolVersion"]
  }
}
```

### Author community standing

`author.community` carries the per-community state of the comment's author, set by the community:

- `postScore`, `replyScore` — the author's accumulated post and reply karma in this community.
- `firstCommentTimestamp` — timestamp of the author's first comment in the community (used by
  account-age challenges).
- `lastCommentCid` — CID of the author's most recent comment in the community.
- `banExpiresAt` — if present, the author is banned in this community until this time.
- `flairs` — moderator-editable author flairs (not author-signed).

### Reduced comment update

A reduced form of the comment update is used inside the `CHALLENGEVERIFICATION`
([BSIP-4](./bsip-4.md)) returned to a publisher, and inside moderation-queue pages
([BSIP-3](./bsip-3.md)). It contains `author`, `cid`, `signature`, `protocolVersion`, `number`,
`postNumber`, and an optional `pendingApproval` flag — enough to convey the accepted comment's
identity and initial state without the full counts and reply pages.

### Signing

A comment update is signed by the community owner, following the CBOR signing rules of
[BSIP-2](./bsip-2.md#signatures). Because `cid` is among the signed properties, a valid update is
cryptographically bound to exactly one comment. A verifier MUST check that the update's
`signature.publicKey` is the community owner's key (the one whose IPNS name is the community address)
before trusting counts or moderation state.

## Rationale

- **Separating mutable from immutable state** is what lets Bitsocial avoid a blockchain: the comment is
  a stable content-addressed object, and only the small, owner-signed update changes over time.
- **Signing `cid` into the update** prevents a valid update from being replayed onto a different
  comment.
- **Community-signed counts** make the community node the authority on its own vote tallies and
  moderation — consistent with the community being the unit of moderation
  ([BSIP-3](./bsip-3.md)) — while votes themselves remain author-signed ([BSIP-6](./bsip-6.md)).

## Security Considerations

- **Owner trust boundary.** Counts, moderation flags, and author standing are asserted by the community
  owner. They are authoritative only within that community and MUST NOT be treated as global facts
  about a comment or author.
- **Edit authenticity.** An `edit` embedded in an update MUST be signed by the comment's author key; a
  community cannot forge author edits, only attach genuine ones.
- **Binding to a comment.** Verifiers MUST reject an update whose signed `cid` does not match the
  comment they are displaying, and whose signer is not the community owner.
- **Staleness.** `updatedAt` lets clients prefer the newest update; clients SHOULD ignore an update
  older than one they already trust for the same comment.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
