# BSIP-13 seed list

The names the interim `.bso` registry registers at launch, and the script that builds them, as
[BSIP-13](../../BSIPS/bsip-13.md#seed-list) requires.

| File | What it is |
| --- | --- |
| `build-seed-list.mjs` | Builds the seed list at snapshot block `S`. |
| `reserved.json` | Reserved names (rule 3). The builder fails if it differs from the table in BSIP-13. |
| `supplied-names.json` | Supplied names: `lists`, from the maintainers' community lists, and `owners`, names that owners sent in. |
| `collect-list-names.mjs` | Refreshes `lists` from a checkout of [bitsocialnet/lists](https://github.com/bitsocialnet/lists). |
| `seed-list.json` | Output: the snapshot block, every entry in seeding order (parents first), the candidates not seeded and why, and any event nodes that could not be mapped to a name. |
| `seed-tree.json` | Output once every owner address is known: the OpenZeppelin `StandardMerkleTree` dump. Its root is `SEED_ROOT`, and it gives the proof for every entry. |

## Build and check

```bash
yarn install
RPC_URL=<mainnet RPC> node assets/bsip-13/build-seed-list.mjs --block <S>
RPC_URL=<mainnet RPC> node assets/bsip-13/build-seed-list.mjs --check
```

Without `--block`, `S` is the latest finalized block. `--check` rebuilds at the block recorded in
`seed-list.json` and fails if either output file differs, so anyone can confirm the published list
and root.

The RPC must serve archive state at `S` and `eth_getLogs` with topic filters over the whole chain.
Ranges it refuses are split until it accepts them. On 2026-11-18,
`https://gateway.tenderly.co/public/mainnet` served both, and a build took about 20 seconds. Most other
public endpoints cap log ranges or refuse archive reads.

To refresh the community-list names, run `node assets/bsip-13/collect-list-names.mjs <path to lists>`
on a clean checkout. To add a name an owner sent, add `{ "name": "x.bso" }` to `owners` in
`supplied-names.json` and rebuild.

## How names are found

Candidates are every node with a `TextChanged` event for the key `bitsocial`, from any contract, up
to `S`, and every supplied name. An event gives a node, not a name. The builder maps a node through
the supplied names and their ancestors, NameWrapper's `NameWrapped` events, the `NewOwner` and
registrar `Transfer` events in the transaction that set the record, `NewOwner` events under every
known name and under every `.eth` name the node's owner holds, and any event that carries a label's
plaintext with its labelhash as the first indexed topic. A node it cannot map is listed in
`unmappedNodes`, with its labelhash and parent when they are known.

## How names are confirmed at `S`

A candidate must be an ENSIP-15 normalized `.eth` name.

- **ENSv1 names** are read from the ENS registry, BaseRegistrar and NameWrapper. A second-level name
  is registered until 90 days after its expiry. Its holder is its registrant, or the holder of the
  wrapped name. A subname's holder is its registry owner, or the holder of the wrapped name.
- **ENSv2 names**, under a second-level name that was migrated (its ENSv1 registry owner is the
  migration Graveyard `0xDa021A2C1C2F99574D861Ef8c6fA745851BEB7F6`) or that ENSv1 does not hold, are
  read by walking the ENSv2 registries from the ETH registry
  `0xf60aba43E1f7F3DAB1186Ff03B561401C9Df85E2`. A name counts as registered while its registry
  reports `REGISTERED`, and its holder is that registry's owner. ENSv2 stops resolving a name at its
  expiry, and its grace period only allows renewal.

The record is read from the name's own resolver with `text`, or with ENSIP-10 `resolve` for a
resolver that answers only that way, with offchain lookups disabled. It is then compared with the
Universal Resolver that BSIP-10 clients use. A name with no resolver of its own, an offchain record,
or a disagreement is not seeded. The last two are marked "needs manual review".

## Leaves

Each entry is `[label, parent, owner, record]`, encoded as `["string", "uint256", "address",
"string"]`. `parent` is `0` for a top-level name, and otherwise the decimal `uint256(namehash(p))` of
the parent's `.bso` name. The leaf hash is OpenZeppelin's standard
`keccak256(bytes.concat(keccak256(abi.encode(label, parent, owner, record))))`, which `seed` checks
with `MerkleProof.verify` against `SEED_ROOT`. Seed entries in the order `seed-list.json` lists
them, so that every parent is registered before its subdomains.
