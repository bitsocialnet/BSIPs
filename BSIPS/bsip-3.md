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
requires: 2
---

## Abstract

A **community** is a key-controlled space that holds posts. It carries mutable metadata — title,
description, rules, moderator roles, anti-spam configuration — and paginated lists of its posts. The
community record is published as a mutable record under the hash of the community's public key (its
IPNS name) and is signed by the community owner. This BSIP defines the community record, how it is
addressed, how its posts are paginated and sorted, and how it is signed.

## Motivation

Communities are the unit of moderation and hosting in Bitsocial. Clients must agree on the community
record format to render a community, fetch its posts, resolve its name, and verify that an update
genuinely came from the community owner. This BSIP is that shared definition.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHOULD", "SHOULD NOT", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Identity and addressing

A community is identified by a keypair. Its **address** is the IPNS name derived from the public key —
a libp2p PeerId string such as `12D3KooW…`. The latest community record is published as a mutable
(IPNS) record under that name; each update increases the record's version, and the network keeps only
the latest version.

A community MAY also have a human-readable crypto domain name (for example `news.bso` or
`news.eth`), carried in the record's `name` field. Clients resolve such names to a public key through
pluggable name resolvers — `.bso` names resolve through the Bitsocial name layer (today the
`bso-resolver`, later the Bitsocial Network appchain; see the Appchain category) and `.eth` names
through ENS. A client MUST verify that a resolved name maps to the record's actual public key before
presenting the name as the community's verified identity.

The community's runtime `address` is `name || publicKey`. As with comments ([BSIP-2](./bsip-2.md)),
`address` is a derived convenience and is not carried on the wire; the wire record stores only the
optional `name`.

### The community record

The community record is a JSON object with the following fields. REQUIRED fields are marked; all
others are OPTIONAL.

Metadata:

- `title` — string, the community's display title.
- `description` — string.
- `rules` — array of strings.
- `roles` — a record mapping an author address to a role object `{ "role": "owner" | "admin" | "moderator" }`. Roles other than these three MAY be used by convention.
- `flairs` — a record mapping a flair scope (such as `post` or `author`) to an array of available flair labels.
- `suggested` — suggested presentation (for example `primaryColor`, `avatarUrl`, `bannerUrl`, `language`). Advisory only.
- `features` — a record of boolean and enum feature toggles (for example media restrictions, voting restrictions, and the community's `pseudonymityMode`).
- `name` — the community's crypto domain name, if any.

Posts and indexes:

- `posts` — the paginated posts of the community (see [Pages](#pages)).
- `modQueue` — paginated CIDs of publications pending approval, when the community requires approval.
- `postUpdates` — a record mapping a time bucket to the CID of a batched index of comment updates.
- `lastPostCid` — CID of the most recent post.
- `lastCommentCid` — CID of the most recent comment (post or reply).
- `statsCid` — REQUIRED. CID of the community's statistics record.

Protocol and trust:

- `challenges` — REQUIRED. An array of the community's **public** anti-spam challenge descriptors (see
  [Anti-spam configuration](#anti-spam-configuration)).
- `encryption` — REQUIRED. The community's encryption parameters (see [Encryption](#encryption)).
- `pubsubTopic` — the pubsub topic publishers use to reach this community (see [BSIP-4](./bsip-4.md)).
- `createdAt` — REQUIRED. Integer Unix time in seconds when the community was created.
- `updatedAt` — REQUIRED. Integer Unix time in seconds of this record version.
- `protocolVersion` — REQUIRED. String, currently `"1.0.0"`.
- `signature` — REQUIRED. The owner's signature over the record (see [Signing](#signing)).

Example (abbreviated):

```jsonc
{
  "name": "news.bso",
  "title": "News From Trusted Sources",
  "description": "Only submit news from trusted sources here.",
  "rules": ["Be nice.", "Don't be mean."],
  "roles": {
    "john.bso": { "role": "owner" },
    "tom.bso": { "role": "moderator" }
  },
  "challenges": [{ "type": "image/png", "description": "Solve the captcha." }],
  "encryption": { "type": "ed25519-aes-gcm", "publicKey": "<base64, 32 bytes>" },
  "createdAt": 1504321021,
  "updatedAt": 1728174027,
  "statsCid": "Qm…",
  "protocolVersion": "1.0.0",
  "posts": { "pages": { "hot": { "comments": [/* … */] } }, "pageCids": { "new": "Qm…" } },
  "signature": {
    "type": "ed25519",
    "signature": "<base64>",
    "publicKey": "<base64, 32 bytes>",
    "signedPropertyNames": ["title", "description", "rules", "roles", "challenges", "encryption", "createdAt", "updatedAt", "statsCid", "protocolVersion", "name"]
  }
}
```

### Pages

A community's posts, and a comment's replies ([BSIP-5](./bsip-5.md)), are delivered as **pages**. A
pages object has the shape:

```jsonc
{
  "pages": { "<sortName>": { "comments": [{ "comment": <CommentIpfs>, "commentUpdate": <CommentUpdate> }], "nextCid": "Qm…" } },
  "pageCids": { "<sortName>": "Qm…" }
}
```

- `pages` maps a sort name to a preloaded first page. Each page is a list of
  `{ comment, commentUpdate }` pairs — the immutable comment record ([BSIP-2](./bsip-2.md)) alongside
  its latest comment update ([BSIP-5](./bsip-5.md)) — plus an optional `nextCid` pointing at the next
  page of the same sort.
- `pageCids` maps a sort name to the CID of its first page, for sorts that are not preloaded inline.
  `pageCids` MAY be omitted when every relevant page fits inline.

Post sort names are `hot`, `new`, `topHour`, `topDay`, `topWeek`, `topMonth`, `topYear`, `topAll`,
and `active`. Reply sort names are `best`, `new`, `old`, `newFlat`, and `oldFlat`. Implementations
MUST accept unknown sort names for forward compatibility and SHOULD ignore sorts they do not support.

Pages are regenerated as content changes; their CIDs are not stable and MUST NOT be treated as
permanent identifiers. The moderation queue (`modQueue`) is paginated the same way, but its entries
use the reduced comment update defined in [BSIP-5](./bsip-5.md).

### Anti-spam configuration

The record's `challenges` array is the **public** description of the community's anti-spam policy —
enough for a publisher to know what to expect, but never the secret material. Each descriptor MAY
include a `type` (for example `image/png` or `text/plain`), a `description`, an optional `challenge`
payload, an `exclude` policy describing who is exempted, and a `pendingApproval` flag. Private
configuration — answers, passwords, allowlists, and rate-limit internals — MUST NOT be published in
the community record; it is kept in the owner's local settings. The challenge exchange itself is
specified in [BSIP-4](./bsip-4.md).

### Encryption

`encryption` declares how publishers encrypt the publications they send to this community. It is an
object `{ "type": "ed25519-aes-gcm", "publicKey": <base64, 32 bytes> }`, where `publicKey` is the
community's encryption key (equal to the community signer's public key). The scheme is specified in
[BSIP-4](./bsip-4.md).

### Signing

The community record is signed by the community **owner** using the keypair whose IPNS name is the
community's address. Signing and verification follow the same rules as comments ([BSIP-2,
Signatures](./bsip-2.md#signatures)): the signed message is the CBOR encoding of the record restricted
to `signedPropertyNames`, with no `null`/`undefined` values, verified against
`signature.publicKey`. A verifier MUST additionally check that the IPNS name the record was fetched
from equals the PeerId derived from `signature.publicKey`; otherwise the record does not belong to
that community address.

## Rationale

- **IPNS name as identity** lets a community keep a stable address while its content changes, without
  a blockchain or a registrar.
- **Public vs. private challenge configuration** lets publishers prepare for a community's anti-spam
  policy without leaking the secrets that make the policy effective.
- **Embedding `{ comment, commentUpdate }` in pages** lets a client render a feed — content plus vote
  counts and reply previews — from a single page fetch, while keeping the immutable comment and the
  mutable update independently signed.

## Security Considerations

- **Owner authority.** Anyone can fetch a community record, but only the holder of the community
  private key can produce a valid signature. Verifiers MUST bind the record to its address via the
  public key, not merely trust the IPNS name they were handed.
- **Name resolution.** A `.bso`/`.eth` name MUST resolve to the record's public key before it is shown
  as verified, or a community could be impersonated by registering a look-alike name.
- **Role trust.** `roles` are claims by the owner; they govern moderation within the community and
  carry no authority outside it. Clients MUST NOT extend a role's meaning beyond the community that
  declares it.
- **Advisory metadata.** `suggested` presentation and `features` are owner-asserted; clients SHOULD
  apply their own policy (for example for media embedding and NSFW handling) rather than trusting them
  blindly.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
