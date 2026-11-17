---
bsip:
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
proof: the wallet signs, with EIP-191, one exact string that names the author's signing key and a
timestamp. A community verifies the proof before it accepts any publication that carries a wallet
entry, and rejects the publication when the proof is invalid or uses a signature type this BSIP does
not define. A client verifies a proof itself before it relies on the entry, for example before it
shows the wallet as the author's or sends funds to it. A valid proof is a link between a signing key
and an address that anyone can check from the publication alone.

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
- **Author key address** — the key address ([BSIP-10](./bsip-10.md#key-addresses)) derived from the
  `signature.publicKey` of the publication that carries the wallet entry.
- **Wallet proof** — the `signature` inside a wallet entry.
- **Proof message** — the string the wallet signs.

### The wallet entry

A wallet entry is the object defined in [BSIP-2](./bsip-2.md#authors):

```json
{
  "address": "0x5050A4F4b3f9338C3472dcC01A87C76A144b3c9c",
  "timestamp": 1790000000,
  "signature": {
    "signature": "0x689c…ac1c",
    "type": "eip191"
  }
}
```

- `address` — REQUIRED. The wallet address: the characters `0x` followed by exactly 40 hexadecimal
  digits, in any letter case. It MUST NOT be a name (an ENS name, a `.bso` name, or any other
  indirection). Addresses are compared without regard to letter case.
- `timestamp` — REQUIRED. Integer Unix time in seconds at which the wallet signed the proof.
- `signature.type` — REQUIRED. The proof scheme. This BSIP defines exactly one value, `eip191`.
- `signature.signature` — REQUIRED. For `eip191`, the 65-byte signature `r || s || v` as `0x`
  followed by 130 hexadecimal digits, where:
  - `v` is `27` or `28` (the bytes `0x1b` or `0x1c`). The `0`/`1` form is not valid. A client whose
    signer returns `0` or `1` MUST add 27 before it stores the signature.
  - `s` is in the lower half of the curve order, that is
    `s <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0`. The high-`s` form of
    the same signature is not valid.

The chain ticker that keys the entry labels which chain the author intends the address for. It is not
part of the proof message: the proof shows control of the address, on every chain where that address
is controlled by the same key.

### The proof message

The proof message is this exact string, with no whitespace and the fields in this order:

```text
{"domainSeparator":"bitsocial-author-wallet","authorPublicKey":"<author key address>","timestamp":<timestamp>}
```

- `<author key address>` is the author key address, in the base58btc form of
  [BSIP-10](./bsip-10.md#key-addresses) (52 characters, starting `12D3KooW`). It MUST NOT be
  `author.name`, the runtime author address, or the base64 form of `signature.publicKey`.
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

A wallet proof is **valid** for a publication when all of the following hold:

1. the entry has the shape in [The wallet entry](#the-wallet-entry);
2. `signature.type` is `eip191`;
3. `timestamp` is not more than five minutes later than the verifier's current time;
4. `signature.signature` has the encoding in [The wallet entry](#the-wallet-entry), including its
   rules for `v` and `s`;
5. the address recovered from `signature.signature` over the proof message, built from the author key
   address of that publication and the entry's `timestamp`, equals `address`.

Verification is stateless. A verifier MUST NOT require the proof's `timestamp` to be newer than one
it has seen before, and MUST NOT keep per-wallet or per-author state to decide validity. Recovering
the address needs no blockchain access.

Rule 3 depends on the verifier's clock, so a proof dated ahead can be valid for one verifier and not
yet valid for another whose clock is behind. The five-minute allowance is fixed, not optional, and is
the allowance a community applies to publication timestamps
([BSIP-4](./bsip-4.md#publication-acceptance)).

A verifier MUST check the `v` and `s` rules itself when the library it uses to recover the address
does not. Recovery libraries differ on both, and a verifier that accepts what its library accepts
would disagree with other verifiers about the same entry.

Signatures from contract accounts ([ERC-1271](https://eips.ethereum.org/EIPS/eip-1271)) are not
`eip191` proofs and are not valid under this BSIP.

### Community acceptance

In addition to the rules of [BSIP-4](./bsip-4.md#publication-acceptance), a community MUST reject a
publication of any type whose `author.wallets` contains an entry that is not valid. This includes an
entry whose `signature.type` is a value this BSIP does not define. The `reason` in the
`CHALLENGEVERIFICATION` SHOULD name the chain ticker of the failing entry.

A community cannot remove a failing entry and accept the rest, because `author` is covered by the
author's signature ([BSIP-2](./bsip-2.md#signatures)).

A publishing client SHOULD run the same check before it starts a challenge exchange, so that an
invalid entry fails locally with a clear error.

### Clients

- A client that creates a wallet entry MUST produce a proof that is valid under this BSIP.
- A client is not required to verify the wallet entries of publications it reads, as long as it
  does not rely on them.
- A client MUST verify a wallet proof itself, under [Verification](#verification), before it relies on
  the entry. Relying on an entry includes showing the address as a wallet the author controls, using
  it to decide what the author holds, and sending funds to it.
- A client MAY show an entry it has not verified only in a way that does not present it as proven.

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
{"domainSeparator":"bitsocial-author-wallet","authorPublicKey":"12D3KooWK99VoVxNE7XzyBwXEzW7xhK7Gpv85r9F3V3fyKSUKPH5","timestamp":1790000000}
```

Resulting wallet entry:

```json
{
  "address": "0x5050A4F4b3f9338C3472dcC01A87C76A144b3c9c",
  "timestamp": 1790000000,
  "signature": {
    "signature": "0x689cdb0da488b458f4deb758ea77c3d205b6d17d690e9ffab497bc44eb9536a25fbc48ce7c3e6cab651efe176f94d856ebbe8fcad920dfece8cb5f0cb355d8ac1c",
    "type": "eip191"
  }
}
```

The signature's `v` byte is `0x1c` (28) and its `s` value is in the lower half of the curve order.

This entry is valid in a publication signed by the key above, when the verifier's time is 1789999700
or later (the proof's `timestamp` less the five-minute allowance). It is not valid when:

- the publication is signed by any other key (the recovered address differs);
- the verifier's time is earlier than 1789999700;
- `signature.type` is anything other than `eip191`;
- `address` is a name such as `example.eth`;
- the last byte of the signature is `0x01` in place of `0x1c`;
- `s` is replaced by its high form, `n - s`, with `v` flipped to `0x1b`, which recovers the same
  address but breaks the `s` rule;
- the proof message is built with `authorAddress` in place of `authorPublicKey`, or with a different
  `domainSeparator`.

## Rationale

- **Bind to the key, not the name.** An author's identity is the signing key
  ([BSIP-10](./bsip-10.md)). The runtime address is `author.name || publicKey`, and a name can be
  repointed to another key. A proof over a name would transfer to whoever holds the name next. The
  field is called `authorPublicKey` rather than `authorAddress` so that an implementer does not pass
  the runtime address out of habit, which is what existing implementations did.
- **A plain EIP-191 message.** Every wallet and hardware device can sign a text message, and the user
  can read what they sign. EIP-712 typed data displays better in some wallets but is supported less
  widely. `signature.type` leaves room to add other schemes in later BSIPs. Contract accounts
  ([ERC-1271](https://eips.ethereum.org/EIPS/eip-1271)) and other chain families are the expected
  additions; both need more than signature recovery to verify, so they are left out here.
- **Reject unknown types.** Accepting an entry with an unknown scheme would leave unproven addresses
  in accepted publications, and every reader would have to check the type before trusting an entry.
  Rejecting keeps one meaning for an accepted entry. The cost is that wallets on other chain families
  cannot be listed until a BSIP defines their scheme.
- **Literal addresses only.** A name in `address` makes verification depend on a resolver and an RPC,
  and changes what the proof means when the name is repointed.
- **No "newest timestamp wins" rule.** Existing challenges keep a per-community record of the newest
  timestamp seen for a wallet and reject older proofs, to stop a copied proof being replayed. Once the
  message names the author's key, a copied proof is useless to anyone who does not hold that key, so
  the state protects nothing. It also cannot be reproduced by a reader, which would make validity
  depend on which community is asked.
- **Compare the proof's timestamp with the verifier's clock.** The alternative is to compare it with
  the `timestamp` of the publication that carries it, which gives every verifier the same answer
  regardless of its clock. That rule trusts the publication's timestamp, which the author chooses and
  only the community holds near the truth ([BSIP-4](./bsip-4.md#publication-acceptance)). An author
  and a community acting together could then future-date both. The clock rule does not depend on the
  community: any verifier rejects a proof dated ahead of its own time. Its cost is a short disagreement
  between verifiers whose clocks differ, which resolves as time passes.
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

Old proofs are not accepted and there is no transition format. Authors sign a new proof.

Two things break if the change is rolled out in the wrong order:

- A challenge that verifies wallet proofs (a token gate, for example) rebuilds the old string. Once an
  author's client re-signs with the new message, that challenge recovers a different address and
  fails every publication from the author.
- A community that turns on the acceptance rule rejects every publication from an author whose client
  still holds an old proof.

The rollout is therefore ordered:

1. Challenges that verify wallet proofs switch to [Verification](#verification).
2. Clients ship the new proof message and re-sign saved wallets, automatically where the client holds
   the wallet key and with a prompt where it does not.
3. Community nodes turn on the acceptance rule in a later release.

Between steps 1 and 2, an author whose client has not updated fails an updated challenge. That is
already the case in deployments where the client and the challenge use different strings. A community
operator who needs both to keep working SHOULD update the challenge and tell authors to update their
client at the same time.

Comments accepted before a community applied this BSIP keep their old entries. This BSIP does not
require a community to re-check or remove them. A client treats them like any other entry: it
verifies an entry before relying on it ([Clients](#clients)), and an old entry fails.

Wallet entries on chain families other than those using `0x` addresses cannot be valid under this
BSIP and are rejected once a community enforces it.

## Security Considerations

- **Abuse and forgery.** The proof is public, since it is published with every publication that
  carries it. Copying another author's entry fails, because the proof message names the original
  author's key and the recovered address will not match under any other key. The author's signature
  over the publication covers the entry, so the binding is mutual: the wallet names the key, and the
  key names the wallet. A proof is not bound to a community, so an author can reuse it everywhere; that
  is intended.
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

## Copyright

Copyright and related rights waived via [CC0](../LICENSE.md).
