---
bsip: 7
title: Comment Edits
description: The author-signed publication that edits or deletes the author's own comment, and how a community carries it in the comment update.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Draft
type: Standards Track
category: Core
created: 2026-10-23
requires: 2, 3, 4, 5, 8
---

## Abstract

A **comment edit** is a publication an author signs to change or delete one of their own comments
after a community has accepted it. The comment record is immutable ([BSIP-2](./bsip-2.md)), so an
edit never modifies it. Instead the community validates the edit, keeps it, and embeds the author's
most recently accepted edit, unmodified and still author-signed, in the comment's update
([BSIP-5](./bsip-5.md)). This BSIP defines the `commentEdit` publication, who may publish it, how a
community validates and applies it, what deletion means, and how clients present and verify the
result.

## Motivation

Authors need to fix mistakes, add spoiler or NSFW warnings after the fact, change their post flairs,
and withdraw what they wrote. A content-addressed comment cannot be changed in place. Clients,
community nodes, and readers therefore have to agree on a separate edit object, on the rule that
only the comment's author may publish one, and on how the edit travels inside the community-signed
comment update. Without that agreement, an edit made in one client is invisible or unverifiable in
another.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Overview

1. The author signs a `commentEdit` that names the target comment by `commentCid`, and publishes it
   to the comment's community under the `commentEdit` key of an encrypted `CHALLENGEREQUEST`
   ([BSIP-4](./bsip-4.md)).
2. The community applies the common acceptance rules
   ([BSIP-4, Publication acceptance](./bsip-4.md#publication-acceptance)) and the edit rules in this
   BSIP, and answers with a `CHALLENGEVERIFICATION`.
3. The community stores the accepted edit. The author's most recently accepted edit becomes the
   `edit` field of the comment's next comment update.
4. Clients verify `edit` against the comment record and merge it into the comment they display.

### Fields

A `commentEdit` is a JSON object with these edit fields:

- `commentCid` — REQUIRED. String, the CID of the comment being edited.
- `content` — OPTIONAL. String, replacement body text (Markdown).
- `deleted` — OPTIONAL. Boolean. `true` deletes the comment (see [Deletion](#deletion)).
- `flairs` — OPTIONAL. Array of [flair objects](./bsip-2.md#flairs), the author's replacement post
  flairs.
- `spoiler` — OPTIONAL. Boolean.
- `nsfw` — OPTIONAL. Boolean.
- `reason` — OPTIONAL. String, the author's note explaining the edit.

and the [common publication fields](./bsip-2.md#common-publication-fields): `timestamp`,
`protocolVersion`, and `signature` (REQUIRED), `author` (OPTIONAL), and the community addressing
fields `communityPublicKey` and `communityName`
([BSIP-2, Community addressing](./bsip-2.md#community-addressing)).

An edit can change only the edit fields above. `title`, `link`, `gallery`, `parentCid`, and every
other field of the comment record stay as the author first signed them.

Example edit as signed by the author:

```jsonc
{
  "commentCid": "QmbKFFGL9EMwdMVrkJUqz2yQAorzUBExchK1qogsU8BJ7e",
  "content": "It wasn't peeling well. (Edit: credit to my nephew for this one.)",
  "spoiler": true,
  "reason": "Added credit",
  "communityPublicKey": "12D3KooWBexQF4qDvyaxDgK4r2qPNk5z8s9b1eU5z2bnR6dExamPLe",
  "communityName": "jokes.bso",
  "author": { "name": "john.bso" },
  "timestamp": 1792764000,
  "protocolVersion": "1.0.0",
  "signature": {
    "type": "ed25519",
    "signature": "<base64>",
    "publicKey": "<base64, 32 bytes>",
    "signedPropertyNames": ["author", "communityPublicKey", "communityName", "protocolVersion", "timestamp", "commentCid", "content", "spoiler", "reason"]
  }
}
```

### Signing

An edit is signed by the author following [BSIP-2, Signatures](./bsip-2.md#signatures). Every
top-level field other than `signature` MUST be listed in `signedPropertyNames`; a community rejects
an edit that carries an unsigned field. The current implementation, pkc-js, lists the fields that
are present in this order: `author`, `communityPublicKey`, `communityName`, `protocolVersion`,
`timestamp`, `commentCid`, `content`, `deleted`, `flairs`, `spoiler`, `nsfw`, `reason`. Verifiers
MUST use the list carried in the signature and MUST NOT depend on its order.

### Who may edit

Only the key that signed a comment may edit it:

- If the community stored the comment under its author's own key, the edit's `signature.publicKey`
  MUST equal the comment record's `signature.publicKey`.
- If the community stored the comment under a pseudonymity alias
  ([BSIP-2, Pseudonymity](./bsip-2.md#pseudonymity)), the edit's `signature.publicKey` MUST equal
  the original author public key the community recorded when it accepted that comment. An edit
  signed by the alias key MUST be rejected.

A community MUST make this decision by comparing public keys. It MUST NOT authorize an edit because
of `author.name`, a derived author address, or a role. Owners, admins, and moderators can edit only
the comments they signed; they act on other people's comments through comment moderation
([BSIP-8](./bsip-8.md)).

### Validation

A community MUST reject a `commentEdit` that fails the rules every publication must meet
([BSIP-4, Publication acceptance](./bsip-4.md#publication-acceptance)). Those rules include
BSIP-4's checks on the targeted comment, here the edited comment. For an edit they mean: the comment
exists and is not removed, deleted, pending, or disapproved (an edit that deletes a pending or
disapproved comment is allowed); its thread is not removed, deleted, or archived, nor locked unless
the signer holds a moderation role; and the edit's `timestamp` is not earlier than the comment's.
In addition, a community MUST reject a `commentEdit` that:

1. **is not signed by the comment's author**, under [Who may edit](#who-may-edit);
2. **has the same signature as an edit the community already accepted.**
   [BSIP-4, Duplicate requests](./bsip-4.md#duplicate-requests) governs the answer to a resend;
3. **breaks a community feature** ([BSIP-3, Features](./bsip-3.md#features)). The checks the
   community applies to comments also apply to the edited values:
   - `noMarkdownImages`, `noMarkdownVideos`, `noMarkdownAudio`: `content` embeds that media type;
   - `noSpoilers`: `spoiler` is `true`; `noSpoilerReplies`: `spoiler` is `true` and the edited
     comment is a reply;
   - `flairs` is non-empty and either `postFlairs` is not enabled or a flair is not deep-equal to an
     entry of the community record's `flairs.post` list. This applies to replies too;
4. **carries a reserved top-level field**: `insertedAt`, `authorSignerAddress`, `isAuthorEdit`,
   `extraProps`, `challengeAnswers`, `challengeCommentCids`, `commentEdit`, `shortCommentCid`,
   `shortCommunityAddress`, `communityAddress`, `state`, `publishingState`, `signer`, `clients`, or
   `nameResolved`. These names are kept for node bookkeeping and runtime fields. Other signed fields
   unknown to the community are accepted and kept with the edit.

A community answers a rejected edit with `challengeSuccess: false` and a `reason`, and an accepted
one with `challengeSuccess: true` and no `encrypted` payload.

### Pseudonymous comments

When the edited comment is stored under a pseudonymity alias:

1. The author signs the edit with their own key, and the community authorizes it against the
   recorded original key, as above.
2. Before storing the edit, the community MUST remove its `author` field and re-sign it with that
   comment's alias private key, keeping the other fields defined in this BSIP unchanged. It MAY drop
   signed fields it does not understand; pkc-js does.
3. The stored edit, and the one later placed in the comment update, is the alias-signed edit. Its
   `signature.publicKey` equals the comment record's `signature.publicKey`, so readers verify it
   like any other edit. Neither the original author's key nor their author object appears in the
   comment update.

Because the community holds the alias private key, it can produce such edits on its own; see
[Security Considerations](#security-considerations).

### The effective edit

A community keeps every edit it accepts. The **effective edit** of a comment is the edit signed by
the comment record's key (the alias key for a pseudonymous comment) that the community accepted
**last**. Acceptance order decides, not `timestamp`.

Each edit is a complete statement of the author-side state, not a patch. A field missing from the
effective edit is unedited, even if an earlier edit set it. A client that wants to keep an earlier
change MUST repeat it in every later edit.

In each comment update it publishes ([BSIP-5](./bsip-5.md)), the community:

- MUST set `edit` to the effective edit exactly as signed: `signature` and every field listed in its
  `signedPropertyNames`, unmodified, so that it verifies on its own;
- MUST omit `edit` when the comment has no effective edit, and MUST NOT put any other object there;
- MUST NOT copy the edit's `reason` into the comment update's top-level `reason`, which belongs to
  moderators ([BSIP-8](./bsip-8.md));
- SHOULD publish a new comment update promptly after accepting an edit.

A community MUST NOT accept an edit it cannot later reproduce byte-for-byte. pkc-js rebuilds the
stored edit before committing it and rejects the publication if the rebuilt copy no longer verifies.

### Presentation

Given a comment record `C`, its comment update `U`, and `E = U.edit`, a client displays:

- **deleted**: `E.deleted === true`.
- **content**: `E.content` when it is a non-empty string, otherwise `C.content`.
- **spoiler**: `U.spoiler` when it is a boolean, otherwise `E.spoiler` when it is a boolean,
  otherwise `C.spoiler`. **nsfw** follows the same rule.
- **flairs**: `U.flairs` when present, otherwise `E.flairs` when present, otherwise `C.flairs`.
- **author flairs**: `U.author.community.flairs` when present, otherwise `E.author.flairs` when
  present, otherwise `C.author.flairs`.
- **reason**: `U.reason` is the moderator's reason. `E.reason` MUST be presented, if at all, as the
  author's edit note and never as a moderation reason.
- Every other field, including `title` and `link`, from `C`.

Values set by moderators therefore take precedence over the author's edit whichever was published
later. Clients SHOULD indicate that a comment was edited when `U.edit` is present, and MAY offer the
original text from `C`.

### Verification by clients

In addition to verifying the comment update ([BSIP-5](./bsip-5.md)), a client that receives
`U.edit` MUST check that:

1. the edit's signature verifies under [BSIP-2](./bsip-2.md#signatures), using the edit's own
   `signedPropertyNames`;
2. the edit's `signature.publicKey` equals the comment record's `signature.publicKey`;
3. the edit's `commentCid` equals the comment update's `cid`.

If any check fails, the client MUST treat the comment update as invalid.

### Deletion

An edit with `deleted: true` deletes the comment. Deletion is final:

- Once a deletion is accepted, BSIP-4's checks on the targeted comment (see
  [Validation](#validation)) reject every further edit of the comment, including one with
  `deleted: false`, as well as votes and replies on it, and every publication in a deleted post's
  thread except moderations. The deletion edit therefore stays the effective edit.
- A comment is deleted exactly when its comment update's `edit.deleted` is `true`.
- A deleted comment is not counted in its ancestors' `replyCount`, `childCount`, `lastChildCid`, or
  `lastReplyTimestamp` ([BSIP-5](./bsip-5.md)); the present replies under a deleted reply still
  count.
- Page contents are governed by [BSIP-3, Pages](./bsip-3.md#pages). By default pkc-js leaves
  deleted posts out of the community's posts pages and keeps deleted replies in reply pages, where
  clients render them as tombstones.
- Deleting a comment that is pending approval or has been disapproved removes it from the community
  entirely, as a purge would ([BSIP-8](./bsip-8.md)).
- An author cannot delete a comment a moderator has removed, because those checks reject any edit
  of a removed comment.

Deletion does not erase content. The comment record stays content-addressed, the community keeps
serving it until a moderator purges it, and peers may hold copies. Clients SHOULD NOT display the
content, title, or link of a deleted comment.

### Ordering, timestamps, and limits

- Beyond the acceptance window of [BSIP-4](./bsip-4.md#publication-acceptance) and the rule that an
  edit is not older than its comment, an edit's `timestamp` has no effect. It does not order edits.
- When several edits for one comment arrive close together, the one the community accepts last is
  the effective edit. Authors SHOULD wait for one edit's `CHALLENGEVERIFICATION` before publishing
  the next.
- There is no protocol limit on how many edits a comment receives or on how long after publication
  it may be edited, other than the locked and archived states. The publication size limit of
  [BSIP-4](./bsip-4.md#publication-acceptance) applies to the whole edit. Communities limit edit
  volume through their anti-spam challenges ([BSIP-3](./bsip-3.md#anti-spam-configuration)).

## Rationale

- **An author-signed edit inside a community-signed update** lets the community attach the edit
  without being able to forge the author's words, and lets readers verify it with no extra fetch.
- **Snapshots instead of patches** keep the comment update to a single, self-contained edit. Readers
  need no edit history, and a community cannot change the meaning of an edit by dropping an earlier
  one. The cost is that clients must resend fields they want to keep.
- **Acceptance order instead of timestamps.** Timestamps are chosen by the author within a window,
  so two edits can arrive out of timestamp order. The community already decides what the comment
  update says; letting it order edits avoids a second, conflicting clock.
- **Final deletion** removes delete and undelete churn, gives tombstones a stable meaning, and lets
  communities reject activity under deleted content without tracking history.
- **Key matching only.** Authorship is a property of the signing key. Roles govern a community's
  moderation, which [BSIP-8](./bsip-8.md) handles with a separate, community-asserted mechanism.
- **Re-signing under the alias** keeps pseudonymous comments verifiable by readers without revealing
  which original key wrote them.

## Backwards Compatibility

- Comment updates published by older nodes can carry an `edit` with the legacy `subplebbitAddress`
  field (the former single community-address field) or an `author.address` field, listed in that
  edit's `signedPropertyNames`. Clients MUST verify such edits with their own `signedPropertyNames`
  and SHOULD accept them. Communities reject new edits that carry `subplebbitAddress` or
  `communityAddress` ([BSIP-4](./bsip-4.md#publication-acceptance)).
- Signed fields a community does not understand are kept and carried in `U.edit`, so newer clients
  can add edit fields without breaking older communities. Clients ignore edit fields they do not
  understand. Under pseudonymity such fields may be dropped when the community re-signs the edit.
- Check 3 of [Verification by clients](#verification-by-clients) is new in this BSIP. Edits placed
  by an honest community always satisfy it.

## Security Considerations

- **Authorization bypass.** The only valid authorization is equality between the edit's signing key
  and the key that signed the comment (or the recorded original key under pseudonymity). A community
  that matched on `author.name`, a runtime author address, or a role would let anyone who claims a
  name edit or delete other people's comments.
- **Forged and transplanted edits.** A community cannot forge an edit of a comment signed by its
  author's own key. It can choose which accepted edit to show, or withhold edits, within its general
  authority over comment updates ([BSIP-5](./bsip-5.md)). Without check 3 of
  [Verification by clients](#verification-by-clients), a community could attach a genuine edit of
  one comment to another comment by the same author, for example showing a deletion or replacement
  text on a comment the author never edited. Clients MUST perform that check.
- **Pseudonymous comments.** The community holds every alias private key, so for a pseudonymous
  comment it can sign any edit it likes. Readers cannot tell such an edit from one the author asked
  for; trust in edits of pseudonymous comments is trust in the community.
- **Replay.** A replayed edit is rejected as a duplicate by signature, and outside the timestamp
  window. The signed `communityPublicKey`, `communityName`, and `commentCid` stop an edit from being
  replayed to another community or onto another comment.
- **Deletion is not erasure.** Authors and clients MUST NOT treat deletion as removal of data.
  Copies of the comment record persist with the community until purged and with any peer that
  fetched it.
- **Bait and switch.** An author can collect votes and replies and then replace the content.
  Clients SHOULD mark edited comments, and communities that care MAY lock or archive posts to freeze
  them.
- **Abuse.** Each accepted edit forces the community to republish a comment update. Edits pass
  through the community's challenges like any publication, and communities SHOULD rate-limit them.
- **Author flairs in edits.** Clients use `E.author.flairs` as author flairs (see
  [Presentation](#presentation)), but pkc-js does not check those flairs against the community's
  `authorFlairs` feature and `flairs.author` list. Communities SHOULD apply to an edit's
  `author.flairs` the same rules they apply to a comment's author flairs.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
