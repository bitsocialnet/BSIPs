// Tests for the builder's ENSv2 reader, with a stubbed client. Run: yarn test:seed-builder
//
// The stub mirrors the deployed ENSv2 registry (PermissionedRegistry): a name's status is REGISTERED
// only while it is unexpired and has an owner, RESERVED while unexpired without an owner, and
// AVAILABLE from its expiry on; getResolver and getSubregistry return the zero address from the
// expiry on. ens-v2.fork.test.mjs checks the same reader against the deployed contracts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToBigInt, labelhash, namehash, zeroAddress } from 'viem';
import { ETH_REGISTRY_V2, GRAVEYARD, isReadFromV2, readV2 } from './ens-v2.mjs';

const OWNER = '0x13087d38B78df0345D67c8CEE73b215589ae3A1f';
const NAME_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';
const SUB_OWNER = '0x98BDDCd3282F95A6553373Dab10b5AEfE0128117';
const RESOLVER = '0x3d4cA730C9Ff5e3C8AABa2E928C9aED59A4bb913';
const SUB_RESOLVER = '0x394D8EB4a4fDF599384DeAb25F31d111d755c398';
const SUBREGISTRY = '0x3561D3D1A499fb74Be8f3B1b0962a1bD611247EB';
const NOW = 1_800_000_000n;
const LATER = NOW + 1_000n;
const NEVER = 2n ** 64n - 1n;
const noRetry = async (fn) => {
  try {
    return await fn();
  } catch {
    return undefined;
  }
};

/**
 * registries: { [registryAddress]: { [label]: { expiry, owner?, resolver?, subregistry? } } }.
 * A registry that is not listed has no code, so every call to it fails.
 */
function stubClient(registries, now = NOW) {
  const calls = [];
  const byLabelId = (registry) =>
    new Map(Object.entries(registry).map(([label, entry]) => [hexToBigInt(labelhash(label)), entry]));
  return {
    calls,
    async readContract({ address, functionName, args, blockNumber }) {
      calls.push({ address, functionName, blockNumber });
      const registry = registries[address];
      if (!registry) throw new Error(`no contract at ${address}`);
      const expired = (entry) => !entry || now >= entry.expiry;
      if (functionName === 'getState') {
        const entry = byLabelId(registry).get(args[0]);
        const owner = entry?.owner ?? zeroAddress;
        const status = expired(entry) ? 0 : owner === zeroAddress ? 1 : 2;
        return { status, expiry: entry?.expiry ?? 0n, latestOwner: owner, tokenId: args[0], resource: args[0] };
      }
      const entry = registry[args[0]];
      if (functionName === 'getResolver') return expired(entry) ? zeroAddress : (entry.resolver ?? zeroAddress);
      if (functionName === 'getSubregistry') return expired(entry) ? zeroAddress : (entry.subregistry ?? zeroAddress);
      throw new Error(`unexpected call ${functionName}`);
    },
  };
}

const migrated = (overrides = {}) => ({
  [ETH_REGISTRY_V2]: {
    bitsocial: { expiry: LATER, owner: OWNER, resolver: RESOLVER, subregistry: SUBREGISTRY, ...overrides },
  },
  // Like blog.bitsocial.eth on mainnet: registered in its own registry with an expiry that never arrives.
  [SUBREGISTRY]: { blog: { expiry: NEVER, owner: SUB_OWNER, resolver: SUB_RESOLVER } },
});

test('a migrated second-level name is registered and held by its ENSv2 owner', async () => {
  const state = await readV2(stubClient(migrated()), 123n, 'bitsocial.eth', noRetry);
  assert.deepEqual(state, { ens: 'v2', node: namehash('bitsocial.eth'), resolver: RESOLVER, holder: OWNER, inactive: null });
});

test('a subname whose ancestors are all registered is registered and held by its own owner', async () => {
  const state = await readV2(stubClient(migrated()), 123n, 'blog.bitsocial.eth', noRetry);
  assert.deepEqual(state, {
    ens: 'v2',
    node: namehash('blog.bitsocial.eth'),
    resolver: SUB_RESOLVER,
    holder: SUB_OWNER,
    inactive: null,
  });
});

test('a subname is not registered once its second-level name has expired, though its own registry still reports it registered', async () => {
  const afterExpiry = stubClient(migrated(), LATER);
  // The subname's own registry, asked directly, still says REGISTERED.
  const own = await afterExpiry.readContract({
    address: SUBREGISTRY,
    functionName: 'getState',
    args: [hexToBigInt(labelhash('blog'))],
  });
  assert.equal(own.status, 2);

  const state = await readV2(afterExpiry, 123n, 'blog.bitsocial.eth', noRetry);
  assert.equal(state.inactive, 'not registered in ENS at S (ENSv2 bitsocial.eth is not registered)');
  assert.equal(state.holder, zeroAddress);
  assert.equal(state.resolver, zeroAddress);

  const parent = await readV2(stubClient(migrated(), LATER), 123n, 'bitsocial.eth', noRetry);
  assert.equal(parent.inactive, 'not registered in ENS at S (ENSv2 bitsocial.eth is not registered)');
  assert.equal(parent.holder, zeroAddress);
});

test('a subname is not registered when its parent has no subregistry', async () => {
  const state = await readV2(stubClient(migrated({ subregistry: zeroAddress })), 123n, 'blog.bitsocial.eth', noRetry);
  assert.equal(state.inactive, 'not registered in ENS at S (no ENSv2 subregistry)');
  assert.equal(state.holder, zeroAddress);
});

test('a deeper subname needs every name above it to be registered', async () => {
  const DEEP = '0x00000000000000000000000000000000000000d1';
  const registries = {
    ...migrated(),
    [SUBREGISTRY]: { blog: { expiry: NOW, owner: SUB_OWNER, resolver: SUB_RESOLVER, subregistry: DEEP } },
    [DEEP]: { posts: { expiry: NEVER, owner: SUB_OWNER, resolver: SUB_RESOLVER } },
  };
  const state = await readV2(stubClient(registries), 123n, 'posts.blog.bitsocial.eth', noRetry);
  assert.equal(state.inactive, 'not registered in ENS at S (ENSv2 blog.bitsocial.eth is not registered)');
});

test('a name ENSv2 only reserves (an unmigrated ENSv1 name) is not read as registered', async () => {
  // Like memes.eth on mainnet: unexpired in the ETH registry, with no owner there.
  const registries = { [ETH_REGISTRY_V2]: { memes: { expiry: LATER, resolver: RESOLVER } } };
  const state = await readV2(stubClient(registries), 123n, 'memes.eth', noRetry);
  assert.equal(state.inactive, 'not registered in ENS at S (ENSv2 memes.eth is not registered)');
  assert.equal(state.holder, zeroAddress);
});

test('a name the ETH registry has never seen is not registered', async () => {
  const state = await readV2(stubClient({ [ETH_REGISTRY_V2]: {} }), 123n, 'nobody.eth', noRetry);
  assert.equal(state.inactive, 'not registered in ENS at S (ENSv2 nobody.eth is not registered)');
});

test('a registry that cannot be read is marked for manual review, not seeded', async () => {
  const registries = migrated();
  delete registries[SUBREGISTRY]; // the parent points at a subregistry that does not answer
  const state = await readV2(stubClient(registries), 123n, 'blog.bitsocial.eth', noRetry);
  assert.equal(state.inactive, 'could not read its ENSv2 registry at S: needs manual review');
  assert.equal(state.holder, zeroAddress);
});

test('every call is made at the block it is given', async () => {
  const client = stubClient(migrated());
  await readV2(client, 26_444_681n, 'blog.bitsocial.eth', noRetry);
  assert.equal(client.calls.length, 6);
  assert.ok(client.calls.every((call) => call.blockNumber === 26_444_681n));
  assert.deepEqual([...new Set(client.calls.map((call) => call.address))], [ETH_REGISTRY_V2, SUBREGISTRY]);
});

test('which registry a name is read from follows the ENSv1 state of its second-level name', () => {
  // Migrated, unwrapped or unlocked: the v1 registry lists the migration Graveyard as its owner.
  assert.equal(isReadFromV2({ inactive: null, registryOwner: GRAVEYARD, holder: GRAVEYARD }), true);
  assert.equal(isReadFromV2({ inactive: null, registryOwner: GRAVEYARD.toLowerCase(), holder: GRAVEYARD }), true);
  // An ordinary ENSv1 name stays on v1, wrapped or not.
  assert.equal(isReadFromV2({ inactive: null, registryOwner: OWNER, holder: OWNER }), false);
  assert.equal(isReadFromV2({ inactive: null, registryOwner: NAME_WRAPPER, holder: OWNER }), false);
  // A name v1 does not hold (never registered there, or past its grace period) is looked up in v2.
  assert.equal(isReadFromV2({ inactive: 'not registered in ENS at S', registryOwner: zeroAddress, holder: zeroAddress }), true);
  assert.equal(isReadFromV2({ inactive: 'expired past the ENS v1 grace period at S', registryOwner: OWNER, holder: zeroAddress }), true);
});

test('a migrated locked name is read from ENSv2 although NameWrapper still owns it in the v1 registry', () => {
  // Migration does not unwrap a locked name: the wrapped token moves to the Graveyard.
  assert.equal(isReadFromV2({ inactive: null, registryOwner: NAME_WRAPPER, holder: GRAVEYARD }), true);
  assert.equal(isReadFromV2({ inactive: null, registryOwner: NAME_WRAPPER, holder: GRAVEYARD.toLowerCase() }), true);
});
