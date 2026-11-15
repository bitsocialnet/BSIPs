---
bsip: 21
title: .bso Website Resolution
description: Resolves .bso websites through ENS-compatible contenthash records, native browsers, and HTTPS gateways.
author: Tommaso Casaburi (@tomcasaburi)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues
status: Draft
type: Standards Track
category: Application
created: 2026-11-12
requires: 13
---

## Abstract

This BSIP defines how a `.bso` name points to a website on IPFS. Owners publish an ENS-compatible
`contenthash` record in the registry of [BSIP-13](./bsip-13.md). Browsers and HTTPS gateways read the
same record and load the same content. A browser with native support can open `5chan.bso`; an
ordinary browser can open it through a gateway such as `https://5chan.bso.limo/`.
The gateway is a replaceable access service, not the authority over the name. This proposal reuses
the registry's existing contenthash interface and does not introduce a new text-record key.

## Motivation

The `.bso` registry gives Bitsocial names their own ownership and records, but an identity record
alone does not tell a browser where to find an application's website. Website owners need one
record that works across native browsers and independently operated gateways. Visitors should not
need a browser extension or a wallet just to read a site.

An app such as 5chan can publish its frontend to IPFS, associate it with `5chan.bso`, and offer both
native and ordinary HTTPS access. Updating the website changes its contenthash without changing
the name or requiring each gateway operator to update a private routing table.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Scope

This specification defines the website record, its resolution, and an HTTPS name-gateway profile.
A native browser implements the record and resolution rules; a conforming name gateway implements
those rules and the gateway profile. IPFS websites are REQUIRED. IPNS, Swarm, ordinary HTTP URL
records, and other content types are outside this version's interoperable profile.

`bso.limo` is an example gateway domain proposed for operation by Bitsocial Forge. No implementation
is required to use it, and it receives no registry privileges. Its branding, deployment, hosting
plans, and availability are outside this standard. References to it below do not assert that the
service is deployed.

### Website record

The authoritative website record is the bytes returned by:

```solidity
function contenthash(bytes32 node) external view returns (bytes memory);
```

The call targets the `.bso` registry identified by BSIP-13, on its specified chain. `node` is the
namehash of the complete, ENS-normalized `.bso` name. Implementations MUST use this exact overload;
the upstream contract also exposes `contenthash(uint256)` with a different ABI selector.

The record MUST use [ENSIP-7](https://docs.ens.domains/ensip/7) contenthash encoding. For IPFS it is
the unsigned-varint `ipfs-ns` multicodec code `0xe3`, followed by the binary CIDv1, with no textual
multibase prefix. The leading bytes are therefore `e3 01`, followed by the CID bytes. A publisher
accepting a CIDv0 input MUST convert it to its equivalent CIDv1 before encoding it.

The text `ipfs://<cid>` is a human-readable representation, not the stored bytes. A bare CID string,
an HTTP gateway URL, and a `text(node, "contenthash")` record are not substitutes. The contenthash
identifies the content root; it does not contain a URL path, query, or fragment. Publishers SHOULD
use a UnixFS directory containing `index.html` as the website root.

The upstream contract pinned by BSIP-13 already provides these operations:

```solidity
function setContenthash(uint256 tokenId, bytes calldata hash) external;
function contenthash(bytes32 node) external view returns (bytes memory);
function supportsInterface(bytes4 interfaceId) external view returns (bool);
```

Here `tokenId = uint256(node)`, `supportsInterface(0xbc1c58d1)` is true, and only the active name's
owner may call `setContenthash`. Passing empty bytes clears the website record. These are existing
contract behaviors, not new permissions granted to a gateway or build service. A publisher MUST
ENS-normalize the name before computing its token ID.

### Resolution

For a requested website name, a resolver MUST:

1. Normalize the complete name using [ENSIP-15](https://docs.ens.domains/ensip/15), rejecting invalid
   names. Require at least one label before the final `.bso` label.
2. Compute its [namehash](https://eips.ethereum.org/EIPS/eip-137), retaining the `.bso` suffix.
3. Call `contenthash(bytes32)` on the BSIP-13 registry. Unlike ENS lookup, this does not first look
   up a resolver contract in the ENS registry.
4. Treat empty bytes as **no website**. This includes unset records and names made inactive by
   expiry, ancestor expiry, or reclamation under BSIP-13. A failed RPC call is a **resolution
   failure**, not evidence that the record is empty.
5. Decode the entire record. Reject malformed varints, malformed or incomplete CIDs, and trailing
   bytes. A well-formed contenthash for a protocol outside this profile is **unsupported content**;
   it MUST NOT be interpreted as IPFS. A valid IPFS CID whose codec or hash the implementation
   cannot process is also unsupported content.
6. Retrieve the IPFS content rooted at the decoded CID, with the requested resource path resolved
   below that root. An unavailable root is a retrieval failure; it does not make the name unset.

Resolvers MUST NOT fall back to the matching `.eth` name, an ancestor's record, the `bitsocial`
text record, DNSLink, or an operator-maintained replacement record. Each subname has its own
contenthash. Website resolution does not require a non-empty `bitsocial` record and does not
establish a Bitsocial community's identity. BSIP-13's transition check against an ENS `bitsocial`
record applies to identity resolution, not to this website record.

An implementation MAY use a local chain node or a configured RPC service. It MUST bind its
configuration to the published chain ID and registry address, rather than accepting either from
the website being resolved. The registry address is still TBD in BSIP-13; this draft supplies no
deployment address.

### Caching and updates

Name-to-contenthash results, including empty results, MUST be revalidated at least every 300 seconds
while in use. This is a maximum cache lifetime, not a delay that publishers must wait. An
implementation MUST NOT knowingly serve a cached mapping past the name's or an ancestor's expiry.
Once revalidation is due, lookup failure MUST NOT silently extend the old mapping's lifetime.

Blocks addressed by immutable CIDs MAY be cached independently for longer. Responses at a mutable
name URL MUST NOT advertise themselves as immutable, and their HTTP freshness lifetime MUST NOT
exceed the remaining name-cache lifetime. ETag validation MUST use the currently resolved content,
not return `304` solely because the request matches an older name-to-CID mapping. These rules bound
resolver and HTTP cache staleness; they cannot revoke already loaded code or a service worker.

### HTTPS gateway profile

#### Name mapping

A gateway declares a DNS base domain `G`. For each supported name `N = L.bso`, its URL is:

```text
https://L.G/<path>?<query>#<fragment>
```

For `G = bso.limo`, this becomes:

```text
5chan.bso       -> https://5chan.bso.limo/
docs.5chan.bso  -> https://docs.5chan.bso.limo/
```

The gateway MUST parse the HTTP authority as a hostname, match the complete `.` + `G` suffix on a
label boundary, and replace that suffix with `.bso` before resolution. It MUST NOT remove arbitrary
occurrences of `limo` or `bso`, accept an unrelated host, or trust forwarded-host headers from
untrusted clients. The base domain itself is the operator's site, not a request for the bare name
`bso`.

This version requires support for names whose labels before `.bso` contain only ASCII letters,
digits, and interior hyphens, are at most 63 bytes each, and produce a gateway hostname at most 253
bytes long. Hosts are lowercased before resolution. Labels beginning `xn--` are excluded from this
profile: this draft defines no conversion between DNS IDNA labels and ENS Unicode names. Gateways
MUST reject names outside this profile rather than truncate them or resolve an approximate spelling.
Native resolvers still support the registry's ENS-normalized Unicode names; a future extension may
define a reversible gateway encoding for names that cannot be represented by this profile.

Gateways MUST serve HTTPS with a valid certificate for the requested hostname. A certificate for
`*.bso.limo` covers `5chan.bso.limo`, but not `docs.5chan.bso.limo`; operators must provision the
necessary deeper-name coverage to serve such subnames.

#### Content and navigation

Gateways MUST implement `GET` and `HEAD`, using IPFS UnixFS path and directory-index behavior from
the [IPFS path gateway specification](https://specs.ipfs.tech/http-gateways/path-gateway/), with the
resolved CID as the fixed root. For a directory with `index.html`, `/` serves that file. A missing
resource returns `404`; it MUST NOT automatically return the root HTML for every missing path.
Gateways SHOULD support the IPFS
[`_redirects` convention](https://specs.ipfs.tech/http-gateways/web-redirects-file/) for sites that
explicitly declare redirects or single-page application routing.

The visible origin MUST remain the requested name's HTTPS origin during ordinary content loading.
A gateway MUST NOT implement normal resolution by redirecting to a shared path gateway such as
`https://G/ipfs/<cid>/`. Explicit redirects published by the website remain allowed.

Paths MUST remain scoped to the resolved content root. For example, `/ipfs/other-cid/` is a path
inside the website, not an instruction to replace its root. Query parameters belong to the
website: a gateway MUST NOT interpret parameters such as `uri` or `format` as permission to change
the resolved root or turn a page into a gateway API response. Implementations MUST preserve query
parameters through gateway-generated redirects. Fragments stay in the browser and are not sent
to the gateway; generated redirects MUST NOT replace them. Hash-routed apps can therefore use
URLs such as `https://5chan.bso.limo/#/example` without server-side fragment handling.

An implementation MUST distinguish at least these failures:

| Outcome | HTTP response |
| --- | --- |
| Invalid host or name | `400 Bad Request` |
| Empty website record or confirmed missing resource | `404 Not Found` |
| Malformed contenthash | `502 Bad Gateway` |
| Unsupported content protocol, codec, or hash | `501 Not Implemented` |
| Registry/RPC unavailable | `503 Service Unavailable` |
| IPFS retrieval timeout | `504 Gateway Timeout` |

A content retrieval failure MUST NOT be disguised as an empty record. Error pages MUST NOT execute
content from a stale or substitute website. Operator policy refusals MUST be reported separately
from name resolution results.

### Native browser integration

A browser supporting `.bso` website navigation MUST run the resolution procedure on the `.bso`
name, then load the website from the resolved CID. Recognizing names in the address bar is browser
policy; this BSIP does not register a new URL scheme or put `.bso` in the public DNS root.

A native browser MAY fetch IPFS blocks itself or through gateways. It MUST either verify the CID
chain from the root through the requested UnixFS path, using locally verified blocks or a trusted
local IPFS node, or clearly expose that it relies on a remote content service. It MUST NOT present
unverified HTML obtained from a remote gateway as independently verified IPFS content. Chain RPC
trust remains a separate assumption even when all IPFS blocks are verified.

The browser MUST isolate distinct `.bso` names as distinct origins, including storage and service
workers. It MUST NOT place every website in a shared `ipfs://` or local-proxy origin. If it offers
an HTTPS fallback instead of native loading, it MUST expose the gateway URL and its trust boundary.
Choosing `bso.limo` as that fallback is optional.

### Publishing and migration

An owner publishes a website by adding its build to IPFS, keeping the content available, and
calling `setContenthash(uint256(namehash(name)), encodedContenthash)` on the registry. A gateway
MUST NOT require a separate operator account or a per-name routing entry to discover that record.
Recording a CID does not itself pin or guarantee availability of its blocks.

BSIP-13's seed process copies the `bitsocial` text record, not ENS website contenthashes. It does
not reserve every ENS website name. A publisher MUST first verify ownership of the `.bso` name,
then explicitly set its website record. Reading `5chan.eth`'s current contenthash and writing those
same bytes to `5chan.bso` is sufficient to serve the same build, provided the owner intends that
content and the blocks remain available. No resolver may infer that consent or copy it at read time.

The future Bitsocial Chain migration, if it implements this standard, MUST preserve the contenthash
bytes for every imported name, including names in grace and imported subnames. Its migration BSIP
MUST specify the replacement chain, registry interface, and activation point before clients switch.
This strengthens BSIP-13's recommendation to preserve other records for website contenthashes; it
does not invent a chain endpoint or an automatic cross-chain fallback.

### Example: 5chan

The following is illustrative, not a claim about the live contenthash or ownership of either name:

```text
publish frontend to IPFS                  -> CID
encode CID using ENSIP-7                  -> contenthash bytes
owner writes 5chan.bso's contenthash      -> .bso registry

ordinary browser:
  https://5chan.bso.limo/
  -> gateway extracts 5chan.bso
  -> registry.contenthash(namehash("5chan.bso"))
  -> IPFS CID -> /index.html

native browser:
  5chan.bso
  -> registry.contenthash(namehash("5chan.bso"))
  -> same IPFS CID -> /index.html
```

For a browser integration such as proposed Freedom Browser support, the additional work is `.bso`
name recognition, BSIP-13 registry selection, and the resolution and origin rules above. Existing
ENS contenthash decoding and IPFS loading can be reused where compatible. This is an integration
target, not a statement that Freedom Browser currently implements this draft.

## Rationale

- **Reuse contenthash.** ENS already defines a binary format for decentralized website addresses,
  and BSIP-13's pinned contract already implements it. A new text key would duplicate that standard
  and require extra browser-specific handling.
- **Separate identity and website records.** An app's frontend is not a community public key. Names
  may have either record, both, or neither, without overloading the meaning of `bitsocial`.
- **Require IPFS first.** It gives all implementations one common website format. Other protocols
  need their own retrieval, verification, and caching rules before they become interoperable here.
- **Keep gateways replaceable.** The owner controls the contenthash. Independent gateways and
  native browsers can resolve it without permission from Forge or reliance on one DNS domain.
- **Keep the name origin stable.** Website updates change the CID while retaining bookmarks,
  relative URLs, and origin-bound storage. Changing names or gateway domains still changes origin.
- **Bound mutable caches.** A five-minute upper bound limits stale mappings while allowing RPC
  caching. Immutable content caching remains efficient without treating the name itself as immutable.

## Backwards Compatibility

This proposal does not change `.eth` resolution, the `bitsocial` text record, or the BSIP-13 seed
format. It does not require additional contract storage or methods beyond the upstream contract
already selected by BSIP-13. Existing Bitsocial clients can ignore website records.

Existing ENS-only software still needs explicit `.bso` registry support; a shared contenthash format
does not make ENS discover the independent registry. `.bso` websites do not become accessible in
ordinary browsers without a gateway or native browser integration.

Moving from an existing domain to `5chan.bso.limo` changes the web origin. Browser-local accounts,
settings, cookies, and service workers do not move automatically. A site migration must handle any
needed user-data export/import separately; this BSIP specifies no storage migration mechanism.

## Reference Implementation

No complete browser or gateway implementation is supplied with this draft. The existing contract
surface is in
[`NameNFT.sol` at BSIP-13's pinned commit](https://github.com/lucadonnoh/gwei-names/blob/8e094ab343d0bfdbd9ec948594fc48f20bed6e5d/src/NameNFT.sol).

The IPFS example from [ENSIP-7](https://docs.ens.domains/ensip/7) is an encoding test vector, not the
5chan website CID:

```text
input CIDv0: QmRAQB6YaCyidP37UdDnjFY5vQuiBrcqdyoW1CuDgwxkD4
contenthash: 0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f
```

An implementation should verify encoding round trips, explicit ABI overload selection, expiry and
ancestor invalidation, malformed and unsupported records, subname routing, path/query/fragment
preservation, isolation between sites, and cache behavior when a record changes or an RPC fails.
No example in this draft is a live deployment test.

## Security Considerations

- **Gateway trust.** A conventional HTTPS browser trusts its gateway to choose and deliver the
  frontend. The gateway can substitute JavaScript even if the real build is content-addressed.
  HTTPS authenticates the gateway hostname, not the on-chain record. Native content verification
  can remove that content-service assumption; it does not automatically verify chain RPC answers.
- **Cross-site isolation.** Different gateway hostnames provide different origins but can still
  share a cookie domain or browser site boundary. Public multi-tenant gateways SHOULD obtain an
  appropriate [Public Suffix List](https://publicsuffix.org/) entry, for example `bso.limo` for its
  top-level tenants, and MUST NOT rely on subdomains alone for cookie or SameSite isolation.
  That entry does not separate `docs.5chan.bso.limo` from its parent at the site boundary. Sites
  MUST treat delegated subnames as potentially hostile, use host-only cookies where applicable,
  and not use SameSite as their sole request-forgery defense. Operator administrative services
  SHOULD be hosted on a separate registrable domain.
- **Mutable names and persistent code.** Name transfer, expiry followed by re-registration, or
  owner-key compromise can put a different website at an existing origin. Old service workers
  may also persist after a legitimate content update. A name origin is not permanent proof of
  the publisher's identity, and cache expiry does not erase browser-local state.
- **Untrusted inputs.** Gateways MUST confine decoded paths to the selected root, reject malformed
  authority values, and avoid double decoding that changes path boundaries. They MUST NOT fetch
  arbitrary HTTP URLs or local network addresses supplied as contenthash data. Website content
  and error messages must not be inserted unsafely into operator pages.
- **Resource use and privacy.** Registry calls and IPFS fetches require timeouts, concurrency limits,
  and response-size controls. RPC providers and content services can observe requested names or
  CIDs. A gateway may be unavailable or block content; that does not revoke the name or prevent
  independent access. Availability depends on continued storage of the website's IPFS blocks.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
