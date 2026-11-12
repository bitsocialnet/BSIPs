---
bsip: 19
title: Directories
description: Named slots such as /biz/ that communities compete for, and how every client resolves a slot to the same current winner.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues/23
status: Draft
type: Standards Track
category: Application
created: 2026-11-06
requires: 2, 3, 10, 15, 18
---

## Abstract

A **directory** is a named slot in a client's navigation, such as 5chan's `/biz/` ("Business &
Finance"), Seedit's `/s/funny`, or a Bitsocial Forum section, that any number of communities compete
for. The client opens whichever candidate currently ranks first, the **winner**, so no community
owns the slot for good, and another community can replace the winner by outranking it. Losing
deletes nothing: every candidate keeps its address, posts, and subscribers. Today the ranking comes
from curated files; holder voting is meant to replace the curators.

This BSIP defines directory codes and the namespaces they belong to; the JSON files that list a
directory's candidates and define the directory (title, rules, NSFW classification, feature
defaults); the deterministic ranking that picks the winner from those files today; how holder voting
over pubsub ([BSIP-18](./bsip-18.md)) plugs into that ranking; how a client resolves a directory to a
community address and what it does when there is no winner or the winner is unreachable; the rule
that subscriptions and durable links name communities by address, never by code; and how clients
present a change of winner. Which codes exist, how a slot is styled, and which settings a candidate
must publish stay with each app.

## Motivation

A directory code is shared state. Users type `/biz/`, paste links that contain it, and expect two
clients to open the same board. If independent clients rank candidates differently, the same code
opens different communities. If a client stores the code instead of the community it resolved to, a
change of winner silently moves the user's subscriptions and links to a community they never chose.
If a client treats a temporarily unreachable winner as having lost, the winner depends on each
reader's connection instead of on the published data. 5chan, Seedit, and the Bitsocial Forum
implement directories with similar but not identical rules. This BSIP fixes the parts they must
share and names the parts each app decides on its own.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Terminology

- **Namespace**: the directories defined together for one family of clients, named by a short
  identifier: `5chan`, `seedit`, and, planned, `forum`. A namespace decides which codes exist and
  where its files are published.
- **Directory code**: the identifier of a directory within its namespace, such as `biz`, `funny`,
  or `pkc`. A directory is identified by its namespace and code together; `biz` in one namespace and
  `biz` in another are unrelated.
- **Candidate**: a community listed as competing for a directory.
- **Directory file**: the JSON file that lists one directory's candidates.
- **Defaults file**: the JSON file that defines every directory of a namespace, keyed by code.
- **Snapshot**: one published version of a directory file.
- **Winner**: the candidate that the [ranking](#ranking-and-the-winner) places first in a snapshot.
- **Shown community**: the community a client opens for a directory. It is the winner, except while
  the client shows a stand-in.
- **Stand-in**: a candidate other than the winner that a client shows because the winner is
  unreachable or fails the namespace's [hosting requirements](#hosting-requirements).

### Shared convention and app-specific parts

| Defined by this BSIP, for every namespace | Decided by each namespace |
| --- | --- |
| Code syntax, and how a route segment is recognized as a code | Which codes exist, and their order and grouping in navigation |
| Candidate entries and the ranking that picks the winner | Route syntax (`/biz/`, `/s/funny`) |
| Snapshot validity and ordering | Titles, descriptions, tags, rules, colors, and banners |
| Resolution, and behavior with no winner or an unreachable winner | Feature defaults and hosting requirements |
| Subscriptions and durable links by address | Whether winners are voted, and the contest criteria |
| How a change of winner is presented | Where its files are published |

The namespaces in use or planned today:

| Namespace | Client | Route | Codes | Candidates published in | File format | Voting |
| --- | --- | --- | --- | --- | --- | --- |
| `5chan` | [5chan](https://github.com/bitsocialnet/5chan) | `/<code>/`, for example `/biz/` | 65 listed, plus the hidden `trash` | `5chan-directories/` | [legacy](#legacy-format) | One contest per code on a test network; tallies shown, not used for winners |
| `seedit` | [Seedit](https://github.com/bitsocialnet/seedit) | `/s/<code>` | 11 | `seedit-directories/` | [format 1](#format-1) | None |
| `forum` (planned) | [Bitsocial Forum](https://github.com/bitsocialnet/bitsocial-forum), not released | `/s/<code>` | 10 sections | `src/data/sections.ts` in the client; planned `forum-directories/` | Planned format 1 | Planned |

The folders are in [bitsocialnet/lists](https://github.com/bitsocialnet/lists). The forum's sections
are directory codes: each section opens the winner among the communities that compete for it, and
the forum is never a single community.

### Directory codes

- A code MUST match `^[a-z0-9]+(-[a-z0-9]+)*$`: lowercase ASCII letters and digits, optionally in
  groups joined by single hyphens. Every current code does (`3`, `r9k`, `biz`, `todayilearned`,
  `off-topic`, `5chan`). Namespace identifiers follow the same syntax.
- A code contains no `.` and no uppercase letter, so it is never a name or a key address
  ([BSIP-10](./bsip-10.md#names)). A client can therefore tell a code from an address in the same
  route segment.
- Codes are compared as exact strings.
- A namespace's code set is defined by its client: fixed in the client (Seedit, the forum) or read
  from the namespace's defaults file (5chan). A client MUST treat a route segment as a directory
  code only when it is a code of the client's own namespace, and MUST then resolve it as that
  directory; any other segment is an address. A namespace MUST NOT define a code equal to a route
  segment its client reserves for something else.
- Where a client expands a bare label to a name (Seedit opens `/s/foo` as `foo.bso`), a code shadows
  that shorthand: a community named `funny.bso` is opened at `/s/funny.bso`, not at `/s/funny`.
- A code becomes public once a client ships it. It SHOULD NOT be renamed and MUST NOT be reused for
  a different topic, because links and quotes that contain it already exist.

### Directory files

A namespace publishes, in a folder named `<namespace>-directories/`:

- `<namespace>-<code>-directory.json`, one directory file per code; and
- `<namespace>-directories-defaults.json`, the defaults file.

No other file in the folder is a directory file, even if it is JSON. For example, 5chan's folder also
holds `bitsocial-seeder-communities.json`, a seeding list whose name deliberately does not match the
pattern. 5chan and Seedit fetch their files from
`https://raw.githubusercontent.com/bitsocialnet/lists/master/<folder>/<file>` and ship a copy of
every file in the client. A client SHOULD ship such a copy, so that its directories resolve when the
source is unreachable. The formats below do not depend on where the files are hosted.

#### Format 1

Format 1 is used by the `seedit` namespace. New namespaces MUST use it.

```jsonc
// seedit-directories/seedit-funny-directory.json
{
  "schemaVersion": 1,
  "revision": 1,
  "directoryCode": "funny",
  "description": "Communities competing for Seedit's /s/funny route. The highest-rated finalized candidate resolves the route. …",
  "tags": ["humor", "comedy", "jokes"],
  "rules": ["Every post must make a genuine attempt at humor.", "…"],
  "createdAt": 1783123200,
  "updatedAt": 1788286365,
  "communities": [
    {
      "address": "funny-posting.bso",
      "addedAt": 1783123200,
      "publicKey": "12D3KooWFL5oGc9p9CYs25eeK5cCpPXXhibECsnqmuxinq2jbtjP",
      "owner": "bitsocialist.bso"
    }
  ]
}
```

| Field | Type | Presence | Meaning |
| --- | --- | --- | --- |
| `schemaVersion` | integer | REQUIRED | `1`. |
| `revision` | integer | REQUIRED | Snapshot number, at least 1 ([Snapshots and revisions](#snapshots-and-revisions)). |
| `directoryCode` | string | REQUIRED | The code. It MUST equal the `<code>` in the file name. |
| `description` | string | OPTIONAL | What the file is. |
| `tags` | array of strings | OPTIONAL | Discovery keywords for the directory. |
| `rules` | array of strings | OPTIONAL | Baseline rules for the directory's communities. |
| `createdAt`, `updatedAt` | integer | OPTIONAL | Unix time in seconds. |
| `communities` | array of [candidates](#candidate-entries) | REQUIRED | The candidates, in no particular order. |

A reader MUST reject a format 1 file unless `schemaVersion` is `1`, `revision` is an integer of at
least 1, `directoryCode` equals the code the reader fetched the file for, and `communities` holds at
least one valid candidate.

#### Legacy format

The `5chan` namespace uses an older format without snapshot fields. Its files carry no
`schemaVersion`, `revision`, or `directoryCode`; the code is the `<code>` in the file name; and the
candidates are in `boards`.

```jsonc
// 5chan-directories/5chan-biz-directory.json
{
  "description": "Boards competing to host the /biz/ directory on 5chan. The highest-scoring board resolves the directory code; if it goes offline, 5chan rotates to the next-highest. …",
  "createdAt": 1779182014,
  "updatedAt": 1779212075,
  "boards": [
    {
      "address": "bizraelis.bso",
      "publicKey": "12D3KooWR7nTdKZqZ1twGWMfVsXYDGp1XAKUrnYznKP651jFrizE",
      "score": 1,
      "addedAt": 1779212075,
      "owner": "bitsocialist.bso"
    },
    {
      "address": "business-and-finance.bso",
      "publicKey": "12D3KooWNMybS8JqELi38ZBX897PrjWbCrGoMKfw3bgoqzC2n1Dh",
      "addedAt": 1779182014,
      "owner": "rinse12.bso"
    }
  ]
}
```

Besides `boards`, a legacy file MAY carry `description`, `createdAt`, `updatedAt`, `rules`, and
`hidden`. `hidden: true` marks a code that clients do not list in directory navigation; it is used
only by `5chan-trash-directory.json`, which exists so that seeders find the board. 5chan does not read
`hidden`: it pins `/trash/` to a fixed community in its code, so `/trash/` is not a directory in the
sense of this BSIP. A 5chan reader MUST accept candidates under `boards` and SHOULD also accept
`communities`. It MUST reject a file with no valid candidate.

#### Candidate entries

| Field | Type | Presence | Meaning |
| --- | --- | --- | --- |
| `address` | string | REQUIRED | The community's name or key address ([BSIP-10](./bsip-10.md#key-addresses)). |
| `publicKey` | string | RECOMMENDED | The community's identity key ([BSIP-10](./bsip-10.md#terminology)), as a key address, when the candidate was listed. For a delegated community, the anchor. |
| `score` | number | OPTIONAL | The first ranking key. Absent means 0. |
| `addedAt` | integer | OPTIONAL | Unix time in seconds when the candidate was added. Every current entry has it. |
| `owner` | string | OPTIONAL | The name or key address of whoever submitted or runs the candidate, as recorded by the curator. It is not verified. |
| `nsfw` | boolean | OPTIONAL | The curator's NSFW classification of the candidate. No current entry uses it. |
| `tags` | array of strings | OPTIONAL | Format 1 only. Discovery keywords for the candidate. No current entry uses it. |

- A reader MUST ignore a candidate whose `address` is neither a name nor a key address, and MUST
  ignore members it does not recognize.
- A file MUST NOT list one community twice: two entries with equivalent addresses
  ([BSIP-10](./bsip-10.md#name-equivalence)) or with the same `publicKey`. A reader keeps the first
  entry for an address and ignores later ones.
- A community SHOULD be a candidate for at most one code in a namespace. 5chan maps each community
  to a single code, and when one community would win two codes, it drops the code that comes later
  in its navigation order.

#### Invalid files

A reader that rejects a fetched file MUST keep the snapshot it already holds, from its cache or its
shipped copy, and MUST NOT treat the rejected file as an empty directory. Because both current
readers reject a file without candidates, a namespace retires a directory by removing its code, not
by publishing an empty file.

#### Defaults file

The defaults file defines each directory, independent of its candidates. It is an object with
`title`, `description`, `createdAt`, and `updatedAt` (Seedit's also carries `schemaVersion: 1` and a
`revision`, which its client does not read), and `directories`, an object that maps each code to an
entry:

```jsonc
// 5chan-directories/5chan-directories-defaults.json (one entry shown, rules abbreviated)
{
  "title": "5chan Directory Defaults",
  "description": "Expected 5chan UX defaults by directory code. …",
  "createdAt": 1779262179,
  "updatedAt": 1793786265,
  "directories": {
    "biz": {
      "directoryCode": "biz",
      "title": "/biz/ - Business & Finance",
      "features": {
        "pseudonymityMode": "per-post",
        "safeForWork": true,
        "hasFlags": false,
        "requirePostLink": true,
        "requirePostLinkIsMedia": true,
        "requireReplyLinkIsMedia": true,
        "bumpLimit": 300,
        "noSpoilers": true,
        "noSpoilerReplies": true,
        "noUpvotes": true,
        "noDownvotes": true,
        "postsPerPage": 20
      },
      "rules": [
        "All discussion should pertain to business, finance, and economics related topics. …",
        "…",
        "No bots or AI posters. Every post must be written by a person: …"
      ]
    }
  }
}
```

An entry's `directoryCode` MUST equal its key. Its other members define the directory:

- `title`: the display title. 5chan titles follow `/<code>/ - <Name>`. A defaults entry's `title`
  takes precedence over any `title` in the directory file.
- `description` and `tags` (`seedit`): what the directory covers. Seedit prefers the defaults
  `description` and the directory file's `tags`.
- `features` (`5chan`): the settings a candidate community is expected to publish in its own
  `features` ([BSIP-3](./bsip-3.md#features)). Names that BSIP-3 defines carry their BSIP-3
  meaning. Others belong to the namespace: 5chan reads `hasFlags` and `postsPerPage`, and
  `bumpLimit` documents the expected bump limit, which 5chan Board Manager takes from its own
  configuration. A directory's `features` never change what a community accepts; only the
  community's own record does.
- `rules` (`5chan`): the directory's rules, which a candidate is expected to enforce. Seedit keeps
  its directory rules in the directory file instead.

A directory is classified NSFW when its `features.safeForWork` is `false`. A client SHOULD treat the
shown community as NSFW when the directory, its candidate entry, or the community's own
`features.safeForWork` ([BSIP-3](./bsip-3.md#features)) classifies it so. It SHOULD NOT let a
community's own `safeForWork: true` override a directory classified NSFW, since that setting is
editable by the community.

#### Hosting requirements

A namespace MAY define requirements that a candidate's community record must meet before the client
shows it. A client MUST evaluate them only against a record of the candidate it has verified
([BSIP-3](./bsip-3.md#signing)) and that is signed for the candidate's own identity key, and MUST NOT
use the record of another key that carries the same name. Requirements do not change the winner. They
decide [stand-ins](#unreachable-winner), and a client MAY refuse a vote for a community that fails
them.

The `5chan` requirements are built from the directory's defaults entry, with the directory file's
`features` as a fallback. A community record meets them when:

1. `features.pseudonymityMode` equals the directory's, if the directory sets one;
2. `features.safeForWork` is `true` when the directory's is `true`, and is not `true` when the
   directory's is `false`;
3. `features.requirePostLinkIsMedia` is `true` when the directory's is `true`;
4. neither `features.maxPostGalleryItems` nor `features.maxReplyGalleryItems` is a number greater
   than 0;
5. at least one public challenge descriptor has `pendingApproval: true`
   ([BSIP-3](./bsip-3.md#anti-spam-configuration)); and
6. the directory's `rules`, taken from the defaults file only, are the first entries of the
   community's `rules`, in the same order, each equal after trimming whitespace.

Uptime, real enforcement of the rules, and thread archiving cannot be read from a record and are left
to curation.

### Ranking and the winner

A client ranks a snapshot's candidates by:

1. `score`, descending, where an absent `score` counts as 0;
2. then `addedAt`, ascending, where an absent `addedAt` sorts after every present one;
3. then `address`, ascending, compared by UTF-16 code units, not by locale collation.

The first candidate is the winner. Since addresses in a file are distinct, the order is total and
the same on every client. The winner is a function of the snapshot alone: reachability, requirement
checks, local settings, and live vote tallies MUST NOT change it.

In today's files, a community joins a directory by a pull request to its directory file, and
`score` is set by hand by the maintainers who merge changes. This is a bootstrap step until voting
decides winners.

#### Snapshots and revisions

In format 1, `revision` orders the snapshots of one directory:

- A publisher MUST increase `revision` whenever the set of candidate addresses or the winner
  changes, and MAY keep it when only other members change (the description, tags, rules, or a score
  that leaves the winner in place).
- A reader that holds a snapshot MUST ignore a fetched file with a lower `revision`, MUST reject a
  file with the same `revision` whose set of candidate addresses or whose winner differs from the
  one it holds, and replaces its snapshot with a file of higher `revision`. The copy shipped in the
  client is the first snapshot a reader holds.

Legacy files have no revision. A reader takes the newest file it fetches and cannot tell a rollback
from an update (see [Security Considerations](#security-considerations)).

### Winners decided by voting

Winners are meant to be decided by holder voting over pubsub ([BSIP-18](./bsip-18.md)) instead of
by pull requests. 5chan runs these contests today, but their results do not yet pick winners.

- **Contests.** A namespace that votes runs exactly one contest per code. Its criteria are derived
  from a manifest of shared defaults and one entry per contest, published next to the directory
  files and processed as BSIP-18 specifies. For 5chan the manifest is
  [`5chan-directory-criteria.jsonc`](https://github.com/bitsocialnet/lists/blob/master/5chan-directory-criteria.jsonc),
  generated from the defaults file. It holds one contest for each of the 65 listed codes, gated on
  the 5chan Pass on Base Sepolia with one vote per holder. Each `contestId` encodes its code:
  `5chan-dir-<code>-vote-test-<n>` for the current test-network contests, and
  `5chan-dir-<code>-vote-<n>` expected on mainnet. A client MUST reject a manifest in which two
  contests encode the same code, or a contest whose `contestId` encodes no code.
- **Matching tally rows to candidates.** A ballot names a community by `publicKey` and an optional
  `name`, and tally rows are keyed by `publicKey` (BSIP-18). A row belongs to the candidate whose
  `publicKey` equals the row's. For a candidate without `publicKey`, the row belongs to it when the
  row's `name` equals the candidate's `address` and the tally reports that name as resolved to the
  row's key. Every other row with positive weight is a **nomination**: a community that voters
  back but the snapshot does not list. Voting for an unlisted community is how 5chan users nominate
  one. Clients MAY show nominations, but a nomination is not a candidate.
- **Effect today.** A tally MUST NOT change the winner. A client MAY show each candidate's weight
  and MAY order its listing of a directory's candidates by weight. 5chan orders by weight only when
  the contest does not run on a test network, so on the current contests the tally is shown and the
  listing keeps the file's order.
- **How voting plugs in.** Voting enters at the first ranking key: a finalized tally's weight is
  meant to take the place of `score`, with the later keys unchanged. 5chan's candidate listing
  already orders by weight first. How a live tally is finalized into a snapshot, and who publishes
  that snapshot, is not yet decided ([Open questions](#open-questions)).

### Resolving a directory

To open a route segment `s` in namespace `N`, a client:

1. treats `s` as an address if it is not a code of `N`, opens it as any community
   ([BSIP-3](./bsip-3.md#fetching-the-community-record)), and stops;
2. takes the newest valid snapshot of the directory that it holds or can fetch, from the network, its
   cache, or its shipped copy, following [Snapshots and revisions](#snapshots-and-revisions);
3. if it has no snapshot, or the directory has no candidates, applies [No winner](#no-winner);
4. ranks the candidates and takes the winner's `address`;
5. opens that address as any community: it verifies the name if the address is one
   ([BSIP-10](./bsip-10.md#verifying-a-community-name)) and loads the community record
   ([BSIP-3](./bsip-3.md#fetching-the-community-record)); and
6. applies [Unreachable winner](#unreachable-winner) while the winner is unreachable, or while it
   fails the namespace's hosting requirements.

Clients SHOULD refresh snapshots periodically. 5chan and Seedit refetch at most once an hour after a
success, retry at most once a minute after a failure, and give up on a fetch after 10 seconds.

#### No winner

A directory without candidates has no winner. A client MUST NOT open another community in its place:
not another directory's winner, not a default community, not a search result. It SHOULD show the
directory's definition and say that no community holds it; the forum does this for sections that
have no candidate yet. 5chan does not route a code that has no candidates.

#### Unreachable winner

When the winner cannot be reached, or fails the namespace's hosting requirements, a client does one
of the following:

- **Keep the winner.** The client keeps opening the winner and reports it as unreachable. Seedit and
  the forum do this.
- **Show a stand-in.** The client shows another candidate, chosen from the same ranking. 5chan does
  this: it walks the ranked candidates and skips those it considers unreachable. It shows the first
  reachable candidate, unless that candidate's loaded record fails the hosting requirements; in that
  case it shows the next reachable candidate whose loaded record meets them. If no reachable
  candidate meets them, it shows the first reachable one, and if none is reachable, the winner.
  5chan considers a candidate unreachable when the newest record it holds is 30 minutes old or more,
  or when loading the record has failed. A candidate that is still loading is not unreachable. 5chan
  re-evaluates its choice whenever its stored records change, and at least every 30 seconds.

A stand-in is a local, temporary display choice. A client MUST NOT record or publish a stand-in as
the directory's winner, and MUST NOT let one trigger [change-of-winner](#change-of-winner) handling.
Directory listings, such as 5chan's home page, show the winner.

### Links, subscriptions, and stored references

1. A directory code is a route, not a community identity. A client MUST NOT store a code where a
   community identity is expected: in subscriptions, followed or blocked lists, default-subscription
   lists, moderation settings, or any signed field. Subscribing from a directory route subscribes to
   the exact address of the shown community.
2. A link that is meant to keep pointing at one community MUST name it by its address. Examples are
   the forum's `/c/<address>` and `/c/<address>/t/<cid>`, and Seedit's post permalinks. A link by
   code, such as `/biz/` or `/s/funny`, is a link to the directory and follows its winner.
3. A link to a comment SHOULD name the comment's community by address. A client that opens a link
   that combines a code with a comment CID MUST load the comment by its CID
   ([BSIP-2](./bsip-2.md#addressing-and-fetching)) and take its community from the comment record's
   own addressing fields ([BSIP-2](./bsip-2.md#community-addressing)), not from the code's current
   winner. It MAY then rewrite the displayed URL to that community.
4. A client MAY display the code in place of the address of the community it currently shows at that
   code, for example `/a/thread/<cid>` for a thread of the shown `/a/` community, provided rules 1–3
   hold.
5. Comment content that refers to a directory, such as a 5chan cross-board quote `>>>/biz/123`,
   refers to the slot, and a client resolves it against the directory's current winner when it
   displays the content. Authors and clients SHOULD refer to a specific community by address in
   signed content.
6. To decide whether a community is a directory's candidate, winner, or shown community, for
   example to display a badge or to show the code in its URL, a client MUST compare addresses with
   name equivalence ([BSIP-10](./bsip-10.md#name-equivalence)) or compare identity keys.

A list that stores a community chosen through a directory MAY record the code and the revision that
chose it next to its exact address. Seedit's default-subscription list records them as
`directoryCode` and `directoryRevision`.

### Change of winner

The winner changes when a snapshot with a higher `revision` ranks a different candidate first. With
voting, a finalized tally will be another source of new snapshots. A community that loses keeps its
address, posts, and subscribers, and every link by address keeps working.

- A client MUST NOT change a user's subscriptions, or anything else it stores by address, because
  the winner changed, except under automatic switching that the user enabled for that directory.
- A client that tracks which subscriptions came from a directory SHOULD record, per directory, the
  exact address it subscribed through that directory and the address and revision of the last winner
  the user acknowledged. When a snapshot with a higher revision than the acknowledged one names a
  winner other than the tracked address, the client SHOULD ask the user whether to switch to the new
  winner, keep both, or keep the current community. A newer snapshot whose winner is the tracked
  address is acknowledged without asking, so a winner that changes back and forth is reported each
  time it changes away from the user's community.
- Automatic switching MUST be opt-in per directory. It MUST replace only the address associated with
  that directory, and MUST keep an address that the user subscribed to directly or through another
  directory. It SHOULD show a notice with an undo action. Undo restores the previous subscription and
  turns automatic switching off for that directory.
- Prompts and automatic switches MUST be driven only by snapshots with a strictly higher revision,
  never by stand-ins, reachability, or live tallies. A namespace without revisions (the legacy
  format) therefore gives clients nothing to prompt on. 5chan does not prompt.
- A client SHOULD show which community currently holds a directory, by address, and SHOULD let users
  reach the other candidates. The forum shows "held by" with the winner's address and lists the other
  communities; 5chan and Seedit each have a page that lists a directory's candidates.

### Directory files and community lists

A directory file is not a community list ([BSIP-15](./bsip-15.md)). It is unsigned, it changes in
place at a fixed path, it carries ranking members, and its snapshots are ordered by `revision`
rather than addressed by CID. A client MUST NOT treat a directory file as a signed community list, or
a community list as a directory snapshot. A namespace MAY also publish a community list of its
candidates for feeds or search across its directories, as the forum plans for its cross-section view.
Entries in such a list carry no rank and do not decide winners.

## Rationale

- **A code is a route, not an identity.** The value of a directory is that its winner can change. Any
  stored reference that follows the winner (a subscription, a permalink, a quote) moves with it, to a
  community the user never chose. Storing the address keeps the user's choices with the user, and
  makes winning a directory a way to reach new visitors, not to take existing subscribers.
- **The winner belongs to the snapshot.** If reachability decided the winner, readers on different
  networks would disagree, and anyone able to make a winner unreachable for some users would take the
  slot for them. Stand-ins keep 5chan's failover as a local display choice without making it the
  winner, and without letting it move subscriptions.
- **A total, locale-independent order.** Most entries carry no `score`, so ties are the normal case
  and the order must be total: `addedAt`, then `address`. Locale collation differs between
  runtimes and settings; UTF-16 code-unit comparison does not.
- **Revisions.** A change of winner is something users are asked about, so it has to be a discrete,
  ordered event. A revision makes it one, and lets a reader refuse both a rollback and a silent
  same-revision swap.
- **Namespaces chosen by client developers.** A code set controls navigation, not content: moderation
  belongs to each candidate community, and anyone can fork a client with different codes. A global
  code registry would need an allocator, which is the central veto directories exist to remove.
- **Files in a public repository, as a bootstrap.** Pull requests give public review and history with
  no infrastructure. Their weakness is that the repository's maintainers decide every winner; voting
  is the planned replacement.
- **Not a community list.** A community list is immutable by design: each revision is a new CID that
  its adopters review again, and clients never move to a newer revision on their own
  ([BSIP-15](./bsip-15.md)). A directory needs the opposite, a stable slot whose winner changes.
  Pointing a slot at "the newest list" would recreate the unreviewed, mutable trust delegation that
  BSIP-15 rejects.
- **Requirements decide stand-ins, not winners.** Requirements are checked against records that each
  client loads on its own schedule. Letting them change the winner would make the winner depend on
  which records a reader happened to load.

### Open questions

- **Finalizing a tally.** A live tally converges over time ([BSIP-18](./bsip-18.md)), and its tie
  break changes every bucket, so two readers can briefly rank a contest differently. One option is to
  read the winner from the live tally once its leader is locked. Another is to publish tallies as
  format 1 snapshots, with weight in `score` and a new `revision`, at bucket boundaries. The second
  keeps revisions as the boundary for change-of-winner prompts, but needs a publisher that every
  client accepts. Undecided.
- **Nominations.** Whether a nominated community can win without first being added to the directory
  file.
- **Requirements and the winner.** Whether hosting requirements become part of the shared winner
  rule, so that every client passes over a top candidate that fails them, or stay a stand-in policy.
  As long as they decide only stand-ins, the winner can be a community that 5chan never shows.
- **5chan's format.** Whether the `5chan` namespace moves to format 1 with revisions, and whether its
  preference for developer-owned candidates (see [Backwards Compatibility](#backwards-compatibility))
  is dropped or moved into the data.
- **Who votes.** 5chan expects 5chan Pass holders to vote, with final governance still being designed
  to include BSO holders. Who votes on forum sections is open, and balance-weighted voting is deferred
  in BSIP-18.
- **Distribution.** Files are fetched from GitHub over HTTPS and are unsigned. Whether snapshots
  should be signed and fetched over Bitsocial transports, and in what record format, is undecided.

## Backwards Compatibility

This BSIP describes conventions that 5chan and Seedit already implement, with these exceptions:

- **Two file formats.** The `5chan` namespace uses the legacy format and Seedit uses format 1.
  Readers of each namespace accept that namespace's format. 5chan's per-code files replaced a single
  `5chan-directories.json` (one `directories` array whose entries carried `directoryCode`, `title`,
  `features`, `name`, and `publicKey`); 5chan still accepts that shape from old caches.
- **5chan's ranking.** Between `score` and `addedAt`, 5chan prefers candidates whose `owner` appears
  in its own list of known 5chan developers, and it compares addresses with locale collation. This
  changes no current winner: every 5chan file with more than one candidate breaks the tie on `score`.
  Before two candidates of a 5chan directory tie on `score`, 5chan must drop the preference or the
  namespace must move it into its data.
- **5chan's links.** 5chan's share links name a thread as `/<code>/thread/<cid>` when the thread's
  community is the directory's winner, which rule 3 of
  [Links, subscriptions, and stored references](#links-subscriptions-and-stored-references)
  discourages. They survive a change of winner because 5chan loads the thread by CID and redirects
  to the thread's own community. 5chan's cross-board quotes (`>>>/<code>/<number>`) follow the
  current winner, as rule 5 describes.
- **Address matching.** 5chan matches candidate addresses after stripping a trailing `.bso` or `.eth`,
  which is looser than name equivalence: it also matches the bare label.
- **NSFW.** Seedit lets a community's own `features.safeForWork` override the candidate entry's
  `nsfw`. No current entry carries `nsfw`, so no displayed classification differs today.
- **The forum.** The forum's candidates are hardcoded in its client, highest-ranked first, without
  `score`, `addedAt`, or revisions. Its plan is to move them to `forum-directories/` in format 1.

## Reference Implementation

Non-normative.

- **Data.** [bitsocialnet/lists](https://github.com/bitsocialnet/lists): `5chan-directories/`,
  `seedit-directories/`, and `5chan-directory-criteria.jsonc`.
- **5chan.** In [bitsocialnet/5chan](https://github.com/bitsocialnet/5chan): parsing and ranking in
  `src/lib/utils/directory-list-utils.ts` (`normalizeDirectoryList`, `sortByDirectoryRank`);
  loading, caching, and the shipped copy in `src/hooks/use-directories.ts`,
  `src/hooks/use-directory-list.ts`, and `src/lib/utils/vendored-directory-lists.ts`; route
  resolution and stand-ins in `src/hooks/use-resolved-community-address.ts` and
  `pickDirectoryWinner`; hosting requirements in `src/lib/directory-board-requirements.ts`; contests
  and tally ranking in `src/lib/directory-vote-criteria.ts` and `src/lib/directory-vote-ranking.ts`;
  thread URL correction in `src/views/post/post.tsx`.
- **Seedit.** In [bitsocialnet/seedit](https://github.com/bitsocialnet/seedit): format 1 validation,
  ranking, and revision checks in `src/lib/utils/directory-list-utils.ts`
  (`normalizeRemoteDirectoryList`); route resolution in `src/hooks/use-resolved-community-route.ts`;
  change-of-winner handling in `src/lib/utils/directory-subscriptions.ts`.
- **Bitsocial Forum.** In
  [bitsocialnet/bitsocial-forum](https://github.com/bitsocialnet/bitsocial-forum): sections in
  `src/data/sections.ts`, `src/lib/sections.ts`, and `src/views/section/section.tsx`; the design in
  `docs/architecture.md`.
- **Voting.** [`@bitsocial/pubsub-voting`](https://github.com/bitsocialnet/pubsub-voting)
  (`deriveDirectoryCriteria` and the contest tally).
- **Seeding.** [bitsocial-seeder](https://github.com/bitsocialnet/bitsocial-seeder) seeds, by default,
  every candidate in every JSON file of `5chan-directories/` and `seedit-directories/` other than
  the defaults files, and every contest of the 5chan manifest. Seeding losing candidates keeps them
  reachable, so a stand-in or a new winner is already seeded.
- **Documentation.** [docs.bitsocial.net/directories](https://docs.bitsocial.net/directories).

## Security Considerations

- **Curator trust.** Whoever can change a directory file, or the host it is fetched from, decides the
  winner and can point a popular route at any community, including one with illegal content. Today
  that is the maintainers of bitsocialnet/lists and GitHub. The mitigations are public review of every
  change, revisions that make each change of winner a visible event, clients that never move
  subscriptions without consent, and shipped copies that keep directories working when the source is
  down. None of them prevents a malicious new revision. Voting is meant to remove the curator.
- **Rollback.** A legacy file has no revision, so a stale cache or a source serving an old file can
  restore a previous winner unnoticed. Format 1 readers refuse lower revisions, but a reader that
  has never seen a newer revision cannot know one exists.
- **Names in `address`.** A candidate listed by name follows the name. If its owner repoints the
  name ([BSIP-10](./bsip-10.md#key-migration)), the directory opens the new key without a new
  revision. Curators SHOULD list `publicKey`, and a client MAY warn when the identity key it loads
  differs from the listed `publicKey`. Vote tallies count by `publicKey`, so a repointed name does not
  carry the old key's votes.
- **Forcing stand-ins.** Under a stand-in policy, anyone who can make the winner unreachable for some
  users, for example by attacking its node, sends those users to the next candidate. A competing
  candidate gains from doing so. 5chan does not currently mark a stand-in as such. The winner and
  every change-of-winner prompt are unaffected, because stand-ins never become winners.
- **Requirement checks.** Checking requirements against an unverified record, or against the record
  of another key that claims the same name, would let a community appear to meet them. Requirements
  are therefore checked only against a verified record signed for the candidate's own key.
- **References by code.** Content and links that name a code change meaning when the winner changes:
  a 5chan quote `>>>/biz/123` written about one board points at post 123 of the next winner. Clients
  that render such references cannot tell readers which board the author meant.
- **Votes.** The security of contests, including gating, weight, and tie breaks, is specified in
  [BSIP-18](./bsip-18.md). A live tally is not a finalized result, which is why it does not yet change
  winners.
- **Privacy.** Fetching directory files from a central host tells that host the client's network
  address and when it runs. 5chan and Seedit also fetch a directory's file when the user opens that
  directory, at most once an hour, which tells the host which directories the user visits.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
