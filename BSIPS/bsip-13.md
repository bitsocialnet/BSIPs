---
bsip: 13
title: Interim .bso Name Registry
description: An ownerless Ethereum mainnet registry for .bso names, how it launches from names already in use, and how it moves to Bitsocial Chain.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues/17
status: Draft
type: Standards Track
category: Appchain
created: 2026-11-04
requires: 10
---

## Abstract

This BSIP moves `.bso` names off ENS and into a registry of their own: an ownerless,
non-upgradeable contract on Ethereum mainnet, forked from the `.gwei` Name Service (GNS). Names are
ERC-721 tokens that expire, are registered by commit-reveal at fixed length-based prices, and carry
ENS-style text records, so the `bitsocial` record of [BSIP-10](./bsip-10.md) does not change. Fees
go to a hardcoded multisig that funds Bitsocial development. The multisig can only collect those
fees and start a one-time sunset. It cannot change prices, and over names it has only the rights
any account has. At launch, every `.bso` name in use through ENS at a snapshot block, subdomains
included, is copied into the registry with the same owner and record, as long as the registry
accepts its label and its entry is seeded before public registration opens. Anyone can seed an
entry, and the maintainers must seed them all. Names that come into use later are not copied. The registry is
temporary: when Bitsocial Chain launches, the Ethereum registry freezes and its unexpired names are
copied onto the chain. This BSIP replaces BSIP-10's `.bso` resolution, stops defining `.eth`
resolution, and narrows BSIP-10's `.bso`/`.eth` equivalence.

## Motivation

Today `.bso` is an alias: `memes.bso` is resolved as `memes.eth`
([BSIP-10](./bsip-10.md#resolving-bso-and-eth-names)). Every `.bso` name is therefore an ENS name,
bought at ENS prices and on ENS terms. In October 2026 a maintainer was quoted more than $20 for
three years for a new community name under ENS v2. Most owners will not pay that to try out a
community, so they run key-only communities, which are harder to find and cannot recover from a key
compromise ([BSIP-10](./bsip-10.md#key-migration)).

Bitsocial Chain, phase 3 of the Bitsocial master plan, is meant to host `.bso` names natively, but it
does not exist yet. An interim registry on Ethereum mainnet makes a normal-length `.bso` name cost
0.0005 ETH a year now, and makes the later move to Bitsocial Chain a copy of state rather than a
change of owners.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Terminology

- **Registry**: the contract defined in [Registry contract](#registry-contract).
- **Fee recipient**: the multisig address hardcoded in the registry
  ([Fee recipient](#fee-recipient)).
- **Seed list**: the names copied into the registry at launch ([Launch](#launch)).
- **Opening**: the moment public registration opens ([Seeding](#seeding)).
- **Activation**: the point at which a client starts resolving `.bso` names through the registry
  ([Resolving `.bso` names](#resolving-bso-names)).

### Deployment parameters

| Parameter | Value |
| --- | --- |
| Chain | Ethereum mainnet (chain ID 1) |
| Registry address | TBD at deployment |
| Upstream | [`lucadonnoh/gwei-names`](https://github.com/lucadonnoh/gwei-names) `src/NameNFT.sol` at commit `8e094ab343d0bfdbd9ec948594fc48f20bed6e5d` |
| TLD node | `namehash("bso")` = `0xe07ef0fd54600878e8c5c0087ff379e0fb9e1c49dfcc763bdada48721f534a20` |
| Fee recipient | Safe multisig `0x442A54b2AFEe1db441Df5aA825059d663c96AA6E` |
| Fee recipient signers and threshold | 4 keys held by 3 people, threshold 3, at launch; 6 keys held by 4 people, threshold 4, once complete ([Fee recipient](#fee-recipient)) |
| Snapshot block `S` | TBD, shortly before deployment |
| Seed entries | `SEED_COUNT`, TBD: the number of entries in the seed list |
| Seeding window | from deployment until `SEED_END`, 7 days later |
| Opening of public registration | `openAt`, one hour (`OPEN_DELAY`) after every entry is seeded, or `SEED_END`, whichever comes first |
| Sunset notice | 30 days |

Every TBD value MUST be filled in before this BSIP moves to Review, and the registry address MUST be
added once the registry is deployed.

### Registry contract

The registry is the upstream `NameNFT` with these changes and no others:

1. **TLD.** The root node is `namehash("bso")`, and full names end in `.bso`. The ERC-721 `name()` is
   `Bitsocial Names` and `symbol()` is `BSONAME`. The symbol MUST NOT be `BSO`, which is the Bitsocial
   token's.
2. **Fees are collected, not locked.** Registration fees, renewal fees, and expiry premiums accumulate
   in the registry as they do upstream. A new function `withdraw()`, callable by anyone, transfers the
   registry's entire ETH balance to `FEE_RECIPIENT`, a constant address. Apart from upstream's refunds
   of overpayment, no other code path sends ETH.
3. **Seeding.** The constant `OPEN_DELAY = 1 hour`, the values `SEED_ROOT`, `SEED_COUNT`, and
   `SEED_END = deployment time + 7 days`, which are set once at deployment and cannot change
   afterwards, a counter `seededCount`, a timestamp `openAt`, and the functions `seed` and
   `seedBatch` ([Seeding](#seeding)). `SEED_ROOT` and `SEED_COUNT` are constructor arguments, so the
   same source is deployed on a test network and on mainnet. Until the opening, `reveal`,
   `registerSubdomain`, and `registerSubdomainFor` revert.
4. **Sunset.** A function `sunset()` that freezes the registry after a notice period
   ([Sunset and migration](#sunset-and-migration)).
5. **Minimum length.** `reveal` and `seed` revert for a top-level label shorter than 3 characters,
   and `isAvailable` returns false for one, so that a client does not commit to a name it cannot
   reveal. A character is one Unicode code point of the validated label, so `ab`, `é`, a single
   CJK character, and an emoji of one or two code points are all too short. An emoji sequence of
   three or more code points after normalization, such as a family joined by zero-width joiners,
   passes although it displays as one symbol. Subdomain labels have no minimum beyond upstream's 1 byte.
   The fee goes by the same count: `reveal` and `renew` pass the label's length in code points to
   `getFee`, where upstream passes its length in bytes ([Prices](#prices)).

Nothing else from the upstream repository is deployed: not `SubdomainRegistrar`,
`GnsUniversalResolver`, `HumanRegistrar`, `GnsPosts`, or `GnsIntegrationVoting`.

The rest of the contract is unchanged, and clients rely on it:

- A name is an ERC-721 token whose ID is `uint256(namehash(name))`
  ([EIP-137](https://eips.ethereum.org/EIPS/eip-137)).
- A label is 1 to 255 UTF-8 bytes, and a top-level label is at least 3 characters (change 5). The
  registry lowercases ASCII letters and rejects control
  characters, space, `.`, DEL, invalid UTF-8, and a leading or trailing `-`. It does not apply
  Unicode normalization ([ENSIP-15](https://docs.ens.domains/ensip/15)); clients do.
- A top-level name is registered by commit-reveal, with 60 seconds to 24 hours between commit and
  reveal, for 365 days. Anyone may renew any top-level name, for 365 days counted from its current
  expiry.
- After expiry a name has a 90-day grace period. During it the name can be renewed, but it does not
  resolve, cannot be transferred, and its records cannot be changed. After the grace period anyone
  may register it, paying a premium that starts at 100 ETH and falls linearly to zero over 21 days.
  Re-registration clears all records.
- Subdomains are free, have no expiry of their own, and are active only while their parent is active
  and has not reclaimed them.
- `text(bytes32 node, string key)` returns a name's text record, or the empty string when the name is
  not active.

The registry has no owner, admin, proxy, pause, or upgrade path. Prices, `FEE_RECIPIENT`,
`OPEN_DELAY`, and every period above are constants. `SEED_ROOT`, `SEED_COUNT`, and `SEED_END` are
fixed at deployment and nothing can change them afterwards. Each is public, so anyone can read it
by calling the getter of the same name: `SEED_ROOT()`, `SEED_COUNT()`, and `SEED_END()`. The
registry does not check the two constructor arguments, so after the mainnet deployment and before
the address is announced, the maintainers MUST call `SEED_ROOT()` and `SEED_COUNT()` on the deployed
registry and confirm that they return the root and the number of entries of the published
`assets/bsip-13/seed-tree.json`.

Because the registry checks only the characters listed above, it accepts labels that are not
ENSIP-15 normalized. Such a name never resolves: clients normalize a name before they resolve it
([Resolving `.bso` names](#resolving-bso-names)), so they either reject the spelling or look up a
different label. The fee paid for it is not refunded. A front-end that registers names MUST
ENS-normalize the label, MUST commit only the normalized form, and MUST refuse a label that
normalization rejects. For example, ENSIP-15 rejects `relationship_advice`, because it allows an
underscore only at the start of a label, but the registry would register it. A front-end SHOULD
suggest `relationship-advice` instead.

#### Prices

The tiers and amounts are upstream's. The length they go by is not: upstream counts UTF-8 bytes,
and this registry counts characters, each one Unicode code point, as for the minimum length
(change 5).

| Label length (characters) | Price per 365 days |
| --- | --- |
| 3 | 0.05 ETH |
| 4 | 0.01 ETH |
| 5 or more | 0.0005 ETH |

So `日本語` and `абв` cost 0.05 ETH a year, like `abc`. Counted in bytes they would be 9 and 6 long
and cost 0.0005 ETH. `getFee(length)` keeps upstream's signature, and a client that calls it MUST
pass the label's length in code points, not in bytes. It also keeps upstream's tiers for lengths 1
and 2, at 0.5 and 0.1 ETH, but the minimum length means no top-level label that short can be
registered.

Registration and renewal cost the same. Gas is paid separately to Ethereum.

### Fee recipient

`FEE_RECIPIENT` is the [Safe](https://safe.global) multisig `0x442A54b2AFEe1db441Df5aA825059d663c96AA6E` on
Ethereum mainnet, controlled by the Bitsocial maintainers. Fees fund their development of Bitsocial while the registry is in use.

The fee recipient's only powers over the registry are:

1. receiving fees through `withdraw()`; and
2. calling `sunset()`, once.

It cannot change prices, periods, or the seed list, and it cannot stop `withdraw()`. Over names it has
no power beyond what any account has: like anyone, it can register an available name by
commit-reveal and renew any top-level name, but it cannot transfer or edit a name it does not own. It
holds the reserved names assigned to it ([Seed list](#seed-list)) as an ordinary owner.

Safe signers can be added, removed, or replaced without changing the Safe's address, so the registry
does not depend on any one signer. The signers are the Safe's owners on chain. The complete signer
set is:

| Signer | Keys |
| --- | --- |
| Tommaso Casaburi (@tomcasaburi) | 2 |
| Rinse (@Rinse12) | 2 |
| A trustee named by Tommaso Casaburi | 1 |
| A trustee named by Rinse | 1 |

Threshold: 4 of 6. A complete signer set and its threshold MUST satisfy both rules:

- the threshold is higher than the number of keys held by any one person, so nobody acts alone; and
- if any one person becomes unavailable, the keys held by everyone else still reach the threshold.

Two people with two keys each and a 3-of-4 threshold meet the first rule but not the second. The set
above meets both: nobody holds more than 2 keys, and without any one person at least 4 keys remain.

The registry MAY be deployed before the signer set is complete, so that the launch does not wait
for every signer's key. The signers on 2026-11-16 are:

| Signer | Keys |
| --- | --- |
| Tommaso Casaburi (@tomcasaburi) | 2 |
| Rinse (@Rinse12) | 1 |
| A trustee named by Rinse | 1 |

Threshold: 3 of 4. This set meets the first rule but not the second: without Tommaso Casaburi the
remaining keys do not reach the threshold
([Security Considerations](#security-considerations)). The maintainers MUST complete the signer set
and SHOULD do so within 60 days of the registry's deployment.

An incomplete set MAY fail the second rule, but it MUST meet the first, and a maintainer together
with only the trustee they named MUST NOT reach the threshold. The complete set and the set above
both meet this. With five keys it takes a threshold of 4, since a maintainer's two keys and their
trustee's one make 3. The threshold MUST therefore rise to 4 in the same transaction that adds the
fifth key. That choice puts control ahead of availability: with five keys and a threshold of 4,
losing any person who holds two keys leaves the others below the threshold, until the sixth key is
added.

Any change to the signers or the threshold MUST be recorded in this BSIP.

### Launch

#### Seed list

The seed list is a set of entries `(label, parent, owner, record)`, fixed before deployment. `parent`
is `0` for a top-level name, and for a subdomain it is `uint256(namehash(p))`, where `p` is the
subdomain's parent name in `.bso` form.

1. **Names in use.** Every `.eth` name, at any level, that at Ethereum mainnet block `S` resolves in
   ENS (registered and, for a second-level name, not past ENS's grace period) and has a non-empty
   `bitsocial` text
   record. The entry holds the name's first label, its parent, the account that holds the `.eth`
   name at `S` (for a second-level name its registrant or the holder of the wrapped name, for a
   subname its owner in the ENS registry or the holder of the wrapped name), and the value of the
   `bitsocial` record. A name under a second-level name that was migrated to ENSv2, or registered
   there, is read from the ENSv2 registries instead: it is registered while its registry reports it
   registered, and it is held by its owner there. ENSv2 stops resolving a name at its expiry, so the
   grace period applies only to ENSv1 names. The record is read on chain from the name's own
   resolver, through `text`, or through ENSIP-10 `resolve` for a resolver that answers only that way.
2. **Ancestors.** For every subname under rule 1, each of its ancestors up to the second-level name,
   held by the account that holds that `.eth` name at `S`. An ancestor that has its own `bitsocial`
   record is already listed under rule 1; any other ancestor is listed with an empty record.
3. **Reserved names.** A short list of top-level names that identify the project, its apps, its
   maintainers, and Bitsocial Forge, the company one maintainer runs, with an empty record. A reserved label that is also listed under rule 1 or 2 is
   dropped from the reserved list. A name in use always goes to its current holder.

An entry is left out when the registry could not hold it:

- its label is one the registry rejects, such as a label that starts or ends with `-` (which
  ENSIP-15 allows) or is longer than 255 bytes;
- it is a subname more than `MAX_SUBDOMAIN_DEPTH` = 10 levels below its top-level name, which
  upstream refuses to register; or
- its holder at block `S` is the zero address, to which the registry cannot mint.

Every subname under an entry that is left out is left out too, whatever the reason, because a
subdomain can be seeded only under a registered parent. Their owners keep the `.eth` names. `seed`
applies the same label and depth checks as ordinary registration. The script that builds the list
MUST apply all three checks to every entry and MUST check that every subdomain entry's parent is in
the list, so every entry in the tree can be seeded. The minimum length never excludes an entry: ENS
registers no second-level `.eth` name shorter than 3 characters, and the reserved list has none.

The script takes candidate names from two sources, and MUST confirm each candidate by resolving it
at block `S`:

- **Logs.** It MUST scan Ethereum mainnet logs up to block `S` for both ENS `TextChanged` events,
  `TextChanged(bytes32,string,string)` and `TextChanged(bytes32,string,string,string)`, with the
  indexed key `bitsocial`, emitted by any contract, so that names on custom resolvers and names
  outside every known list are found.
- **Supplied names.** It MUST also check every name on a published list of supplied names: the
  names in the maintainers' community lists, and every name an owner sends the maintainers before
  the seed list is fixed. This covers what the logs cannot give.

A log holds a node, not a name, and a subname's label may never have been published on chain. The
script MUST publish, with the seed list, every event node it could not map to a name. Rules 1 and 2
cover only names the script finds, so these are not seeded:

- a name whose record is served by an offchain
  ([EIP-3668](https://eips.ethereum.org/EIPS/eip-3668)) or wildcard
  ([ENSIP-10](https://docs.ens.domains/ensip/10)) resolver, even when it is supplied, because it
  has no record or owner on chain to copy;
- a name whose onchain resolver returns a `bitsocial` record without emitting `TextChanged`, unless
  it is supplied; and
- a name behind an event node nobody could map, unless it is supplied.

A name that is missed cannot be added once `SEED_ROOT` is deployed. Before the seed list is fixed,
the maintainers MUST therefore publish and announce a preliminary seed list together with the
unmapped nodes, and SHOULD leave owners at least 3 days to supply missing names.

Rules 1 and 2 take only `.eth` names whose labels are already ENS-normalized
([ENSIP-15](https://docs.ens.domains/ensip/15)): normalizing the name leaves it unchanged. ENS
registers unnormalized spellings such as `MEMES.eth` as separate names, but BSIP-10 clients normalize
before resolving, so those names never served a Bitsocial identity. Leaving them out keeps them from
competing with the normalized name for the same `.bso` label. The seed list MUST contain at most one
entry per `(label, parent)`, and the script MUST check this.

Proposed reserved names:

| Labels | Owner |
| --- | --- |
| `bitsocial`, `bitsocialnet`, `bitsocialchain`, `bso`, `bsips`, `pkc`, `pkcprotocol`, `plebbit`, `5chan`, `seedit`, `wetube`, `gitcommons`, `modelswarm`, `infinipedia`, `mintpass`, `agoraswap` | fee recipient |
| `bitsocialforge`, `forge`, `forgerpc` | Bitsocial Forge, `0x80F6Bf31441ff217e3aA2811c1f5FF85308e1FC7` |
| `tom`, `tommaso`, `tomcasaburi` | Tommaso Casaburi, `0x89e768DDF3696EB79112734fB0755AB27F8C5620` |
| `rinse`, `rinse12` | Rinse, `0x98BDDCd3282F95A6553373Dab10b5AEfE0128117` |
| `esteban`, `estebanabaroa` | fee recipient |

`SEED_ROOT` is the root of an OpenZeppelin `StandardMerkleTree` over the entries, with leaf encoding
`["string", "uint256", "address", "string"]` for `(label, parent, owner, record)`. Before
deployment, the seed list, the reserved list, and the script that builds them from block `S` MUST be
published in `assets/bsip-13/`, so anyone can rebuild `SEED_ROOT` and check every entry. Block `S` SHOULD be as close to deployment as practical.

#### Seeding

`seed(label, parent, owner, record, proof)` may be called by anyone before `SEED_END`. It reverts
unless `proof` shows that the entry is in the tree and the name has no record in the registry.
Otherwise the registry:

- for a top-level entry, registers the label to `owner` for 365 days;
- for a subdomain entry, requires `parent` to be registered and active, and registers the label under
  it to `owner` as a subdomain, with no expiry of its own as upstream;
- charges no fee and, if `record` is non-empty, sets the name's `bitsocial` text record to `record`;
  and
- adds one to `seededCount`.

`seedBatch(entries)` takes a list of `(label, parent, owner, record, proof)` and seeds each entry in
order. It skips an entry whose name already has a record, and reverts if any other entry would make
`seed` revert. Anyone can seed, so without the skip one entry seeded by someone else would revert a
whole batch. Skipping loses nothing, because an entry can only be seeded to its listed owner and
record. `seededCount` counts only the names a call actually registers. A parent must be seeded
before its subdomains, in an earlier call or earlier in the same batch. From `SEED_END` on, `seed`
and `seedBatch` revert.

`seed` does not use upstream's internal `_register`, which requires the caller to own the parent and
mints with `_safeMint`. It has its own path, which MUST:

- validate and lowercase the label with the function `reveal` uses (`_validateAndNormalize`), and
  apply the depth limit of subdomain registration;
- write the name's record as an ordinary registration does, including the parent's epoch for a
  subdomain;
- mint with `_mint`, so that `onERC721Received` is never called and a contract owner without that
  hook still receives its name; and
- emit `NameRegistered`, `SubdomainRegistered` for a subdomain, and `TextChanged` for a non-empty
  record, so that indexers see a seeded name like any other.

The call that brings `seededCount` to `SEED_COUNT` sets `openAt = block.timestamp + OPEN_DELAY` and
emits an event. Public registration opens at `openAt`, or at `SEED_END` if that comes first or the
count is never reached. This moment is the **opening**. Until then `reveal`, `registerSubdomain`,
and `registerSubdomainFor` revert. Nobody can therefore register a seeded label first, and the
owner of a seeded parent can neither register a listed subname before it is seeded nor reclaim one
after. An entry can be seeded only once and anyone can seed, so nobody can inflate the count or
keep registration closed. Nothing else is paused: the owner of a seeded name can transfer it or
change its records at once, and anyone can `commit`.

The delay exists because anyone can send the last `seed`. Without it, whoever sends that
transaction could reveal their own commitments in the same block, ahead of everyone else. With it,
the opening time is on chain an hour before it arrives.

The maintainers MUST seed every entry before `SEED_END`, SHOULD do so within one hour of deployment,
and MUST publish a check that every entry is registered to its listed owner. An entry that is still
unseeded at `SEED_END` loses its protection: a top-level label opens to public registration, and a
subdomain is left to its parent's owner.

Because `commit` is not paused, anyone can commit before the opening and reveal as soon as it comes.
Upstream accepts a reveal between 60 seconds and 24 hours after its commit, so a commitment is
valid at the opening only if it was made at least 60 seconds and at most 24 hours before it. For
an opening at `openAt`, any commitment made after `openAt` is known and at least 60 seconds before
it qualifies. The maintainers MUST announce the planned deployment time in advance, and the
announcement MUST state these limits. Reveals at the opening still compete on transaction
ordering, as for any name that becomes available at a known time.

At the opening the maintainers MUST compare every seeded record with the name's current ENS
`bitsocial` record and publish the names whose records differ, so that their owners can update the
`.bso` record. They SHOULD repeat the comparison 30 and 90 days later. It is the only notice such an
owner gets ([Security Considerations](#security-considerations)).

### Resolving `.bso` names

On activation, a client resolves a `.bso` name with these steps, which replace steps 1–4 of
[Resolving `.bso` and `.eth` names](./bsip-10.md#resolving-bso-and-eth-names). `canResolve` is true
exactly when the name ends in `.bso` (compared case-insensitively).

1. ENS-normalize the name ([ENSIP-15](https://docs.ens.domains/ensip/15)).
2. Compute `node = namehash(name)` ([EIP-137](https://eips.ethereum.org/EIPS/eip-137)).
3. Call `text(node, "bitsocial")` on the registry.

Steps 5–7 of BSIP-10 still apply. An empty result, which includes a name that is unregistered,
expired, or in its grace period, means `none`. Example:

```text
name:   memes.bso
node:   0x32766e8bc53e343c21d132d673d112b27f0e1aa11965199b934d29721837a941
call:   text(node, "bitsocial") on the registry
value:  12D3KooWNsF2eMrdw3YFPycAaFEvZ9Eq3ekhNL3vrAAfN6dAwXLp
```

On activation this BSIP no longer defines `.eth` resolution. `.eth` is then a TLD like any other
under BSIP-10's [Resolver interface](./bsip-10.md#resolver-interface): a client that has no resolver
for it gets the outcome **unsupported** for a `.eth` name, and a client MAY still support `.eth`
with a resolver of its own, in which case its names match only exactly. ENS remains the source of
the seed list and nothing more.

Each client activates when it ships a resolver that implements this section. Clients SHOULD NOT
activate before the opening. An activated client resolves `.bso` names from the registry alone and
does not consult ENS for them.

### Name equivalence

On activation, BSIP-10's [Name equivalence](./bsip-10.md#name-equivalence) rule 2 becomes: both
spellings end in `.bso` (suffix compared case-insensitively) and they are identical after
lowercasing. `bot.bso` and `Bot.BSO` are still the same name. `bot.bso` and `bot.eth` are different
names, held in different registries, possibly by different owners. A `.eth` name, like a name under
any other TLD, matches only exactly.

An identity-list entry spelled with `.eth` cannot be verified by a client that has no resolver for
`.eth`, so it grants nothing there. It is not an error, and the rest of the list applies as before.

There is one exception, for comments signed while `.bso` was still an alias. When a client checks
whether a stored comment belongs to a community (rule 2 of
[Community membership of comments](./bsip-10.md#community-membership-of-comments)), the comment's
`communityName` is the record's name with the other of the two suffixes, the comment's `timestamp`
is before `SEED_END`, and its `communityPublicKey` is present and equals the community's identity
key, the comment is a member. In every other case the new rule applies. A comment signed for
`a.eth` before then, in a community that later renamed itself `a.bso` and kept its key, stays a
member. A comment signed later, or under another community's key, never passes as a member of `a.bso`.
Comments that lack `communityPublicKey`, or that were signed before a key migration, lose membership
across the two suffixes. The exception compares stored spellings only. It does not need `.eth` to
resolve, so it applies in every activated client.

### Sunset and migration

`sunset()` may be called only by `FEE_RECIPIENT`, and only once. It sets
`sunsetAt = block.timestamp + 30 days` and emits an event. From `sunsetAt` on, the registry is frozen:
every function that changes its state reverts, except `withdraw()`. Nobody can commit, register,
renew, transfer, approve, or change a record. Names keep resolving from the frozen state until they
expire. A sunset cannot be cancelled or delayed.

During the 30-day notice the registry works as before, so owners can still renew, transfer, and edit.
The frozen state at `sunsetAt` is what the migration imports, so changes made during the notice
period, renewals included, carry over.

The fee recipient MUST NOT call `sunset()` except to move `.bso` to Bitsocial Chain, and only once a
BSIP that specifies Bitsocial Chain's `.bso` registry has reached Last Call. That BSIP:

- MUST import, at no charge, the registry's state at `sunsetAt`: every top-level name that is active
  or in its grace period, with the same owner, expiry, and `bitsocial` text record, and every active
  subdomain under them, with the same parent, owner, and `bitsocial` text record. It SHOULD import
  their other records;
- MUST define the `.bso` resolution that replaces [Resolving `.bso` names](#resolving-bso-names)
  from `sunsetAt`; and
- defines its own fees and their recipient. This BSIP does not bind it.

## Rationale

- **An interim registry instead of ENS.** ENS prices and payment terms are set by ENS. Waiting for
  Bitsocial Chain would leave `.bso` tied to them for an unknown time. Ethereum mainnet gas is cheap
  enough today for a name registry, and a registry there can be copied onto Bitsocial Chain later
  without new owners or new records.
- **Fork GNS.** GNS is ownerless and immutable, prevents front-running with commit-reveal, makes names
  expire so abandoned ones return, and exposes the ENS `text(node, key)` interface. Resolvers change
  only which contract they call, and BSIP-10's record format is unchanged. The diff is limited to the
  five changes above, so most of the deployed code is code that already runs upstream.
- **Collect fees instead of burning them.** Bitsocial has no other funding, and this registry is
  temporary. A fixed recipient is acceptable because it cannot change prices and has no special
  power over names. It is a multisig rather than one person's address so that the registry survives
  the loss of any one key, and of any one person once the signer set is complete
  ([Fee recipient](#fee-recipient)). The arrangement ends with this registry. The maintainers intend
  name fees on Bitsocial Chain to stop funding them and instead be burned, or be used by the
  registry to buy back and burn BSO. That is a statement of intent and not part of this
  specification: the BSIP for that registry sets its fees
  ([Sunset and migration](#sunset-and-migration)), and the mechanism is not decided.
- **Seed from a snapshot instead of checking ENS on chain.** The registry could let `.eth` holders
  claim matching `.bso` names by reading ENS during a claim window. That would tie an immutable
  contract to ENS contracts, which have changed before, and give `.bso` names to every `.eth` holder,
  squatters included. Seeding only names that have a `bitsocial` record, at any level, copies exactly
  the identities Bitsocial users rely on, records included, so those communities keep resolving
  for the first year without their owners doing anything. Renewal is permissionless, so anyone can
  extend a seeded name for its owner. Subnames bring their ancestors so that the registry can hold
  them. The cost is that the maintainers build the list. Fixing it at block `S` and publishing the
  script makes it checkable.
- **Seed by transactions, not in the constructor.** Ethereum mainnet caps a transaction at 2^24 gas
  ([EIP-7825](https://eips.ethereum.org/EIPS/eip-7825)). Deploying the contract and registering about
  100 entries is estimated at 23 to 25 million gas, which does not fit. A Merkle root keeps the
  deployment small, and `seedBatch` seeds an estimated 70 entries per transaction.
- **No transition window.** The seed list freezes records at block `S`, and under BSIP-10 a changed
  record moves a community to another key. An earlier draft made activated clients also resolve
  `x.eth` for 90 days and treat a disagreement as **unknown**. That costs an extra lookup per name,
  and it lets whoever holds `x.eth` make `x.bso` **unknown** by setting a different record. For a
  `.bso` name registered after the opening, that is anyone willing to register the `.eth` name. On a
  seed list of about 100 names, a stale record that its owner can fix at once is the smaller
  problem, and the published comparison tells the owner about it.
- **Pause registration until every entry is seeded.** The registry cannot tell whether an arbitrary
  label is on the seed list without storing the list. Pausing `reveal` and subdomain registration
  until the opening removes the race instead. Counting seeded entries lets registration open an
  hour after the list is done, in practice within about two hours of deployment, with `SEED_END` as
  the fallback if an entry is never seeded. The hour makes the opening time public in advance, so
  the sender of the last seeding transaction gets no head start.
- **No top-level names shorter than 3 characters.** Bitsocial has one namespace, `.bso`, where the
  web has hundreds of top-level domains, so its one- and two-character names are the scarcest it
  will ever have. Sold at a fixed price, they would go to whoever revealed first at the opening,
  and the resale value would go to them. Reserving them for the fee recipient would avoid that but
  put the most valuable names in the maintainers' hands. Making them unregistrable does neither:
  nobody holds them, and the BSIP that specifies Bitsocial Chain's registry decides how they are
  allocated. ENS has the same 3-character minimum for `.eth`. The count is in code points, not
  bytes, so that a single CJK character or a simple emoji is not a way around it. It does not stop
  emoji sequences of three or more code points, which display as one symbol: telling those apart
  needs grapheme segmentation, which is too much code for an immutable contract, and the Bitsocial
  Chain registry can treat them as it sees fit. Subdomains are exempt
  because their parent's owner controls them anyway.
- **Fees by characters, not bytes.** ENS prices `.eth` names by the same code-point count it uses
  for its minimum. Counted in bytes, every name of 3 or 4 characters outside ASCII would pay the
  lowest price: a hundredth of what `abc` pays for a 3-character name. The count is one function,
  shared with the minimum length, and the registry's fees cannot be corrected after deployment.
- **One price for 5 characters and more.** A cheaper tier for labels of 10 characters or more was
  considered and left out. With directories ([BSIP-19](./bsip-19.md)) a community competes for a slot with a
  long descriptive name, so long names are the normal product and a cheap tier would remove most
  fee income. Names that cheap could also be held in bulk and would be imported into Bitsocial
  Chain, which a later change could not undo. If the flat price is the mistake, owners overpay by
  about a dollar a year.
- **Fees in ETH only, with no discount for paying in BSO.** A discount for paying in the Bitsocial
  token was considered and left out. A percentage discount needs a BSO price in ETH on chain. An
  ownerless registry cannot replace a price source that fails, and a thinly traded pool can be moved
  for one transaction, which would let 3- and 4-character names be registered for almost nothing. A fixed
  price table in BSO needs no price source, but it drifts with the token's price until paying in BSO
  is either nearly free or never chosen, and nobody can correct it. For labels of 5 characters or more,
  the normal case, any discount is worth less than the gas of the extra token approval. A token
  payment path would also add code that upstream does not run. Bitsocial Chain's registry sets its
  own fees ([Sunset and migration](#sunset-and-migration)) and can give BSO a role without these
  limits.
- **Reserved names.** Squatters can use project and maintainer names to impersonate them. The list is
  kept short so the registry stays neutral, and names in use take precedence over it.
- **Sunset freezes the registry, after notice.** The migration imports the state at `sunsetAt`. If
  names could still be renewed, sold, or edited on Ethereum after that, a buyer would hold a token
  that controls nothing on Bitsocial Chain, and old and migrated clients would resolve different
  keys. Freezing everything but `withdraw()` keeps the Ethereum state and the imported state the
  same. The 30-day notice is enforced by the contract, so a sunset is public before it takes effect,
  and owners can renew or move names before the freeze.
- **Stop defining `.eth`.** While `.bso` was an alias, resolving `x.eth` was the same lookup. With two
  registries it is a second naming system that every client would have to carry, and a second
  owner for every label: `memes.eth` and `memes.bso` can belong to different people. Bitsocial has
  one namespace, so the BSIP defines one. Every name in use is seeded, which keeps the cost to names
  the seed list misses. It is also easy to undo: no contract depends on it, and a client that
  wants ENS names can add a resolver for them.
- **Separate `.bso` and `.eth`.** Once the two registries can have different owners, equivalence would
  let whoever holds `bot.bso` match identity-list entries written for `bot.eth`, and the reverse. The
  membership exception keeps pages with comments from the alias era valid. Its `SEED_END` cutoff
  stops it from applying to new comments. Its key check stops the holder of `a.bso` from showing
  comments that were posted to a different community at `a.eth`, since those carry that community's
  key. `timestamp` is set by the comment's author, so backdating only lets authors misfile their own
  comments. The exception decides only which comments a community may show, not who holds authority.

## Backwards Compatibility

- Every `.bso` name in use at block `S`, subdomains included, keeps its owner, key, and record in the
  registry once its entry is seeded, unless the registry rejects its label or depth, its holder
  is the zero address, or the list builder cannot find it: an offchain or wildcard record, or a
  name with no `TextChanged` event or no recoverable label that nobody supplied
  ([Seed list](#seed-list)). The maintainers must seed every entry before `SEED_END`, and an entry
  still unseeded then loses that guarantee ([Seeding](#seeding)).
- A name that comes into use on ENS after block `S` is not seeded. Its owner has to register the
  `.bso` name like anyone else, and someone else may get it first
  ([Security Considerations](#security-considerations)).
- Clients that have not activated keep resolving `x.bso` as `x.eth`, and activated clients read only
  the registry. For a seeded name both registries give the same answer until an owner changes one
  of them. Owners SHOULD keep both records the same while clients that have not activated are in
  use, and clients SHOULD activate promptly.
- A `.bso` name that is not seeded stops resolving in activated clients until someone registers it in
  the registry.
- An activated client that follows this BSIP no longer resolves `.eth` names
  ([Resolving `.bso` names](#resolving-bso-names)). A community or author known only by a `.eth`
  name stops loading or verifying by that name there, and has to use the `.bso` name: the seeded
  one, or one registered after the opening. `.eth` spellings no longer match `.bso` spellings, and
  identity-list entries spelled with `.eth` grant nothing ([Name equivalence](#name-equivalence)).
  Community owners SHOULD list the `.bso` spelling. The maintainers MUST say all of this when they
  announce the deployment.
- No signed record becomes invalid.

## Reference Implementation

The seed-list builder, the reserved and supplied names, and the seed list it builds are in
[`assets/bsip-13/`](../assets/bsip-13/README.md).

To be written:

- the registry: a fork of `lucadonnoh/gwei-names` at the upstream commit with the changes in
  [Registry contract](#registry-contract), with a test for each change, in a `bitsocialnet`
  repository. The deployed upstream `NameNFT` is 19,682 bytes, 4,894 below the 24,576-byte limit of
  [EIP-170](https://eips.ethereum.org/EIPS/eip-170), so the fork's size MUST be measured early;
- `.bso` resolution through the registry in
  [bso-resolver](https://github.com/bitsocialnet/bso-resolver).

## Security Considerations

- **No upgrades.** A bug in the registry is permanent. The upstream `NameNFT`, inherited from
  wei-names, has had automated reviews (Cantina Apex, Plainshift AI, Zellic V12), and its repository
  shows no manual audit. The added code (`withdraw`, `seed`, `seedBatch`, the opening check,
  the minimum length, `sunset`, and the freeze)
  SHOULD be reviewed independently and tested on Sepolia and on a mainnet fork before deployment.
- **Fee recipient.** If the signers can no longer reach the threshold, fees are stuck where nobody can
  reach them, and `sunset()` can never be called, so the Ethereum registry keeps selling names after
  a migration. The signer rules in [Fee recipient](#fee-recipient) exist to prevent this. Until the
  signer set is complete, losing a person who holds two keys has exactly that effect. Signers who
  reach the threshold can call `sunset()` early. After the 30-day notice the registry freezes, and
  without a migration each name lapses when the time already paid for it runs out. The notice makes
  such a call public before it takes effect, and because renewals are uncapped, upstream and here,
  owners can pay for more time during it. Signers cannot change prices or the seed list, and have no
  power over names beyond what any account has.
- **Seed list.** A wrong owner, record, or omission in the seed list is permanent once `SEED_ROOT` is
  deployed, and an entry left unseeded at `SEED_END` is open to anyone. Anyone holding a `.eth` name
  at block `S` receives the `.bso` name, including a holder who had compromised it by then. The list
  MUST be published and checked before deployment, and the seeding check after it.
- **Stale seeded records.** A record copied at block `S` can hold a key its owner has since replaced on
  ENS, possibly because it was compromised. Activated readers of `x.bso` follow the registry, so
  they follow the old key, as a migration back to it, until the owner updates the `.bso` record.
  Nothing in the protocol prevents this. An owner who changes a key on ENS after block `S` SHOULD
  also set it on the `.bso` name, which is possible as soon as the name is seeded. The comparisons
  the maintainers publish ([Seeding](#seeding)) are the only notice an owner gets.
- **Names not on the seed list.** After the opening, anything not seeded is first come, first served.
  That includes a `.eth` name that got its `bitsocial` record after block `S`, a name the list
  builder could not find ([Seed list](#seed-list)), a label or depth the registry rejects, a name
  held by the zero address, and an entry left unseeded at `SEED_END`. Someone else can register `x.bso` and set their own key, and
  under BSIP-10 key migration every activated reader of `x.bso` follows it. Holding `b.bso` also lets
  them create `memes.b.bso` for free. Taking block `S` close to deployment narrows the gap. Owners
  of such names SHOULD register their `.bso` names as soon as public registration opens. An
  activated reader cannot fall back to the `.eth` name, so until the owner registers the `.bso` name
  the community loads there only by its key address.
- **Name hijack.** Under BSIP-10, whoever controls a name controls where its community's readers
  migrate ([Key migration](./bsip-10.md#key-migration)). A `.bso` name that passes its grace period can
  be registered by anyone, who can then move its readers to their own key. Owners SHOULD renew early.
  Renewal is permissionless, so others, such as a directory maintainer, can also renew a name for its
  owner.
- **Subdomains.** A parent owner can reclaim any subdomain at any time and move its readers. A
  community named by a subdomain trusts its parent's owner completely. It also cannot leave: under
  BSIP-10's [Community membership of comments](./bsip-10.md#community-membership-of-comments), a
  community that moves to another name loses membership of its earlier comments, so its only exit
  is to drop the name and never take another. A community that does not want a name of its own
  SHOULD stay key-only, which lets it take a name later and keep its comments. Services that
  register names for others SHOULD NOT hand out subdomains as community names.
- **Look-alike names.** The registry lowercases ASCII only, so Unicode confusables and non-normalized
  spellings can be registered. BSIP-10's normalization and look-alike rules apply to `.bso` names
  unchanged, so a non-normalized spelling never resolves
  ([Registry contract](#registry-contract)).
- **Two registries until clients activate.** Someone who controls `x.eth` but not `x.bso`, for example
  by registering an `x.eth` that expired after block `S`, can move readers on clients that have not
  activated to their own key. Activated clients ignore ENS for `.bso` names, so prompt activation
  limits this.
- **Front-running and resolver trust.** Commit-reveal stops a mempool watcher from registering a name
  first, and before the opening `reveal` is disabled entirely. BSIP-10's resolver trust considerations
  apply to the Ethereum providers that clients read the registry through.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
