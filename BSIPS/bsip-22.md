---
bsip: 22
title: Author Wallet Proofs
description: The signed message that proves an author controls a wallet listed in author.wallets, and where that proof is verified.
author: Rinse (@Rinse12)
discussions-to: https://github.com/bitsocialnet/BSIPs/issues/26
status: Draft
type: Standards Track
category: Core
created: 2026-11-17
requires: 2, 4, 10
---

## Abstract

An author can list blockchain wallets in `author.wallets` ([BSIP-2](./bsip-2.md#authors)). Each entry
carries a signature that is meant to prove the author controls the wallet. This BSIP defines that
proof: the wallet signs, with EIP-191, one exact string that names the author's signing key, the
wallet's own address and a timestamp. A community verifies the proof before it accepts any publication
that carries a wallet entry, and rejects the publication when the proof is invalid. An entry of a
signature type this BSIP does not define is unproven, and this BSIP does not require a community to
reject it. A client verifies a proof itself before it relies on the entry, for example before it shows
the wallet as the author's or sends funds to it. A valid proof is a link between a signing key and an
address that anyone can check from the publication alone.

## Motivation

[BSIP-2](./bsip-2.md#authors) gives a wallet entry its shape and says the proof format is not yet
specified. Without a specification:

- **The entry proves nothing.** Implementations that validate only the shape accept any address, so
  an author can list a wallet that belongs to someone else. Anything built on the entry, such as token
  gating, displaying holdings, or sending a payment to an author, inherits that hole.
- **Implementations have drifted apart.** Clients and challenges in use sign and verify three
  different strings (`plebbit-author-wallet`, `pkc-author-wallet`, `bitsocial-author-wallet`), over
  different values. A wallet signed by one client fails verification in another community's challenge.
- **Some of those strings are unsafe.** A proof signed over the author's runtime address follows the
  author's name when the name is repointed to another key. A proof signed over only the wallet's own
  address names no author at all and can be copied by anyone who sees it.

Independent implementations need one string, one binding, and one rule for who verifies it.

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT",
"RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as
described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174).

### Terminology

- **Wallet entry** — one value of the `author.wallets` record, keyed by a chain ticker.
- **Carrying record** — the signed record whose `author.wallets` holds the wallet entry: a publication
  or a [BSIP-15](./bsip-15.md) list.
- **Author key address** — the key address ([BSIP-10](./bsip-10.md#key-addresses)) derived from the
  `signature.publicKey` of the carrying record. It names the author only when the carrying record's
  own signature is valid ([BSIP-2](./bsip-2.md#signatures)).
- **Wallet proof** — the `signature` inside a wallet entry.
- **Proof message** — the string the wallet signs.

### The wallet entry

A wallet entry is the object defined in [BSIP-2](./bsip-2.md#authors):

```json
{
  "address": "0x5050A4F4b3f9338C3472dcC01A87C76A144b3c9c",
  "timestamp": 1790000000,
  "signature": {
    "signature": "0xfc70…e31c",
    "type": "eip191"
  }
}
```

- `address` — REQUIRED. A string. For `eip191`, the wallet address: the characters `0x` followed by
  exactly 40 hexadecimal digits, in any letter case. It MUST NOT be a name (an ENS name, a `.bso`
  name, or any other indirection). Addresses are compared without regard to letter case.
- `timestamp` — REQUIRED. An integer. For `eip191`, a non-negative integer Unix time in seconds at
  which the wallet signed the proof.
- `signature.type` — REQUIRED. A string naming the proof scheme. This BSIP defines exactly one value,
  `eip191`. Any other string is an unknown type ([Verification](#verification)).
- `signature.signature` — REQUIRED. A string. For `eip191`, the 65-byte signature `r || s || v` as
  `0x` followed by 130 hexadecimal digits, where:
  - `v` is `27` or `28` (the bytes `0x1b` or `0x1c`). The `0`/`1` form is not valid. A client whose
    signer returns `0` or `1` MUST add 27 before it stores the signature.
  - `s` is in the lower half of the curve order, that is
    `s <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0`. The high-`s` form of
    the same signature is not valid.

The types above are the shape [BSIP-2](./bsip-2.md#authors) gives every wallet entry. The further
rules marked `eip191` apply to entries of that type only; a later BSIP defines them for its own type.

A wallet entry or its `signature` object MAY carry members this BSIP does not define. A verifier MUST
ignore them: they do not make the entry invalid and are not part of the proof. A client MUST NOT
treat an unknown member as something the wallet attested to, since the wallet signed only the proof
message.

The chain ticker that keys the entry labels which chain the author intends the address for. It is not
part of the proof message: the proof shows control of the address, on every chain where that address
is controlled by the same key.

### The proof message

The proof message is this exact string, with no whitespace and the fields in this order:

```text
{"domainSeparator":"bitsocial-author-wallet","authorPublicKey":"<author key address>","walletAddress":"<wallet address>","timestamp":<timestamp>}
```

- `<author key address>` is the author key address, in the base58btc form of
  [BSIP-10](./bsip-10.md#key-addresses) (52 characters, starting `12D3KooW`). It MUST NOT be
  `author.name`, the runtime author address, or the base64 form of `signature.publicKey`.
- `<wallet address>` is the entry's `address` with its hexadecimal digits in lowercase (`0x` followed
  by 40 lowercase digits). The wallet signs its own address, so the signer must know the address
  before it signs, and a signature cannot be made first and its address derived from it afterwards.
- `<timestamp>` is the entry's `timestamp`, written as a decimal integer with no quotes, sign, or
  leading zeros.

The string is valid JSON so that a wallet can show the user what they are signing, but it is defined
as a byte string, not as a JSON value. An implementation MUST build it by concatenation, or with a
serializer it has confirmed produces exactly these bytes, and MUST NOT rely on a serializer's key
order.

### Signing

For `signature.type` `eip191`, the wallet signs the UTF-8 bytes of the proof message as an
[EIP-191](https://eips.ethereum.org/EIPS/eip-191) personal message (version byte `0x45`, the
`personal_sign` scheme): the signed digest is the Keccak-256 hash of
`"\x19Ethereum Signed Message:\n" || <decimal byte length of the message> || <message>`.

### Verification

Verifying an entry has one of three outcomes. First, whatever its type, the entry MUST have the shape
in [The wallet entry](#the-wallet-entry): an object with a string `address`, an integer `timestamp`,
and a `signature` object whose `signature` and `type` are strings. Members this BSIP does not define
are ignored. An entry that does not have this shape is **invalid**. Then the outcome depends on
`signature.type`:

- **Unknown.** `signature.type` is a string other than `eip191`. This BSIP defines no further check
  for it, so the entry is neither valid nor invalid. It is **unproven**.
- **Valid.** `signature.type` is `eip191` and all of the following hold for the carrying record:
  1. `address` is `0x` followed by exactly 40 hexadecimal digits, and `timestamp` is not negative;
  2. `timestamp` is not more than five minutes later than the verifier's current time;
  3. `signature.signature` has the encoding in [The wallet entry](#the-wallet-entry), including its
     rules for `v` and `s`;
  4. the address recovered from `signature.signature` over the proof message, built from the author
     key address of the carrying record, the entry's `address` and the entry's `timestamp`, equals
     `address`.
- **Invalid.** An `eip191` entry for which a condition above fails.

A proof is **proven** only when it is valid under a type the verifier implements. A verifier that
implements a type defined by a later BSIP applies that BSIP's rules to entries of that type, and
treats entries of every other type as unknown.

A wallet proof says nothing about a carrying record whose own signature is not valid. A verifier MUST
verify that signature ([BSIP-2](./bsip-2.md#signatures)) before it treats a wallet entry as proven,
because the proof names the key in `signature.publicKey`, and only the record's signature shows that
the holder of that key listed the wallet.

Verification is stateless. A verifier MUST NOT require the proof's `timestamp` to be newer than one
it has seen before, and MUST NOT keep per-wallet or per-author state to decide validity. Recovering
the address needs no blockchain access.

Condition 2 of an `eip191` entry depends on the verifier's clock, so a proof dated ahead can be valid
for one verifier and not yet valid for another whose clock is behind. The five-minute allowance is
fixed, not optional, and is the allowance a community applies to publication timestamps
([BSIP-4](./bsip-4.md#publication-acceptance)).

A verifier MUST check the `v` and `s` rules itself when the library it uses to recover the address
does not. Recovery libraries differ on both, and a verifier that accepts what its library accepts
would disagree with other verifiers about the same entry.

Signatures from contract accounts ([ERC-1271](https://eips.ethereum.org/EIPS/eip-1271)) are not
`eip191` proofs and are not valid under this BSIP.

### Community acceptance

In addition to the rules of [BSIP-4](./bsip-4.md#publication-acceptance), a community MUST reject a
publication of any type whose `author.wallets` contains an invalid entry. An unknown entry is not a
ground for rejection under this BSIP. The `reason` in the `CHALLENGEVERIFICATION` SHOULD name the
chain ticker of the failing entry.

A community MAY still reject a publication over an unknown entry, or limit the number of entries it
accepts, through a challenge or other local policy. That is the community's own rule, not a rule of
this BSIP, and an implementation MUST NOT apply it unless the community's operator has chosen it.

A community cannot remove a failing entry and accept the rest, because `author` is covered by the
author's signature ([BSIP-2](./bsip-2.md#signatures)).

An accepted entry may therefore be unknown, and a community's acceptance does not make an entry
proven. Community acceptance applies to publications; a list has none, so a list's entries are checked
only by readers ([Clients](#clients)).

A publishing client SHOULD run the same check before it starts a challenge exchange, so that an
invalid entry fails locally with a clear error.

### Clients

- A client that creates a wallet entry MUST produce a proof that is valid under this BSIP.
- A client is not required to verify the wallet entries of publications it reads, as long as it
  does not rely on them.
- A client MUST verify a wallet proof itself, under [Verification](#verification), before it relies on
  the entry, whether the carrying record is a publication or a list. Relying on an entry includes
  showing the address as a wallet the author controls, using it to decide what the author holds, and
  sending funds to it.
- An entry is proven only when it is valid under a type the client implements. A client MUST NOT rely
  on an unknown or invalid entry, and MAY show it only in a way that does not present it as proven.
  A client that does not yet implement a later signature type shows its entries as unproven, even if
  the proof is valid.

A community's acceptance is not something a client can rely on in place of its own check. A
publication does not record whether its community applied this BSIP or when it began to, so a reader
cannot tell an entry a community verified from one accepted before the rule existed, or by a community
that does not apply it. Verifying is one hash and one public-key recovery, with no network access.

### Test vector

Author signing key (Ed25519 seed, hex) and its public forms:

```text
seed                 0101010101010101010101010101010101010101010101010101010101010101
signature.publicKey  iojj3XQJ8ZX9UtstPLpdcspnCb8dlBIb83SIAbQPb1w
author key address   12D3KooWK99VoVxNE7XzyBwXEzW7xhK7Gpv85r9F3V3fyKSUKPH5
```

Wallet (secp256k1 private key, hex) and its address:

```text
private key  0202020202020202020202020202020202020202020202020202020202020202
address      0x5050A4F4b3f9338C3472dcC01A87C76A144b3c9c
```

Proof message for `timestamp` 1790000000:

```text
{"domainSeparator":"bitsocial-author-wallet","authorPublicKey":"12D3KooWK99VoVxNE7XzyBwXEzW7xhK7Gpv85r9F3V3fyKSUKPH5","walletAddress":"0x5050a4f4b3f9338c3472dcc01a87c76a144b3c9c","timestamp":1790000000}
```

The entry's `address` is in mixed case, and the message names it in lowercase.

Resulting wallet entry:

```json
{
  "address": "0x5050A4F4b3f9338C3472dcC01A87C76A144b3c9c",
  "timestamp": 1790000000,
  "signature": {
    "signature": "0xfc705f790e2744d8acbec610783ce999e253392b9699cef1c20b338648a5aa132b8e6f5f836d314ad173ec97bb453d8a2df2fd1207ced2263f5701bdad17f0e31c",
    "type": "eip191"
  }
}
```

The signature's `v` byte is `0x1c` (28) and its `s` value is in the lower half of the curve order. It
is the signature a wallet produces for this key and message when it picks its nonce as
[RFC 6979](https://www.rfc-editor.org/rfc/rfc6979) describes, so an implementation that signs the
vector can compare bytes. A verifier does not depend on how the nonce was picked.

This entry is valid in a publication or list signed by the key above, when the verifier's time is
1789999700 or later (the proof's `timestamp` less the five-minute allowance). It stays valid with an
added member this BSIP does not define, such as `"label": "main"` on the entry or `"publicKey": "…"`
inside `signature`. It is not valid when:

- the publication or list is signed by any other key (the recovered address differs);
- the verifier's time is earlier than 1789999700;
- `signature.type` is not a string, or `timestamp` is negative;
- `address` is a name such as `example.eth`;
- the last byte of the signature is `0x01` in place of `0x1c`;
- `s` is replaced by its high form, `n - s`, with `v` flipped to `0x1b`, which recovers the same
  address but breaks the `s` rule;
- the proof message is built with `authorAddress` in place of `authorPublicKey`, or with a different
  `domainSeparator`;
- the proof message omits `walletAddress`, or names a wallet address other than the entry's `address`;
- the proof message names the wallet address in mixed case,
  `0x5050A4F4b3f9338C3472dcC01A87C76A144b3c9c`, in place of the lowercase form;
- the entry's `timestamp` is changed, for example to 1790000001, without signing again: the
  proof message changes with it, so the recovered address differs even when the verifier's time
  is 1790000001.

The same entry with `signature.type` set to any other string, such as `"erc1271"`, is unknown, not
invalid: this BSIP gives a community no ground to reject the publication, and no verifier treats the
entry as proven. This holds when `address` is not a `0x` address or `timestamp` is negative, because
those rules belong to `eip191`. An entry that lacks the shape of [The wallet
entry](#the-wallet-entry), such as one without a `timestamp`, is invalid whatever its type.

The vector is also in [`assets/bsip-22/wallet-proof-vectors.json`](../assets/bsip-22/wallet-proof-vectors.json),
which `assets/verify-vectors.mjs` checks with Node built-ins only.

## Rationale

- **Bind to the key, not the name.** An author's identity is the signing key
  ([BSIP-10](./bsip-10.md)). The runtime address is `author.name || publicKey`, and a name can be
  repointed to another key. A proof over a name would transfer to whoever holds the name next. The
  field is called `authorPublicKey` rather than `authorAddress` so that an implementer does not pass
  the runtime address out of habit, which is what existing implementations did.
- **The wallet signs its own address.** Recovery always returns some address for any signature, so
  comparing the recovered address with the entry's `address` shows nothing if the message does not
  name that address: anyone could pick a signature at random, take the address it recovers, and list
  it as a wallet nobody controls. With the address in the message, the signer has to choose it before
  signing, and only the holder of its key can make the signature. The address is written in lowercase
  so that the case of `address` does not change the signed bytes.
- **A plain EIP-191 message.** Every wallet and hardware device can sign a text message, and the user
  can read what they sign. EIP-712 typed data displays better in some wallets but is supported less
  widely. `signature.type` leaves room to add other schemes in later BSIPs. Contract accounts
  ([ERC-1271](https://eips.ethereum.org/EIPS/eip-1271)) and other chain families are the expected
  additions; both need more than signature recovery to verify, so they are left out here.
- **Accept unknown types as unproven.** A rule that a community rejects an unknown type cannot be
  loosened later, because communities that already enforce it keep rejecting until each one upgrades,
  so every new signature type would fail for its authors in every community that is behind. A rule
  that accepts unknown types as unproven can be tightened later by a BSIP that upgraded communities
  adopt, while the others carry on. The cost is that a community can hold entries nobody has proven,
  so acceptance means nothing about an entry's type; a reader already has to verify, as
  [Clients](#clients) requires. Junk entries are bounded by the size limit on a publication, and a
  community can limit entries locally. A later BSIP could let a community advertise the types it
  supports, so a client can leave out an entry the community would not check.
- **Literal addresses only.** A name in `address` makes verification depend on a resolver and an RPC,
  and changes what the proof means when the name is repointed.
- **No "newest timestamp wins" rule.** Existing challenges keep a per-community record of the newest
  timestamp seen for a wallet and reject older proofs, to stop a copied proof being replayed. Once the
  message names the author's key, a copied proof is useless to anyone who does not hold that key, so
  the state protects nothing. It also cannot be reproduced by a reader, which would make validity
  depend on which community is asked.
- **Common shape first.** The rules for `address` and `timestamp` that this BSIP states belong to
  `eip191`, because a later type may use another kind of address or another meaning for the
  timestamp. Only the shape BSIP-2 gives every entry is checked before the type, so that a verifier
  that does not know a type cannot call its entry invalid for a reason that is specific to it.
- **Compare the proof's timestamp with the verifier's clock.** The alternative is to compare it with
  the `timestamp` of the publication that carries it, which gives every verifier the same answer
  regardless of its clock. That rule trusts the publication's timestamp, which the author chooses and
  only the community holds near the truth ([BSIP-4](./bsip-4.md#publication-acceptance)). An author
  and a community acting together could then future-date both. The clock rule does not depend on the
  community: any verifier rejects a proof dated more than five minutes ahead of its own time. Its cost
  is a short disagreement between verifiers whose clocks differ, which resolves as time passes.
- **The community verifies, and a client verifies what it uses.** Verifying on acceptance keeps
  false entries out of a community and gives challenges one check to build on. It cannot stand in for
  a client's own check, because nothing in a publication says whether its community applied the rule.
  Requiring every reader to verify every entry on every page load would be wasted work, so the
  obligation attaches to use: a client that shows, counts, or pays an address verifies that entry
  first.
- **One signature encoding.** Signers and recovery libraries disagree on `v` (`0`/`1` or `27`/`28`)
  and on whether a high `s` is acceptable. Because a community rejects a publication over an invalid
  entry, two verifiers that follow their libraries would accept and reject the same publication. The
  values chosen are what `personal_sign` returns from mainstream wallets, and the low-`s` rule of
  [EIP-2](https://eips.ethereum.org/EIPS/eip-2).
- **Unknown members are ignored.** If one verifier rejected an entry with an extra member and
  another accepted it, a publication would be accepted by one community and rejected by another. Later
  BSIPs that add signature types are likely to add members, so rejecting them would also make every
  such addition a breaking change for entries of the existing type.
- **A fixed five-minute allowance.** An optional allowance would let verifiers differ by choice as
  well as by clock. Five minutes matches the allowance for publication timestamps.
- **Avatars are out of scope.** The `author.avatar` proof has the same history of inconsistent
  strings. It involves ownership of a token, which changes over time and needs chain access to check,
  so it is left to its own BSIP.

## Backwards Compatibility

This BSIP is incompatible with every wallet proof created before it. Proofs in use today were signed
over one of these strings, none of which is valid here:

```text
{"domainSeparator":"plebbit-author-wallet","authorAddress":"…","timestamp":…}
{"domainSeparator":"pkc-author-wallet","authorAddress":"…","timestamp":…}
{"domainSeparator":"bitsocial-author-wallet","authorAddress":"…","timestamp":…}
```

Old proofs are not accepted and there is no transition format. Authors sign a new proof. Challenges
that verify wallet proofs must adopt this BSIP before clients re-sign, or they reject the new proofs;
the order is tracked in [pkc-js#566](https://github.com/pkcprotocol/pkc-js/issues/566).

Comments accepted before a community applied this BSIP keep their old entries. This BSIP does not
require a community to re-check or remove them. A client treats them like any other entry: it
verifies an entry before relying on it ([Clients](#clients)), and an old entry fails.

Wallet entries on chain families other than those using `0x` addresses cannot be proven under this
BSIP. An entry with the `eip191` type and a non-`0x` address is invalid and is rejected once a
community enforces it; an entry with another type is unknown and unproven.

## Security Considerations

- **Abuse and forgery.** The proof is public, since it is published with every publication that
  carries it. Copying another author's entry fails, because the proof message names the original
  author's key and the recovered address will not match under any other key. The author's signature
  over the publication covers the entry, so the binding is mutual: the wallet names the key, and the
  key names the wallet. A proof is not bound to a community, so an author can reuse it everywhere;
  that is intended. The message also names the wallet address, so a signature nobody made, with
  whatever address it happens to recover, does not verify as that address's proof.
- **No revocation.** A proof never expires. An author stops listing a wallet by omitting it from
  later publications, but earlier publications keep the entry. An application that needs a current
  link MUST use the entry on the publication it is acting on, not one remembered from an older
  publication.
- **Key compromise.** Someone who obtains the author's signing key can publish as the author and
  attach the author's existing proofs, but gains no control of the wallet. Someone who obtains the
  wallet key can sign a proof for any author key, so a wallet proof shows control of the wallet key at
  signing time and nothing more.
- **Signing prompts.** The proof message is a signature request shown by a wallet. A malicious
  application could ask a user to sign a proof for a key the application controls, linking the user's
  wallet to an identity that is not theirs. Clients SHOULD show the author key address being linked,
  and users should sign a proof only in a client they trust.
- **Signature malleability.** For a given message and key, a second `(r, s, v)` exists with the high
  `s` value, and it recovers the same address. It is not valid here, so each proof has one accepted
  encoding. Malleability never let anyone forge a proof; the rule exists so that verifiers agree.
  Implementations SHOULD still not use the signature bytes as a unique identifier.
- **Privacy.** A wallet entry permanently and publicly links a signing key to an on-chain address,
  and through it to that address's whole transaction history and balances, in every community the
  author publishes to. The link cannot be withdrawn from publications already accepted. Clients SHOULD
  warn users of this before they attach a wallet, and SHOULD NOT attach one by default.
- **Resource cost.** Verifying an entry is one hash and one public-key recovery, with no network
  access. The number of entries is bounded by the 40,000-byte limit on a publication
  ([BSIP-4](./bsip-4.md#publication-acceptance)). A community MAY additionally limit the number of
  entries it accepts.
- **Unknown entries.** By default a community accepts entries of types it does not know, so an author
  can store entries that nothing proves. They cost a community only the space inside the same size
  limit, and a client that follows [Clients](#clients) never relies on them.

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
