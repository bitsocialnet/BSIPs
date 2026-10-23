---
bsip: 9
title: Community Edits
description: The owner- or admin-signed publication that edits a community's public record over pubsub, including renaming the community.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Draft
type: Standards Track
category: Core
created: 2026-10-23
requires: 2, 3, 4, 8, 10
---

## Abstract

A **community edit** lets a holder of the `owner` or `admin` role change a community's public
properties without access to the node that hosts the community. The role holder signs a
`communityEdit` publication and sends it through the challenge exchange ([BSIP-4](./bsip-4.md)). The
hosting node authorizes the signer against the community's `roles` ([BSIP-3](./bsip-3.md)), merges
the edit into the community's current properties, and publishes the result in its next signed
community record. This BSIP defines the publication, which properties each role may change, how the
node validates and applies an edit, and the identity rules that govern a change of the community's
name.

## Motivation

The community record is signed by the community's key, which lives on the hosting node. The people
who run a community (its owners and admins) often do not operate that node, and should not need its
private key to update a title, adjust rules, or appoint moderators. A signed publication that the
node verifies and applies gives them that ability while keeping the node's private settings, such as
challenge secrets, out of reach. Independent clients and nodes must agree on which fields such a
publication may touch and how it is merged, or an edit accepted by one node would mean something
else on another.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Overview

1. A role holder signs a `communityEdit` and publishes it to the community under the
   `communityEdit` key of an encrypted `CHALLENGEREQUEST` ([BSIP-4](./bsip-4.md)).
2. The hosting node applies the common acceptance rules
   ([BSIP-4, Publication acceptance](./bsip-4.md#publication-acceptance)), checks the signer's role,
   and validates the edit. A community edit targets no comment, so BSIP-4's checks on a targeted
   comment do not apply.
3. The node merges the edit into its current properties and answers with a `CHALLENGEVERIFICATION`.
4. The node's next community record carries the new values.

### Fields

A `communityEdit` publication is a JSON object with:

- `communityEdit` — REQUIRED. An object of the properties to change, each OPTIONAL. Only these keys
  are allowed; the roles that may set each one are given in [Authorization](#authorization):
  - `title` — string.
  - `description` — string.
  - `rules` — array of strings.
  - `flairs` — object mapping a flair scope (for example `post` or `author`) to an array of
    [flair objects](./bsip-2.md#flairs).
  - `features` — object of feature toggles ([BSIP-3, Features](./bsip-3.md#features)).
  - `suggested` — object of presentation hints ([BSIP-3](./bsip-3.md)).
  - `pubsubTopic` — non-empty string, the topic publishers use to reach the community
    ([BSIP-4](./bsip-4.md)).
  - `roles` — object mapping role keys (key addresses or names, [BSIP-10](./bsip-10.md)) to role
    objects. A role object has a REQUIRED non-empty `role` string; other keys are allowed.
  - `name` — the community's name ([BSIP-10, Names](./bsip-10.md#names); see
    [Renaming](#renaming)).
  - `address` — legacy alias of `name` (see [Renaming](#renaming)).

and the [common publication fields](./bsip-2.md#common-publication-fields): `timestamp`,
`protocolVersion`, and `signature` (REQUIRED), `author` (OPTIONAL), and `communityPublicKey` and
`communityName` ([BSIP-2, Community addressing](./bsip-2.md#community-addressing)).

The publication is signed by the role holder following
[BSIP-2, Signatures](./bsip-2.md#signatures). Every top-level field other than `signature` MUST be
listed in `signedPropertyNames`. pkc-js lists the present fields in this order: `author`,
`communityPublicKey`, `communityName`, `protocolVersion`, `timestamp`, `communityEdit`. Verifiers
MUST NOT depend on the order.

Example community edit, signed by the key that `john.bso` resolves to, where the community record's
`roles` contains `"john.bso": { "role": "owner" }`:

```jsonc
{
  "communityEdit": {
    "description": "Jokes only. No reposts.",
    "features": { "noVideos": true },
    "roles": { "alice.bso": { "role": "moderator" } }
  },
  "communityPublicKey": "12D3KooWBexQF4qDvyaxDgK4r2qPNk5z8s9b1eU5z2bnR6dExamPLe",
  "communityName": "jokes.bso",
  "author": { "name": "john.bso" },
  "timestamp": 1792764000,
  "protocolVersion": "1.0.0",
  "signature": {
    "type": "ed25519",
    "signature": "<base64>",
    "publicKey": "<base64, 32 bytes>",
    "signedPropertyNames": ["author", "communityPublicKey", "communityName", "protocolVersion", "timestamp", "communityEdit"]
  }
}
```

### Authorization

Roles are matched as in [BSIP-8, Role matching](./bsip-8.md#role-matching). A node MUST reject a
`communityEdit` unless:

- its signer holds the `owner` or `admin` role; and
- if `communityEdit` contains `roles`, `name`, or `address`, its signer holds the `owner` role.

So `title`, `description`, `rules`, `flairs`, `features`, `suggested`, and `pubsubTopic` may be
changed by owners and admins, while `roles`, `name`, and `address` may be changed only by owners.
The `moderator` role cannot publish community edits. Authority comes only from `roles`: the key that
signs the community record has no implicit role, and an `owner` role entry grants no access to the
node's private key or private settings.

### Validation

A node MUST reject a `communityEdit` that fails the common acceptance rules of
[BSIP-4](./bsip-4.md#publication-acceptance), and MUST also reject it when:

1. **It carries a reserved top-level field**: `challengeAnswers`, `challengeCommentCids`,
   `shortCommunityAddress`, `communityAddress`, `state`, `publishingState`, `signer`, `clients`, or
   `nameResolved`.
2. **The signer is not authorized**, under [Authorization](#authorization).
3. **`communityEdit` contains any key not listed in [Fields](#fields).** This covers every other
   community record field, such as `challenges`, `encryption`, `posts`, `modQueue`, `postUpdates`,
   `statsCid`, `createdAt`, `updatedAt`, and `protocolVersion`, and the node's private `settings`.
   Challenge configuration and other private settings can be changed only on the node itself.
4. **The node has already accepted a `communityEdit` with the same signature.**
5. **The merged result is invalid** (see [Applying an edit](#applying-an-edit)): it does not satisfy
   the community record format of [BSIP-3](./bsip-3.md), a name-form role key cannot be resolved,
   or a name rule of [Renaming](#renaming) fails.

A rejected edit changes nothing. The node answers it with `challengeSuccess: false` and a `reason`,
and answers an applied edit with `challengeSuccess: true` and no `encrypted` payload.

### Applying an edit

For each key `K` in `communityEdit`, the node merges the edit's value into the community's current
value of `K` and then applies all merged values at once:

- Where both values are objects, they are merged key by key, recursively.
- Where both values are arrays, they are merged element by element: element `i` of the edit is
  merged into element `i` of the current array, and current elements beyond the edit's length are
  kept.
- Otherwise the edit's value replaces the current one.

Consequences that publishers MUST account for:

- To add or change one role, feature, suggestion, or flair scope, the edit carries only that entry;
  the other entries are kept.
- An entry cannot be removed over pubsub. JSON cannot carry `undefined`, and `null` is not a valid
  value for any editable property. To take away a role's authority, an owner sets it to a role
  string that grants nothing (see [BSIP-8, Role matching](./bsip-8.md#role-matching)); removing the
  entry entirely requires the node operator.
- An array such as `rules` cannot be shortened over pubsub: an edit can overwrite leading elements,
  but trailing elements of the current array remain.

When the merged `roles` contains name-form role keys, the node MUST resolve each of them without
using a cached result and MUST reject the edit if any cannot be resolved. pkc-js checks every
name-form key in the merged map, so an existing role key whose name no longer resolves blocks any
`roles` edit until the operator removes it.

### Renaming

A community's address is its `name` when it has one, otherwise its identity key
([BSIP-10, Terminology](./bsip-10.md#terminology)). Changing the name and changing the address are
therefore one operation, and `address` is accepted as a legacy alias of `name`:

- `{ "name": M }` or `{ "address": M }`, where `M` is a name, sets the name to `M`.
- `{ "address": K }`, where `K` is the community's identity key, drops the name.
- An edit that carries both `name` and `address` naming different addresses MUST be rejected, and
  none of its other properties applied.
- The name cannot be dropped with `name` over pubsub, because JSON cannot carry an absent value; an
  owner drops it with `address` set to the identity key.

The new name MUST be a name under [BSIP-10, Names](./bsip-10.md#names), a string containing a `.`,
and MUST NOT contain uppercase letters, so that one name is never spelled two ways on the wire. A
node MUST reject an `address` that is neither such a name nor its own identity key. The node SHOULD
verify that `M` resolves to its identity key before applying the rename; pkc-js applies the rename
and reports a failed or mismatching resolution only as a local error. Readers verify the name
of every record they load ([BSIP-10](./bsip-10.md#verifying-a-community-name)), so an unverified
name is never shown as the community's identity.

After a rename from `N` to `M`:

1. The node's next record carries `"name": M`, and every new publication to the community MUST carry
   `communityName` exactly `M`
   ([BSIP-10, Community names on publications](./bsip-10.md#community-names-on-publications)).
2. Which stored comments the community keeps in its pages, reply counts, and statistics follows
   [BSIP-10, Community membership of comments](./bsip-10.md#community-membership-of-comments),
   evaluated against the new name. Comments signed with `communityName` `N` stop being members, and
   become members again if the community is renamed back to `N`; comments without `communityName`,
   or signed with a spelling of `M`, stay members. pkc-js applies these rules every time it builds
   pages, so a renamed community never publishes a page that clients reject.
3. Readers do not follow renames: a reader that loaded the community by `N` rejects the record named
   `M` and has to load the community again by `M` or by its key
   ([BSIP-10](./bsip-10.md#verifying-a-community-name)). A reader that loaded it by key keeps
   following it.
4. Comments, votes, edits, and moderations accepted before the rename keep the `communityName` they
   were signed with; signed fields never change.

### Publishing the result

Once an edit is applied, the node MUST include the new values in its next community record
([BSIP-3](./bsip-3.md)). That record has a later `updatedAt` and a new signature by the community
key over every field it carries. Readers see the edit only in that record.

The `CHALLENGEVERIFICATION` for an applied edit is sent once the node's state has changed, which can
be before the new record is published. A publisher that needs to see the result SHOULD wait for a
record whose `updatedAt` is later than its edit's `timestamp`.

A change to `pubsubTopic` moves the community's challenge exchange to the new topic. Publishers use
the topic of the latest record they have verified. A change to `features` applies to publications
the node validates after the edit, and does not alter comments already stored.

## Rationale

- **Owner and admin tiers.** Most edits are routine and can be delegated to admins. `roles` and the
  name decide who controls the community and what it is called, so they stay with owners.
- **Public properties only.** Everything a community edit can touch is already public in the
  community record. Challenge secrets, allowlists, and other private settings never travel over
  pubsub, so a compromised role key cannot read or replace them.
- **Merging instead of replacing** lets an edit carry only what changes, so two admins editing
  different entries of `roles` or `features` do not erase each other's work. The element-wise rule
  for arrays mirrors the current implementation; a later revision may make arrays replace wholesale.
- **A rename is an identity change.** Authors sign `communityName` into every publication. A comment
  signed for `N` was published to the community called `N`, so a community now called `M` does not
  present it as its own. Applying the same membership rules on the node as clients apply to pages
  means a node never publishes a page that clients reject and never hides a comment clients would
  accept.
- **One operation for name and address.** Treating `name` and the legacy `address` as one value,
  and rejecting an edit where they disagree, leaves no state in which a node is addressed by one
  name and signs records carrying another.

## Backwards Compatibility

- `address` is accepted in `communityEdit` as a legacy alias of `name`, after the `address` field
  that older community records carried ([BSIP-10](./bsip-10.md#backwards-compatibility)). A node
  rewrites it into `name` as described in [Renaming](#renaming); it never appears in a new
  community record.
- Comments stored before publications carried `communityPublicKey` and `communityName` separately
  may have neither field. BSIP-10's membership rules keep them through any rename, because they
  accept a missing field.
- A node that does not implement community edits rejects them; role holders can still edit through
  the node operator.

## Security Considerations

- **Authorization bypass.** Community edits are authorized only through
  [BSIP-8, Role matching](./bsip-8.md#role-matching). Accepting a claimed `author.name` without
  resolving it, or matching a runtime author address, would let anyone rewrite the community.
- **Privilege escalation.** Owners can grant the `owner` role to any key. Admins cannot touch
  `roles` or the name, but they can change `pubsubTopic`, which moves the challenge exchange, and
  `features`, which includes `pseudonymityMode` and other privacy- and access-relevant switches.
  Communities SHOULD grant `admin` only to keys trusted with those powers.
- **Revocation.** Because entries cannot be removed over pubsub, a compromised role key can be
  neutralized by an owner but only removed by the node operator. A compromised owner key can
  likewise neutralize the other owners; the node operator remains the final authority, through edits
  made on the node itself.
- **Replay.** A community edit can be replayed within the timestamp window, and a node that applied
  it twice could undo a later edit, for example restoring an earlier title. Nodes MUST reject a
  `communityEdit` whose signature they have already accepted (rule 4 of [Validation](#validation));
  pkc-js does not yet do this for community edits. The signed `communityPublicKey` and
  `communityName` stop an edit from being replayed to another community.
- **Name hijacking.** An owner can rename the community to a name that does not resolve to it.
  Readers verify names before trusting them ([BSIP-10](./bsip-10.md#verifying-a-community-name)),
  and nodes SHOULD refuse such renames.
- **Stale authorization.** Roles are checked when the request is validated, before any interactive
  challenge; see the re-check recommended in [BSIP-8, Role matching](./bsip-8.md#role-matching).
- **Abuse.** Every applied edit forces a new community record. Community edits pass through the
  community's challenges and the publication size limit of
  [BSIP-4](./bsip-4.md#publication-acceptance); communities SHOULD rate-limit them.
- **Surprising merges.** Publishers that expect replacement semantics can leave stale roles or array
  elements in place. Clients SHOULD show the role holder the merged result, read from the next
  record, rather than the edit they sent.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
