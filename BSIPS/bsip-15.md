---
bsip: 15
title: Community Lists
description: A signed, immutable record, addressed by CID, in which a curator lists communities with metadata for default feeds and search.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Draft
type: Standards Track
category: Application
created: 2026-11-06
requires: 2, 3, 10, 16, 17
---

## Abstract

A **community list** is a signed, immutable JSON record, stored on IPFS and addressed by its CID, in
which a curator lists communities together with metadata the curator assigns to each: a name, a
title, a description, languages, locations, features, and tags. Clients load lists to render default
feeds and to search communities by that metadata without loading each community. This BSIP defines
the record and its entries, the curator's optional `author` profile, how the record is signed (every
member except `signature`), the names it reserves for runtime values, its 2 MiB size limit, how a
list is published, and how a reader loads and verifies it by CID. A revision is a new record with a
new CID, and clients never move from one revision to another on their own. The format replaces the
earlier "multisub" design, which was never implemented; that name is retired.

## Motivation

Clients need sets of communities to start from: a front page, a topic feed such as `crypto`, or a
large, loosely curated index to search. Reading the title and topic of every community from its own
record costs at least one IPNS resolution and one fetch per community ([BSIP-3](./bsip-3.md)), and
tells the network which communities the reader is looking at. A list carries enough metadata for a
client to filter and search locally, and to load only the communities it actually shows.

A list is also a trust decision. Apps ship list addresses as defaults, so whoever controls a list
decides where every installed client goes. Independent clients need a shared format in which a list
is attributable to a key, cannot be altered by whoever relays it, and cannot change after a client
adopted it.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Terminology

- **List** — a community list record as defined in this BSIP. Implementations call the record
  `CommunityList` and an entry `CommunityListEntry`.
- **Curator** — the holder of the key that signs a list.
- **Entry** — one element of a list's `communities` array, describing one community.
- **Revision** — a list a curator publishes to supersede an earlier one. It is a separate record with
  its own CID.

### The list record

A list is a JSON object with the following members:

- `title` — OPTIONAL. String. The list's display title.
- `description` — OPTIONAL. String.
- `author` — OPTIONAL. The curator's profile ([The `author` field](#the-author-field)).
- `communities` — REQUIRED. Array of [entries](#entries), possibly empty. Two entries MUST NOT have
  the same `publicKey`, compared as exact strings.
- `timestamp` — REQUIRED. Positive integer Unix time in **seconds**: when the curator signed this
  revision.
- `protocolVersion` — REQUIRED. Non-empty string, currently `"1.0.0"`.
- `signature` — REQUIRED. The curator's signature ([Signing](#signing)).

Strings and arrays have no individual length limits; the whole record is bounded by the
[size limit](#size-limit). Every array-valued member, of the list and of its entries, has a plural
name.

Example:

```jsonc
{
  "title": "Funny communities",
  "description": "The funniest communities",
  "author": { "name": "john.bso", "displayName": "John" },
  "communities": [
    {
      "publicKey": "12D3KooWNsF2eMrdw3YFPycAaFEvZ9Eq3ekhNL3vrAAfN6dAwXLp",
      "name": "funny.bso",
      "title": "Funny things",
      "languages": ["en"],
      "tags": ["funny", "memes"]
    },
    { "publicKey": "12D3KooW…" }
  ],
  "timestamp": 1792713600,
  "protocolVersion": "1.0.0",
  "signature": {
    "type": "ed25519",
    "signature": "<base64>",
    "publicKey": "<base64, 32 bytes>",
    "signedPropertyNames": ["title", "description", "author", "communities", "timestamp", "protocolVersion"]
  }
}
```

### Entries

An entry describes one community. Its metadata is set by the curator, not by the community's owner,
and nothing in it is signed by the community.

- `publicKey` — REQUIRED. Non-empty string: the community's identity key as a key address
  ([BSIP-10](./bsip-10.md#key-addresses)), the value publications carry in `communityPublicKey`
  ([BSIP-3](./bsip-3.md#identity-and-addressing)).
- `name` — OPTIONAL. Non-empty string: the community's name ([BSIP-10](./bsip-10.md#names)), for
  example `memes.bso`.
- `title` — OPTIONAL. String: the curator's title for the community.
- `description` — OPTIONAL. String: the curator's description of the community.
- `languages` — OPTIONAL. Array of strings: the languages of the community, so that a client can show
  or hide it by the reader's language.
- `locations` — OPTIONAL. Array of strings: the locations the community concerns, so that a client
  can show or hide it by the reader's location.
- `features` — OPTIONAL. Array of strings: properties of the community that a client can match
  against the reader's settings, for example whether it is safe for work. It is unrelated to the
  `features` object of the community record ([BSIP-3](./bsip-3.md#features)).
- `tags` — OPTIONAL. Array of strings: keywords for search.

This BSIP defines no vocabulary for `languages`, `locations`, `features`, or `tags`; their values are
free-form strings. Readers check `publicKey` and `name` only as non-empty strings: neither the
key-address form nor the name syntax is validated when a list loads.

### The `author` field

`author` is the curator's profile, which clients show next to the list the way they show a
publication's author next to a comment. It has the shape of a publication's `author`
([BSIP-2](./bsip-2.md#authors)): the OPTIONAL members `name`, `displayName`, `previousCommentCid`,
`wallets`, `avatar`, and `flairs`, with the same types. Other members MAY be present and are signed as
part of `author`.

- `author.name`, when present, MUST be a name, that is, contain a `.`
  ([BSIP-10](./bsip-10.md#names)).
- `author` MUST NOT carry `address`, `publicKey`, `shortAddress`, `nameResolved`, or `community`. A
  list is never sent to a community, so a list author has no community standing (`author.community`)
  on the wire or at runtime.
- `author` carries no identity member. The curator's identity is `signature.publicKey`.
- A curator without profile members omits `author`; signing drops an empty object
  ([BSIP-2](./bsip-2.md#signatures)).

Clients derive the runtime author as for publications
([BSIP-10](./bsip-10.md#runtime-addresses)): `author.publicKey` is the signer address, and
`author.address` is `author.name` when present, otherwise `author.publicKey`. A client MUST NOT present
`author.name` as the curator's identity unless it verified the name for the signer
([BSIP-10](./bsip-10.md#verifying-an-author-name)). The outcome of that verification does not affect
whether the list is valid.

Any key can sign a list, including the key the curator signs publications with; a list signed with
that key carries the same verifiable author identity as the curator's comments. One key can sign any
number of lists.

### Runtime values and reserved names

Implementations derive the following values. They are not part of the wire record and are never
signed:

- on the list: `cid` and `shortCid`;
- on each entry: `address`, equal to `name` when present, otherwise `publicKey`, and `shortAddress`;
- on `author`: the values listed in [The `author` field](#the-author-field).

A list MUST NOT carry a top-level member named `cid`, `shortCid`, `state`, `updatingState`,
`publishingState`, `clients`, `signer`, or `raw`. An entry MUST NOT carry `address` or
`shortAddress`. `author` MUST NOT carry the names listed in [The `author` field](#the-author-field).
Members added by later BSIPs MUST NOT use these names.

### Signing

The curator signs a list following [BSIP-2, Signatures](./bsip-2.md#signatures). `signedPropertyNames`
MUST list every top-level member of the record except `signature`, including members a reader may not
recognize. This is stricter than the rule for comment records, which may carry unsigned community-set
and unknown members ([BSIP-2](./bsip-2.md#signatures)). Readers apply this rule to the record as
received, before verification narrows the record to its signed members
([Loading and verifying a list](#loading-and-verifying-a-list)). Members of entries and of `author`
need no separate check: `communities` and `author` are each signed as a whole.

Readers MUST accept and preserve members they do not recognize, at the top level, in entries, and in
`author`, and MUST include them when verifying the signature. A newer publisher may add and sign
members a reader does not know; a reader that dropped them would fail to verify the list.

### Addressing

A list is identified by its CID alone. It has no IPNS name, no name of its own, and no member that
points to another list.

- The CID is computed over the exact UTF-8 bytes of the record as published, imported as
  [BSIP-2, Addressing and fetching](./bsip-2.md#addressing-and-fetching) describes in its step 3, and
  expressed as a CIDv0 (`Qm…`).
- Unlike a comment record, a list has no canonical serialization. A publisher MAY serialize the
  record as any JSON text. The same signed list serialized another way has another CID and verifies
  under both.
- A list is referenced by its CIDv0 string. Implementations MUST reject a CIDv1 given as the address
  of a list.

### Size limit

The size limit of a list is 2,097,152 bytes (2 MiB).

- A publisher MUST NOT publish a list whose DAG size exceeds the limit. The DAG size is the total
  size of the blocks produced by importing the record's bytes as in
  [BSIP-2, Addressing and fetching](./bsip-2.md#addressing-and-fetching), which `ipfs add` reports as
  the file's cumulative size.
- A reader MUST reject a list whose bytes exceed the limit, before parsing it, and SHOULD stop
  downloading once more bytes than the limit have arrived.

The DAG size of a file always exceeds its byte length, so every list a conforming publisher produces
passes the reader's check. A list is a single file; there is no pagination or chunking.

### Publishing a list

To publish a list, a curator:

1. builds the record from the members defined above and removes, at every depth, members whose value
   is `null`, absent, or an empty object, as signing requires ([BSIP-2](./bsip-2.md#signatures));
2. signs it ([Signing](#signing));
3. serializes it as JSON, encodes the text as UTF-8, and checks the [size limit](#size-limit);
4. adds the bytes to IPFS as a CIDv0 file and keeps them available, for example by pinning them and
   announcing them to the network;
5. distributes the resulting CID.

A publisher MUST NOT publish a list that fails any check in
[Loading and verifying a list](#loading-and-verifying-a-list).

The curator keeps the signing key; no other party holds it or signs on the curator's behalf. Losing
the key does not affect published lists, whose CIDs stay valid, but prevents signing later revisions
under the same identity. There is no edit publication: nobody, the curator included, can change a
published list.

### Loading and verifying a list

A reader loads a list from its CIDv0 in the following steps, and MUST reject the list if any step
fails:

1. Fetch the bytes by CID from IPFS peers or gateways ([BSIP-16](./bsip-16.md)), enforcing the
   [size limit](#size-limit), and check that the bytes hash to the CID
   ([BSIP-2](./bsip-2.md#addressing-and-fetching)).
2. Parse them as JSON.
3. Check the presence and types of the members defined in [The list record](#the-list-record),
   [Entries](#entries), and [The `author` field](#the-author-field), keeping members it does not
   recognize ([Signing](#signing)).
4. Check that:
   - no [reserved name](#runtime-values-and-reserved-names) appears at the top level, in `author`, or
     in an entry;
   - `author.name`, if present, contains a `.`;
   - no two entries have the same `publicKey`;
   - every top-level member other than `signature` is listed in `signedPropertyNames`; and
   - the signature verifies ([BSIP-2](./bsip-2.md#signatures)).

The reader then derives the [runtime values](#runtime-values-and-reserved-names). A list that fails a
step is invalid as a whole; a reader MUST NOT accept part of it, for example by dropping an invalid
entry. Readers do not compare `timestamp` with the current time.

A failure in steps 2 to 4, or a record over the size limit, is a property of the bytes the CID names,
so fetching the same CID again cannot fix it. A reader SHOULD NOT retry such a failure, and SHOULD
retry transport failures.

Verifying `author.name` ([The `author` field](#the-author-field)) is not part of loading. A reader
MAY return a list before that verification completes and report the outcome when it does.

### Using entries

A list is a directory of pointers, not an authority. Entry metadata is the curator's claim about a
community.

- A client MAY render, filter, and search entries by their metadata without loading the communities.
  It MUST NOT present entry metadata as the community's own or as signed by the community.
- A client MAY show or hide entries by matching `languages`, `locations`, and `features` against the
  reader's language, location, and settings. Such filtering applies the curator's labels; it is not a
  property the client has verified.
- A client opens an entry by loading the community by its `publicKey` or its `name`, as
  [BSIP-3](./bsip-3.md) and [BSIP-10](./bsip-10.md#verifying-a-community-name) specify, which
  verifies a name against the community's key at that point. A client MUST NOT present an entry's
  `name` as the community's verified name on the strength of the list alone.
- Loading a list resolves no entry names. A client SHOULD load and resolve only the entries it
  displays, not a list's entries in bulk.

### Revisions

A revision is a new list with a new CID. A list carries no reference to earlier or later revisions.
To revise a list, the curator builds a new record, typically from the members of the loaded current
revision without its runtime values, and publishes it.

A client MUST NOT replace the list it uses with another revision unless its user or its app
configuration chooses the new CID. In particular, a client MUST NOT follow a reference from one
revision to another found inside a list, should a later BSIP define one.

How a curator announces a new revision, and which lists a client uses by default, are out of scope.
Default lists are app configuration.

### Publishing and loading through an RPC server

A client connected to an RPC server ([BSIP-17](./bsip-17.md)) publishes and loads lists through two
methods. The signing key never leaves the client, and the server is not trusted to judge validity.

- `publishCommunityList`, with the parameter `{ "communityListRawString": string }`: the exact bytes
  the client signed and serialized. The server checks the [size limit](#size-limit), parses and
  verifies the record as a reader would, refuses one that fails, adds the exact bytes to IPFS, pins
  them, and returns `{ "cid": string }`. The client MUST check that the returned CID is the CIDv0 of
  the bytes it sent, and MUST treat any other CID as a failed publish.
- `fetchCommunityList`, with the parameter `{ "cid": string }`: the server fetches the bytes under the
  size limit and returns them unparsed as `{ "communityListRawString": string }`. The client MUST
  enforce the size limit, check that the bytes hash to the CID, and parse and verify the list itself.

## Rationale

- **Immutable records instead of IPNS.** The original design
  ([pkc-js issue #21](https://github.com/pkcprotocol/pkc-js/issues/21)) published lists as mutable
  IPNS records. It was reversed on 2026-09-06 for a security reason: apps ship list
  addresses as defaults, so a mutable list is a permanent, unreviewable delegation of trust to one
  keyholder. A single IPNS update could send every installed client to arbitrary new communities,
  illegal content included, with nobody in the loop, and because a list update swaps the whole set
  of places a client goes, the damage of one update is large. With immutable CIDs, whoever adopts a
  CID decides once, over concrete bytes, and each revision is reviewed again when it is adopted. That
  is also why clients never move between revisions on their own. Immutability also removes the IPNS
  machinery: republishing, liveness, delegated publishing, staleness rules, and sequence numbers.
- **Every member signed.** A comment record has a second producer, the community, which legitimately
  adds unsigned members ([BSIP-2](./bsip-2.md#the-comment-record)). A list has a single producer, so
  an unsigned member can only have been added by someone else. Without the rule, anyone could add a
  member to a curator's list, add the result to IPFS under a new CID, and have it verify as the
  curator's.
- **Loose loading.** Verification walks the record's own `signedPropertyNames`. A reader that rejected
  or dropped unknown members would reject lists from newer publishers or break their signatures, so
  readers keep unknown members and require only that top-level ones be signed. New optional members,
  such as a revision reference, can therefore be added later without breaking existing readers.
- **Reserved names.** Because loading is loose, a record could otherwise smuggle in names that
  implementations use for runtime values. Every other record type follows the same rule.
- **CIDv0 only.** Every content check in the reference implementation (over RPC, through gateways,
  and in the size check of the kubo path) recomputes a CIDv0. Accepting a CIDv1 would make a list load over some transports
  and not others.
- **One file and a 2 MiB limit.** At roughly 200 bytes per entry, a list of about ten thousand
  entries fits in one file, which keeps fetching and verification simple. Readers enforce the limit
  as well as publishers, because a limit only honest publishers observe does not bound what readers
  download. Chunking can be added if a real list outgrows one file.
- **No name resolution for entries.** A list can hold thousands of entries; resolving every name on
  load would be a burst of resolver traffic, and the community load path already verifies a name
  against its key when a client opens the community.
- **`author.name` must be a name.** `author.address` is `author.name` when present. A name without a
  `.`, such as another key's address, would make the list display as authored by that key. Comments
  pass through a community that rejects such names before anyone sees them; a list reaches readers
  directly, so the reader is the only place to reject them.
- **The publication author schema.** Reusing the `author` of publications lets clients render a
  curator with the code that renders comment authors, and a list signed with the curator's personal
  key shows the same identity as their comments. Signing a list uses no IPNS name, so one key can
  sign any number of lists.
- **No edits and no shared custody.** Only the keyholder signs. An edit publication signed by others
  (the earlier `MultisubEdit`) contradicts that, and a revision already covers the curator's own
  changes.
- **No registry of default lists.** Which lists an app starts from is a product decision, so it
  stays in app configuration rather than in the protocol (the earlier `PKCDefaults` idea).
- **Retiring "multisub".** The name was a remnant of the "subplebbit" vocabulary, which the protocol
  renamed to "community". There is no `Multisub`, `MultisubCommunity`, or `MultisubEdit` record.

Open questions:

- A signed reference to the previous revision (for example `previousCommunityListCid`) is deferred.
  It would let clients show a list's history, never follow it automatically.
- A curator's channel for announcing revisions is undefined. The curator's author community
  ([BSIP-14](./bsip-14.md)), or another community the curator runs, is the expected channel; both are
  mutable, and a community is moderated.
- Whether `languages`, `locations`, and `features` should use defined vocabularies, for example
  BCP 47 language tags and ISO 3166 codes, so that independent clients filter alike.
- Whether readers should reject an entry `name` that is not a name, and an `author.name` with an
  uppercase ASCII letter, as BSIP-10 requires of names generally. The reference implementation
  checks only that `author.name` contains a `.` and does not check entry names.
- Whether the order of entries carries meaning, for example a ranking.
- How the reference implementation measures size on load. Its direct paths count the file's bytes,
  as specified above, but its RPC client measures the DAG size. Over RPC it therefore rejects lists
  whose byte length is within about 500 bytes of the limit, which only a non-conforming publisher
  produces.

## Backwards Compatibility

Lists are a new record type; no existing record changes. The earlier "multisub" design (lists
published over IPNS, with a `names[]` field, magnet URIs, `MultisubEdit` publications, and a
`PKCDefaults` registry) was documented but never implemented, so there are no records in that format
to migrate. Default lists that apps already ship as their own configuration are not lists under this
BSIP and are unaffected.

Readers that predate this BSIP cannot load lists. Because readers keep unknown signed members, lists
that later BSIPs extend with new optional members remain loadable by readers of this version.

The reference implementation, pkc-js, has supported lists since v0.0.125. This BSIP describes its
behavior as of v0.0.135.

## Reference Implementation

Non-normative. The current implementation is in [pkc-js](https://github.com/pkcprotocol/pkc-js):
schemas, reserved names, and the size limit in
[`src/community-list/`](https://github.com/pkcprotocol/pkc-js/tree/master/src/community-list)
(`schema.ts`), publishing, loading, retries, and author name verification in
`src/community-list/community-list.ts`, signing and verification in `src/signer/signatures.ts`
(`signCommunityList`, `verifyCommunityList`), and the RPC server methods in `src/rpc/src/index.ts`.
The implementation notes are in
[`docs/protocol/community-lists.md`](https://github.com/pkcprotocol/pkc-js/blob/master/docs/protocol/community-lists.md).

The API is `pkc.createCommunityList({ signer, title, description, author, communities, timestamp })`
followed by `publish()`, and `pkc.createCommunityList({ cid })` followed by `update()`, or the
one-shot `pkc.getCommunityList({ cid })`. Creation rejects unknown members, so a typo is never signed
into an immutable record; it drops the runtime values a loaded list carries, so a revision can be
built from a loaded list. Publishing needs a kubo RPC client or a PKC RPC server; instances that use
only gateways or libp2p-js can load lists but not publish them. `author.nameResolved` is `true` when
the name is verified, `false` when it is refuted or when no configured resolver handles its TLD (which
[BSIP-10](./bsip-10.md#verification-outcomes) classifies as unknown, not refuted), and absent until
settled.

Rejections and their pkc-js error codes:

| Check | Error code |
| --- | --- |
| Address is not a CIDv0 | `ERR_INVALID_CREATE_COMMUNITY_LIST_OPTIONS_SCHEMA` |
| Record over the size limit, on load | `ERR_OVER_DOWNLOAD_LIMIT` |
| Record over the size limit, on publish | `ERR_COMMUNITY_LIST_OVER_ALLOWED_SIZE` |
| Bytes do not hash to the CID | `ERR_CALCULATED_CID_DOES_NOT_MATCH` |
| Not JSON | `ERR_INVALID_JSON` |
| Wrong member types, or duplicate entry `publicKey` | `ERR_INVALID_COMMUNITY_LIST_SCHEMA` |
| Reserved name, `author.name` without `.`, unsigned member, or invalid signature | `ERR_COMMUNITY_LIST_SIGNATURE_IS_INVALID`, with the specific reason |
| RPC server returned another CID on publish | `ERR_ADDED_COMMUNITY_LIST_TO_IPFS_BUT_GOT_DIFFERENT_CID` |

## Security Considerations

- **Adopting a list is a trust decision.** A client that uses a list goes where its curator points.
  Immutability limits that trust to bytes someone reviewed: a curator, or an attacker holding the
  curator's key, cannot change a list a client already uses. A compromised key can still sign new
  lists that look like the curator's, which is why moving to a new CID needs a user's or app
  developer's choice.
- **Curator claims.** Every entry member, `name` included, is asserted by the curator, not by the
  community. A list can mislabel a community's language, location, or `features`, for example
  labelling an adult community as safe for work. Clients MUST NOT treat such labels as a content
  guarantee, and SHOULD apply their own policy to the communities and content they display.
- **Name spoofing.** An entry's `name` and the list's `author.name` are claims until verified for the
  corresponding key ([BSIP-10](./bsip-10.md)). A list can pair a well-known name with an attacker's
  key; a client that opens the entry by that `name` reaches the community the name actually resolves
  to, and a client that opens it by `publicKey` has verified nothing about the name.
- **Republication and old revisions.** The CID identifies bytes; the signature identifies the
  curator. Anyone can add a curator's list to IPFS again, or serialize it differently under another
  CID, and it remains the curator's signed content. Published revisions never expire or become
  revocable, so anyone can keep presenting an old revision, for example one that still lists a
  community the curator later dropped. `timestamp` is the curator's own claim and does not establish
  which of two revisions is newer.
- **Denial of service.** Readers enforce the size limit while downloading and before parsing, and
  loading a list triggers no name resolution and no per-entry fetch. A list can still name thousands
  of communities, which is why clients load and resolve only the entries they display
  ([Using entries](#using-entries)).
- **RPC servers.** A server cannot forge a list, because the client checks the CID and verifies the
  signature itself, and it cannot substitute other bytes on publish, because the client checks the
  returned CID. It can refuse service, and it learns which lists a client publishes and fetches. A
  server pins any validly signed list up to the size limit for any client allowed to call it, so
  access to the method is the server's control against abuse ([BSIP-17](./bsip-17.md)).
- **Availability.** A list is retrievable only while some node that holds it serves it. Losing the
  curator's key loses nothing already published, but a list nobody serves cannot be loaded; apps
  that ship a list as a default have to keep it served.
- **Privacy.** Fetching a list by CID tells the peers or gateways asked that the reader wanted it.
  Searching and filtering a list locally reveals less than loading every community to read its
  metadata, which is part of the purpose of lists.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
