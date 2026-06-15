---
bsip: 6
title: Votes
description: The format and signing of upvotes and downvotes on Bitsocial comments.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Draft
type: Standards Track
category: Core
created: 2026-06-15
requires: 2
---

## Abstract

A **vote** is an author-signed upvote, downvote, or vote cancellation on a comment. Votes are
published to a community like any other publication ([BSIP-4](./bsip-4.md)); the community tallies
them and reflects the totals in the comment's update ([BSIP-5](./bsip-5.md)). This BSIP defines the
vote format.

## Motivation

Voting is the simplest publication type, but clients still need to agree on its exact shape — which
comment it targets, the allowed values, and which fields are signed — so that votes can be validated
and counted consistently across implementations.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHOULD", "SHOULD NOT", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Fields

A vote is a publication ([BSIP-2](./bsip-2.md)) with two vote-specific fields:

- `commentCid` — REQUIRED. The CID of the comment being voted on.
- `vote` — REQUIRED. One of `1` (upvote), `-1` (downvote), or `0` (cancel a previous vote).

Plus the common publication fields:

- `author` — the author object.
- `timestamp` — integer Unix time in seconds.
- `protocolVersion` — string, currently `"1.0.0"`.
- `signature` — the author's signature.
- Community addressing — `communityPublicKey` and/or `communityName` ([BSIP-2](./bsip-2.md#community-addressing)).

Example vote as signed by the author:

```jsonc
{
  "commentCid": "QmXnEICVkZBHKgjtj7Vt63HWq3ZfPjcGTSPs79oXtfEZxc",
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
    "signedPropertyNames": ["commentCid", "vote", "communityPublicKey", "communityName", "author", "timestamp", "protocolVersion"]
  }
}
```

### Signing and counting

A vote is signed by its author using the CBOR signing rules of [BSIP-2](./bsip-2.md#signatures). A
vote of `0` cancels the author's previous vote on the same comment. A community SHOULD count at most
one effective vote per author per comment (the most recent), and reflects `upvoteCount` and
`downvoteCount` in the comment update ([BSIP-5](./bsip-5.md)). As with all publications, the
convenience field `communityAddress` is never signed and never appears on the wire.

## Rationale

- **A single `vote` field with values `1`/`0`/`-1`** keeps voting minimal and makes cancellation
  explicit rather than requiring a separate message type.
- **Author-signed votes, community-counted totals** keep the trust model consistent: each vote is
  attributable to an author key, while the community is the authority on the aggregate it publishes.

## Security Considerations

- **One effective vote per author.** Counting MUST be idempotent per author per comment, or an author
  could inflate a tally by republishing. The latest signed vote (including a `0` cancellation) wins.
- **Sybil resistance is the community's job.** A vote only proves that *some* keypair voted. Resistance
  to vote manipulation comes from the community's anti-spam challenges and exclusion policy
  ([BSIP-4](./bsip-4.md)), not from the vote format itself.
- **Target binding.** `commentCid` is signed, so a vote cannot be moved to a different comment; a
  verifier MUST reject a vote whose signature does not cover `commentCid`.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
