---
bsip: 5
title: Comment Updates
description: The mutable, community-signed record that carries a comment's vote counts, replies, and moderation state.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Draft
type: Standards Track
category: Core
created: 2026-06-15
requires: 2, 3
---

## Abstract

A **comment update** carries the mutable state of a comment — vote counts, reply counts and reply
pages, moderation flags, the latest author edit, and the author's standing in the community —
separately from the immutable comment record ([BSIP-2](./bsip-2.md)). Comment updates are signed by
the community and republished as the comment accumulates votes and replies. This BSIP defines the
comment update format, how it binds to its comment, how clients fetch it, and the reduced form used
during publishing and in the moderation queue.

## Motivation

A comment record is content-addressed and therefore immutable: once published, its CID cannot change.
But votes, replies, and moderation decisions change over time. Putting that mutable state in a
separate, community-signed record lets the comment stay stable while its counts and status evolve, and
lets clients fetch "the current state of this comment" without re-fetching or invalidating the comment
itself.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Overview

For each comment it has accepted and published, the community maintains a comment update and
republishes it when the comment's state changes (for example a new vote, reply, edit, or moderation
action). A comment update is bound to its comment by `cid` and signed by the key that signs the
community record ([BSIP-3](./bsip-3.md#signing)).

### Fields

REQUIRED fields:

- `cid` — the CID of the comment this update describes. It is signed, so an update cannot be
  transplanted onto a different comment.
- `upvoteCount` — non-negative integer.
- `downvoteCount` — non-negative integer.
- `replyCount` — non-negative integer; the number of counted replies at every depth under the comment
  (see [Counting replies](#counting-replies)).
- `updatedAt` — integer Unix time in seconds of this version of the update.
- `protocolVersion` — string, currently `"1.0.0"`.
- `signature` — the community's signature (see [Signing](#signing)).

OPTIONAL fields:

- `childCount` — non-negative integer; the counted direct replies only.
- `number`, `postNumber` — positive integers; the community-assigned sequential number of the comment
  and of its thread's post.
- `replies` — a reply pages object ([BSIP-3, Pages](./bsip-3.md#pages)).
- `lastChildCid` — CID of the most recent counted direct reply.
- `lastReplyTimestamp` — `timestamp` of the most recent counted reply at any depth.
- `edit` — the most recent author edit of the comment, exactly as the author's `commentEdit`
  publication ([BSIP-7](./bsip-7.md)). Its `signature.publicKey` MUST equal the comment's
  `signature.publicKey`. Its `content`, `deleted`, `flairs`, `spoiler`, and `nsfw` override the
  comment's own values when displayed.
- `flairs` — moderator-assigned [flairs](./bsip-2.md#flairs), overriding the author's and the edit's.
- `spoiler`, `nsfw` — moderator overrides of the author's values.
- `pinned`, `locked`, `archived`, `removed` — moderation state ([BSIP-8](./bsip-8.md)). Only posts
  can be locked or archived.
- `approved` — present once a moderator approved (`true`) or disapproved (`false`) a comment that was
  pending approval. A disapproved comment that is kept also has `removed: true`.
- `reason` — string: the reason given by the most recent moderation that carried one
  ([BSIP-8](./bsip-8.md)).
- `author` — `{ "community": ... }`, the author's standing in this community (see
  [Author community standing](#author-community-standing)). No other `author` field is allowed.

A comment update MAY carry additional fields set by the community's challenges (for example a
country code); such fields are signed like any other, and clients MAY ignore those they do not
understand. A comment update MUST NOT carry fields reserved for comment records or runtime use, such
as `depth`, `thumbnailUrl`, or `deleted`.

Example (abbreviated):

```jsonc
{
  "cid": "QmQwin4X1VAmELE5KsDHBfz3ZhaLiN8NcH663nvBJNMqUm",
  "upvoteCount": 10,
  "downvoteCount": 5,
  "replyCount": 3,
  "childCount": 3,
  "number": 42,
  "postNumber": 42,
  "updatedAt": 1728174027,
  "lastChildCid": "Qm…",
  "lastReplyTimestamp": 1728450341,
  "author": {
    "community": { "postScore": 12, "replyScore": 4, "firstCommentTimestamp": 1700000000, "lastCommentCid": "Qm…" }
  },
  "replies": { "pages": { "best": { "comments": [/* { comment, commentUpdate } … */] } } },
  "protocolVersion": "1.0.0",
  "signature": {
    "type": "ed25519",
    "signature": "<base64>",
    "publicKey": "<base64, 32 bytes>",
    "signedPropertyNames": [
      "cid", "upvoteCount", "downvoteCount", "replyCount", "childCount", "number", "postNumber",
      "updatedAt", "lastChildCid", "lastReplyTimestamp", "author", "replies", "protocolVersion"
    ]
  }
}
```

### Counting replies

`replyCount` and `lastReplyTimestamp` cover every depth under the comment; `childCount` and
`lastChildCid` cover direct replies only. A reply is counted once the community has published a
comment update for it, unless it was removed by a moderator, deleted by its author, is pending
approval, was disapproved, or belongs to a different community. Present replies under a removed or
deleted reply are still counted. Removing or deleting a reply removes it from `lastReplyTimestamp`, so
it no longer bumps its thread.

### Author community standing

`author.community` carries the community's view of the comment's author:

- `postScore`, `replyScore` — REQUIRED. Numbers: the author's post and reply karma (upvotes minus
  downvotes) in this community.
- `firstCommentTimestamp` — REQUIRED. Timestamp of the author's first comment in the community, used
  by account-age rules ([BSIP-3](./bsip-3.md#anti-spam-configuration)).
- `lastCommentCid` — REQUIRED. CID of the author's most recent comment in the community.
- `banExpiresAt` — if present and in the future, the author is banned in this community until this
  time ([BSIP-8](./bsip-8.md)).
- `flairs` — author flairs set by a moderator or a challenge; they override the author's own
  `author.flairs` when displayed.

Additional fields MAY be present. When the community pseudonymizes authors
([BSIP-2](./bsip-2.md#pseudonymity)), karma, `firstCommentTimestamp`, and `lastCommentCid` describe
the alias, while `banExpiresAt` and `flairs` also reflect moderation aimed at the original author
([BSIP-8](./bsip-8.md)).

### Fetching comment updates

A **post's** comment update is published in the community's `postUpdates` directories
([BSIP-3](./bsip-3.md)). The keys of `postUpdates` are time buckets in seconds. A post is published
in the smallest bucket `b` for which `now − b ≤ post.timestamp`, at the path

```text
/ipfs/<postUpdates[b]>/<postCid>/update
```

where `update` is the comment update serialized as JSON. A client SHOULD try the buckets that satisfy
the inequality from smallest to largest, since the community moves a post into a larger bucket as it
ages. The current implementation uses the buckets 86400 (one day), 604800 (one week), 2592000 (30
days), and 3153600000 (100 years).

A **reply's** comment update is not published at its own path. Clients obtain it from the reply pages
of its parent or of its thread's post, where each entry pairs the reply with its latest comment update
([BSIP-3, Pages](./bsip-3.md#pages)).

A client MUST prefer the update with the greater `updatedAt` when it holds more than one for the same
comment.

### Reduced comment updates

A reduced comment update is used inside the `CHALLENGEVERIFICATION` returned to a publisher
([BSIP-4](./bsip-4.md)) and in moderation-queue pages ([BSIP-3](./bsip-3.md#moderation-queue)). It
contains `cid`, `signature`, `protocolVersion`, and optionally `author`, `number`, `postNumber`, and
`pendingApproval` (boolean, `true` when the comment is held for moderator approval), plus any fields
the community's challenges set. It is signed like a full update, over the fields it carries.

### Signing

A comment update is signed following the rules of [BSIP-2, Signatures](./bsip-2.md#signatures), by the
key that signs the community record. Every field of the update except `signature` MUST be listed in
`signedPropertyNames`. Because `cid` is signed, a valid update is bound to exactly one comment.

### Verification

A client MUST reject a comment update that:

- carries a field not listed in `signedPropertyNames`, or a reserved field;
- has an invalid signature;
- is signed by a key other than the community record's `signature.publicKey` (for a delegated
  community, the current minter; [BSIP-11](./bsip-11.md));
- has a `cid` different from the CID of the comment it is displayed with;
- carries an `edit` whose `signature.publicKey` differs from the comment's `signature.publicKey`,
  whose `commentCid` differs from the update's `cid`, or whose signature is invalid;
- carries `replies` pages that do not verify ([BSIP-3, Signing](./bsip-3.md#signing)). A preloaded
  flat sort under a post holds the post's whole subtree, so its entries are checked against the post
  rather than as direct replies.

## Rationale

- **Separating mutable from immutable state** is what lets Bitsocial avoid a blockchain: the comment is
  a stable content-addressed object, and only the small, community-signed update changes over time.
- **Signing `cid` into the update** prevents a valid update from being replayed onto a different
  comment.
- **Community-signed counts** make the community the authority on its own vote tallies and moderation
  — consistent with the community being the unit of moderation ([BSIP-3](./bsip-3.md)) — while votes
  themselves remain author-signed ([BSIP-6](./bsip-6.md)).
- **Time buckets for post updates** let a client find a post's latest update from the community
  record alone, while the community republishes recent, frequently changing posts more often than old
  ones.

## Backwards Compatibility

Older updates MAY carry `author.subplebbit` instead of `author.community`; readers SHOULD treat the two
the same. Updates published before `childCount` and `lastChildCid` existed omit them.

## Security Considerations

- **Community trust boundary.** Counts, moderation flags, and author standing are asserted by the
  community. They are authoritative only within that community and MUST NOT be treated as global facts
  about a comment or author.
- **Edit authenticity.** An `edit` embedded in an update MUST be signed by the comment's signing key; a
  community cannot forge author edits, only attach genuine ones, and checking `edit.commentCid` stops
  it from moving an author's edit onto another of their comments. Under pseudonymity the signing key
  is the alias, which the community holds, so it can forge edits of pseudonymized comments
  ([BSIP-7](./bsip-7.md)).
- **Binding to a comment.** Verifiers MUST reject an update whose signed `cid` does not match the
  comment they are displaying, or whose signer is not the community's.
- **Staleness and rollback.** A community or relay can serve an older, validly signed update. Clients
  SHOULD ignore an update older than one they already trust for the same comment.
- **Challenge-set fields.** Fields added by challenges are community-asserted like everything else in
  the update; clients MUST NOT treat them as author claims.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
