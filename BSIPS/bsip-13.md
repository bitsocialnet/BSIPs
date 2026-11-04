---
bsip: 13
title: Interim .bso Name Registry
description: An ownerless Ethereum mainnet registry for .bso names, how it launches from names already in use, and how it moves to Bitsocial Chain.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
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
any account has. At launch, every `.bso` name
already in use through ENS is copied into the registry with the same owner and record before public
registration opens. The registry is temporary: when Bitsocial Chain launches, unexpired names are
copied onto it and the Ethereum registry stops selling names. This BSIP replaces steps 2–4 of
BSIP-10's `.bso` resolution and narrows BSIP-10's `.bso`/`.eth` equivalence.

## Motivation

Today `.bso` is an alias: `memes.bso` is resolved as `memes.eth`
([BSIP-10](./bsip-10.md#resolving-bso-and-eth-names)). Every `.bso` name is therefore an ENS name,
bought at ENS prices and on ENS terms. In October 2026 a maintainer was quoted more than $20 for
three years for a new community name under ENS v2. Most owners will not pay that to try out a
community, so they run key-only communities, which are harder to find and cannot recover from a key
compromise ([BSIP-10](./bsip-10.md#key-migration)).

Bitsocial Chain, phase 2 of the Bitsocial master plan, is meant to host `.bso` names natively, but it
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
- **Activation**: the point at which a client starts resolving `.bso` names through the registry
  ([Resolving `.bso` names](#resolving-bso-names)).

### Deployment parameters

| Parameter | Value |
| --- | --- |
| Chain | Ethereum mainnet (chain ID 1) |
| Registry address | TBD at deployment |
| Upstream | [`lucadonnoh/gwei-names`](https://github.com/lucadonnoh/gwei-names) `src/NameNFT.sol` at commit `8e094ab343d0bfdbd9ec948594fc48f20bed6e5d` |
| TLD node | `namehash("bso")` = `0xe07ef0fd54600878e8c5c0087ff379e0fb9e1c49dfcc763bdada48721f534a20` |
| Fee recipient | Safe multisig, address TBD |
| Fee recipient signers and threshold | TBD ([Fee recipient](#fee-recipient)) |
| Snapshot block `S` | TBD, shortly before deployment |
| Seed period | 7 days from deployment |
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
3. **Seeding.** A constant `SEED_ROOT`, a constant `SEED_END = deployment time + 7 days`, and a
   function `seed` ([Seeding](#seeding)). Before `SEED_END`, `reveal` reverts.
4. **Sunset.** A function `sunset()` ([Sunset and migration](#sunset-and-migration)).

Nothing else from the upstream repository is deployed: not `SubdomainRegistrar`,
`GnsUniversalResolver`, `HumanRegistrar`, `GnsPosts`, or `GnsIntegrationVoting`.

The rest of the contract is unchanged, and clients rely on it:

- A name is an ERC-721 token whose ID is `uint256(namehash(name))`
  ([EIP-137](https://eips.ethereum.org/EIPS/eip-137)).
- A label is 1 to 255 UTF-8 bytes. The registry lowercases ASCII letters and rejects control
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
`SEED_ROOT`, `SEED_END`, and every period above are constants.

#### Prices

Unchanged from upstream:

| Label length (UTF-8 bytes) | Price per 365 days |
| --- | --- |
| 1 | 0.5 ETH |
| 2 | 0.1 ETH |
| 3 | 0.05 ETH |
| 4 | 0.01 ETH |
| 5 or more | 0.0005 ETH |

Registration and renewal cost the same. Gas is paid separately to Ethereum.

### Fee recipient

`FEE_RECIPIENT` is a [Safe](https://safe.global) multisig on Ethereum mainnet controlled by the
Bitsocial maintainers. Fees fund their development of Bitsocial while the registry is in use.

The fee recipient's only powers over the registry are:

1. receiving fees through `withdraw()`; and
2. calling `sunset()`, once.

It cannot change prices, periods, or the seed list, and it cannot stop `withdraw()`. Over names it has
no power beyond what any account has: like anyone, it can register an available name by
commit-reveal and renew any top-level name, but it cannot transfer or edit a name it does not own. It
holds the reserved names assigned to it ([Seed list](#seed-list)) as an ordinary owner.

Safe signers can be added, removed, or replaced without changing the Safe's address, so the registry
does not depend on any one signer. Signers:

| Signer | Keys |
| --- | --- |
| Tommaso Casaburi (@tomcasaburi) | 2 |
| Rinse (@Rinse12) | 2 |
| TBD | TBD |

Threshold: TBD. The signer set and threshold MUST satisfy both rules:

- the threshold is higher than the number of keys held by any one person, so nobody acts alone; and
- if any one person becomes unavailable, the keys held by everyone else still reach the threshold.

Two people with two keys each and a 3-of-4 threshold meet the first rule but not the second.

Any change to the signers or the threshold MUST be recorded in this BSIP.

### Launch

#### Seed list

The seed list is a set of entries `(label, owner, record)`, fixed before deployment:

1. **Names in use.** Every second-level `.eth` name that, at Ethereum mainnet block `S`, is registered,
   is not expired, and has a non-empty ENS `bitsocial` text record. The entry holds its label, the
   account that holds the `.eth` name at `S` (its registrant, or the holder of the wrapped name), and
   the value of the `bitsocial` record.
2. **Reserved names.** A short list of names that identify the project, its apps, and its maintainers,
   with an empty record. If a reserved label is also a name in use under rule 1, it is dropped from the
   reserved list. A name in use always goes to its current holder.

Proposed reserved names:

| Labels | Owner |
| --- | --- |
| `bitsocial`, `bitsocialnet`, `bitsocialforge`, `bsips`, `pkc`, `pkcprotocol`, `plebbit`, `5chan`, `seedit`, `mintpass`, `agoraswap` | fee recipient |
| `tom`, `tommaso`, `tomcasaburi` | Tommaso Casaburi, address TBD |
| `rinse`, `rinse12` | Rinse, address TBD |
| `esteban`, `estebanabaroa` | fee recipient |

`SEED_ROOT` is the root of an OpenZeppelin `StandardMerkleTree` over the entries, with leaf encoding
`["string", "address", "string"]` for `(label, owner, record)`. Labels are ENS-normalized. Before
deployment, the seed list, the reserved list, and the script that builds them from block `S` MUST be
published in `assets/bsip-13/`, so anyone can rebuild `SEED_ROOT` and check every entry.

#### Seeding

`seed(label, owner, record, proof)` may be called by anyone before `SEED_END`. If `proof` shows that
`(label, owner, record)` is in the tree and the label is not registered, the registry registers the
label to `owner` for 365 days, charges no fee, and, if `record` is non-empty, sets the name's
`bitsocial` text record to `record`. Seeding MUST NOT call `onERC721Received`, so a contract owner
without that hook still receives its name. From `SEED_END` on, `seed` reverts, and labels that were
never seeded are open to anyone.

Because `reveal` reverts before `SEED_END`, nobody can register a seeded label first. The maintainers
SHOULD seed every entry within one day of deployment.

### Resolving `.bso` names

On activation, a client resolves a `.bso` name with these steps, which replace steps 2–4 of
[Resolving `.bso` and `.eth` names](./bsip-10.md#resolving-bso-and-eth-names):

1. ENS-normalize the name ([ENSIP-15](https://docs.ens.domains/ensip/15)).
2. Compute `node = namehash(name)` ([EIP-137](https://eips.ethereum.org/EIPS/eip-137)).
3. Call `text(node, "bitsocial")` on the registry.

Steps 1 and 5–7 of BSIP-10 still apply. An empty result, which includes a name that is unregistered,
expired, or in its grace period, means `none`. Example:

```text
name:   memes.bso
node:   0x32766e8bc53e343c21d132d673d112b27f0e1aa11965199b934d29721837a941
call:   text(node, "bitsocial") on the registry
value:  12D3KooWNsF2eMrdw3YFPycAaFEvZ9Eq3ekhNL3vrAAfN6dAwXLp
```

`.eth` names keep resolving through ENS as BSIP-10 specifies. They are no longer reached by
rewriting a `.bso` suffix.

Each client activates when it ships a resolver that implements this section. Clients SHOULD NOT
activate until every seed entry has been seeded or `SEED_END` has passed.

### Name equivalence

On activation, BSIP-10's [Name equivalence](./bsip-10.md#name-equivalence) rule 2 becomes: both
spellings end in `.bso`, or both end in `.eth` (suffix compared case-insensitively), and they are
identical after lowercasing. `bot.bso` and `Bot.BSO` are still the same name. `bot.bso` and `bot.eth`
are different names, held in different registries, possibly by different owners.

There is one exception. When a client checks whether a stored comment belongs to a community (rule 2
of [Community membership of comments](./bsip-10.md#community-membership-of-comments)), it MUST keep
using BSIP-10's original rule. A comment signed with `communityName: "a.eth"` before its community
renamed itself `a.bso` stays a member.

### Sunset and migration

`sunset()` may be called only by `FEE_RECIPIENT`, and only once. It sets
`sunsetAt = block.timestamp + 30 days` and emits an event. From `sunsetAt` on, `reveal` and `renew`
revert. Names keep resolving until they expire, and can still be transferred and edited. A sunset
cannot be cancelled or delayed.

The fee recipient MUST NOT call `sunset()` except to move `.bso` to Bitsocial Chain, and only once a
BSIP that specifies Bitsocial Chain's `.bso` registry has reached Last Call. That BSIP:

- MUST import, at no charge, every name that is active or in its grace period at `sunsetAt`, with the
  same owner, expiry, and `bitsocial` text record, and SHOULD import its other records and
  subdomains;
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
  four changes above, so most of the deployed code is code that already runs upstream.
- **Collect fees instead of burning them.** Bitsocial has no other funding, and this registry is
  temporary. A fixed recipient is acceptable because it cannot change prices and has no special
  power over names. It is a
  multisig rather than one person's address so that the registry survives the loss of any one key or
  person.
- **Seed from a snapshot instead of checking ENS on chain.** The registry could let `.eth` holders
  claim matching `.bso` names by reading ENS during a claim window. That would tie an immutable
  contract to ENS contracts, which have changed before, and give `.bso` names to every `.eth` holder,
  squatters included. Seeding only names that have a `bitsocial` record copies exactly the identities
  Bitsocial users rely on, records included, so those communities keep resolving without their owners
  doing anything. The cost is that the maintainers build the list. Fixing it at block `S` and
  publishing the script makes it checkable.
- **Pause public registration while seeding.** The registry cannot tell whether an arbitrary label is
  on the seed list without storing the list. Pausing `reveal` until `SEED_END` removes the race
  instead.
- **Reserved names.** Squatters can use project and maintainer names to impersonate them. The list is
  kept short so the registry stays neutral, and names in use take precedence over it.
- **Sunset stops renewals and gives notice.** After migration a renewal on Ethereum would buy nothing,
  so the sunset stops renewals as well as registrations. The 30-day notice is enforced by the
  contract, so a sunset is public before it takes effect.
- **Separate `.bso` and `.eth`.** Once the two registries can have different owners, equivalence would
  let whoever holds `bot.bso` match identity-list entries written for `bot.eth`, and the reverse. The
  membership exception keeps older pages valid. It decides only which comments a community may show,
  not who holds authority.

## Backwards Compatibility

- Every `.bso` name in use at block `S` keeps its owner, key, and record in the registry.
- Clients that have not activated keep resolving `x.bso` as `x.eth`. For a seeded name both
  registries give the same answer until an owner changes one of them, after which old and new clients
  resolve different keys. Owners SHOULD keep both records the same until their users' clients have
  activated, and clients SHOULD activate promptly.
- A `.bso` name that is not seeded stops resolving in activated clients until someone registers it in
  the registry.
- `.eth` names keep resolving as before. They no longer match `.bso` spellings in identity lists or
  when a community is loaded by name ([Name equivalence](#name-equivalence)). Community owners whose
  identity lists rely on that match SHOULD list the `.bso` spelling.
- No signed record becomes invalid.

## Reference Implementation

To be written:

- the registry: a fork of `lucadonnoh/gwei-names` at the upstream commit with the changes in
  [Registry contract](#registry-contract), with a test for each change, in a `bitsocialnet`
  repository;
- the seed-list builder and its output, in `assets/bsip-13/`;
- `.bso` resolution through the registry in
  [bso-resolver](https://github.com/bitsocialnet/bso-resolver).

## Security Considerations

- **No upgrades.** A bug in the registry is permanent. The upstream `NameNFT`, inherited from
  wei-names, has had automated reviews (Cantina Apex, Plainshift AI, Zellic V12), and its repository
  shows no manual audit. The added code (`withdraw`, `seed`, the `SEED_END` check, and `sunset`)
  SHOULD be reviewed independently and tested on Sepolia and on a mainnet fork before deployment.
- **Fee recipient.** If the signers can no longer reach the threshold, fees are stuck where nobody can
  reach them, and `sunset()` can never be called, so the Ethereum registry keeps selling names after
  a migration. The signer rules in [Fee recipient](#fee-recipient) exist to prevent this. Signers who
  reach the threshold can call `sunset()` early: it stops registrations and renewals, so without a
  migration every name would expire within about 15 months. The 30-day notice makes such a call
  public before it takes effect. Signers cannot change prices or the seed list, and have no power over
names beyond what any account has.
- **Seed list.** A wrong owner, record, or omission in the seed list is permanent once `SEED_ROOT` is
  deployed. Anyone holding a `.eth` name at block `S` receives the `.bso` name, including a holder who
  had compromised it by then. The list MUST be published and checked before deployment.
- **Name hijack.** Under BSIP-10, whoever controls a name controls where its community's readers
  migrate ([Key migration](./bsip-10.md#key-migration)). A `.bso` name that passes its grace period can
  be registered by anyone, who can then move its readers to their own key. Owners SHOULD renew early.
  Renewal is permissionless, so others, such as a directory maintainer, can also renew a name for its
  owner.
- **Subdomains.** A parent owner can reclaim any subdomain at any time and move its readers. A
  community named by a subdomain trusts its parent's owner completely.
- **Look-alike names.** The registry lowercases ASCII only, so Unicode confusables and non-normalized
  spellings can be registered. BSIP-10's normalization and look-alike rules apply to `.bso` names
  unchanged.
- **Two registries during the transition.** Until clients activate, someone who controls `x.eth` but
  not `x.bso`, for example by registering an `x.eth` that expired after block `S`, can move readers on
  old clients to their own key. Prompt activation shortens this window.
- **Front-running and resolver trust.** Commit-reveal stops a mempool watcher from registering a name
  first, and before `SEED_END` `reveal` is disabled entirely. BSIP-10's resolver trust considerations
  apply to the Ethereum providers that clients read the registry through.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
