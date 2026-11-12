---
bsip: 2
title: Comments
description: The format, addressing, and signing of Bitsocial comments — the posts and replies users publish to communities.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues/6
status: Draft
type: Standards Track
category: Core
created: 2026-06-15
---

## Abstract

A **comment** is the basic unit of user-authored content in Bitsocial. Posts and replies are both
comments: an object signed by an author and published to a community. Once accepted by a community,
a comment is stored as an immutable record addressed by its IPFS CID. This BSIP defines the comment
format, the fields every publication shares, how comments are addressed and fetched, how posts and
replies relate, how a community may pseudonymize authors, and the signature rules that every signed
Bitsocial record follows.

## Motivation

Independent Bitsocial clients must agree on exactly what a comment is — which fields exist, which are
author-set, which are community-set, which bytes are signed, and how its address is computed — or they
cannot display, validate, or relay each other's content. This BSIP is the canonical description of that
shared format. Its [Signatures](#signatures) section is also the signing scheme the other Core BSIPs
reference.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Overview

A comment exists in three forms:

1. The **comment publication**: the object the author signs and sends, encrypted, to the community
   in a challenge exchange ([BSIP-4](./bsip-4.md)). It exists only during publishing.
2. The **comment record**: the publication exactly as signed, plus a few fields the community sets
   ([The comment record](#the-comment-record)). The community adds it to IPFS once it accepts the
   publication; from then on it is immutable and addressed by its CID.
3. The **comment update**: the mutable state of the comment (votes, replies, moderation), signed by
   the community and specified in [BSIP-5](./bsip-5.md).

Clients display a comment by combining its record with its latest comment update.

### Common publication fields

Every publication type — comments, votes ([BSIP-6](./bsip-6.md)), comment edits
([BSIP-7](./bsip-7.md)), comment moderations ([BSIP-8](./bsip-8.md)), and community edits
([BSIP-9](./bsip-9.md)) — carries these fields:

- `timestamp` — REQUIRED. Positive integer Unix time in **seconds**.
- `protocolVersion` — REQUIRED. Non-empty string, currently `"1.0.0"`.
- `signature` — REQUIRED. The publisher's signature: the author's, or for a moderation or community
  edit, the role holder's (see [Signatures](#signatures)).
- `author` — OPTIONAL. The author object (see [Authors](#authors)). When the author has no fields
  to publish, `author` MUST be omitted; it MUST NOT be an empty object `{}`.
- `communityPublicKey` and `communityName` — the community the publication is addressed to (see
  [Community addressing](#community-addressing)).

Fields that only exist inside a client — the signing key (`signer`), the challenge options passed
alongside a publication (`challengeRequest`), and derived convenience values such as
`communityAddress`, `address`, `publicKey`, `shortAddress`, `shortCid`, and `nameResolved` — are never
signed and MUST NOT appear on the wire. A publication MUST NOT carry a field its type reserves for
another purpose (see [Reserved names](#reserved-names)); communities reject such publications.

### Author-set comment fields

A comment publication is a JSON object with the [common publication fields](#common-publication-fields)
and the following content fields. The author MUST set at least one of `title`, `content`, `link`,
`crosspost`, or `gallery`.

- `title` — string, the post title.
- `content` — string, the body text (Markdown).
- `link` — string URL, 1 to 2000 characters.
- `linkWidth`, `linkHeight` — positive numbers, the media dimensions of `link`, when known.
- `linkHtmlTagName` — non-empty string, a hint for how to embed `link` (for example `img`, `video`,
  or `audio`).
- `flairs` — array of [flair objects](#flairs) chosen by the author for the post.
- `spoiler` — boolean.
- `nsfw` — boolean.
- `parentCid` — CID of the parent comment. Present on replies, absent on posts.
- `postCid` — CID of the root post of the thread. REQUIRED when `parentCid` is set; MUST be absent
  on posts.
- `quotedCids` — array of CIDs of comments this reply quotes. Only replies may carry it, and every
  quoted comment MUST belong to the same thread.
- `crosspost` — a repost of another comment record, embedded verbatim. Its shape and verification are
  specified in [BSIP-12](./bsip-12.md). A comment whose only payload is `crosspost` is valid.
- `gallery` — a non-empty array of media items (images, videos, or audio). Each item is an object
  with `url` (string, 1 to 2000 characters), `htmlTagName` (`img`, `video`, or `audio`), and
  optional `width` and `height` (positive numbers) and `alt` (string of at most 1000 characters, the
  author's text description of the media). Items MAY carry further members, which are signed with the
  comment and MUST be preserved. A comment without a gallery omits the field; an empty array is
  invalid. A comment whose only payload is `gallery` is valid. A comment MAY carry both `link` and
  `gallery`; clients show the `link` first, then the gallery. Readers check only this structure;
  the media checks in [Community acceptance of comments](#community-acceptance-of-comments) apply
  when a community accepts the comment, so a later change to them cannot invalidate a published one.

Example comment publication:

```jsonc
{
  "title": "Why did the banana go to the doctor?",
  "content": "It wasn't peeling well.",
  "communityPublicKey": "12D3KooWBexQF4qDvyaxDgK4r2qPNk5z8s9b1eU5z2bnR6dExamPLe",
  "communityName": "jokes.bso",
  "author": { "name": "john.bso", "displayName": "John" },
  "timestamp": 1728174027,
  "protocolVersion": "1.0.0",
  "signature": {
    "type": "ed25519",
    "signature": "<base64>",
    "publicKey": "<base64, 32 bytes>",
    "signedPropertyNames": ["content", "title", "author", "communityPublicKey", "communityName", "protocolVersion", "timestamp"]
  }
}
```

### Flairs

A flair is an object with a required `text` string and optional `backgroundColor` and `textColor`
strings and `expiresAt` (integer Unix time in seconds). Additional fields are allowed. Flairs appear
on comments (`flairs`), on authors (`author.flairs`), in comment updates set by moderators
([BSIP-5](./bsip-5.md)), and in the community record's list of allowed flairs
([BSIP-3](./bsip-3.md)). A community accepts author-chosen flairs only when its `features` allow them
and each flair is deep-equal to one the community lists (see
[Community acceptance of comments](#community-acceptance-of-comments)).

### Posts and replies

`depth` distinguishes posts from replies and is set on the comment record by the community, not by
the author:

- A **post** has `depth` 0, no `parentCid`, and no `postCid`.
- A **top-level reply** has `depth` 1, with `parentCid` and `postCid` both pointing at the post.
- A **nested reply** has `depth` 2 or greater, with `parentCid` pointing at its immediate parent and
  `postCid` pointing at the root post. Its `depth` is its parent's `depth` plus one.

### Authors

The `author` object describes the author. All of its fields are OPTIONAL:

- `name` — the author's domain name, for example `john.bso`. It MUST be a domain name (see
  [BSIP-10](./bsip-10.md)) written in lowercase; a free-form name belongs in `displayName`.
- `displayName` — a free-form display name.
- `previousCommentCid` — CID of the author's previous comment, in any community, forming a
  per-author chain the author maintains.
- `wallets` — a record keyed by chain ticker, each value
  `{ "address": string, "timestamp": integer, "signature": { "signature": string, "type": string } }`
  proving the author controls that address.
- `avatar` — an NFT avatar
  `{ "chainTicker": string, "address": string, "id": string, "timestamp": integer, "signature": { "signature": string, "type": string } }`.
- `flairs` — array of [flair objects](#flairs).

Other fields MAY be present and are signed as part of `author`, except names reserved for derived
values: `address`, `publicKey`, `shortAddress`, `community`, and `nameResolved` MUST NOT appear in a
published `author`. The proof formats inside `wallets` and `avatar` are verified independently of the
publication signature and are not yet specified by a BSIP.

An author's cryptographic identity is the `signature.publicKey` of their publication. Clients derive
the **author address** as `author.name || publicKey`, where `publicKey` is the IPNS name (a libp2p
PeerId string such as `12D3KooW…`) of the signing key ([BSIP-10](./bsip-10.md#key-addresses)). The
address is a runtime value and is not part of the wire object, and it is not a verdict: whether
`author.name` actually belongs to the signing key is a separate result of verifying the name
([BSIP-10](./bsip-10.md#verifying-an-author-name)). A client MUST NOT present `author.name` as the
author's verified identity unless that verification succeeded, and MUST show the key-derived address
when it did not.

The comment update carries the community's view of the author (karma, ban state, moderator flairs) in
`author.community` ([BSIP-5](./bsip-5.md#author-community-standing)); that object is never part of a
publication.

### Community addressing

A publication names the community it is published to with two fields:

- `communityPublicKey` — the IPNS name (PeerId string) of the community's identity key, as defined in
  [BSIP-3](./bsip-3.md#identity-and-addressing). For a delegated community this is the anchor key,
  not the key that signs the community record ([BSIP-11](./bsip-11.md)). REQUIRED on new
  publications.
- `communityName` — the community's domain name, for example `jokes.bso`. REQUIRED when the
  community has a name, and then it MUST be exactly that name; MUST be absent when the community has
  none ([BSIP-10](./bsip-10.md#community-names-on-publications)).

A community rejects a publication whose `communityPublicKey` is missing or differs from its identity
key, or whose `communityName` differs from its name, or that omits `communityName` when the community
has one. Clients MAY expose a convenience `communityAddress` equal to `communityName` when present,
otherwise `communityPublicKey`. `communityAddress` is a runtime value only: it MUST NOT appear on the
wire and MUST NOT be signed.

### The comment record

When a community accepts a comment publication, it stores the **comment record**: the publication
with every author-signed field preserved byte for byte, plus the following community-set fields. They
are not covered by the author's signature and MUST be treated as community-asserted metadata:

- `depth` — REQUIRED. Non-negative integer, as described in [Posts and replies](#posts-and-replies).
- `previousCid` — OPTIONAL. A link to an earlier comment in the same list: for a post, the CID of the
  most recent post the community had accepted before it; for a reply, the CID of an earlier reply to
  the same parent. It is a traversal hint; clients MUST NOT treat it as an authoritative ordering.
- `thumbnailUrl` (non-empty string), `thumbnailUrlWidth`, `thumbnailUrlHeight` (positive numbers) —
  OPTIONAL. A thumbnail the community generated for `link`.
- `pseudonymityMode` — OPTIONAL. One of `per-post`, `per-reply`, or `per-author`, present when the
  community pseudonymized the author of this comment (see [Pseudonymity](#pseudonymity)).

A record MUST NOT carry any other community-set field. Mutable counts, scores, replies, and moderation
state are not part of the comment record; they live in the comment update ([BSIP-5](./bsip-5.md)).

Because the record is the publication byte for byte, a community MUST refuse a publication it could
not store and republish exactly, including one with an empty `author` object or with a string that is
not well-formed Unicode (for example a lone UTF-16 surrogate), since either would change the signed
bytes or the CID once stored.

### Reserved names

Some names are reserved because they mean something else on another record or in implementations,
and accepting them on the wire would let a record smuggle state into a client. A comment record, and
a comment publication, MUST NOT carry a top-level member named:

- a comment update field that is not also a comment field: `cid`, `upvoteCount`, `downvoteCount`,
  `replyCount`, `childCount`, `number`, `postNumber`, `edit`, `pinned`, `locked`, `archived`,
  `removed`, `reason`, `approved`, `updatedAt`, `lastChildCid`, `lastReplyTimestamp`, `replies`, or
  `pendingApproval`;
- a runtime or transport name: `signer`, `challengeRequest`, `communityAddress`, `challengeAnswers`,
  `challengeCommentCids`, `comment`, `commentUpdate`, `original`, `shortCid`,
  `shortCommunityAddress`, `deleted`, `raw`, `state`, `clients`, `publishingState`, `updatingState`,
  `nameResolved`, or `abortSignal`;
- a storage name used by the current implementation: `insertedAt`, `authorSignerAddress`,
  `originalCommentSignatureEncoded`, `extraProps`, `challengeCommentUpdate`, `postUpdatesBucket`,
  `publishedToPostUpdatesMFS`, or `rowid`.

A comment publication additionally MUST NOT carry the community-set fields of
[the comment record](#the-comment-record). The reserved names inside `author` are listed in
[Authors](#authors). Clients MUST reject a fetched comment record that carries a reserved name.

### Addressing and fetching

A comment is addressed by the CID of its record. The CID is computed as follows:

1. Serialize the comment record as JSON with no insignificant whitespace, with the keys of every
   object, at every depth, sorted in ascending order of their UTF-16 code units. Strings are escaped
   as ECMAScript `JSON.stringify` escapes them: `"`, `\`, and U+0000–U+001F are escaped (using `\b`,
   `\f`, `\n`, `\r`, `\t` where they apply and `\u00xx` otherwise), lone surrogates are written as
   `\udxxx`, and every other character is written as itself. Numbers are written as ECMAScript's
   `String(number)` writes them. Array elements keep their order.
2. Encode the resulting string as UTF-8.
3. Import those bytes as IPFS does by default without raw leaves: a UnixFS file in dag-pb, in
   262,144-byte chunks with a balanced layout of at most 174 children per node, hashed with sha2-256,
   and expressed as a CIDv0 (`Qm…`). For a record of `n` ≤ 262,144 bytes `b`, this is the base58btc
   encoding of `0x12 0x20` followed by the sha2-256 of the block
   `0x0a ‖ varint(m) ‖ 0x08 0x02 0x12 ‖ varint(n) ‖ b ‖ 0x18 ‖ varint(n)`, where `m` is the length of
   everything after `varint(m)`.

The comment record is fetched by its CID from the peer-to-peer network, or from an IPFS gateway at
`https://<gateway>/ipfs/<cid>`. A client MUST check that a fetched record hashes to the CID it
requested, and MUST verify its signature as described below; the CID proves integrity, not
authorship. Test vectors for this computation are in
[`assets/bsip-2/cid-vectors.json`](../assets/bsip-2/cid-vectors.json).

### Pseudonymity

A community MAY set `features.pseudonymityMode` in its record ([BSIP-3](./bsip-3.md)) to hide the
long-lived identities of its authors from other users. When it does, for every accepted comment whose
author does not hold the `owner`, `admin`, or `moderator` role, the community:

1. replaces `author` with an object containing only the author's `displayName`, or omits `author`
   when there is none;
2. re-signs the comment, following [Signatures](#signatures), with an **alias** key it generates and
   keeps privately:
   - `per-reply` — a fresh alias for every comment;
   - `per-post` — one alias per author per thread: a new post gets a fresh alias, and the author's
     replies in that thread reuse it;
   - `per-author` — one alias per author for the whole community;
3. sets `pseudonymityMode` on the stored record.

The comment record then carries the alias's signature, and clients verify it like any other record.
Author edits of a pseudonymized comment are authorized against the original author and re-signed with
the same alias ([BSIP-7](./bsip-7.md)). Pseudonymity hides an author from other users only: the
community node knows the mapping between aliases and original authors.

### Community acceptance of comments

In addition to the rules every publication must meet ([BSIP-4](./bsip-4.md#publication-acceptance)),
a community MUST reject a comment publication that:

- sets none of `title`, `content`, `link`, `crosspost`, or `gallery`;
- sets `parentCid` without `postCid`, or whose `postCid` is not the root post of `parentCid`'s
  thread;
- sets `quotedCids` on a post, or quotes a comment that does not exist in the community, belongs to
  another thread, or is pending approval;
- carries a `crosspost` the community does not accept ([BSIP-12](./bsip-12.md));
- carries a `gallery` when the community's `features.maxPostGalleryItems` (for a post) or
  `features.maxReplyGalleryItems` (for a reply) is absent or 0, or with more items than that maximum
  ([BSIP-3](./bsip-3.md#features));
- carries a `gallery` item whose `url` is not an `https` URL whose path ends in a file extension of
  an image, video, or audio type, or whose `htmlTagName` does not match that type: `img` for images
  (animated ones included), `video` for video, `audio` for audio;
- has the same signature as a comment it already stored (a duplicate);
- carries author-chosen post `flairs` when `features.postFlairs` is not enabled, or a post flair not
  listed in the record's `flairs.post`; or `author.flairs` when `features.authorFlairs` is not
  enabled, or an author flair not listed in `flairs.author` (author flairs are not checked when the
  community pseudonymizes authors);
- violates an enabled feature toggle in the community record's `features` ([BSIP-3](./bsip-3.md)),
  for example a link or media restriction, a spoiler restriction, markdown media restrictions,
  required flairs, or `noNestedReplies`.

### Signatures

Every signed Bitsocial record — publications, comment records, comment updates, community records,
and challenge-exchange messages — carries a `signature` object:

```jsonc
{
  "type": "ed25519",
  "signature": "<base64, 64 bytes>",
  "publicKey": "<base64, 32 bytes>",
  "signedPropertyNames": ["...the names of the signed fields..."]
}
```

`type` MUST be `"ed25519"`, the only signature type currently defined; verifiers SHOULD reject other
types. Records stored on IPFS carry `signature` and `publicKey` as base64 strings in the standard
alphabet **without** `=` padding (86 and 43 characters); since implementations compare public keys
as strings, padded values MUST NOT be produced. Challenge-exchange messages carry them as CBOR byte
strings ([BSIP-4](./bsip-4.md#message-envelope)).

To sign a record, the signer first removes, at every depth, object properties whose value is `null`,
absent, or an empty object (array elements are left as they are), and sets `signedPropertyNames` to
the names of the record's remaining signable fields. The signed message is then built as follows, by
signer and verifier alike:

1. Take the record's properties whose names appear in `signedPropertyNames`, in any order.
2. Drop every such property whose value is `null` or absent. A verifier MUST accept a name listed in
   `signedPropertyNames` that the record does not carry.
3. Encode the remaining properties as a CBOR map ([RFC 8949](https://www.rfc-editor.org/rfc/rfc8949))
   using deterministic encoding, as [cborg](https://github.com/rvagg/cborg)'s default encoder does:
   - every map, at every depth, has its keys sorted shorter-first and then bytewise, which for the
     text keys used here is the core deterministic order of
     [RFC 8949, section 4.2.1](https://www.rfc-editor.org/rfc/rfc8949#section-4.2.1);
   - lengths are definite and no tags are used;
   - integers within ±(2⁵³ − 1) use the shortest integer encoding, and `-0` encodes as `0`;
   - other numbers use the shortest of float16, float32, or float64 that holds the value exactly;
   - strings are text strings, booleans are `true`/`false`, a nested `null` is CBOR `null`, arrays
     keep their order, and byte strings (only in challenge-exchange messages) are byte strings;
   - an `undefined` value cannot be encoded, so a record carrying one cannot be signed or verified.
4. Sign the bytes with Ed25519 ([RFC 8032](https://www.rfc-editor.org/rfc/rfc8032)) using the key
   whose public half is `publicKey`. Verifiers SHOULD apply the
   [ZIP-215](https://zips.z.cash/zip-0215) validation rules, as the reference implementation does, so
   that every implementation accepts exactly the same signatures.

The `signature` field itself is never listed in `signedPropertyNames`. Verification re-derives the
signed bytes from the `signedPropertyNames` carried in the record — never from a hardcoded list —
and checks the signature against `publicKey`. This keeps records signed under older field sets
verifiable.

A verifier MUST reject a record that carries a field not listed in its `signedPropertyNames`, with
one exception: on a comment record, the [community-set fields](#the-comment-record) and fields
unknown to the verifier MAY be present unsigned. A verifier MUST still reject a comment record that
carries a known author-signable field (any field from
[Author-set comment fields](#author-set-comment-fields) or the
[common publication fields](#common-publication-fields)) that is not listed in `signedPropertyNames`.
Unsigned fields MUST NOT be presented as authored by the signer.

Test vectors for these rules, including the CBOR bytes each signature covers and negative cases,
are in [`assets/bsip-2/signature-vectors.json`](../assets/bsip-2/signature-vectors.json).

## Rationale

- **CBOR over a list of named fields** gives a canonical, language-independent byte string to sign,
  and lets the protocol evolve: new optional fields can be added without breaking verification of
  older records, because verifiers trust each record's own `signedPropertyNames`.
- **Rejecting unsigned fields** closes the gap a relay could otherwise use to append forged
  properties; the comment record's community-set fields are the one deliberate, named exception.
- **Splitting author-set and community-set fields** keeps the author's signature meaningful: a
  community can attach `depth` or a thumbnail without being able to forge author content.
- **Storing the publication byte for byte** keeps the record's CID and signature stable through the
  community's storage and every later page that embeds it.
- **Separating mutable state into comment updates** ([BSIP-5](./bsip-5.md)) lets the immutable,
  CID-addressed comment stay stable while votes and replies accumulate.

## Backwards Compatibility

Older records carry the community address as a single signed field, `subplebbitAddress`, rather than
as separate `communityPublicKey` and `communityName`, and older authors carry a signed
`author.address`. An implementation that reads such records SHOULD treat a value in domain form (for
example ending in `.bso` or `.eth`) as the name and any other value as the public key, and MUST NOT
require `communityPublicKey` on records stored before it was introduced. Communities MUST reject new
publications that carry `subplebbitAddress` or `communityAddress`. Because verification uses each
record's own `signedPropertyNames`, records signed with a different set of fields remain verifiable.

## Security Considerations

- **Unsigned fields.** A relaying peer can append arbitrary properties to a record in transit.
  Verifiers MUST reject records with unsigned fields as specified above and MUST NOT act on
  unsigned data as if the author had signed it.
- **Name spoofing.** `author.name` and `communityName` are human-readable claims. They MUST be
  verified against the corresponding public key ([BSIP-10](./bsip-10.md)) before display as
  verified; otherwise an attacker could publish under a name they do not control.
- **Content addressing.** A comment fetched by CID is integrity-protected by the hash, but the CID
  does not prove authorship — the signature does. Always verify both.
- **Pseudonymity limits.** Pseudonymity protects authors from other users, not from the community
  operator, who holds the alias mapping. Other metadata (writing style, timing, links) can still
  correlate an author's comments.
- **Link handling.** `link`, `linkHtmlTagName`, and thumbnails describe remote media. Clients SHOULD
  treat them as untrusted input and apply their own embedding, sanitization, and privacy policy;
  fetching remote media can reveal the reader's IP address to its host.
- **Non-canonical strings.** Strings that are not well-formed Unicode can encode differently in
  different implementations, breaking signature or CID verification after storage; communities
  reject them for that reason.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
