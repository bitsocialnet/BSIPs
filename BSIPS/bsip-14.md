---
bsip: 14
title: Author Communities
description: A profile as a community configuration, addressed by its author's key, posted to only by that author, and fed by their crossposts.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Draft
type: Standards Track
category: Application
created: 2026-11-06
requires: 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 17
---

## Abstract

An **author community**, informally a **profile**, is an ordinary community
([BSIP-3](./bsip-3.md)) configured to show one author's activity. It is a delegated community
([BSIP-11](./bsip-11.md)) whose anchor is the key the author signs their comments with, so anyone
holding one of the author's comments can derive the profile's address. Only its owner may post to
it: by default the pubsub challenge exchange is disabled, backed by a challenge that every publisher
except the owner fails. Its feed is the owner's crossposts ([BSIP-12](./bsip-12.md)) of
their own comments, published by the owner's client. The record declares itself to clients with
`suggested.uiType: "author"`. An author community introduces no record type, field, or message:
it is a configuration, not a type. This BSIP specifies the address rule, the two configurations a
profile takes, what a reader can and cannot conclude from the record, how clients attribute and
render the feed, how a client finds an author's profile, and the profile's key lifetime.

## Motivation

Readers want one place that shows what an author has posted across communities, that the author
controls, and that survives a community removing the author's posts or going offline. A
peer-to-peer network has no server to hold such a page, and a separate profile record would need its
own format, verification, moderation, and hosting, all of which communities already have.

Communities already provide everything a profile needs: a signed, updatable record, pages, comment
updates, moderation, and delegated publishing. Crossposts already let a comment carry another
comment's author-signed record. What independent clients and nodes must agree on is where a profile
lives, how it is configured, how it tells clients what it is, and what its record does and does not
prove. Without that agreement, one client's profile is an ordinary board to another, and clients
either probe every author they render or cannot find profiles at all.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Terminology

- **Author community**, or **profile**: a community configured as this BSIP specifies.
- **Owner**: the author whose key address ([BSIP-10](./bsip-10.md#key-addresses)) is the profile's
  identity key. The **owner key** is that author's Ed25519 keypair: it signs the owner's
  publications in every community, and it is the profile's anchor (`As`/`An` in
  [BSIP-11](./bsip-11.md#keys)).
- **Profile node**: the node that runs the profile and holds its minter key (`Ms`).
- **Entry**: a comment in the profile's post pages.
- **Self-signed entry**: an entry that carries `crosspost` ([BSIP-12](./bsip-12.md)) and whose
  embedded record's signer address, derived from `crosspost.comment.signature.publicKey`, equals the
  profile's identity key.
- **Owner-only challenge**: a challenge in the community's anti-spam configuration
  ([BSIP-3](./bsip-3.md#anti-spam-configuration)) that fails for every publisher it applies to, so
  that only publishers excluded from it can pass. The reference implementation ships one as the
  built-in challenge named `fail`.
- **Out-of-band path**: any way of handing a publication to the node that runs a community other
  than the pubsub challenge exchange of [BSIP-4](./bsip-4.md), for example the RPC protocol of
  [BSIP-17](./bsip-17.md) to that node.
- **Feed-only** and **reply-able**: the two configurations a profile takes, specified in
  [Feed-only profiles](#feed-only-profiles) and [Reply-able profiles](#reply-able-profiles).

"Author community" is unrelated to **author community standing**
([BSIP-5](./bsip-5.md#author-community-standing)), the `author.community` object in comment
updates through which any community reports its view of an author's karma, ban state, and history
in that community. A profile publishes `author.community` for its entries like any community does;
those values describe votes on the profile's own copies and are not the owner's karma (see
[The feed](#the-feed)).

### A configuration, not a type

A profile is an ordinary community. Its record has the schema of [BSIP-3](./bsip-3.md), is
loaded and verified as [BSIP-11](./bsip-11.md#loading-and-verifying-a-community-record) specifies,
and its comments, comment updates, votes, edits, and moderation follow the Core BSIPs unchanged.
Every rule in this BSIP is a configuration of fields those BSIPs define, or a convention for how
clients read them.

A reader MUST load and verify a profile exactly as any community record. Whether a record declares
itself a profile, or meets this BSIP's configuration, MUST NOT affect whether it is valid or how it
is loaded.

### Identity and address

A profile's identity key is the owner's key address: the key address derived from the
`signature.publicKey` the owner signs their publications with.

- The profile is a delegated community ([BSIP-11](./bsip-11.md)) whose anchor `An` is the owner
  key. Its record carries `anchor: { "publicKey": An }`.
- The owner's private key MUST NOT be given to the profile node. The owner's client signs the anchor
  record that points `An` at the profile node's minter, and the profile node publishes it, as in
  [BSIP-11, Setting up and rotating a minter](./bsip-11.md#setting-up-and-rotating-a-minter).
- Because only the owner key can sign the anchor record, a community record that verifies at `An` is
  endorsed by the owner key. Readers need no check beyond those of BSIP-11 to know that a profile at
  `An` was set up by the holder of the owner key.
- Every publication to the profile carries `communityPublicKey` equal to `An`
  ([BSIP-11, Publications](./bsip-11.md#publications)).

A delegated community whose anchor is already the owner key becomes a profile by changing its
configuration. A community with any other identity key cannot become the owner's profile: changing
a community's identity key is a key migration ([BSIP-10](./bsip-10.md#key-migration)), not a
reconfiguration.

### Declaring a profile

This BSIP defines the value `"author"` for the `suggested.uiType` field of the community record
([BSIP-3](./bsip-3.md#the-community-record)).

- A profile node MUST set `suggested.uiType` to `"author"` in the profile's record.
- `uiType` absent means an ordinary community. `"author"` is the only value defined. Clients MUST
  treat a value they do not recognize as absent.
- `uiType` is a rendering hint signed by the profile node, like every member of `suggested`
  ([A configuration, not a type](#a-configuration-not-a-type)). A record whose `uiType` is
  misleading verifies like one whose `title` is misleading.
- A client that implements profiles SHOULD render a community as a profile if and only if its
  record carries `suggested.uiType: "author"`. It renders the profile as that of the author whose key
  address is the community's identity key.
- Clients SHOULD NOT infer that a community is a profile from its `roles`, for example from the
  identity key holding the `owner` role. Any community may list its own identity key as owner, and a
  profile whose roles are not yet configured does not.
- A client MUST identify a profile's owner by the identity key, or by a name verified for that key
  ([BSIP-10](./bsip-10.md#verification-outcomes)). It MUST NOT present the record's `title`,
  `description`, or `suggested` members as the owner's verified identity.

### Roles

The owner-only challenge excuses the owner through `exclude.roles`, which is matched against the
record's public `roles` ([BSIP-3](./bsip-3.md#roles)) under the rules of
[BSIP-10, Identity lists](./bsip-10.md#identity-lists).

- A profile's `roles` MUST map the identity key, in the base58btc key-address form
  ([BSIP-10](./bsip-10.md#key-addresses)), to `{ "role": "owner" }` before the owner first
  publishes to it. That key matches every publication signed by the owner key, whatever
  `author.name` it carries, and is compared without any name resolution.
- `roles` MAY also map the owner's name to `{ "role": "owner" }`. A name key matches only when the
  owner publishes with that exact `author.name` and the name resolves, uncached, to the signer
  address. A `roles` map that holds only the owner's name locks the owner out of every publication
  they send without that name, and whenever the profile node cannot resolve it.
- It is RECOMMENDED that `roles` hold no entry other than the owner's (see
  [Rationale](#rationale)).

When a publication fails only because a name-form `roles` key could not be verified for its signer
(the name has no record, its record is not a valid key, the node has no resolver for its TLD, or no
resolver answered), the profile node SHOULD state that cause in the verification's `reason`
([BSIP-4](./bsip-4.md#the-exchange)) rather than leave the owner-only challenge's text as the only
explanation. A name that resolves to a different key is not the owner and gets no such reason.

### Publishing to a profile

Every profile's challenge configuration contains an owner-only challenge whose exclusions include
`{ "roles": ["owner"] }`. Which other exclusions it has, and whether the challenge exchange runs at
all, is what distinguishes the two configurations below.

The profile node SHOULD configure the owner-only challenge's rejection text to say that only the
owner can post, and SHOULD publish that text in the challenge descriptor's `publicOptions` under the
key `error` ([BSIP-3](./bsip-3.md#anti-spam-configuration)). A rejected publisher receives the text
in the `CHALLENGEVERIFICATION`'s `challengeErrors`, at the owner-only challenge's index
([BSIP-4](./bsip-4.md#the-exchange)).

A profile node MUST apply to every publication it receives on an out-of-band path the same checks it
applies to one received in a `CHALLENGEREQUEST`: the acceptance rules of
[BSIP-4](./bsip-4.md#publication-acceptance) and its challenges, exclusions included. The
out-of-band path is how the owner publishes to a feed-only profile, so it is the path the owner-only
challenge guards when several owners share one profile node.

Whatever the path, the owner's client signs the publication with the owner key before handing it
over, and the publication is stored as signed ([BSIP-2](./bsip-2.md#the-comment-record)). A node or
RPC server that relays it does not sign it on the owner's behalf, so the stored comment's author is
the owner, not the service that relayed it. How a hosted profile node authenticates the owners it
serves is outside the protocol.

### Feed-only profiles

The feed-only configuration is the default. In it:

1. The profile node disables the challenge exchange: the record MUST NOT carry `pubsubTopic`, and
   the node does not subscribe to an exchange topic for the profile. No publisher can then open an
   exchange, and clients do not try ([BSIP-3](./bsip-3.md#the-community-record)).
2. The owner-only challenge's `exclude` is exactly `[{ "roles": ["owner"] }]`. It rejects every
   other publisher that reaches the node on an out-of-band path, and if the exchange is ever
   re-enabled, the configuration still rejects everyone but the owner.
3. The profile generates no reply sorts ([Page sorts](#page-sorts)).
4. The owner publishes on an out-of-band path to the profile node, for example over
   [BSIP-17](./bsip-17.md) to that node, or from the node's own process.

Nobody but the owner can publish anything to a feed-only profile: no posts, replies, or votes.
Discussion of an entry happens in the community where the embedded comment was first published, and
is not mirrored into the profile. A client can tell this from the missing `pubsubTopic` alone and
hide its reply and vote controls instead of letting a publication fail.

The owner's own replies are accepted, since the owner-only challenge excludes them, and are counted
in their parent's `replyCount` and `lastReplyTimestamp` ([BSIP-5](./bsip-5.md#counting-replies)).
With no reply sort, no page lists them, so readers see a count with nothing to open. An owner who
wants to reply in the profile uses the reply-able configuration.

An owner who cannot reach the profile node on an out-of-band path, for example a browser-only
author whose node is hosted, can publish only over pubsub, and so has to leave the exchange enabled.
Such a profile carries `pubsubTopic`, keeps the owner-only challenge with
`exclude: [{ "roles": ["owner"] }]` so that it rejects every publication the owner did not sign, and
generates no reply sorts.

### Reply-able profiles

A profile that takes replies from other authors needs both an enabled exchange and a reply sort.
Either alone does not work: with the exchange enabled and no reply sort, a stranger's reply is
accepted and counted but listed in no page; with a reply sort and the exchange disabled, nobody but
the owner can reply. In the reply-able configuration:

1. The record carries `pubsubTopic`.
2. The owner-only challenge's `exclude` is:

   ```json
   [
     { "roles": ["owner"] },
     { "publicationType": { "reply": true, "commentEdit": true, "commentModeration": true, "communityEdit": true } }
   ]
   ```

3. At least one further challenge guards the publications that the second exclude item excuses,
   with `exclude: [{ "roles": ["owner"] }]`. Without it, replies are unguarded.
4. The profile generates one reply sort ([Page sorts](#page-sorts)).

An `exclude` array matches when any of its items matches, and an item matches when all of its
conditions hold ([BSIP-3](./bsip-3.md#anti-spam-configuration)), so:

| Publisher and publication | Owner-only challenge | Further challenge | Result |
| --- | --- | --- | --- |
| owner, any type | excluded by `roles` | excluded by `roles` | passes both |
| stranger, post | applies and fails | not issued | rejected |
| stranger, reply, comment edit, comment moderation, or community edit | excluded by `publicationType` | applies | challenged normally |
| stranger, vote | applies and fails | not issued | rejected |

A stranger's comment moderation or community edit is still rejected by the authorization rules of
[BSIP-8](./bsip-8.md) and [BSIP-9](./bsip-9.md).

`vote` is deliberately absent from the `publicationType` item, so strangers' votes are rejected
while the owner's are excluded by `roles`. A vote sent to the profile lands on the profile's copy of
an entry, is tallied by the profile node, and adds nothing that clients count as the owner's karma
([The feed](#the-feed)). A profile that wants vote-driven reply sorting MAY add `"vote": true` to the
`publicationType` item.

### What a reader can tell

A reader can establish the following from a verified profile record:

- **Whose profile it is.** The identity key is the owner key, endorsed by the anchor record
  ([Identity and address](#identity-and-address)).
- **That nobody can publish over pubsub**, for a feed-only profile: the record has no
  `pubsubTopic`. This is the strongest owner-only signal a profile carries, because no challenge's
  passability is left to infer.
- **Who is exempt from which challenge.** Challenge descriptors publish `exclude` verbatim, and the
  record publishes the `roles` that `exclude.roles` is matched against.

A reader cannot establish whether a challenge can be passed. The challenge descriptor does not carry
the challenge's implementation or private options ([BSIP-3](./bsip-3.md#anti-spam-configuration)), so
a profile whose owner-only challenge always fails publishes the same exclusions as a community whose
first challenge is an answerable question. Both have `type` `text/plain`. `description` and
`publicOptions.error` are free text chosen by the profile node; a passable challenge can publish an
identical `error` text. They state the node's intent and are hints, not evidence.

"Only the owner posts here" is therefore a reasonable inference from a reply-able profile's record,
not a fact the record attests. Clients MAY present it as a hint, and MUST NOT present it as
verified. A client learns for certain, as for any community, by publishing and reading the
`CHALLENGEVERIFICATION`.

Nothing enforces owner-only posting on the read side. A dishonest profile node can accept a post
from anyone, and the post verifies like any comment of the profile. Owner-only posting is a
property of an honest node's configuration; attribution of entries by signer
([The feed](#the-feed)) is what protects readers from a dishonest one.

### Page sorts

A profile feed is one author's posts in the order they were published, so almost none of the sorts
an unconfigured community generates ([BSIP-3, Pages](./bsip-3.md#pages)) serve it. A profile node
SHOULD generate:

| Configuration | Post sorts | Reply sorts |
| --- | --- | --- |
| feed-only | `new`, preloaded | none |
| reply-able | `new`, preloaded | `new`, preloaded |

- While the feed fits in one page, the record embeds `posts.pages.new` and carries no
  `posts.pageCids`, as BSIP-3 allows when the preloaded pages hold the whole comment set. A client
  that wants another order sorts the embedded page locally. Past one page, `new` is paginated
  through `pageCids` like any sort. Clients discover a profile's sorts from the keys of its pages,
  as for any community.
- Pinned comments stay first, as in any sort by default ([BSIP-3](./bsip-3.md#pages)), so a post the
  owner pins ([BSIP-8](./bsip-8.md)) stays on top.
- The reply-able configuration uses `new` because strangers cannot vote, so every reply ties under a
  score-based sort. A profile that accepts votes MAY use `best` instead.

### The feed

The feed is the comments the owner publishes to the profile. The owner's client MAY mirror the
owner's activity elsewhere by publishing, alongside each comment it publishes in another community,
a crosspost of it ([BSIP-12](./bsip-12.md#building-a-crosspost)), embedding the comment record the
origin community returned in its `CHALLENGEVERIFICATION` ([BSIP-4](./bsip-4.md#the-exchange)). A
client MAY backfill history by
walking the owner's `author.previousCommentCid` chain ([BSIP-2](./bsip-2.md#authors)) and
crossposting each comment it reaches. Mirroring and backfilling are client behavior; the profile node
publishes no entry on the owner's behalf.

Because the feed is made of crossposts, a profile does not set `features.noCrossposts`, and its
`features.maxCrosspostDepth`, if set, admits the chains the owner publishes
([BSIP-12](./bsip-12.md#community-features)).

**Order.** An entry is a comment of the profile with its own `timestamp`, which falls inside the
acceptance window of [BSIP-4](./bsip-4.md#publication-acceptance), and `new` orders by it. Live
crossposts land moments after their originals, but backfilled history lands at the time of the
backfill. A client that wants the order in which the originals were published re-sorts entries by
`crosspost.comment.timestamp`.

**Attribution.** Reading an entry is reading a crosspost: the tier-1 and tier-2 rules, the three
tier-2 states, and the display rules of
[BSIP-12, Client display and attribution](./bsip-12.md#client-display-and-attribution) apply
unchanged. In particular:

- A client MUST NOT present an entry as published by the owner unless the entry's own signer address
  equals the profile's identity key. An entry signed by another key is that key's comment, however a
  profile node came to accept it.
- An entry's embedded record is the owner's own comment only when the entry is self-signed. An entry
  that embeds a record signed by another key is an ordinary crosspost of that author's comment.
- A client that shows the owner's karma computes it from the profile's entries under rule 6 of
  [BSIP-12, Client display and attribution](./bsip-12.md#client-display-and-attribution), counting only self-signed entries whose tier-2 update verifies and is not removed or
  deleted. There is no signed profile-wide total. The vote counts on the profile's copies, and the
  `author.community` the profile publishes for its entries, MUST NOT be presented as the owner's
  karma.

**Duplicates.** Like every community ([BSIP-12](./bsip-12.md#community-acceptance)), a profile node
does not reject a second crosspost of the same `cid`. A client that mirrors or
backfills SHOULD check whether the profile already holds an entry crossposting a `cid` before
publishing another.

**Removal.** An entry leaves the feed only through the profile's own moderation: the owner's comment
edit with `deleted` ([BSIP-7](./bsip-7.md)), or a comment moderation with `removed` or `purged`
([BSIP-8](./bsip-8.md)), on the profile's copy. Nothing is retracted by omission.

### The profile as a backup

An entry embeds the whole author-signed record, so a profile also holds the owner's own copy of
their comments. A client that publishes a bare crosspost of each of the owner's posts into the
profile as it publishes them keeps a copy the origin community cannot take back: if the origin
removes or purges the post, or disappears, the profile still holds the text, and tier 1 still proves
the owner wrote it. Replies do not follow. The profile's copy is its own comment, with its own reply
thread or none, and an origin that purges a post takes its replies with it.

Clients SHOULD render self-signed entries as follows, in place of the generic rendering of
BSIP-12's tier-2 states:

- **Unknown** (the origin no longer serves an update, or never did): render the entry as the owner's
  own copy rather than with the generic unverified marker, worded so that it does not assert the
  origin, for example "kept by the author; its original community did not confirm it". Show the
  origin community only as the owner's claim; an unknown entry may have been purged, or may never
  have been accepted.
- **Removed** (removed by the origin, or deleted there by the owner): keep showing the text, marked
  as removed or deleted at that community. A deletion at the origin does not reach the profile's
  copy.
- **Live**: render it as any live crosspost.

A self-signed entry that is unknown does not count toward karma under BSIP-12, unless the client
verified the origin's update earlier and kept it. Entries embedding records signed by other keys get
the ordinary crosspost treatment.

### Finding a profile

There is no field on `author` that says an author has a profile. A client finds the profile of an
author whose signer address is `S` by loading the community at `S`, by key
([BSIP-10](./bsip-10.md#verifying-a-community-name),
[BSIP-11](./bsip-11.md#loading-and-verifying-a-community-record)). The outcome is a **positive
verdict** when a record verifies and carries `suggested.uiType: "author"`, and a **negative
verdict** otherwise. A missing IPNS record is never proven missing, only not found before a timeout,
so a negative verdict usually costs a full timeout.

- Clients SHOULD NOT look up profiles speculatively, for example for every author in a feed they
  render.
- Clients SHOULD look up a profile on demand, for example when a user opens an author's page.
- Clients SHOULD cache the verdict per author key: keep a positive verdict, and keep a negative
  verdict for about one day, so that a repeat visit does not wait on the same timeout while a newly
  created profile still appears within a day.
- A comment record that carries `pseudonymityMode` is signed by an alias that its community holds
  ([BSIP-2](./bsip-2.md#pseudonymity)). The community at the alias's key, if any, is not the
  author's profile, and clients SHOULD NOT look one up for such a comment.

### Key lifetime

The owner key signs both the owner's comments and the anchor record. Consequently:

- There is no rotation of the owner key. A new key is a new author identity with its own profile;
  the profile at the old key stays where it is.
- The owner key is the author's everyday signing key, held by their client. The recommendation of
  [BSIP-11](./bsip-11.md#keys) that the anchor key stay offline cannot hold for a profile; the rule
  that it never reaches the profile node still does.
- As for any delegated community, the owner re-signs the anchor record before its validity lapses
  ([BSIP-11](./bsip-11.md#setting-up-and-rotating-a-minter)), from the client that holds the owner
  key.
- Minter rotation is supported as for any delegated community
  ([BSIP-11](./bsip-11.md#minter-rotation-and-key-migration)): the owner points `An` at a new minter
  on another node, and the profile's address and stored comments are unchanged. This is how a
  profile moves between nodes; the new node needs the profile's stored comments to serve them.

### Example

A feed-only profile owned by the author whose key address is
`12D3KooWCm8hzun1TM8VqVowUqkE8CYsYAE6LzMCoXRsq8ZaYUEu` (abbreviated; signatures elided):

```jsonc
{
  "anchor": { "publicKey": "12D3KooWCm8hzun1TM8VqVowUqkE8CYsYAE6LzMCoXRsq8ZaYUEu" },
  "roles": { "12D3KooWCm8hzun1TM8VqVowUqkE8CYsYAE6LzMCoXRsq8ZaYUEu": { "role": "owner" } },
  "suggested": { "uiType": "author" },
  "challenges": [
    {
      "type": "text/plain",
      "description": "A challenge that automatically fails with a custom error message.",
      "exclude": [{ "roles": ["owner"] }],
      "publicOptions": { "error": "Only the owner can post to this profile." }
    }
  ],
  "encryption": { "type": "ed25519-aes-gcm", "publicKey": "<base64, the minter's key>" },
  // no pubsubTopic: the challenge exchange is disabled
  "posts": { "pages": { "new": { "comments": [/* { comment, commentUpdate } entries, newest first */] } } },
  "pageSorts": {
    "posts": { "new": { "name": "new", "description": "Newest first", "publicOptions": { "pinnedFirst": "true" /* … */ } } }
  },
  "createdAt": 1792713600,
  "updatedAt": 1792800000,
  "protocolVersion": "1.0.0",
  "signature": { "publicKey": "<base64, the minter's key>" /* … */ }
}
```

A self-signed entry in that profile: a bare crosspost of the owner's post in `jokes.bso`. Both the
entry and the embedded record are signed by the owner key, whose key address is the profile's
identity key. The profile has no name, so the entry carries no `communityName`:

```jsonc
{
  "crosspost": {
    "cid": "Qm…",
    "comment": { /* the owner's jokes.bso post record, verbatim, signed by K78ZChw9… */ }
  },
  "communityPublicKey": "12D3KooWCm8hzun1TM8VqVowUqkE8CYsYAE6LzMCoXRsq8ZaYUEu",
  "author": { "name": "john.bso" },
  "timestamp": 1792803600,
  "protocolVersion": "1.0.0",
  "depth": 0,
  "signature": {
    "type": "ed25519",
    "signature": "<base64>",
    "publicKey": "K78ZChw9hQ839Qj5DcmWUP/OSd+oFi/XIQHEjCmv8Zo",
    "signedPropertyNames": ["crosspost", "communityPublicKey", "author", "timestamp", "protocolVersion"]
  }
}
// signer address of the entry and of the embedded record: 12D3KooWCm8hzun1TM8VqVowUqkE8CYsYAE6LzMCoXRsq8ZaYUEu
```

## Rationale

- **A configuration, not a type.** A dedicated profile record would need its own schema,
  verification, pages, moderation, and export, each a copy of what communities have, and every
  client would have to learn it before showing a profile. As a configuration, a profile loads
  everywhere a community loads, and a client that knows nothing about profiles still shows its
  posts. For the same reason this BSIP is an Application BSIP: it adds conventions above the Core
  BSIPs, not rules to them.
- **The address is the owner key.** Every comment carries the key that identifies its author, so the
  address of an author's profile needs no registry, no hint, and no name. Delegation keeps the owner
  key off the node that must sign the record continuously, and makes the profile's existence an act
  of the owner key, since only that key can sign the anchor record.
- **Feed-only by default.** A profile is a broadcast of one author's activity, and that is the shape
  most profiles want. It is also the cheapest: the node runs no exchange topic and builds no reply
  pages. Its owner-only property is legible through an absence, `pubsubTopic`, which is a stronger
  signal than any challenge configuration.
- **The challenge as a backstop.** Disabling the exchange removes the pubsub path, but the
  out-of-band path is real and runs the same challenge pipeline. On a node that runs several
  owners' profiles, the owner-only challenge is what rejects the other owners, and if the exchange is
  re-enabled the configuration fails closed rather than open.
- **No `features.onlyOwnerCanPost`.** A flag would be a clearer declaration, but it would be written
  by the same node that writes the challenge configuration, so it would add no verifiability, only
  save an inference. Owner-only posting cannot be attested by a record whose author is the node that
  enforces it.
- **`uiType` in `suggested`.** Whether to show a community as a profile is a rendering choice of the
  same kind as a color or an avatar: a client may ignore it without breaking interoperability, and
  nothing about validity depends on it. Unknown values are ignored so that the vocabulary can grow.
  Inferring profiles from `roles` was rejected because it is wrong in both directions and, being
  written by the same node, buys no extra trust.
- **No `author.hasProfile`.** A signed flag on `author` was considered
  ([pkc-js #269](https://github.com/pkcprotocol/pkc-js/issues/269)) and rejected. It would be
  permanent wire surface, self-attested, stale as soon as a profile stops being published, and
  absent from every comment published before the profile existed. The cost it would save, a lookup
  that times out, is bounded by looking up on demand and caching the negative verdict.
- **Entries are published by the owner.** Only the owner can sign as the owner, so an entry is either
  owner-signed or a record the profile node chose to embed. The second option was rejected because it
  makes a profile's contents unattributable to anyone but the node.
- **Strangers' votes rejected.** Karma over a profile is read at tier 2 from each entry's origin.
  Votes on the profile's copies would build a second, misleading score tallied by the owner's own
  delegate, and `new` does not use scores.
- **No signed karma total.** A total computed by the profile node would be the owner's delegate
  attesting to the owner's reputation. A sum over independently verified entries needs no trust in
  the node.
- **One sort.** Profiles may number one per author and outnumber ordinary communities by far.
  Generating the default nine post sorts and five reply sorts for each would cost IPFS blocks,
  publishing time, and rotating CIDs for orders a client can compute from one embedded page.
- **Self-signed entries as a backup.** Hiding a removed crosspost is reasonable in an ordinary
  community, but in a profile it would defeat the one thing an author-signed copy offers: that the
  author's own words outlive the community they were posted in.

Open questions:

- **Delegating profile moderation** to a third party. `roles` can already name moderators; whether
  and how a profile should do so is not specified, and the recommended configuration gives `roles`
  to the owner alone.
- **Convergence.** Because a profile's identity key is the owner key, a name record that designates
  the owner key ([BSIP-10](./bsip-10.md#resolving-bso-and-eth-names)) designates the profile's
  identity key too. Whether a profile should carry the owner's name as its community `name`, and how
  one name should present both a community feed and its owner's author feed, is not specified.

## Backwards Compatibility

This BSIP adds no wire format. A client that does not implement it shows a profile as an ordinary
community whose posts are crossposts. A client that predates [BSIP-12](./bsip-12.md) may reject bare
crossposts or show them without their embedded record. A client that predates the rule that a
record without `pubsubTopic` accepts no pubsub publications ([BSIP-3](./bsip-3.md)) may try to
publish to a feed-only profile on a default topic and time out.

The reference implementation, pkc-js, has supported profiles, including `suggested.uiType`, since
v0.0.119. This BSIP describes its behavior as of v0.0.135.

## Reference Implementation

Non-normative. pkc-js implements profiles with no profile-specific source, as documented in
[`docs/protocol/author-communities.md`](https://github.com/pkcprotocol/pkc-js/blob/master/docs/protocol/author-communities.md)
(issue [#31](https://github.com/pkcprotocol/pkc-js/issues/31)):

- the delegated community, anchor record and minter in
  [`docs/protocol/delegated-ipns.md`](https://github.com/pkcprotocol/pkc-js/blob/master/docs/protocol/delegated-ipns.md);
- `settings.disablePubsubChallengeExchange`, which omits `pubsubTopic`, in
  [`src/runtime/node/community/local-community/comment-updates.ts`](https://github.com/pkcprotocol/pkc-js/blob/master/src/runtime/node/community/local-community/comment-updates.ts),
  and the publisher's fast failure with `ERR_COMMUNITY_CHALLENGE_EXCHANGE_DISABLED` in
  [`src/publications/publication.ts`](https://github.com/pkcprotocol/pkc-js/blob/master/src/publications/publication.ts);
- the built-in `fail` challenge in
  [`src/runtime/node/community/challenges/pkc-js-challenges/fail.ts`](https://github.com/pkcprotocol/pkc-js/blob/master/src/runtime/node/community/challenges/pkc-js-challenges/fail.ts),
  `exclude` and `roles` matching in
  [`challenges/exclude/exclude.ts`](https://github.com/pkcprotocol/pkc-js/blob/master/src/runtime/node/community/challenges/exclude/exclude.ts)
  and
  [`local-community/author-identity.ts`](https://github.com/pkcprotocol/pkc-js/blob/master/src/runtime/node/community/local-community/author-identity.ts),
  and the public challenge descriptor in
  [`docs/protocol/challenge-settings.md`](https://github.com/pkcprotocol/pkc-js/blob/master/docs/protocol/challenge-settings.md);
- `settings.pages` and the single-chunk shortcut in
  [`docs/protocol/page-sorts.md`](https://github.com/pkcprotocol/pkc-js/blob/master/docs/protocol/page-sorts.md);
- `suggested.uiType` in
  [`src/community/schema.ts`](https://github.com/pkcprotocol/pkc-js/blob/master/src/community/schema.ts);
- tests in
  [`test/node/author-community/author-community.test.ts`](https://github.com/pkcprotocol/pkc-js/blob/master/test/node/author-community/author-community.test.ts)
  and
  [`test/node-and-browser/author-community/wire-legibility.test.ts`](https://github.com/pkcprotocol/pkc-js/blob/master/test/node-and-browser/author-community/wire-legibility.test.ts).

A feed-only profile is one `createCommunity` call, followed by publishing the anchor record and
starting the community:

```js
const profile = await pkc.createCommunity({
    anchor: { publicKey: An },            // the owner's key address
    roles: { [An]: { role: "owner" } },   // createCommunity never adds this itself
    suggested: { uiType: "author" },
    settings: {
        disablePubsubChallengeExchange: true,
        challenges: [{
            name: "fail",
            options: { error: "Only the owner can post to this profile." },
            publicOptions: ["error"],
            exclude: [{ roles: ["owner"] }]
        }],
        pages: { posts: [{ name: "new", preloaded: true }], replies: [] }
    }
})
```

Two pkc-js behaviors make configuration mistakes likely. `createCommunity` never seeds `roles`, and
`roles` is public while `settings` is private, so a profile whose excludes are configured but whose
`roles` is empty rejects its owner's first post. And `community.edit()` replaces each top-level
member it is given whole, `settings`, `suggested`, and `roles` included, so an edit that converts an
existing community must repeat the entries it keeps; an edit that omits `settings.pages` unsets it.

Moving a profile to another node reuses `exportCommunity`, which exports the community database
like any other; the minter's private key is left out unless `includePrivateKey` is set, and the
owner key is never on the node to export.

## Security Considerations

- **Delegate trust.** The profile node holds the minter key and, until the owner rotates it,
  controls what the profile publishes ([BSIP-11](./bsip-11.md#security-considerations)). It can
  accept posts from anyone, omit entries from pages, set moderation state, or stop serving the
  profile. It cannot sign as the owner, so attributing entries by signer, and counting only
  self-signed entries toward the owner's karma, keeps a dishonest node from putting words or
  reputation in the owner's name.
- **Owner key compromise.** An attacker holding the owner key can publish as the owner everywhere
  and can re-point the profile to a minter of their own by signing an anchor record with a higher
  sequence. Both are the same loss: the profile's identity is the author's identity. A profile
  without a community name cannot recover ([BSIP-11](./bsip-11.md#security-considerations)); the
  author starts over under a new key. Because the owner key is an everyday signing key rather than
  an offline one, it is more exposed than the anchor key BSIP-11 assumes.
- **Impersonation.** Anyone can create a profile at their own key with another author's title,
  avatar, and `uiType: "author"`. It is the profile of the key that set it up, which is why clients
  identify a profile's owner by its identity key or a name verified for it, never by its metadata.
- **Inferred posting policy.** A reply-able profile's owner-only property is an inference, and an
  answerable challenge can be dressed up to look like an owner-only one. Clients that rely on the
  inference, for example to hide a post button, risk only usability; they do not rely on it for
  attribution, which comes from signatures.
- **Owner lock-out.** A `roles` map keyed only by the owner's name makes the owner's ability to post
  depend on fresh resolution of that name on every publication. A resolver outage, a missing
  resolver for the TLD, or a name record in flux locks the owner out. The key-form `roles` entry
  avoids this.
- **Multi-tenant nodes.** On a node that runs several owners' profiles, other tenants can reach the
  profile on the out-of-band path. The owner-only challenge, matched against the signer, is what
  rejects them; a profile node that skipped challenges on that path would let any tenant post to any
  profile.
- **Lookup cost and privacy.** A negative lookup costs a full timeout and asks peers or gateways
  about a specific author's key. Speculative lookups for every rendered author would multiply both
  and reveal what the reader is viewing; looking up on demand and caching verdicts bounds them. A
  cached negative verdict can hide a newly created profile for up to a day.
- **Backups outlive deletion.** A self-signed entry keeps the text after the origin removes the
  post and after the owner deletes it there; the owner must delete the profile's copy as well. As
  with any crosspost ([BSIP-12](./bsip-12.md#security-considerations)), anyone holding the record can
  crosspost it again.
- **Aggregation and pseudonymity.** A profile gathers an author's activity across communities in one
  place, which makes it easier to correlate. Crossposting a comment from a community that
  pseudonymizes its authors into the owner's profile links the alias to the owner key. A community
  holds the private keys of its aliases, so a profile at an alias's key would be published by that
  community, not by the author.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
