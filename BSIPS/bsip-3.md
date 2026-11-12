---
bsip: 3
title: Communities and Pages
description: The mutable community record — metadata, roles, anti-spam configuration, and paginated posts — and how it is addressed and signed.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Draft
type: Standards Track
category: Core
created: 2026-06-15
requires: 2, 10
---

## Abstract

A **community** is a key-controlled space that holds posts. It carries mutable metadata — title,
description, rules, moderator roles, feature toggles, anti-spam configuration — and paginated lists of
its posts. The community record is published as a mutable IPNS record under the community's key and
is signed by the community. This BSIP defines the community record, how it is addressed and fetched,
how its posts and replies are paginated and sorted into pages, how its anti-spam policy is described
publicly, and how the record is verified.

## Motivation

Communities are the unit of moderation and hosting in Bitsocial. Clients must agree on the community
record format to render a community, fetch its posts, resolve its name, know whether and how they can
publish to it, and verify that a record genuinely came from the community. This BSIP is that shared
definition.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Identity and addressing

A community is identified by an Ed25519 keypair, its **identity key**. Its public-key address is the
IPNS name of that key: a libp2p PeerId string such as `12D3KooW…`. Publications name the community by
this value in `communityPublicKey` ([BSIP-2](./bsip-2.md#community-addressing)).

In the common case the identity key also signs the community record and its comment updates. A
**delegated** community separates the two: a long-lived anchor key is the identity, and a rotating
minter key signs the records. Delegation, the record's `anchor` field, and how a reader walks and
verifies the chain are specified in [BSIP-11](./bsip-11.md). Wherever this BSIP says "the identity
key", it means the anchor for a delegated community.

A community MAY also have a domain name such as `news.bso`, carried in the record's `name` field. Name
syntax, normalization, and resolution are specified in [BSIP-10](./bsip-10.md). A client MUST verify
that the name resolves to the community's identity key before presenting the name as the community's
verified identity.

The community's runtime `address` is `name || publicKey`. As with comments, `address` is a derived
convenience and is not carried on the wire.

### Fetching the community record

The latest community record is published as an IPNS record under the IPNS name of the key that signs
it, whose value is `/ipfs/<cid>`, where `<cid>` addresses the community record serialized as JSON.
For a delegated community, readers address the anchor's IPNS name, whose record points at the signing
key's ([BSIP-11](./bsip-11.md)). A reader:

1. resolves `name`, if it addressed the community by name, to the identity key
   ([BSIP-10](./bsip-10.md#verifying-a-community-name));
2. resolves the IPNS name to a CID, validating each IPNS record and following the delegation chain
   when there is one ([BSIP-11](./bsip-11.md#loading-and-verifying-a-community-record));
3. fetches the record by CID and verifies it as described in [Signing](#signing);
4. replaces the record it holds only if the new record's `updatedAt` is strictly greater.

### The community record

The community record is a JSON object. Fields marked REQUIRED MUST be present; all others are
OPTIONAL.

Metadata:

- `title` — string, the community's display title.
- `description` — string.
- `rules` — array of strings.
- `name` — the community's domain name, if any ([BSIP-10](./bsip-10.md)).
- `roles` — a record mapping an author identity to a role object `{ "role": string }`. Keys are either
  a key-derived author address (an IPNS name) or an author domain name. The roles `owner`, `admin`,
  and `moderator` have the meaning given in [Roles](#roles); other role names MAY be used by
  convention and grant nothing in this protocol. Role objects MAY carry additional fields.
- `flairs` — a record mapping a flair scope to an array of [flair objects](./bsip-2.md#flairs). The
  scopes `post` and `author` list the flairs authors may choose when the corresponding feature is
  enabled.
- `suggested` — owner-suggested presentation; clients MAY ignore any of it without breaking
  interoperability: `primaryColor`, `secondaryColor`, `avatarUrl`, `bannerUrl`, `backgroundUrl`,
  `language`, and `uiType` (how the owner suggests clients render the community, for example
  `"author"` for a profile, [BSIP-14](./bsip-14.md)). It never affects validation or loading.
- `features` — feature toggles; see [Features](#features).

Posts and indexes:

- `posts` — the community's posts as a pages object (see [Pages](#pages)).
- `modQueue` — `{ "pageCids": { <sortName>: <cid> } }`, the paginated publications pending moderator
  approval (see [Moderation queue](#moderation-queue)).
- `postUpdates` — a record mapping a time bucket, written as a decimal string of seconds, to the CID
  of a directory of post comment updates ([BSIP-5](./bsip-5.md#fetching-comment-updates)).
- `pageSorts` — `{ "posts"?: { <sortName>: PageSort }, "replies"?: { <sortName>: PageSort } }`,
  describing each configured sort (see [Pages](#pages)).
- `lastPostCid` — CID of the most recent post.
- `lastCommentCid` — CID of the most recent comment (post or reply).
- `statsCid` — CID of a statistics record. Its format is not specified by a BSIP.

Protocol and trust:

- `challenges` — REQUIRED. An array, possibly empty, of the community's **public** anti-spam challenge
  descriptors (see [Anti-spam configuration](#anti-spam-configuration)).
- `encryption` — REQUIRED. `{ "type": "ed25519-aes-gcm", "publicKey": <base64, 32 bytes> }`, the key
  publishers encrypt to (see [Encryption](#encryption)).
- `pubsubTopic` — the pubsub topic publishers use to reach this community ([BSIP-4](./bsip-4.md)).
  A record without `pubsubTopic` belongs to a read-only community that accepts no publications over
  pubsub; clients MUST NOT attempt a challenge exchange with it.
- `anchor` — `{ "publicKey": <IPNS name> }`, present exactly when the community is delegated
  ([BSIP-11](./bsip-11.md)).
- `createdAt` — REQUIRED. Integer Unix time in seconds when the community was created.
- `updatedAt` — REQUIRED. Integer Unix time in seconds of this record version.
- `protocolVersion` — REQUIRED. String, currently `"1.0.0"`.
- `signature` — REQUIRED. The community's signature over the record (see [Signing](#signing)).

A record MUST NOT carry a name reserved for runtime use: `cid`, `shortCid`, `updateCid`,
`shortUpdateCid`, `shortAddress`, `shortCommunityAddress`, `nameResolved`, `ipnsHops`, `raw`,
`deleted`, `signer`, `settings`, `editable`, `state`, `clients`, `startedState`, `started`,
`publishingState`, `updatingState`, `exports`, or `abortSignal`.

Example (abbreviated):

```jsonc
{
  "name": "news.bso",
  "title": "News From Trusted Sources",
  "description": "Only submit news from trusted sources here.",
  "rules": ["Be nice.", "Don't be mean."],
  "roles": {
    "john.bso": { "role": "owner" },
    "12D3KooWJJcSwMHrFvsFL7YCNDLD95kBczEfkHpPNdxcjZwR2X2Y": { "role": "moderator" }
  },
  "features": { "noNestedReplies": true, "postFlairs": true },
  "flairs": { "post": [{ "text": "Breaking", "backgroundColor": "#d00" }] },
  "challenges": [
    {
      "type": "text/plain",
      "description": "Solve a math problem.",
      "exclude": [{ "postScore": 10, "firstCommentTimestamp": 604800 }, { "roles": ["moderator"] }]
    }
  ],
  "encryption": { "type": "ed25519-aes-gcm", "publicKey": "<base64, 32 bytes>" },
  "pubsubTopic": "12D3KooWBexQF4qDvyaxDgK4r2qPNk5z8s9b1eU5z2bnR6dExamPLe",
  "postUpdates": { "86400": "Qm…", "604800": "Qm…" },
  "createdAt": 1504321021,
  "updatedAt": 1728174027,
  "protocolVersion": "1.0.0",
  "posts": { "pages": { "hot": { "comments": [/* … */], "nextCid": "Qm…" } }, "pageCids": { "new": "Qm…" } },
  "signature": {
    "type": "ed25519",
    "signature": "<base64>",
    "publicKey": "<base64, 32 bytes>",
    "signedPropertyNames": [
      "name", "title", "description", "rules", "roles", "features", "flairs", "challenges",
      "encryption", "pubsubTopic", "postUpdates", "createdAt", "updatedAt", "protocolVersion", "posts"
    ]
  }
}
```

### Encryption

`encryption` declares how publishers encrypt what they send to the community in the challenge exchange
([BSIP-4](./bsip-4.md#encryption)). `type` is `"ed25519-aes-gcm"`, the only scheme currently defined,
and `publicKey` is the base64 Ed25519 public key to encrypt to. `publicKey` MUST be the same key as the
record's `signature.publicKey`, and the community signs its `CHALLENGE` and `CHALLENGEVERIFICATION`
messages with that key. Publishers MUST NOT send a challenge request to a community whose `encryption`
type they do not support.

### Roles

Roles are claims by the community about who may moderate it:

- `owner` — may edit the record's editable properties ([BSIP-9](./bsip-9.md)), including `name`
  and `roles`, and moderate.
- `admin` — may edit the record's editable properties except `name` and `roles`, and moderate.
- `moderator` — may moderate comments ([BSIP-8](./bsip-8.md)).

Owners, admins, and moderators are never pseudonymized ([BSIP-2](./bsip-2.md#pseudonymity)) and may
still reply, and edit their comments, under a locked post. A role key matches a publication when the key is a key-derived
address equal to the IPNS name of the publication's `signature.publicKey`, or when it is a domain name
equivalent to the publication's `author.name` that resolves to that same key
([BSIP-10](./bsip-10.md)). A role MUST NOT be matched against a client-derived `author.address`.

### Features

`features` is a record of toggles that change what the community accepts. Each is OPTIONAL; boolean
toggles default to off, `maxCrosspostDepth` defaults to the protocol cap, and the gallery limits
default to 0 (no galleries). A community enforces its own toggles when accepting publications;
clients SHOULD read them to avoid publications that will be rejected, and MUST NOT treat them as
guarantees about content they display. Unknown toggles MUST be ignored.

| Toggle | Effect |
| --- | --- |
| `noImages`, `noVideos`, `noAudio` | Reject comments whose `link` or any `gallery` item is an image, a video (animated images included), or audio. |
| `noImageReplies`, `noVideoReplies`, `noAudioReplies`, `noReplyLinks` | The same, for replies only; `noReplyLinks` rejects any reply `link` but not a reply `gallery`. |
| `maxPostGalleryItems`, `maxReplyGalleryItems` | Non-negative integers: the most items a post's or a reply's `gallery` may have ([BSIP-2](./bsip-2.md#author-set-comment-fields)). Absent or 0 rejects any gallery. There is no default, so clients read them to decide whether to offer one. |
| `noMarkdownImages`, `noMarkdownVideos`, `noMarkdownAudio` | Reject content (and content edits) that embeds that media in Markdown or HTML. |
| `noSpoilers`, `noSpoilerReplies` | Reject `spoiler: true` on comments, or on replies only. |
| `requirePostLink`, `requireReplyLink` | Require an `https` `link` on posts, or on replies. A `gallery` does not satisfy them. |
| `requirePostLinkIsMedia`, `requireReplyLinkIsMedia` | Require that link to be image, video, or audio. A post with several files then carries the first in `link` and the rest in `gallery`. |
| `noNestedReplies` | Reject replies to replies (maximum depth 1). |
| `noUpvotes`, `noDownvotes`, `noPostUpvotes`, `noPostDownvotes`, `noReplyUpvotes`, `noReplyDownvotes` | Reject those votes ([BSIP-6](./bsip-6.md)). |
| `postFlairs`, `requirePostFlairs` | Let authors choose post flairs from `flairs.post`, or require one on posts. |
| `authorFlairs`, `requireAuthorFlairs` | Let authors choose author flairs from `flairs.author`, or require one. |
| `noCrossposts`, `maxCrosspostDepth` | Reject crossposts, or cap how deep a crosspost chain may be ([BSIP-12](./bsip-12.md)). |
| `noArchive` | Moderators may not newly archive posts ([BSIP-8](./bsip-8.md)). |
| `pseudonymityMode` | `per-post`, `per-reply`, or `per-author` ([BSIP-2](./bsip-2.md#pseudonymity)). |
| `safeForWork` | Informational: the community declares itself safe for work. |

### Pages

A community's posts, and a comment's replies ([BSIP-5](./bsip-5.md)), are delivered as **pages**. A
pages object has the shape:

```jsonc
{
  "pages": { "<sortName>": { "comments": [{ "comment": <comment record>, "commentUpdate": <comment update> }], "nextCid": "Qm…" } },
  "pageCids": { "<sortName>": "Qm…" }
}
```

- `pages` maps a sort name to its first page, embedded ("preloaded") in the record. The first key is
  the sort a client should open by default; clients MUST NOT otherwise rely on key order.
- `pageCids` maps a sort name to the CID of its first page, for sorts that are not preloaded.
  `pageCids` MAY be omitted when everything fits in the preloaded pages.
- A page is `{ "comments": [...], "nextCid"?: <cid> }`. Each entry pairs the immutable comment record
  ([BSIP-2](./bsip-2.md)) with the latest comment update the community signed for it
  ([BSIP-5](./bsip-5.md)), nested reply pages included. `nextCid` points at the next page of the same
  sort.
- A page fetched from `pageCids` SHOULD be at most 1 MiB, and each page reached through `nextCid` at
  most twice the size allowed for the page before it, and never more than 32 MiB. A community
  applies these limits to the page's **DAG size**: the total size of the blocks produced by
  importing the whole serialized page as in
  [BSIP-2, Addressing and fetching](./bsip-2.md#addressing-and-fetching), which `ipfs add` reports
  as the file's cumulative size. That is the page's UTF-8 byte length plus the dag-pb and UnixFS
  framing of each 262,144-byte chunk and the links of the nodes above them, about 7,950 bytes for a
  32 MiB page. It is not the sum of the entries' sizes taken as separate files, which counts framing
  a page does not have and misses the framing it has.
- Readers MAY refuse a page whose bytes exceed its limit; pkc-js does, and stops downloading at the
  limit ([BSIP-16](./bsip-16.md#verifying-what-was-fetched)). The DAG size of a page always exceeds
  its byte length, so a reader never refuses a page that its community kept within the limit. pkc-js
  communities keep every page's DAG size at least 1 KiB under its limit.

The sorts a community generates are its operator's choice. An unconfigured community generates the
post sorts `hot`, `new`, `topHour`, `topDay`, `topWeek`, `topMonth`, `topYear`, `topAll`, and `active`,
with `hot` preloaded, and the reply sorts `best`, `new`, `old`, `newFlat`, and `oldFlat`, with `best`
preloaded. `newFlat` and `oldFlat` list a post's whole reply subtree flattened and exist only under
posts. Clients MUST discover a community's sorts from the keys of `pages` and `pageCids` rather than
from a fixed list, and MUST accept any non-empty sort name other than `__proto__`, `constructor`, and
`prototype`.

When the community configures its sorts, the record carries `pageSorts`, describing each sort by name:
`name` (the sort implementation's registry name, if any), `description`, and `publicOptions` (a record
of string options the sort runs with). When every preloaded page holds the community's whole comment
set, a community MAY publish only the preloaded pages; a client that wants another sort then sorts
those comments locally.

Pinned comments come first in every sort by default. By default a community's post pages exclude
removed, deleted, pending, and disapproved comments, while reply pages include removed and deleted
replies (so clients can render a placeholder that keeps the thread's structure) and exclude pending
ones. These are defaults: a sort MAY include removed or deleted comments, so clients MUST check each
entry's comment update before rendering it as live content.

Pages are regenerated as content changes; their CIDs are not stable and MUST NOT be treated as
permanent identifiers.

### Moderation queue

When a community holds comments for approval ([Anti-spam configuration](#anti-spam-configuration)),
`modQueue.pageCids` maps a sort name to the CID of the first page of pending comments. Mod-queue pages
have the same shape as other pages, but each entry carries the reduced comment update defined in
[BSIP-5](./bsip-5.md#reduced-comment-updates), and entries MAY be at any depth with different
parents. Mod-queue pages are never preloaded.

### Anti-spam configuration

The record's `challenges` array is the **public** description of the community's anti-spam policy:
enough for a publisher to know what to expect, never the secret material. Each descriptor has:

- `type` — REQUIRED. The challenge's media type, for example `text/plain` or `image/png`.
- `description` — string describing the challenge for a UI.
- `challenge` — a static challenge known in advance (for example a password prompt), if any.
- `caseInsensitive` — boolean; answers are compared without regard to case.
- `pendingApproval` — boolean; a comment that passes the challenges while this challenge applied to it
  (the author was not excluded from it) is held in the moderation queue instead of published.
- `publicOptions` — a record of string options the owner chose to publish, for example a published
  allowlist. Options are private unless the owner names them; secrets such as a question's answer
  MUST NOT be published.
- `exclude` — an array of exclude items describing who skips this challenge (see below).

The challenge exchange itself is specified in [BSIP-4](./bsip-4.md). Answers, passwords, private
allowlists, and rate-limit state stay with the community node.

An author skips a challenge when **any** of its exclude items matches, and an item matches when
**all** of the conditions it sets hold:

- `postScore`, `replyScore` — the author's post or reply karma in this community
  ([BSIP-5](./bsip-5.md#author-community-standing)) is at least this value.
- `postCount`, `replyCount` — the author has published at least this many posts or replies in this
  community.
- `firstCommentTimestamp` — a duration in seconds: the author's first comment in this community is at
  least this old.
- `publicationType` — `{ post?, reply?, vote?, commentEdit?, commentModeration?, communityEdit? }`:
  the publication is one of the types set to `true`.
- `rateLimit` — the author has published fewer than this many publications of this type in the past
  hour; `rateLimitChallengeSuccess: false` counts failed attempts instead of successful ones.
- `publicKeys` — the IPNS name of the publication's signing key is in this list.
- `names` — the publication's `author.name` is equivalent to a name in this list and resolves to the
  signing key ([BSIP-10](./bsip-10.md)).
- `roles` — the author holds one of these [roles](#roles).
- `challenges` — every challenge at these indexes in `challenges` succeeded.
- `community` — `{ addresses, maxCommentCids, postScore?, replyScore?, firstCommentTimestamp? }`: among
  the first `maxCommentCids` (default 3) CIDs the publisher listed in `challengeCommentCids`
  ([BSIP-4](./bsip-4.md)), at least one is a comment in one of `addresses`, signed by the same key as
  the publication, whose author standing there meets the given thresholds.

Records from older communities MAY carry the removed exclude fields `address` and `role`; readers MUST
ignore them and MUST NOT let them grant anything.

### Signing

The community record is signed following the rules of [BSIP-2, Signatures](./bsip-2.md#signatures),
by the key whose IPNS name the record was published under. Every field of the record except
`signature` MUST be listed in `signedPropertyNames`. A reader MUST check that:

1. the record carries no field outside `signedPropertyNames` and no reserved runtime field;
2. the signature is valid;
3. the PeerId derived from `signature.publicKey` equals the IPNS name the record was fetched from (for
   a delegated community, the last key of the chain);
4. `encryption.publicKey` is the same key as `signature.publicKey`;
5. if the record carries `anchor`, the delegation checks of
   [BSIP-11](./bsip-11.md#verification-summary) pass;
6. if the reader loaded the community by name, the record's `name` is the same name
   ([BSIP-10](./bsip-10.md#verifying-a-community-name));
7. every preloaded page verifies, as described below.

Whether the record's `name` resolves to the identity key does not affect the record's validity; it
decides only whether the name may be shown as the community's verified identity
([BSIP-10](./bsip-10.md#verification-outcomes)).

A page verifies when every entry does. An entry verifies when:

- its comment record verifies ([BSIP-2](./bsip-2.md#signatures)) and hashes to the CID the entry
  stands for;
- its comment belongs to this community, by the membership rules of
  [BSIP-10](./bsip-10.md#community-membership-of-comments);
- its structure matches where it appears: a post has `depth` 0 and no `postCid`; in a reply page, each
  comment's `parentCid` is the comment whose replies these are, its `depth` is one more than its
  parent's, and its `postCid` is the thread's post; in a flat page, each comment's `postCid` is the
  post;
- its comment update verifies against it ([BSIP-5](./bsip-5.md#verification)).

## Rationale

- **IPNS name as identity** lets a community keep a stable address while its content changes, without
  a blockchain or a registrar. Delegation ([BSIP-11](./bsip-11.md)) keeps that identity stable while
  the signing key rotates.
- **Pinning `encryption.publicKey` to the signer** stops a record from delegating the challenge
  exchange to a key the reader never validated against the address it typed.
- **Public vs. private challenge configuration** lets publishers prepare for a community's anti-spam
  policy without leaking the secrets that make it effective; `publicOptions` makes publishing any part
  of it an explicit owner decision.
- **Configurable sorts discovered from the record** let communities choose their feeds without every
  client knowing every sort in advance.
- **Embedding `{ comment, commentUpdate }` in pages** lets a client render a feed — content plus vote
  counts and reply previews — from one fetch, while the immutable comment and the mutable update stay
  independently signed.

## Backwards Compatibility

`statsCid` was previously REQUIRED and is now OPTIONAL. Records without `pubsubTopic` used to be
treated as using a default topic; they now mean a read-only community. Older records MAY carry the
community address as `address` instead of `name`, and older exclude items MAY carry `address` or
`role`; see [Anti-spam configuration](#anti-spam-configuration). Readers parse records loosely enough
that fields added by newer versions, such as `pageSorts` and `anchor`, do not break them, but such
fields are still signed and verified.

Since pkc-js 0.0.140, its communities measure pages by DAG size as [Pages](#pages) specifies.
Earlier versions decided where a page ends by summing each entry's DAG size as if it were a separate
file, which undercounts a page of a few hundred large entries by more than the 1 KiB margin they
kept. They still checked the whole page's DAG size before publishing it, so such a page was never
published: the generation failed with `ERR_PAGE_GENERATED_IS_OVER_EXPECTED_SIZE`, and the community
kept its previous record until a later cycle packed its pages differently. A community on a version
before 0.0.140 can therefore stop publishing new records for a while, but it does not publish pages
over these limits. Versions before 0.0.127 did not stop doubling page sizes at 32 MiB, so their
communities could publish larger pages, which pkc-js readers refuse since 0.0.127.

## Security Considerations

- **Owner authority.** Anyone can fetch a community record, but only the holder of the signing key can
  produce a valid signature. Verifiers MUST bind the record to its address through the public key and,
  for delegated communities, through the chain; they MUST NOT trust an IPNS name they were merely
  handed.
- **Name resolution.** A domain name MUST resolve to the identity key before it is shown as verified,
  or a community could be impersonated with a look-alike name ([BSIP-10](./bsip-10.md)).
- **Roles bound to keys.** Role keys MUST be matched against the publication's signing key, directly
  or through a verified name. Matching against a publisher-supplied address would let anyone claim a
  moderator's name.
- **Role scope.** `roles` are claims by the community; they govern moderation within it and carry no
  authority outside it.
- **Advisory metadata.** `suggested` and `features` are community-asserted; clients SHOULD apply their
  own policy (for example for media embedding and NSFW handling) rather than trusting them blindly.
- **Removed content in pages.** Sorts can include removed or deleted comments. A client that renders
  page entries without checking their comment updates can display content moderators removed.
- **Published options.** `publicOptions` is public forever once published. A challenge whose security
  depends on a secret (a question's answer, a password) MUST NOT publish it.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
