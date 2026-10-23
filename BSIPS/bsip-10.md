---
bsip: 10
title: Names and Addresses
description: How authors and communities are addressed by public key or by crypto-domain name, and when a name counts as verified.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Draft
type: Standards Track
category: Core
created: 2026-10-23
requires: 2
---

## Abstract

Every Bitsocial author and community has a **key address**: the libp2p PeerId of an Ed25519 public
key, written in base58btc (for example `12D3KooW…`). Either MAY also have a **name**, a crypto
domain such as `memes.bso` or `vitalik.eth` that resolves to a key address. This BSIP defines both
forms, the runtime value `address = name || publicKey`, which name fields go on the wire, the
letter-case and `.bso`/`.eth` equivalence rules, the resolver interface and the `bitsocial` text
record it reads, the three-valued outcome of verifying a name, how a community moves to a new key
by repointing its name (key migration), how names in roles and challenge exclusions are matched to
authors, and caching and failure behavior.

## Motivation

Public keys are unforgeable but unreadable. Names are readable but, until resolved, are only claims:
anyone can sign a comment with `author.name` set to someone else's domain. Clients that do not share
one rule for when a name counts as an identity disagree in harmful ways. One client shows `bot.bso`
as verified while another shows an impostor; a community grants a moderator role to whoever typed a
moderator's name; a reader keeps trusting a community key its owner abandoned after a compromise.
[BSIP-2](./bsip-2.md) and [BSIP-3](./bsip-3.md) carry name fields; this BSIP defines what those
fields mean and how every implementation checks them.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Terminology

- **Key address**: the string form of an Ed25519 public key, defined in
  [Key addresses](#key-addresses). It is also the key's IPNS name.
- **Name**: a string defined in [Names](#names), for example `memes.bso`.
- **Signer address**: the key address derived from a record's `signature.publicKey`.
- **Identity key** of a community: the key address readers address it by. For an ordinary community
  it is the signer address of its record; for a delegated community it is `anchor.publicKey`
  ([BSIP-11](./bsip-11.md)).
- **Resolver**: a component that maps a name to a key address ([Name resolution](#name-resolution)).

### Key addresses

A key address is derived from a 32-byte Ed25519 public key:

1. Encode the key as a libp2p `PublicKey` protobuf: the bytes `0x08 0x01 0x12 0x20` followed by the
   32 key bytes (36 bytes).
2. Wrap the result in an identity multihash: `0x00 0x24` followed by those 36 bytes (38 bytes).
3. Encode the 38 bytes in base58btc (the Bitcoin alphabet), with no multibase prefix.

The result is 52 characters long and starts with `12D3KooW`.

- Every wire field and configuration value that holds a key address, including `communityPublicKey`,
  `anchor.publicKey`, key-form `roles` keys, `exclude.publicKeys`, and the key inside a name record,
  MUST use this base58btc form. The base36 and base32 CID encodings of the same key (`k51…`,
  `bafz…`) MUST NOT be used there. Key addresses are compared as exact, case-sensitive strings, so a
  value in another encoding never matches.
- `signature.publicKey` and `encryption.publicKey` carry the raw key in base64
  ([BSIP-2](./bsip-2.md#signatures)), not a key address. An implementation that compares one of them
  with a key address MUST derive the key address first.

### Names

A **name** is any string that contains at least one `.` (U+002E). This is the only test that tells a
name from a key address: a key address never contains a `.`, and a string without one is never a
name. The part after the last `.` is the name's TLD.

- A name MUST NOT contain an uppercase ASCII letter (`A`–`Z`), whatever its TLD. A client MUST
  refuse to sign a publication whose `author.name` contains one. A community node MUST reject such a
  publication before resolving anything. A community MUST NOT adopt such a name, and a client MUST
  refuse to load a community addressed by one.
- `.bso` and `.eth` names SHOULD be written in ENS-normalized form
  ([ENSIP-15](https://docs.ens.domains/ensip/15)). A reader SHOULD NOT treat a `.bso` or `.eth` name
  that is not in normalized form as verified, because two such spellings can resolve to one ENS
  name.
- `author.name`, when present, MUST be a name. A community node MUST reject a publication whose
  `author.name` contains no `.`. A free-form label belongs in `author.displayName`
  ([BSIP-2](./bsip-2.md#authors)).
- A name designates exactly one key address at a time. Authors and communities are named through the
  same record ([Resolving `.bso` and `.eth` names](#resolving-bso-and-eth-names)), so a name cannot
  serve as an author's name and a community's name at once.

### Name equivalence

Two spellings A and B are **the same name** when:

1. A and B are identical strings; or
2. both end in `.bso` or `.eth` (suffix compared case-insensitively) and, after lowercasing both and
   replacing a trailing `.bso` with `.eth`, they are identical.

Otherwise they are different names. `bot.bso`, `bot.eth`, and `Bot.BSO` are the same name;
`bot.sol` and `bot.eth` are not, and neither are `Bot.sol` and `bot.sol`. (Spellings with uppercase
letters are invalid on the wire but can appear in identity lists an owner typed by hand.) `.bso` is
the protocol's spelling of an ENS `.eth` name, and ENS
names are case-insensitive. For any other TLD the resolver's case rules are unknown, so only an exact
match counts.

Equivalence never replaces resolution. It decides only whether two spellings name the same name; an
identity-list entry `bot.eth` grants nothing to a publication signed with `author.name: "bot.bso"`
unless `bot.bso` resolves to that publication's signer ([Identity lists](#identity-lists)).

Implementations MUST use equivalence, not string equality, when matching names in identity lists,
when checking a stored comment's `communityName` against a community
([Community membership of comments](#community-membership-of-comments)), and when deciding whether
two community addresses denote the same community. They MUST use exact string equality where this
BSIP says so, notably when a community node validates the `communityName` of a new publication
([Community names on publications](#community-names-on-publications)).

### Wire fields

The names and identity keys of authors and communities travel in these signed fields. (Names also
appear as entries in a community's identity lists; see [Identity lists](#identity-lists).)

| Object | Field | Presence | Value |
| --- | --- | --- | --- |
| Publication ([BSIP-2](./bsip-2.md#authors)) | `author.name` | OPTIONAL | The author's name. |
| Publication ([BSIP-2](./bsip-2.md#community-addressing)) | `communityName` | REQUIRED when the community has a name, else absent | The community's name. |
| Publication ([BSIP-2](./bsip-2.md#community-addressing)) | `communityPublicKey` | REQUIRED | The community's identity key. |
| Community record ([BSIP-3](./bsip-3.md#identity-and-addressing)) | `name` | OPTIONAL | The community's name. |
| Community record ([BSIP-11](./bsip-11.md)) | `anchor.publicKey` | Delegated communities only | The community's identity key. |

The following are **runtime-only**: they MUST NOT appear in a new wire object and MUST NOT be signed.

- On an author: `address`, `publicKey`, `shortAddress`, `nameResolved`. A community node MUST reject a
  publication whose `author` carries any of them, or carries `community` (that sub-object is set only
  by the community in comment updates, [BSIP-5](./bsip-5.md)).
- On a community: `address`, `publicKey`, `shortAddress`, `nameResolved`, `ipnsHops`. A reader MUST
  reject a community record that carries `shortAddress`, `nameResolved`, or `ipnsHops`
  ([BSIP-3](./bsip-3.md) lists the other reserved fields). Older community records carry a legacy
  `address` ([Backwards Compatibility](#backwards-compatibility)).

Example publication by a named author to a named community:

```jsonc
{
  "content": "Release notes are up.",
  "communityPublicKey": "12D3KooWNsF2eMrdw3YFPycAaFEvZ9Eq3ekhNL3vrAAfN6dAwXLp",
  "communityName": "news.bso",
  "author": { "name": "john.bso", "displayName": "John" },
  "timestamp": 1792713600,
  "protocolVersion": "1.0.0",
  "signature": {
    "type": "ed25519",
    "signature": "<base64>",
    "publicKey": "K78ZChw9hQ839Qj5DcmWUP/OSd+oFi/XIQHEjCmv8Zo",
    "signedPropertyNames": ["content", "communityPublicKey", "communityName", "author", "timestamp", "protocolVersion"]
  }
}
// signer address: 12D3KooWCm8hzun1TM8VqVowUqkE8CYsYAE6LzMCoXRsq8ZaYUEu
// author.address (runtime): "john.bso", verified only if john.bso resolves to the signer address
```

### Runtime addresses

```text
address = name || publicKey
```

- `author.address` is `author.name` when present, else the signer address. `author.publicKey` is the
  signer address.
- `community.address` is the name the client identified the community by, or its identity key when
  the client identified it by key. `community.publicKey` is the identity key.

A client fixes `address` when it first identifies an author or community. It MUST NOT change
`address` because a name failed to verify, and MUST NOT substitute the key address for an unverified
name; it reports the verification outcome separately
([Verification outcomes](#verification-outcomes)). `address` is a claim the publisher controls and
MUST NOT be used to decide identity or authority; use the signer address, or a name verified for that
signer.

### Community names on publications

These rules apply when a community node validates a new publication
([BSIP-4](./bsip-4.md)):

- `communityPublicKey` MUST be present and MUST equal the community's identity key (the anchor of a
  delegated community, [BSIP-11](./bsip-11.md)). The node MUST reject any other value.
- When the community has a name, `communityName` MUST be present and MUST be exactly the community's
  current name; `.bso`/`.eth` aliases are not substituted. When the community has no name,
  `communityName` MUST be absent. The node MUST reject a publication that violates either rule.
- A client that reached the community by its key MUST read the name from the verified community
  record before signing.

Both fields are signed, so a stored comment keeps the name and key it was signed with after the
community renames itself or migrates to a new key.

### Community membership of comments

A client that verifies a comment presented as belonging to a community MUST apply these rules, using
the community's currently verified record:

1. If the record carries `anchor` ([BSIP-11](./bsip-11.md)), the comment's `communityPublicKey`, when
   present, MUST equal `anchor.publicKey`.
2. If the record carries `name` N, the comment's `communityName`, when present, MUST be the same name
   as N ([Name equivalence](#name-equivalence)). `communityPublicKey` is not otherwise checked, so
   comments signed before a [key migration](#key-migration) stay valid.
3. If the record has no `name`, the comment's `communityPublicKey`, when present, MUST equal the
   identity key.

Clients MUST apply rules 1–3 to every comment in a community's pages and reply pages; a page with a
comment that fails is invalid. A client that loads a single comment by CID and associates it with a
community MUST reject it if rule 2 fails, and MAY also apply rules 1 and 3. A community node SHOULD
apply the same rules against its current record when it builds pages and counts, so that it never
publishes a comment readers reject.

Consequences after an address change (informative):

| Change | Comments signed before it | Still members afterwards |
| --- | --- | --- |
| key only → name `c.bso` | no `communityName` | yes |
| `a.eth` → `a.bso` | `communityName: "a.eth"` | yes (same name) |
| `n.bso` → `m.bso` | `communityName: "n.bso"` | no |
| `n.bso` → no name | `communityName: "n.bso"` | yes (rule 3 does not check names) |
| renamed back to `n.bso` | `communityName: "n.bso"` | yes again |

### Name resolution

#### Resolver interface

A resolver offers two operations:

- `canResolve(name) → boolean`: a pure, synchronous test, typically of the TLD. It MUST NOT perform
  I/O.
- `resolve(name) → { publicKey, …metadata } | none`: a lookup that returns the key the name's record
  designates, returns `none` when it obtained a definitive answer that no record exists, or fails
  with an error when it could not obtain an answer (network error, timeout, malformed response).

The resolver receives the name exactly as published; it is the resolver's job to apply any
normalization its naming system requires. A client MAY configure several resolvers, for example one
per chain provider. Resolution of a name proceeds in configured order:

1. Skip every resolver whose `canResolve(name)` is false. If none remains, the outcome is
   **unsupported**.
2. Ask each remaining resolver in turn. The first one that returns a `publicKey` decides the result.
   A resolver that returns `none` does not stop the search; a resolver that errors is recorded and
   the next one is asked.
3. If a key was returned, the outcome is **found(key)**. If the key is not a valid key address
   ([Key addresses](#key-addresses)), the outcome is **invalid record** instead.
4. Otherwise, if at least one resolver returned `none`, the outcome is **no record**.
5. Otherwise every resolver errored, and the outcome is **failed**. A timeout or abort is also
   **failed**.

#### Resolving `.bso` and `.eth` names

`.bso` and `.eth` names are resolved through the Ethereum Name Service on Ethereum mainnet:

1. `canResolve` is true exactly when the name ends in `.bso` or `.eth` (compared case-insensitively).
2. If the name ends in `.bso`, replace that suffix with `.eth`.
3. ENS-normalize the result ([ENSIP-15](https://docs.ens.domains/ensip/15)).
4. Read the ENS text record ([ENSIP-5](https://docs.ens.domains/ensip/5)) with key **`bitsocial`**
   for that name.
5. If the record is unset or empty, return `none`.
6. Otherwise parse the value: split it on `;` and trim whitespace around each segment. The first
   segment MUST be a key address, which becomes `publicKey`. Each later segment MUST have the form
   `key=value` with a non-empty key; the key `publicKey` is reserved and MUST NOT appear there. Other
   keys are metadata that this BSIP does not interpret, and readers MUST ignore keys they do not
   understand.
7. A value that does not parse MUST NOT verify any name. A resolver SHOULD report it so that the
   outcome is **invalid record**.

The same record serves authors and communities. Example ENS text record for `news.bso` (stored on
`news.eth`):

```text
key:   bitsocial
value: 12D3KooWNsF2eMrdw3YFPycAaFEvZ9Eq3ekhNL3vrAAfN6dAwXLp
```

A value MAY carry metadata segments, for example
`12D3KooWNsF2eMrdw3YFPycAaFEvZ9Eq3ekhNL3vrAAfN6dAwXLp;lang=en`.

`.bso` is mapped onto ENS in this BSIP because that is the registry `.bso` names live in today. If a
later Appchain BSIP moves `.bso` to another registry, it will replace steps 2–4 for `.bso` and must
revisit [Name equivalence](#name-equivalence). Names under other TLDs MAY be supported by other
resolvers; this BSIP does not define them, and they match only exactly.

#### Verification outcomes

Verifying a name for a given key produces one of three outcomes:

- **verified**: the name designates that key.
- **refuted**: a resolver answered and the answer contradicts the claim.
- **unknown**: no answer was obtained. This is not an accusation.

A client MUST NOT present a name as an identity unless its outcome is **verified**. A client MUST NOT
present a **refuted** name as the author's or community's identity. An **unknown** outcome MUST NOT be
treated, displayed, or cached as **refuted**; the client SHOULD retry later
([Caching and retries](#caching-and-retries)). The outcome of verifying a name never makes a signed
record invalid: a comment whose `author.name` is refuted is still a valid comment by its signer.

#### Verifying an author name

For an author with name D and signer address S:

| Resolution outcome | Outcome |
| --- | --- |
| found(S) | verified |
| found(K), K ≠ S | refuted |
| no record, invalid record | refuted |
| failed, unsupported | unknown |
| not attempted (for example, resolution disabled) | unknown |

A community node validating a new publication ([BSIP-4](./bsip-4.md)) that carries `author.name`
SHOULD verify it, with a cache no older than 30 minutes. A node that verifies it MUST reject the
publication unless the outcome is **verified**, and SHOULD state which case applied in the rejection
reason: the name has no record, the record is not a valid key, the node has no resolver for the TLD,
the node could not obtain an answer, or the name resolves to a different key.

#### Verifying a community name

For a community with identity key K and name D, the outcome is computed from resolving D:

| Resolution outcome | Outcome | Effect |
| --- | --- | --- |
| found(K) | verified | none |
| found(M), M a non-identity key of the community's own verified delegation chain (its minter) | refuted | identity unchanged ([BSIP-11](./bsip-11.md)) |
| found(K′), any other K′ ≠ K | verified for K′ | [key migration](#key-migration) to K′ |
| no record, invalid record | refuted | identity and record kept |
| failed, unsupported | unknown | identity and record kept |

**Loading a community by name D.** The reader resolves D. Unless the outcome is found(N), the reader
cannot load the community; it MUST NOT retry after **unsupported** and SHOULD retry the other
outcomes with backoff. It then fetches and verifies the record reachable from N
([BSIP-3](./bsip-3.md#signing), [BSIP-11](./bsip-11.md)) and MUST check the record against D:

- If the record has a `name`, it MUST be the same name as D. A reader that loaded `n.bso` and
  receives a record named `m.bso` MUST reject it; readers do not follow renames.
- If the record has no `name`, the reader MUST reject it unless it already holds a key address for
  D and the record's signer address equals it.

It then classifies D against the record's identity key with the table above, and fetches later
records through the identity key rather than resolving D on every fetch.

**Loading a community by key.** The reader fetches and verifies the record under that key. A `name` in
the record is the owner's claim; the reader classifies it with the table above and MUST NOT let it
change `address`.

#### Key migration

A community **migrates** to a new identity key when its name, verified as in
[Verifying a community name](#verifying-a-community-name), now resolves to a key address K′ that
differs from the identity key K the reader holds and is not a non-identity key of the community's own
verified chain. There is no in-band announcement: the name record is the announcement. The owner
migrates by setting the name's record to K′ and publishing community records under K′ with the same
`name`.

A reader that detects a migration MUST:

1. discard every community record, page, and comment update obtained under K, and every result of a
   fetch under K that completes afterwards, since K may be compromised;
2. take K′ as the identity key, mark the name **verified**, and keep `address` unchanged;
3. fetch and verify the record under K′ from scratch, with no fallback to K if that fails;
4. use K′ as `communityPublicKey` on every new publication; and
5. notify the application, identifying K and K′.

This applies whether the reader loaded the community by name or by key: a record that names a
community delegates its identity to whoever controls that name. A community without a name cannot
migrate; its identity is its key. Rotating the minter of a delegated community is not a migration
([BSIP-11](./bsip-11.md)).

#### Identity lists

A community configures identities in its `roles` keys ([BSIP-3](./bsip-3.md)), in challenge
`exclude.publicKeys` and `exclude.names`, and in allow and deny lists. Any implementation that decides
whether a configured identity string refers to a publication's author MUST use this rule:

- A key-form string (no `.`) matches if and only if it equals the publication's signer address.
- A name-form string matches if and only if the publication carries `author.name`, the configured
  string and `author.name` are the same name ([Name equivalence](#name-equivalence)), and
  `author.name`, the published spelling and never the configured one, resolves to the signer address.
  This resolution MUST bypass cached results.
- `author.address` MUST NOT be used.

A name that is not **verified** for the signer does not match. Implementations SHOULD compare
key-form strings before resolving any name, so that an author listed by key is never delayed by, or
dependent on, a resolver. When a decision is taken after a delay, such as after an interactive
challenge answer ([BSIP-4](./bsip-4.md)), the name SHOULD be resolved again at decision time. Clients
that display role membership SHOULD apply the same rule.

#### Caching and retries

Implementations MAY cache resolution results. A cache entry MUST be keyed by the name and by the
resolver (and its provider) that produced it. Only **found** results SHOULD be stored persistently;
**no record**, **invalid record**, and **failed** results SHOULD NOT be. Callers choose a maximum age
per purpose; the RECOMMENDED values are:

| Purpose | Maximum age |
| --- | --- |
| Matching identity lists; checking a moderator's role; assigning a role | 0 (no cache) |
| Validating the `author.name` of an incoming publication | 30 minutes |
| An owner checking a new community name before adopting it | 10 minutes |
| Loading a community by name; re-verifying a displayed community name | 1 hour |
| Verifying author names for display | 1 hour |

A displayed outcome MUST lapse so that a name transferred to someone else stops reading as verified:
a **verified** outcome SHOULD be re-derived at least every hour, and a **refuted** outcome SHOULD be
re-derived after 60 seconds, since a missing or malformed record is also what a correctly owned name
looks like while its owner is configuring it. After an **unknown** outcome, a client SHOULD wait at
least 10 seconds before asking again, and SHOULD NOT start a new resolution of a name while one is in
flight. A client MUST NOT retry a name whose outcome is **unsupported** until its resolver
configuration changes.

#### Failure behavior

- A name that cannot be verified never changes `address` and never invalidates a signed record.
- Loading a community by name fails when resolution does not return found; see
  [Verifying a community name](#verifying-a-community-name) for which failures are retried.
- A community node that rejects a publication for an author-name failure does so through the
  challenge exchange ([BSIP-4](./bsip-4.md)), with the reason in `CHALLENGEVERIFICATION`.
- A client that delegates resolution to a trusted intermediary, such as an RPC server, receives that
  intermediary's outcome and inherits its trust ([Security Considerations](#security-considerations)).

## Rationale

- **`address` is derived, never stored.** Keeping `address` off the wire means a signature never
  covers a value the signer cannot prove. Keeping it fixed after a failed verification, and reporting
  the outcome separately, lets a client show "`john.bso` (unverified)" instead of silently swapping
  identities, which would make the same comment display under different authors in different clients.
- **Three outcomes, not two.** "Refuted" is an accusation that the claimant is an impostor. A resolver
  outage, a timeout, or a TLD a client cannot resolve must not produce that accusation, and must
  remain retryable. A short lifetime for refuted outcomes covers names whose owners are still
  configuring them.
- **One spelling on the wire.** Signatures cover exact bytes, so the lowercase rule ensures one author
  or community is never signed under two spellings. Equivalence is still needed for identity lists
  and old records, because owners type names by hand and `.eth`/`.bso` are aliases.
- **One text record for authors and communities.** A single `bitsocial` key keeps the record format
  and the resolver interface independent of what is being named.
- **Identity follows the name.** Letting a name move a community to a new key gives owners a recovery
  path from key compromise without a registrar or a new address. The price is that the name's
  controller is part of the community's trust base.
- **Exact `communityName` at publish time, equivalence afterwards.** New publications are held to the
  single current spelling; stored comments are judged by equivalence because they may have been signed
  under an alias that was correct at the time.

## Backwards Compatibility

- Older records carry `author.address` instead of `author.name`. A reader SHOULD treat a legacy
  `author.address` that is a name as `author.name`. Stored comment records that carry
  `author.address` remain verifiable; new publications carrying it MUST be rejected.
- Older publications carry a combined `subplebbitAddress`. A reader SHOULD treat a value that is a
  name as `communityName` and any other value as `communityPublicKey`. Community nodes MUST reject new
  publications carrying `subplebbitAddress` or `communityAddress`.
- Older community records carry `address` instead of `name`. A reader SHOULD treat a legacy `address`
  that is a name as `name`.
- The uppercase rule applies to new publications and to communities created, edited, or loaded by
  name. Records signed before it remain verifiable.
- Records signed before `communityName` became required lack it; the membership rules accept them.

## Reference Implementation

Non-normative. The current implementation is
[pkc-js](https://github.com/pkcprotocol/pkc-js): name equivalence in `src/domain-util.ts`, resolver
orchestration and caching in `src/clients/base-client-manager.ts`, community name verification and key
migration in `src/community/community-client-manager.ts`, and identity-list matching in
`src/runtime/node/community/local-community/author-identity.ts`. `.bso` and `.eth` resolution is
implemented by [bso-resolver](https://github.com/bitsocialnet/bso-resolver).

## Security Considerations

- **Impersonation.** `author.name` and a community record's `name` are unauthenticated claims until
  resolved. A client that displays a name as an identity without a **verified** outcome lets anyone
  impersonate anyone. A community node that skips author-name verification stores impostor names;
  readers must still verify them.
- **Look-alike names.** The uppercase rule removes ASCII case variants only. Unicode confusables
  (Cyrillic `а` for Latin `a`, for example) and non-ASCII case variants remain possible. Clients SHOULD
  display `.bso`/`.eth` names in ENS-normalized form, SHOULD flag names that mix scripts or contain
  confusable characters, and MUST NOT extend equivalence beyond
  [Name equivalence](#name-equivalence). A **verified** outcome proves control of the exact name
  resolved, not of the name the user believes they are reading.
- **Case folding.** ENS resolution case-folds, so `X.bso` and `x.bso` resolve to the same record. The
  uppercase rule keeps one spelling on the wire; readers that accepted mixed-case names would let one
  owner appear under several spellings, or let a mixed-case spelling borrow a lowercase name's
  verification.
- **Equivalence is not authorization.** Matching uses the published `author.name` and resolves it; the
  configured spelling is never resolved. An impostor gains nothing from an entry that names an alias
  of a name they do not control.
- **Resolver trust.** A resolver, chain provider, or RPC server that lies can make any name verify for
  any key. Because the first returned key wins, one dishonest provider early in the configured order
  decides the outcome. Clients SHOULD use providers they trust or run their own node, and MAY query
  several providers and treat disagreement as **unknown**. Clients that delegate resolution to an RPC
  server trust that server completely for names.
- **Stale and rolled-back resolutions.** A cached result can outlive a transfer of the name. The
  lifetimes in [Caching and retries](#caching-and-retries) bound the window; decisions that grant
  authority bypass the cache. A provider serving an old chain state can roll a name back to a
  previous key; this is a resolver-trust problem and is mitigated the same way.
- **Key compromise and migration hijack.** Key migration is a community's recovery path from key
  compromise, and it is also an attack path: whoever controls the name record controls where readers
  migrate, including readers that loaded the community by key. An expired or transferred name can be
  re-registered by an attacker, who can then migrate every reader to a key they hold. Community owners
  SHOULD keep their names registered and their name-owner keys secure. Readers discard all data from
  the old key on migration, so an attacker holding a compromised old key cannot keep feeding
  migrated readers. Communities without a name have no recovery path short of a new address.
- **Denial of service.** Every displayed name costs a lookup. The retry floors, the in-flight limit,
  and skipping unsupported TLDs keep a resolver outage or a page full of attacker-chosen names from
  turning into unbounded lookups.
- **Privacy.** Resolution reveals to the resolver's provider which names a client is interested in.
  Clients that care SHOULD use their own node or a provider they trust.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
