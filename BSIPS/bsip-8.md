---
bsip: 8
title: Comment Moderation
description: The moderator-signed publication that removes, approves, locks, pins, labels, or purges a comment and bans or flairs its author.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Draft
type: Standards Track
category: Core
created: 2026-10-23
requires: 2, 3, 4, 5, 10
---

## Abstract

A **comment moderation** is a publication signed by a holder of a moderation role in a community
(`owner`, `admin`, or `moderator`) that changes the moderation state of one comment or the standing
of its author in that community. It can remove or approve the comment; lock, archive, or pin a post;
override spoiler, NSFW, and flairs; ban or flair the author; or purge the comment and its replies
from the community. The community authorizes the signer against its `roles` ([BSIP-3](./bsip-3.md)),
records the moderation, and reflects the result in the community-signed comment update
([BSIP-5](./bsip-5.md)). This BSIP defines the `commentModeration` publication, how role holders are
recognized, what each action does, and how conflicting moderations resolve.

## Motivation

Communities are the unit of moderation in Bitsocial, but moderators rarely hold the community's
private key or run its node. They need a signed message that the hosting node can authorize and act
on, and clients need to agree on what each action means for display, for which later publications
are accepted, and for the author's standing. This BSIP specifies that message and those effects so
that any client can moderate any community and any community can honor any client's moderation.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Overview

1. A role holder signs a `commentModeration` naming the target comment by `commentCid` and listing
   one or more actions, and publishes it to the community under the `commentModeration` key of an
   encrypted `CHALLENGEREQUEST` ([BSIP-4](./bsip-4.md)).
2. The community applies the common acceptance rules
   ([BSIP-4, Publication acceptance](./bsip-4.md#publication-acceptance)), checks the signer's
   role, applies the moderation rules below, and answers with a `CHALLENGEVERIFICATION`.
3. The community records the moderation and applies its effects. The result appears in the
   comment's next comment update and, for author actions, in the comment updates of all the author's
   comments.

Moderations themselves are not published as records; readers see only their effect, asserted by the
community in its signed comment updates.

### Fields

A `commentModeration` is a JSON object with:

- `commentCid` — REQUIRED. String, the CID of the target comment.
- `commentModeration` — REQUIRED. An object of actions, all OPTIONAL:
  - `removed` — boolean. Remove (`true`) or restore (`false`) the comment.
  - `approved` — boolean. Approve or disapprove a comment that is pending approval.
  - `locked` — boolean. Lock or unlock a post.
  - `archived` — boolean. Archive or unarchive a post.
  - `pinned` — boolean. Pin or unpin a post or reply.
  - `spoiler`, `nsfw` — boolean. Override the author's values.
  - `flairs` — array of [flair objects](./bsip-2.md#flairs), replacing the comment's flairs.
  - `reason` — string, a public explanation of the moderation.
  - `purged` — boolean. `true` purges the comment and its replies from the community.
  - `author` — object of actions on the comment's author:
    - `banExpiresAt` — positive integer Unix time in seconds; the author is banned until then.
    - `flairs` — array of flair objects, the author's moderator-assigned flairs in this community.

and the [common publication fields](./bsip-2.md#common-publication-fields): `timestamp`,
`protocolVersion`, and `signature` (REQUIRED), `author` (OPTIONAL), and `communityPublicKey` and
`communityName` ([BSIP-2, Community addressing](./bsip-2.md#community-addressing)).

A key present in `commentModeration` is an action; an absent key leaves that state unchanged. One
moderation MAY carry several actions. Unknown keys inside `commentModeration` or its `author` object
are accepted and ignored by communities that do not understand them, and do not appear in comment
updates.

The moderation is signed by the role holder following [BSIP-2, Signatures](./bsip-2.md#signatures).
Every top-level field other than `signature` MUST be listed in `signedPropertyNames`. pkc-js lists
the present fields in this order: `author`, `communityPublicKey`, `communityName`,
`protocolVersion`, `timestamp`, `commentModeration`, `commentCid`. Verifiers MUST NOT depend on the
order.

Example moderation removing a comment and banning its author, signed by a moderator whose role entry
in the community record is `"tom.bso": { "role": "moderator" }`:

```jsonc
{
  "commentCid": "QmbKFFGL9EMwdMVrkJUqz2yQAorzUBExchK1qogsU8BJ7e",
  "commentModeration": {
    "removed": true,
    "reason": "Spam link",
    "author": { "banExpiresAt": 1795356000 }
  },
  "communityPublicKey": "12D3KooWBexQF4qDvyaxDgK4r2qPNk5z8s9b1eU5z2bnR6dExamPLe",
  "communityName": "jokes.bso",
  "author": { "name": "tom.bso" },
  "timestamp": 1792764000,
  "protocolVersion": "1.0.0",
  "signature": {
    "type": "ed25519",
    "signature": "<base64>",
    "publicKey": "<base64, 32 bytes>",
    "signedPropertyNames": ["author", "communityPublicKey", "communityName", "protocolVersion", "timestamp", "commentModeration", "commentCid"]
  }
}
```

### Role matching

A publication's signer **holds** a role when a key of the community's `roles`
([BSIP-3, Roles](./bsip-3.md#roles)) whose role object carries that role matches the publication
under [BSIP-10, Identity lists](./bsip-10.md#identity-lists): a key-form entry matches the signer
address, and a name-form entry matches only when the publication's own `author.name` is the same
name and resolves, without a cached result, to the signer address. A community deciding authority
MUST apply that rule and MUST NOT match a role against a runtime author address. In addition:

- Only the roles `owner`, `admin`, and `moderator` grant authority. Other role strings grant
  nothing.
- Roles are read from the community's current state when the publication is validated. A community
  SHOULD evaluate the match again immediately before applying a publication that waited on an
  interactive challenge.
- When the only possible match failed because the community could not resolve the name, the
  community SHOULD say so in the rejection `reason` rather than report that the signer has no role.

### Authorization

A community MUST reject a `commentModeration` unless its signer holds the `owner`, `admin`, or
`moderator` role under [Role matching](#role-matching). The three roles have the same moderation
powers. Authority comes only from `roles`: the key that signs the community record has no implicit
role.

Roles confer no rank over targets. Any role holder may moderate any comment, including comments by
other role holders, and may ban any comment's author.

### Validation

A community MUST reject a `commentModeration` that fails the rules every publication must meet
([BSIP-4, Publication acceptance](./bsip-4.md#publication-acceptance)). Those rules include the ban
check, so a banned role holder cannot moderate, and reject a moderation whose comment does not exist
in the community (pending comments exist; purged ones do not). BSIP-4's checks on the state of the
targeted comment and its thread do not apply: a moderator can act on a removed, deleted, locked,
archived, pending, or disapproved comment and on any comment in such a thread. In addition, a
community MUST reject a `commentModeration` that:

1. **carries a reserved top-level field**: `insertedAt`, `modSignerAddress`, `extraProps`,
   `targetAuthorSignerAddress`, `targetAuthorDomain`, `challengeAnswers`, `challengeCommentCids`,
   `shortCommentCid`, `shortCommunityAddress`, `communityAddress`, `state`, `publishingState`,
   `signer`, `clients`, or `nameResolved`;
2. **is not authorized**, under [Authorization](#authorization);
3. **has a `timestamp` earlier than the target comment's `timestamp`**;
4. **sets `locked` or `archived` to `true` on a reply.** Only posts are locked or archived; a
   `false` value on a reply is accepted and has no effect;
5. **sets `archived` to `true` while the community record's `features.noArchive` is `true`**, unless
   the post is already archived;
6. **carries `approved`, with either value, for a comment that is not pending approval**;
7. **has the same signature as a moderation the community already accepted.**
   [BSIP-4, Duplicate requests](./bsip-4.md#duplicate-requests) governs the answer to a resend.

Moderator `flairs`, `spoiler`, and `nsfw` are not checked against the community's flair lists or
features.

A community answers a rejected moderation with `challengeSuccess: false` and a `reason`, and an
accepted one with `challengeSuccess: true` and no `encrypted` payload.

### Actions

Each action below describes the effect on the target comment's update `U` ([BSIP-5](./bsip-5.md))
and on later publications. Rejections of later publications are enforced by BSIP-4's checks on the
targeted comment ([BSIP-4, Publication acceptance](./bsip-4.md#publication-acceptance)).

- **`removed`** sets `U.removed`. While a comment is removed, votes and replies on it and edits of
  it are rejected; while a post is removed, every vote, reply, and edit in its thread is rejected.
  Replies under a removed reply remain open. A removed comment is not counted in its ancestors'
  reply counts. By default pkc-js leaves removed posts out of the posts pages and keeps removed
  replies in reply pages as tombstones ([BSIP-3, Pages](./bsip-3.md#pages)). `false` restores it.
- **`spoiler`**, **`nsfw`** set `U.spoiler` and `U.nsfw`, which take precedence over the comment's
  and the author's edit values ([BSIP-7](./bsip-7.md#presentation)).
- **`flairs`** sets `U.flairs`, which takes precedence over the comment's and the edit's flairs. An
  empty array clears them.
- **`pinned`** sets `U.pinned`. Pages list pinned comments first unless a sort says otherwise
  ([BSIP-3, Pages](./bsip-3.md#pages)).
- **`locked`** sets `U.locked` on a post. Replies in a locked post's thread, and edits of the post
  or of any comment in its thread, are accepted only from role holders; votes on the post or on
  anything in its thread are rejected for everyone, role holders included. `false` unlocks.
- **`archived`** sets `U.archived` on a post. Replies, votes, and edits in an archived post's
  thread, the post included, are rejected for everyone; only moderations are still accepted. `false`
  unarchives.
- **`reason`** sets `U.reason`.
- **`approved: true`** makes a pending comment live. The community adds the comment record to IPFS
  (it was not published there while pending), assigns its `number` and `postNumber`, includes it in
  pages, and sets `U.approved` to `true`.
- **`approved: false`** disapproves a pending comment:
  - if `approved` is the only key in `commentModeration`, the community deletes the comment from its
    store entirely, leaving no comment update;
  - otherwise the comment leaves the moderation queue but is kept: `U.approved` is `false` and
    `U.removed` is `true` unless a moderation has set `removed` explicitly. Votes, replies, and
    edits on it are rejected, except an author edit deleting it ([BSIP-7](./bsip-7.md)).
- **`purged: true`** deletes the comment and its entire reply subtree from the community: their
  records, comment updates, and the votes and edits targeting them. The community stops serving and
  unpins them, removes them from pages and counts, and from then on rejects any publication that
  references them as unknown. Purging cannot be undone. The other comment actions of a purging
  moderation have no lasting effect; its `author` actions still apply, because the community records
  the target author before purging.
- **`author.banExpiresAt`** bans the target comment's author (see
  [Author standing](#author-standing)) until that time. BSIP-4's ban check rejects every
  publication from a banned author, of every type, while `banExpiresAt` is later than the current
  time. The value appears as `author.community.banExpiresAt` in the comment updates of the author's
  comments. A ban is lifted by a later moderation that sets `banExpiresAt` to a past time.
- **`author.flairs`** sets the author's moderator-assigned flairs, which appear as
  `author.community.flairs` in the comment updates of the author's comments and take precedence over
  author-chosen flairs.

### Author standing

The **target author** of a moderation is the author of the target comment: the address derived from
the comment record's `signature.publicKey` and, if the comment record has an `author.name`, that
name. For a comment stored under a pseudonymity alias
([BSIP-2, Pseudonymity](./bsip-2.md#pseudonymity)), the target author is the original author: the
original public key and name the community recorded when it accepted the comment, not the alias.

A community MUST record the target author when it accepts a moderation with `author` actions, and
MUST keep that record when the target comment is later purged, so that bans outlive the comment.

When the community computes an author's standing, either to run BSIP-4's ban check on a new
publication or to fill `author.community` in a comment update, an author moderation applies when its
recorded target author is:

- the address derived from the publication's or comment's signing key;
- for an original author, any alias address the community issued to them, and for an alias address,
  the original author it belongs to; or
- the exact `author.name` of the publication, or the original author name recorded for the comment.

pkc-js compares names exactly here, so a ban recorded for `x.eth` does not match `x.bso`.
Communities SHOULD treat names that are the same under
[BSIP-10, Name equivalence](./bsip-10.md#name-equivalence) as the same author.

In a comment update for a pseudonymous comment, `author.community.banExpiresAt` and
`author.community.flairs` reflect moderations targeting the alias or its original author, while the
karma fields count only the alias's own comments.

### Resolving conflicts

A community MUST resolve the state it publishes as follows:

- **Per field, the last accepted moderation wins.** For each of `removed`, `approved`, `locked`,
  `archived`, `pinned`, `spoiler`, `nsfw`, and `flairs`, the comment's value is the value in the
  moderation of that comment the community accepted last among those that set the field. Acceptance
  order decides, not `timestamp`, and it does not matter which role holder signed.
- **`reason` resolves on its own**: `U.reason` is the reason in the last accepted moderation of the
  comment that carried one. It may explain a different action than the latest flag change, and
  clients SHOULD NOT assume otherwise.
- **Author actions resolve per author**, across all of that author's comments: the ban is the
  `banExpiresAt` of the last accepted moderation targeting the author that set one, even if it is
  earlier than a previous ban, and the author flairs are those of the last accepted moderation
  targeting the author that set them.
- **Moderators override authors.** `U.spoiler`, `U.nsfw`, and `U.flairs` take precedence over the
  author's edit ([BSIP-7](./bsip-7.md#presentation)) whichever was published later.
- **Removal and deletion are independent.** A comment may be removed (`U.removed`), deleted by its
  author (`U.edit.deleted`), or both.
- **Purge is terminal.** Nothing can target a purged comment.

## Rationale

- **Role holders sign, the community asserts.** A moderation is authenticated once, by the node
  that applies it. Readers already trust that node for its comment updates ([BSIP-5](./bsip-5.md)),
  so republishing every moderation as a separate verifiable record would add data without adding
  trust.
- **Matching on the signing key, or on a name proven to resolve to it,** means a role cannot be
  claimed by writing someone else's name into `author.name`. Resolving at match time makes revoking
  a name, or pointing it at a new key, take effect immediately.
- **Per-field last-writer-wins** lets several moderators act at once without coordinating: each
  moderation states only what it changes.
- **Locking and archiving apply to posts** because they close a whole thread; pinning applies to any
  comment because replies can be pinned within their parent's reply pages.
- **Disapproval with or without a reason.** A bare `approved: false` discards spam with no trace; a
  disapproval carrying anything else keeps a record so the author can see why.
- **Bans keyed to the author, not the comment,** survive purges and apply across all of the author's
  aliases and, by name, to new keys that claim the same name.

## Backwards Compatibility

Unknown keys inside `commentModeration` and its `author` object are accepted and ignored, so new
moderation actions can be added without breaking older communities; older communities simply do not
apply them. A community that has not implemented an action MUST NOT claim its effect in comment
updates.

## Security Considerations

- **Authorization bypass.** The role check is the only barrier between any key and full moderation
  power. A community MUST implement [Role matching](#role-matching) exactly: matching a role key
  against a claimed `author.name` without resolving it, or against a runtime author address, lets
  anyone moderate.
- **Stale authorization.** Roles are checked when the request is validated, before any interactive
  challenge. pkc-js does not check again before applying the moderation, so a role revoked while the
  moderator answers a challenge (up to the exchange's lifetime) does not stop it; hence the re-check
  recommended in [Role matching](#role-matching).
- **No rank among roles.** A `moderator` can remove an owner's posts and ban an owner or admin, and
  a banned role holder can no longer moderate or publish community edits ([BSIP-9](./bsip-9.md))
  over pubsub. Only the node operator can repair this. Communities SHOULD grant roles only to
  trusted keys; implementations MAY refuse moderations whose target author holds a higher role, as a
  local policy.
- **Replay.** Duplicate detection by signature and the timestamp window stop replays, and the signed
  `communityPublicKey`, `communityName`, and `commentCid` stop a moderation from being replayed to
  another community or comment.
- **Unverifiable history.** Readers see only the community-signed result, not who moderated. A
  community can therefore claim moderation that no role holder performed; this is inside the trust
  readers already give it for comment updates.
- **Ban evasion.** Bans match keys, aliases, and names. A banned author can publish under a fresh
  key without a name; resisting that is the job of the community's anti-spam challenges and
  exclusion policy ([BSIP-4](./bsip-4.md)). A publication claiming a banned name is rejected even if
  its signer does not own the name, which harms only the claimant.
- **Purge is not erasure.** Purging stops the community serving the records and unpins them, but
  peers that fetched them may keep copies.
- **Pending content is already visible.** A pending comment is not added to IPFS under its own CID
  until it is approved, but its record is carried in the community's moderation queue pages
  ([BSIP-3](./bsip-3.md)), which anyone can fetch. Disapproval and purging stop serving it; they
  cannot recall copies already fetched.
- **Reasons are public.** `reason` appears in signed comment updates; moderators SHOULD NOT put
  private information in it.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
