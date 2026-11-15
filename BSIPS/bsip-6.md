---
bsip: 6
title: Votes
description: The format and signing of upvotes and downvotes on Bitsocial comments, and how communities count them.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues/10
status: Draft
type: Standards Track
category: Core
created: 2026-06-15
requires: 2, 4, 5
---

## Abstract

A **vote** is an author-signed upvote, downvote, or vote cancellation on a comment. Votes are
published to a community like any other publication ([BSIP-4](./bsip-4.md)); the community counts
them and reflects the totals in the comment's update ([BSIP-5](./bsip-5.md)). This BSIP defines the
vote format, the rules a community applies when accepting a vote, and how votes are counted.

## Motivation

Voting is the simplest publication type, but clients still need to agree on its exact shape — which
comment it targets, the allowed values, and which fields are signed — and communities need to count
votes the same way, so that vote counts mean the same thing across implementations.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Fields

A vote is a JSON object with the [common publication fields](./bsip-2.md#common-publication-fields)
and two vote-specific fields:

- `commentCid` — REQUIRED. The CID of the comment being voted on.
- `vote` — REQUIRED. One of `1` (upvote), `-1` (downvote), or `0` (cancel the author's previous
  vote).

Votes are published inside a `CHALLENGEREQUEST` under the `vote` key ([BSIP-4](./bsip-4.md)). Unlike
comments, accepted votes are not published individually; only their totals are.

Example vote:

```jsonc
{
  "commentCid": "QmQwin4X1VAmELE5KsDHBfz3ZhaLiN8NcH663nvBJNMqUm",
  "vote": -1,
  "communityPublicKey": "12D3KooWBexQF4qDvyaxDgK4r2qPNk5z8s9b1eU5z2bnR6dExamPLe",
  "communityName": "jokes.bso",
  "author": { "name": "john.bso" },
  "timestamp": 1728174027,
  "protocolVersion": "1.0.0",
  "signature": {
    "type": "ed25519",
    "signature": "<base64>",
    "publicKey": "<base64, 32 bytes>",
    "signedPropertyNames": ["author", "communityPublicKey", "communityName", "protocolVersion", "timestamp", "commentCid", "vote"]
  }
}
```

### Signing

A vote is signed by its author following [BSIP-2, Signatures](./bsip-2.md#signatures). Every field of
the vote except `signature` MUST be listed in `signedPropertyNames`. The convenience field
`communityAddress` is never signed and never appears on the wire.

### Acceptance

In addition to the rules for every publication ([BSIP-4](./bsip-4.md#publication-acceptance)), which
reject votes on comments that do not exist, were removed or deleted, are pending approval or
disapproved, or sit in an archived or locked thread, a community MUST reject a vote that:

- has `vote` `0` when the same author has no effective vote on that comment;
- is disallowed by the community's `features` ([BSIP-3](./bsip-3.md#features)): `noUpvotes`,
  `noDownvotes`, or, for a post (`depth` 0) or a reply, `noPostUpvotes`, `noPostDownvotes`,
  `noReplyUpvotes`, or `noReplyDownvotes`.

Votes in a locked thread are rejected for everyone, moderators included.

### Counting

An author is identified for counting by the IPNS name of the vote's `signature.publicKey`. A community
MUST count at most one effective vote per author per comment: each accepted vote replaces that
author's previous vote on the comment, and a vote of `0` leaves the author with no effective vote. The
comment update's `upvoteCount` and `downvoteCount` ([BSIP-5](./bsip-5.md)) are the numbers of
effective `1` and `-1` votes. An author's `postScore` and `replyScore` in the community
([BSIP-5](./bsip-5.md#author-community-standing)) are the sums of upvotes minus downvotes on their
posts and replies.

## Rationale

- **A single `vote` field with values `1`/`0`/`-1`** keeps voting minimal and makes cancellation
  explicit rather than requiring a separate message type.
- **Author-signed votes, community-counted totals** keep the trust model consistent: each vote is
  attributable to an author key, while the community is the authority on the aggregate it publishes.
- **Not publishing individual votes** keeps comment updates small and avoids exposing who voted for
  what.

## Security Considerations

- **One effective vote per author.** Counting MUST be idempotent per author per comment, or an author
  could inflate a tally by republishing.
- **Sybil resistance is the community's job.** A vote only proves that *some* keypair voted, and
  keypairs are free. Resistance to vote manipulation comes from the community's anti-spam challenges
  and exclusion policy ([BSIP-3](./bsip-3.md#anti-spam-configuration)), not from the vote format.
- **Target binding.** `commentCid` is signed, so a vote cannot be moved to a different comment.
- **Replays.** Within the five-minute timestamp window, resending an author's earlier signed vote
  would replace their current one. A community SHOULD reject a vote whose signature it has already
  accepted ([BSIP-4](./bsip-4.md#duplicate-requests)).
- **Unverifiable totals.** Because individual votes are not published, readers cannot audit a
  community's counts; they are as trustworthy as the community that signs them.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
