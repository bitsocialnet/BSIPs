// The builder's ENSv2 reader against the deployed ENSv2 contracts, on a local fork of mainnet.
// Skipped unless ANVIL_RPC_URL points at an anvil fork, because it moves that chain's clock:
//
//   anvil --fork-url <mainnet RPC> --port 18547
//   ANVIL_RPC_URL=http://127.0.0.1:18547 node --test assets/bsip-13/ens-v2.fork.test.mjs
//
// It shows the case no seeded name is in today: blog.bitsocial.eth is registered in its own
// registry with an expiry that never arrives, so once bitsocial.eth expires only the walk from the
// ETH registry notices that the subname no longer resolves.
//
// It also reads menaskop.eth, a locked name migrated at block 26494269, so the fork must be at
// that block or later.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, hexToBigInt, http, isAddressEqual, labelhash, namehash, parseAbi, publicActions, zeroAddress } from 'viem';
import { mainnet } from 'viem/chains';
import { ETH_REGISTRY_V2, GRAVEYARD, isReadFromV2, readV2, v2RegistryAbi } from './ens-v2.mjs';

const url = process.env.ANVIL_RPC_URL;
const REGISTERED = 2;

test('on a mainnet fork, a subname stops being registered when its second-level name expires', { skip: !url && 'set ANVIL_RPC_URL to an anvil mainnet fork' }, async () => {
  const client = createTestClient({ chain: mainnet, mode: 'anvil', transport: http(url, { timeout: 120_000 }) }).extend(publicActions);
  const state = (registry, label) =>
    client.readContract({ address: registry, abi: v2RegistryAbi, functionName: 'getState', args: [hexToBigInt(labelhash(label))] });

  // Before: both names are registered, each held by its ENSv2 owner.
  const parentBefore = await readV2(client, undefined, 'bitsocial.eth');
  const subBefore = await readV2(client, undefined, 'blog.bitsocial.eth');
  assert.equal(parentBefore.inactive, null);
  assert.equal(subBefore.inactive, null);
  assert.notEqual(parentBefore.holder, zeroAddress);
  assert.notEqual(subBefore.holder, zeroAddress);
  assert.notEqual(subBefore.resolver, zeroAddress);

  const subregistry = await client.readContract({ address: ETH_REGISTRY_V2, abi: v2RegistryAbi, functionName: 'getSubregistry', args: ['bitsocial'] });
  const parentState = await state(ETH_REGISTRY_V2, 'bitsocial');
  const subState = await state(subregistry, 'blog');
  assert.equal(parentState.status, REGISTERED);
  assert.equal(subState.status, REGISTERED);
  assert.ok(subState.expiry > parentState.expiry, 'the subname outlives its second-level name');

  // Move the fork's clock to the second-level name's expiry.
  await client.setNextBlockTimestamp({ timestamp: parentState.expiry });
  await client.mine({ blocks: 1 });
  assert.ok((await client.getBlock()).timestamp >= parentState.expiry);

  // The subname's own registry still reports it registered...
  assert.equal((await state(subregistry, 'blog')).status, REGISTERED);
  // ...but the second-level name is gone, and the reader rejects both.
  assert.notEqual((await state(ETH_REGISTRY_V2, 'bitsocial')).status, REGISTERED);
  const parentAfter = await readV2(client, undefined, 'bitsocial.eth');
  const subAfter = await readV2(client, undefined, 'blog.bitsocial.eth');
  assert.equal(parentAfter.inactive, 'not registered in ENS at S (ENSv2 bitsocial.eth is not registered)');
  assert.equal(subAfter.inactive, 'not registered in ENS at S (ENSv2 bitsocial.eth is not registered)');
  assert.equal(subAfter.holder, zeroAddress);
  assert.equal(subAfter.resolver, zeroAddress);
});

test('on a mainnet fork, a migrated locked name is read from ENSv2', { skip: !url && 'set ANVIL_RPC_URL to an anvil mainnet fork' }, async () => {
  const client = createTestClient({ chain: mainnet, mode: 'anvil', transport: http(url, { timeout: 120_000 }) }).extend(publicActions);
  const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
  const NAME_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';
  const name = 'menaskop.eth';
  const node = namehash(name);

  // ENSv1 still shows NameWrapper as the registry owner: only the wrapped token went to the Graveyard.
  const registryOwner = await client.readContract({
    address: ENS_REGISTRY,
    abi: parseAbi(['function owner(bytes32 node) view returns (address)']),
    functionName: 'owner',
    args: [node],
  });
  const holder = await client.readContract({
    address: NAME_WRAPPER,
    abi: parseAbi(['function ownerOf(uint256 id) view returns (address)']),
    functionName: 'ownerOf',
    args: [hexToBigInt(node)],
  });
  assert.ok(isAddressEqual(registryOwner, NAME_WRAPPER));
  assert.ok(isAddressEqual(holder, GRAVEYARD));
  assert.equal(isReadFromV2({ inactive: null, registryOwner, holder }), true);

  // ENSv2 has it registered, held by the account it was migrated to.
  const v2 = await readV2(client, undefined, name);
  assert.equal(v2.inactive, null);
  assert.notEqual(v2.holder, zeroAddress);
  assert.ok(!isAddressEqual(v2.holder, GRAVEYARD));
});
