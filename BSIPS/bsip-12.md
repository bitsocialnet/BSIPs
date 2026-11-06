---
bsip: 12
title: Crossposts
description: How a comment reposts another comment by embedding its signed record verbatim, and how that embed is verified and shown.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Draft
type: Standards Track
category: Core
created: 2026-10-23
requires: 2, 3, 4, 5
---

## Abstract

A **crosspost** is a comment that reposts another comment. The crossposting comment carries an
author-signed `crosspost` field holding the CID of the reposted comment and that comment's complete
record, embedded verbatim. Because the embedded record carries its own author's signature and must
hash to the CID it is paired with, any client can check locally who wrote the reposted content
(**tier 1**). Loading the reposted comment's comment update from its own community additionally
proves that the community accepted exactly those bytes, and reports its current moderation state
(**tier 2**). This BSIP defines the `crosspost` field, nesting and its depth cap, both verification
tiers, what a community checks before accepting a crosspost, the `noCrossposts` and
`maxCrosspostDepth` community features, and how clients attribute and display crossposts.

## Motivation

Reposting is a basic social primitive: sharing a post into another community, reposting a comment
with or without commentary, or mirroring an author's own posts into a profile feed. A plain
reference by CID is not enough on a peer-to-peer network. Moderators of the receiving community
would have to fetch the referenced comment before they could moderate the repost, and the
referenced text could become unreachable when its community goes offline, removes it, or its author
deletes it.

Embedding the original record fixes availability and moderation, but creates a verification
problem: the embedded record is supplied by the reposter, and part of it (the fields its hosting
community added) was never signed by its author. Independent clients must agree on what an embed
proves on its own, what it takes to prove more, and how to display it, or reposts become a way to
forge authorship, origin, or reputation. This BSIP is that shared definition.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Terminology

- **Crossposting comment** — a comment ([BSIP-2](./bsip-2.md)), post or reply, that carries a
  `crosspost` field.
- **Host community** — the community the crossposting comment is published to.
- **Embedded record** — the comment record carried in `crosspost.comment`.
- **Referenced community** — the community named by the embedded record's own community addressing
  fields, `communityPublicKey` and/or `communityName`
  ([BSIP-2, Community addressing](./bsip-2.md#community-addressing)).
- **Chain** — the sequence of embedded records reached by following `crosspost.comment`, then
  `crosspost.comment.crosspost.comment`, and so on. A crosspost of a crosspost has a chain of two.
- **Chain depth** — the number of embedded records in the chain: 0 for a comment without
  `crosspost`, 1 for a plain crosspost, 2 for a crosspost of a crosspost.

### Content identifiers

This BSIP writes `CID(x)` for the CID of a JSON value `x`, computed exactly as
[BSIP-2](./bsip-2.md) computes the CID of a comment record (its "Addressing and fetching" section):
the CIDv0 (`Qm…`) that `ipfs add` with default settings produces for the UTF-8 bytes of `x`
serialized as JSON with no insignificant whitespace and with object keys sorted by UTF-16 code
units at every depth. For a genuine comment record, `CID(record)` is the CID under which the record
is published and fetched, and under which it appears in pages ([BSIP-3, Pages](./bsip-3.md#pages)).

### The `crosspost` field

`crosspost` is an OPTIONAL author-set field of a comment. When present it is an object with exactly
two members:

- `cid` — REQUIRED. String. The CID of the embedded record, in CIDv0 string form. It MUST equal
  `CID(comment)`.
- `comment` — REQUIRED. The complete comment record of the reposted comment, exactly as it was
  published: the author-signed fields, the author's `signature`, and the fields its community set
  (including the REQUIRED `depth`), as defined in [BSIP-2](./bsip-2.md). It is a comment record,
  not the pubsub publication that preceded it.

Publishers MUST NOT add other members to the `crosspost` object.

The following rules apply to the field:

- A crossposting comment MAY be a post or a reply.
- A comment carries at most one `crosspost`. It is an object, never an array.
- `crosspost` is author-signed. When present it MUST be listed in the comment's
  `signature.signedPropertyNames` ([BSIP-2, Signatures](./bsip-2.md#signatures)). The signed bytes
  therefore cover the whole embedded record, including the embedded author's `signature` and any
  nested `crosspost`.
- `crosspost` counts as content. A comment that sets none of `title`, `content`, or `link` is valid
  when it carries `crosspost` (a **bare crosspost**: a repost with nothing added). A comment with
  none of `title`, `content`, `link`, or `crosspost` remains invalid.
- `crosspost` appears wherever the comment does: in the publication sent in a `CHALLENGEREQUEST`
  ([BSIP-4](./bsip-4.md)), in the stored comment record, and in every page entry that carries the
  comment ([BSIP-3, Pages](./bsip-3.md#pages)). It is never part of a comment update
  ([BSIP-5](./bsip-5.md)), and a later author edit cannot add, change, or remove it.
- The embedded record carries no comment update. A crosspost freezes the reposted comment's
  immutable record only; its mutable state is loaded on demand (see [Tier 2](#tier-2-verification)).
- `crosspost` is independent of `quotedCids`. `quotedCids` says "this text refers to these
  comments" and embeds nothing; `crosspost` says "this comment is a repost of that one" and embeds
  it. A reply MAY carry both.

### Preserving the embedded record

Every implementation that stores, relays, re-encodes, or re-serves a crossposting comment MUST
preserve `crosspost.comment` exactly, at every level of the chain: every member, including members
it does not recognize and author-signed members defined by later protocol versions, with unchanged
values. Implementations MUST NOT strip, normalize, default, or annotate the embedded record, even
where they strip or normalize unknown members of the top-level record for their own storage.
Because `CID(x)` sorts keys and drops whitespace before hashing, member order and whitespace do not
matter; the JSON value does.

This is required because the embedded record is pinned by two hashes. `crosspost.cid` hashes the
whole embedded record, so any change makes [tier-1 check 1](#tier-1-verification) fail and the
crossposting comment invalid. And the crossposting comment's own CID hashes the crossposting
record, embedded record included, so a host community that alters the embedded record while storing
it can no longer serve a record that matches the CID it published; the comment then fails
verification in every page that carries it.

Values that a client computes about an embedded record at runtime (for example whether an embedded
author's name resolved) MUST NOT be written into the wire record. A client that crossposts a record
it read MUST embed the wire record, not an annotated copy.

### Building a crosspost

A publisher builds a crossposting comment as follows:

1. Obtain the reposted comment's record `R` as published: fetched by CID, or the `comment` of a
   page entry.
2. Set `crosspost` to `{ "cid": CID(R), "comment": R }`.
3. Set the host community's addressing fields, `parentCid` and `postCid` when publishing a reply,
   and optionally the publisher's own `title`, `content`, or `link`.
4. Sign the comment as any other comment, with `crosspost` among the signed properties.

Crossposting a crosspost embeds the crossposting record as `R`, which lengthens the chain by one. A
publisher that wants to repost the original rather than the intermediate MAY embed the innermost
record of the chain instead. A publisher MUST NOT publish a comment whose chain depth exceeds the
[protocol cap](#chains-and-the-depth-cap), and SHOULD run [tier 1](#tier-1-verification) locally
before publishing, so that an invalid crosspost fails before a challenge exchange starts.

### Chains and the depth cap

The protocol caps chain depth at **10**. Every implementation MUST reject a comment record whose
chain depth exceeds 10, on every path that takes in comment records: building a publication
locally, accepting a publication as a community, fetching a comment by CID, reading each entry of a
page (posts, replies, and moderation queue pages), reading the reply pages nested in a comment
update, and reading the comment returned in a `CHALLENGEVERIFICATION`.

- **Reject, never truncate.** An implementation MUST NOT accept a record after verifying only part
  of its chain. A record over the cap is rejected whole.
- **Measure before recursing.** Implementations SHOULD determine chain depth with an iterative walk
  along `crosspost.comment.crosspost` that stops after 11 levels, before any recursive parsing or
  verification of the chain. Recursive processing of an unbounded chain exhausts the stack at a
  depth that varies by engine, which would make the same record valid on one client and fatal on
  another.
- **A constant, not a setting.** The cap is a protocol constant, identical for every client.
  Changing it requires a new BSIP. A community can only tighten it for what it accepts (see
  [Community features](#community-features)).
- The cap bounds levels, not bytes. Size is bounded separately by the limits on publications and
  fetched records (see [Security Considerations](#security-considerations)).

### Tier 1 verification

Tier 1 is local and needs no network access. A verifier MUST perform it as part of verifying the
signature of any comment that carries `crosspost` ([BSIP-2, Signatures](./bsip-2.md#signatures)),
whether the comment arrives as a publication or as a fetched record, after checking the depth cap.
For the embedded record `E` = `crosspost.comment`, the verifier checks, in order:

1. **CID.** `CID(E)` MUST equal `crosspost.cid`.
2. **No reserved members.** `E` MUST NOT contain a name reserved for comment records
   ([BSIP-2, Reserved names](./bsip-2.md#reserved-names)), and `E.author`, if present, MUST NOT
   contain `community`, `publicKey`, `shortAddress`, or `nameResolved`.
3. **Every signable member is signed.** For each author-signable member name present on `E`, that
   name MUST appear in `E.signature.signedPropertyNames`. The author-signable names are `title`,
   `content`, `link`, `linkWidth`, `linkHeight`, `linkHtmlTagName`, `flairs`, `spoiler`, `nsfw`,
   `parentCid`, `postCid`, `quotedCids`, `crosspost`, `author`, `communityPublicKey`,
   `communityName`, `timestamp`, and `protocolVersion`. Community-set members (`depth`,
   `thumbnailUrl`, `thumbnailUrlWidth`, `thumbnailUrlHeight`, `previousCid`, `pseudonymityMode`)
   and member names the verifier does not recognize are exempt.
4. **Author signature.** `E.signature` MUST verify over the members of `E` named in its own
   `signedPropertyNames`, following [BSIP-2, Signatures](./bsip-2.md#signatures). If `E` itself
   carries a `crosspost`, the verifier applies checks 1–4 to that nested `crosspost`, and so on down
   the chain.

If any check fails at any level, the outermost crossposting comment is invalid as a whole, and is
handled exactly as any other comment record that fails verification.

The embedded record is verified as an author-signed comment, not as a record of the host community.
Verifiers MUST NOT apply to it the checks that bind a comment to the community or page carrying it
(community addressing match, page membership, depth and parent relations within a page), nor the
acceptance checks that bind a publication to the present (the publication timestamp window). It is
normal for the embedded record to name another community and to be old.

Tier 1 establishes that the holder of `E.signature.publicKey` signed the author-set fields of `E`,
including its claim to have been published to the referenced community. It does **not** establish:

- the embedded author's human-readable name, which requires name resolution
  ([BSIP-2, Authors](./bsip-2.md#authors));
- that the referenced community ever accepted `E`;
- any community-set member of `E` (`depth`, `thumbnailUrl`, `thumbnailUrlWidth`,
  `thumbnailUrlHeight`, `previousCid`, `pseudonymityMode`), which whoever built the crosspost can
  choose freely, together with a matching `cid`;
- the current state of the reposted comment: its votes, replies, edits, removal, or deletion.

### Tier 2 verification

Tier 2 is complete when the verifier holds a comment update ([BSIP-5](./bsip-5.md)) for
`crosspost.cid`, obtained from the referenced community by any route BSIP-3 and BSIP-5 allow, that
verifies against that community as BSIP-5 requires: signed by the referenced community, with its
signed `cid` equal to `crosspost.cid`. Because the update's `cid` is signed and `crosspost.cid`
hashes the entire embedded record, a valid update is the referenced community attesting to exactly
these bytes, community-set members included.

- Tier 2 is a client-side, on-demand check. It is not part of record validity: a crossposting
  comment that passes tier 1 is a valid record whether or not tier 2 ever completes.
- Each level of a chain has its own referenced community and its own tier 2.
- A referenced community that never accepted the comment never yields an update, so the protocol
  has no natural timeout. A client MUST bound the wait itself.
- Holding only the embedded record is tier 1, however it was obtained. In particular, a client that
  builds a local comment object from the embedded record has not reached tier 2 until a verified
  update for `crosspost.cid` has actually arrived.

Tier 2 has three outcomes, which clients render as three distinct states:

| State | Condition |
|---|---|
| **live** | A verified update is held, `removed` is not `true`, and its `edit` does not have `deleted` set to `true`. |
| **removed** | A verified update is held, and `removed` is `true` or its `edit` has `deleted` set to `true`. |
| **unknown** | No verified update: the referenced community is unreachable or gone, the update failed verification, the embedded record names no community, or the client's wait ended. |

**Unknown is not removed.** Removed is the referenced community saying something; unknown is that
community saying nothing. Clients MUST NOT render or count unknown as removed or deleted, and
SHOULD treat it as retryable rather than final.

### Community acceptance

When a community receives a crossposting comment in a challenge exchange ([BSIP-4](./bsip-4.md)),
it MUST, in addition to the checks it applies to every comment:

1. require `crosspost` to be signed, as it requires of every field of a publication;
2. reject the publication if its chain depth exceeds the protocol cap, or if
   [tier 1](#tier-1-verification) fails at any level;
3. reject the publication if its own `features.noCrossposts` is `true`;
4. reject the publication if its chain depth exceeds its effective `maxCrosspostDepth`
   ([Community features](#community-features));
5. count the embedded record toward any size limit it applies to publications; and
6. store the crossposting comment so that the embedded record is preserved exactly
   ([Preserving the embedded record](#preserving-the-embedded-record)).

A community MUST NOT apply to the embedded record the checks it applies to the publication itself
(community addressing, the timestamp window, the author's name resolution, bans, duplicate
detection); those apply to the crossposting comment. It MUST NOT reject a crosspost because the
referenced community is the host community itself.

A community is NOT REQUIRED to perform tier 2 and SHOULD NOT make acceptance depend on it, so that
accepting a publication never depends on a third party's uptime. A community SHOULD NOT reject a
crosspost only because it already holds another comment crossposting the same `cid`.

Once accepted, a crossposting comment is an ordinary comment of the host community: it has its own
CID, its own comment update ([BSIP-5](./bsip-5.md)), its own votes ([BSIP-6](./bsip-6.md)), its own
replies, and its own moderation. None of these affect the reposted comment, and nothing that
happens to the reposted comment affects them. A community that re-signs or rewrites incoming
comments, for example under a pseudonymity mode, MUST carry `crosspost` through unchanged; the
embedded record keeps its original author's signature.

### Community features

Two OPTIONAL members of the community record's `features` ([BSIP-3](./bsip-3.md)) govern crossposts:

- `noCrossposts` — boolean. When `true`, the community rejects every comment carrying `crosspost`,
  posts and replies alike. Absent or `false` means crossposts are accepted.
- `maxCrosspostDepth` — non-negative integer. The deepest chain the community accepts. The
  effective value is the smaller of `maxCrosspostDepth` and the protocol cap of 10; absent means
  10. A value above 10 MUST be read as 10, not as an error, so that a future protocol version can
  raise the cap without invalidating community records. A value of 0 rejects every crosspost.

Both features are **inbound only**: they govern what this community accepts, not whether this
community's comments may be crossposted elsewhere. When both apply, `noCrossposts` takes precedence
as the reason for rejection. Enabling `noCrossposts` or lowering `maxCrosspostDepth` applies to new
publications only; crossposting comments already accepted remain valid and readable. Enforcement
happens at acceptance; a publishing client MAY read these features from the community record to
refuse locally before starting a challenge exchange.

### Client display and attribution

Clients that display crossposts MUST follow these rules, at every level of a chain they display:

1. **Two authors, kept apart.** The crossposting comment's own author-set fields (`title`,
   `content`, `link`, `flairs`, and so on) belong to the crossposting author; the embedded record's
   belong to the embedded author, identified by `E.signature.publicKey`. Clients MUST attribute each
   to the key that signed it, and MUST NOT present the crossposting author as the author of the
   embedded content, or the embedded author as the author or endorser of the crossposting
   commentary.
2. **Names are claims until resolved.** A client MUST NOT present `E.author.name` as the embedded
   author's identity unless it has resolved that name to `E.signature.publicKey`, as
   [BSIP-2, Authors](./bsip-2.md#authors) requires for any author. A name that resolves to a
   different key MUST NOT be presented as an identity. An unresolved name is not a verdict either
   way; the client falls back to the key-derived address.
3. **At tier 1, show only what the author signed.** A client MAY render the embedded record's
   author-signed fields at tier 1. It MUST NOT render the embedded record's `thumbnailUrl`,
   `thumbnailUrlWidth`, or `thumbnailUrlHeight`, and MUST NOT rely on its other community-set
   members, until tier 2 completes. It MUST NOT present the referenced community as the place the
   comment was published, as a fact, until tier 2 completes; it MAY present it as the author's
   claim.
4. **Render the tier-2 state.** A **live** embed MAY be shown with the referenced comment's score
   and moderation state and with its origin presented as fact. A **removed** embed MUST be marked
   as removed by the referenced community, or deleted by its author; whether the embedded text stays
   visible alongside that mark is client policy. An **unknown** embed SHOULD be shown with its
   tier-1 content marked unverified, and MUST NOT be shown as removed.
5. **Keep the two comments' state separate.** The crossposting comment's votes, replies, and
   moderation state come from its own comment update in the host community. Clients MUST NOT
   present them as the reposted comment's, and MUST NOT present the reposted comment's tier-2 state
   as the crossposting comment's.
6. **Count only what tier 2 verifies.** Any score, karma, or count a client derives from crossposts
   (for example the karma of a feed made of crossposts) MUST count an embedded record only when its
   tier-2 update verifies and it is not removed or deleted, and MUST NOT count unknown entries. An
   entry whose update has verified MAY keep counting after the referenced community becomes
   unreachable, because the community's signature over those bytes does not expire.
7. **Chains.** A client MAY display fewer levels than a chain holds; every level it does display
   follows these rules on its own tier and with its own referenced community.

### Example

A post in `bestof.bso` reposting a post from `jokes.bso`, as stored by `bestof.bso`. The embedded
record is the `jokes.bso` record verbatim, including the `depth` that `jokes.bso` set:

```jsonc
{
  "title": "Best joke I read this week",
  "crosspost": {
    "cid": "Qm…", // CID of the canonical serialization of the object below
    "comment": {
      "title": "Why did the banana go to the doctor?",
      "content": "It wasn't peeling well.",
      "communityPublicKey": "12D3KooWBexQF4qDvyaxDgK4r2qPNk5z8s9b1eU5z2bnR6dExamPLe",
      "communityName": "jokes.bso",
      "author": { "name": "john.bso" },
      "timestamp": 1728174027,
      "protocolVersion": "1.0.0",
      "depth": 0,
      "signature": {
        "type": "ed25519",
        "signature": "<base64, by john.bso's key>",
        "publicKey": "<base64, john.bso's key>",
        "signedPropertyNames": ["title", "content", "communityPublicKey", "communityName", "author", "timestamp", "protocolVersion"]
      }
    }
  },
  "communityPublicKey": "12D3KooWJd8mTqzX4bA7rCkYvN2pG5hEw9sLfU3oZ6iRtMxQbExamPLe",
  "communityName": "bestof.bso",
  "author": { "name": "alice.bso" },
  "timestamp": 1728260427,
  "protocolVersion": "1.0.0",
  "depth": 0,
  "signature": {
    "type": "ed25519",
    "signature": "<base64, by alice.bso's key>",
    "publicKey": "<base64, alice.bso's key>",
    "signedPropertyNames": ["title", "crosspost", "communityPublicKey", "communityName", "author", "timestamp", "protocolVersion"]
  }
}
```

A bare crosspost of that post, published to a third community, has a chain depth of 2 and nothing
but `crosspost` as content (abbreviated):

```jsonc
{
  "crosspost": {
    "cid": "Qm…", // CID of the bestof.bso record above
    "comment": { /* the bestof.bso record above, verbatim, including its own crosspost */ }
  },
  "communityPublicKey": "12D3KooW…",
  "author": { "name": "carol.bso" },
  "timestamp": 1728346827,
  "protocolVersion": "1.0.0",
  "depth": 0,
  "signature": { "signedPropertyNames": ["crosspost", "communityPublicKey", "author", "timestamp", "protocolVersion"] /* … */ }
}
```

## Rationale

- **Embed rather than link.** A link would force moderators to fetch the referenced comment before
  they could act on the repost, and would leave the repost empty once the original is edited,
  deleted, removed, or its community disappears. Embedding makes the reposted text available,
  author-signed, and independently moderatable in the host community's own records.
- **No embedded comment update.** The embedded record lives inside an immutable, content-addressed
  record, so anything embedded is frozen forever. Comment updates are mutable state; a snapshot
  baked into an immutable record could never be refreshed and would go stale on the first vote.
- **Two tiers, and acceptance at tier 1.** Tier 1 proves authorship with no network access, which
  is enough to accept and display a repost. Proving that the referenced community accepted the
  comment, and what state it is in, needs that community's signature, so it is deferred to readers
  that want it. A community that required tier 2 at acceptance would make publishing depend on a
  third party's uptime.
- **Why the `cid` alone proves nothing.** Whoever builds a crosspost chooses both the embedded bytes
  and the `cid`, so check 1 only binds them to each other. The binding matters because it is what
  lets a tier-2 update, which signs the `cid`, attest to every byte of the embedded record,
  including the members its author never signed.
- **Why check 3 exists.** `signedPropertyNames` lives inside `signature`, which is not itself
  signed, so a record chooses which of its members are verified. A post signed without a
  `crosspost` lists none, and a `crosspost` attached afterwards leaves its signature valid. Since
  verification reads only the listed members, such an attached subtree would be stored and rendered
  without any of its levels being checked. Rejecting any signable member that is present but not
  listed makes "verified" imply "signed" at every level. The rule is limited to the author-signable
  names so that community-set members, which are legitimately unsigned, and unknown members from
  future protocol versions keep loading.
- **A depth cap of 10, rejected rather than truncated.** Publication size limits bound only what a
  community accepts; clients fetch much larger records, and a deep chain is cheap to mint, even
  with valid signatures at every level. Uncapped, recursive processing fails at an engine-dependent
  depth. A fixed constant makes the rejection identical everywhere; truncation would leave an
  unverified subtree in what is stored and rendered.
- **`maxCrosspostDepth` in `features`, tighten-only.** `features` is published in the community
  record, so publishing clients can see the limit before spending a challenge. Letting a community
  raise the cap would let it accept comments no client will load. `maxCrosspostDepth: 0` and
  `noCrossposts: true` encode the same policy; both are kept because `0` falls out of the
  arithmetic, and `noCrossposts` is the simpler switch.
- **Bare crossposts.** A repost with nothing added is the most common form on other platforms, and
  requiring commentary would only produce filler.
- **No back-references.** The original comment is immutable and predates its reposts, so it can
  never list them, and there is no global index of communities to search. Showing "crossposted to
  …" on an original would need a separate mechanism, which can be added later without changing this
  wire format.
- **Prior art.** Mainstream platforms store a reference, render one embed level, and in Reddit's
  case flatten a crosspost of a crosspost to the original. Embedding the innermost record expresses
  that flattening in this format.
- **Profile feeds.** A feed built from an author's crossposts of their own comments, as in an author
  community ([BSIP-14](./bsip-14.md)), needs no further mechanism: whether an embedded record was
  signed by a given key is a tier-1 fact, a removed original still renders as removed rather than
  vanishing, and verified entries keep counting after their origin goes away.

## Backwards Compatibility

`crosspost` is an additive, optional field. Records without it, and communities that never set the
two features, are unaffected; absent features mean crossposts are accepted up to the protocol cap.

Implementations that predate this BSIP may handle crossposting comments in different ways. One that
requires a comment to carry `title`, `content`, or `link` will reject bare crossposts. One that
loads unknown signed fields will show a crossposting comment as an ordinary comment without its
embed. A community node that normalizes or strips unknown members of incoming records would corrupt
the embedded record and the CID it publishes; such a node SHOULD reject crossposting comments
rather than store them.

Tier-1 check 3 is a new rejection rule, but conforming signers sign every member they set, so it
rejects only records whose signable members were added after signing.

The reference implementation, pkc-js, has supported crossposts since v0.0.82. This BSIP describes
its behavior as of v0.0.132.

## Security Considerations

- **Forged or altered embedded records.** Altering any byte of an embedded record breaks check 1;
  altering the author-signed content and recomputing the `cid` breaks check 4. What a forger can do
  is build a record that was never published anywhere: signed by their own key, or by a key whose
  owner signed it for another purpose, with any `depth`, thumbnail, or `previousCid` they like and a
  matching `cid`. Such a record passes tier 1. Only tier 2 tells it apart, because no community
  will have signed an update for its `cid`; this is why community-set members and the origin must
  not be shown as fact at tier 1.
- **Unsigned subtrees.** Without check 3, a valid record could carry an unsigned `crosspost` whose
  nested levels are never verified, including a nested `cid` that lies about its own bytes so that a
  later tier-2 fetch attests to content that community never saw. Verifiers MUST run check 3 on the
  raw record, before narrowing it to its signed members.
- **Impersonating the original author.** Anyone can generate a key, set `author.name` to someone
  else's name, and sign a record that passes tier 1. Name resolution at every displayed level is
  what exposes this, which is why clients MUST NOT present an embedded name as identity before it
  resolves to the embedded signing key. Clients MUST also keep the crossposting author and the
  embedded author visually distinct, so that a reposter cannot pass off their commentary as the
  original author's or claim the original as their own.
- **Impersonating the original community.** The embedded record's `communityPublicKey` and
  `communityName` are claims by its author. A record can name any community it was never posted to.
  The origin is fact only at tier 2, and a referenced `communityName` must itself be resolved
  before it is shown as a verified community identity ([BSIP-3](./bsip-3.md)).
- **Reputation inflation.** If clients counted unverified crossposts toward scores or karma, anyone
  could inflate a score by crossposting records nobody can check. Counting only verified, live
  entries closes this.
- **Nesting and size denial of service.** Each level of a chain adds a hash computation over the
  remaining subtree, a signature verification, and possibly a name resolution. The depth cap bounds
  all three at ten levels per comment, and measuring depth before recursing keeps an attacker's
  over-deep chain from costing more than a capped one. Size is bounded by the limits on publications
  and on fetched records; the embedded record counts toward both, so nesting consumes the budget
  available to the crossposting comment. pkc-js rejects publications over 40,000 bytes of JSON and
  refuses to fetch comment records over 1 MiB and pages over the limits of
  [BSIP-3, Pages](./bsip-3.md#pages). Clients SHOULD batch and bound concurrent
  name resolutions for embedded authors, especially when rendering pages that hold many
  crossposting comments.
- **Removed or deleted originals.** Embedding is designed so that a repost survives the original's
  removal, deletion, or the disappearance of its community. A crosspost of a comment that was later
  removed or deleted still carries the text; tier 2 reveals the removal or deletion, and clients
  MUST mark it. Moderation of the original never reaches the repost, and the host community
  moderates the crossposting comment independently through its own comment updates.
- **Privacy of reposting removed content.** An author's deletion, or a community's removal, does not
  retract copies: anyone who holds a comment record can crosspost it into any community that
  accepts crossposts, at any later time, and each copy is again content-addressed and replicable.
  Authors and clients should treat publication as irreversible. Communities that do not want to
  host such copies can set `noCrossposts`, and moderate crossposting comments like any other. A
  crosspost of a removed or deleted comment shows its text to readers of the host community even
  where the origin no longer serves it; clients MAY hide the text of removed embeds by policy.
- **Pseudonymity.** The embedded record keeps its original author's signature and `author`,
  including under a host community's pseudonymity mode, which re-signs only the crossposting
  comment. Crossposting one's own comment into a pseudonymous community therefore places one's
  real author key next to the alias's post, and can link the two.
- **Host community policy covers the outer comment.** Content restrictions a community applies to
  incoming comments (for example on media links) are evaluated on the crossposting comment's own
  fields; pkc-js does not apply them to the embedded record. A community that wants its
  restrictions to cover embedded content MUST check the embedded record itself, or set
  `noCrossposts`.
- **Tier-2 fetches reveal interest.** Completing tier 2 means contacting the referenced community's
  peers or gateways about a specific comment. Clients SHOULD perform tier 2 on demand rather than
  for every crosspost they receive.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
