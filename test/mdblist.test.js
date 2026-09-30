import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAddon } from '../src/addon.js';
import { createServer } from '../src/server.js';
import { createMdbList, withMdbList } from '../src/mdblist.js';
import { createConfigCodec } from '../src/config.js';
import { discoveryConfig, encodeDiscovery, decodeDiscovery } from '../src/discovery.js';

const key = 'mdb-test-key-123456789';
const list = { id: 42, name: 'My Indian list', types: ['movie', 'series'] };
const config = { source: 'mdblist', lists: [list], languages: ['hi', 'ta'], catalogues: ['movie:mdb-42', 'series:mdb-42', 'movie:years', 'movie:search'], people: [] };
const film = id => ({ id, title: `Film ${id}`, original_language: 'hi', origin_country: ['IN'], imdb_id: `tt${1000 + id}` });
const row = id => ({ ids: { tmdb: id } });
const tmdb = async path => path === '/configuration/languages' ? [] : path.startsWith('/discover') ? { results: [] } : film(Number(path.split('/').at(-1)));

test('live MDBList singleton list details and documented objects both resolve safely', async () => {
  const info = { id: 42, name: 'Indian movies', mediatype: 'movie' };
  for (const data of [info, [info]]) {
    const mdb = createMdbList({ apiKey: key, fetcher: async () => ({ ok: true, status: 200, json: async () => data }) });
    assert.deepEqual(await mdb.info(42), { id: 42, name: 'Indian movies', types: ['movie'] });
  }
  for (const data of [[], [info, info], [{ ...info, id: 43 }]]) {
    const mdb = createMdbList({ apiKey: key, fetcher: async () => ({ ok: true, status: 200, json: async () => data }) });
    await assert.rejects(mdb.info(42));
  }
});

test('MDBList preferences preserve legacy defaults, validate list types and round-trip', () => {
  assert.deepEqual(decodeDiscovery(encodeDiscovery(config)), config);
  assert.equal(discoveryConfig('hi').source, undefined);
  assert.deepEqual(discoveryConfig({ ...config, catalogues: undefined }).catalogues, ['movie:mdb-42', 'series:mdb-42']);
  for (const change of [{ source: 'bad' }, { source: 'tmdb' }, { lists: [list, list] }, { lists: [{ ...list, types: ['tv'] }] }, { catalogues: ['movie:mdb-43'] }]) assert.throws(() => discoveryConfig({ ...config, ...change }), { status: 400 });
});

test('versioned encrypted credentials retain old TMDB links and reject tampering', () => {
  const codec = createConfigCodec('s'.repeat(64)), bundle = { version: 2, tmdb: 'a'.repeat(32), mdblist: key };
  const sealed = codec.seal(bundle);
  assert.equal(sealed.includes(key), false);
  assert.deepEqual(codec.open(sealed), bundle);
  assert.equal(codec.open(codec.seal('a'.repeat(32))), 'a'.repeat(32));
  assert.throws(() => codec.open('x' + sealed.slice(1)), { status: 400 });
  assert.throws(() => codec.seal({ ...bundle, mdblist: 'bad' }), { status: 400 });
});

test('MDBList API uses fixed GET routes, safe errors, nested cursor and media type', async () => {
  let seen;
  const mdb = createMdbList({ apiKey: key, fetcher: async (url, options) => {
    seen = { url, options };
    return { ok: true, status: 200, json: async () => ({ shows: [row(1)], pagination: { next_cursor: 'next' } }) };
  } });
  assert.deepEqual(await mdb.items(42, 'series', 'first'), { rows: [row(1)], next: 'next' });
  assert.equal(seen.url.origin, 'https://api.mdblist.com');
  assert.equal(seen.url.searchParams.get('mediatype'), 'show');
  assert.equal(seen.url.searchParams.get('cursor'), 'first');
  assert.equal(seen.options.redirect, 'error');
  for (const status of [401, 403, 404, 429, 500, 202]) {
    const failing = createMdbList({ apiKey: key, fetcher: async () => ({ ok: status === 202, status }) });
    await assert.rejects(failing.lists(), error => !error.message.includes(key) && error.status >= 400);
  }
  await assert.rejects(mdb.info('https://other.example'), { status: 400 });
});

test('API rejects malformed lists and pagination instead of calling them empty', async () => {
  const mdb = createMdbList({ apiKey: key, fetcher: async () => ({ ok: true, status: 200, headers: { get: () => 'true' }, json: async () => ({ movies: [] }) }) });
  await assert.rejects(mdb.items(42, 'movie'), /pagination/);
  await assert.rejects(mdb.lists(), /invalid lists/);
});

test('manifests expose selected MDBList shelves and retain labelled TMDB features', () => {
  const manifest = createAddon(tmdb).manifest(config);
  assert.deepEqual(manifest.catalogs.map(c => `${c.type}:${c.id}`), ['movie:mdb-42', 'series:mdb-42', 'movie:years', 'movie:search']);
  assert.match(manifest.catalogs[0].name, /MDBList/);
  assert.match(manifest.catalogs[2].name, /TMDB/);
  assert.deepEqual(manifest.catalogs[0].extra[0].options, ['Hindi', 'Tamil']);
});

test('list hydration checks origin, original language, adult status and stable IDs', async () => {
  const addon = createAddon(async path => {
    if (path.startsWith('/find/')) return { movie_results: [{ id: 1 }] };
    const id = Number(path.split('/').at(-1));
    if (id === 2) return { ...film(id), original_language: 'en' };
    if (id === 3) return { ...film(id), origin_country: ['US'] };
    if (id === 4) return { ...film(id), adult: true };
    if (id === 5) return { ...film(id), imdb_id: null, origin_country: ['US'], production_countries: [{ iso_3166_1: 'IN' }] };
    return film(id);
  });
  for (const id of [2, 3, 4]) assert.equal(await addon.listItem('movie', row(id), ['hi']), null);
  assert.equal((await addon.listItem('movie', row(5), ['hi'])).id, 'indiantmdb:movie:5');
  assert.equal((await addon.listItem('movie', { imdb_id: 'tt1001' }, ['hi'])).id, 'tt1001');
  assert.equal(await addon.listItem('movie', {}, ['hi']), null);
});

test('cursor bridge backfills filtered rows, deduplicates and handles random page access', async () => {
  const calls = [];
  const base = createAddon(async path => {
    const id = Number(path.split('/').at(-1));
    return { ...film(id), original_language: id <= 5 ? 'en' : 'hi' };
  });
  const addon = withMdbList(base, { items: async (_, type, cursor) => {
    calls.push(cursor);const page = Number(cursor || 0);
    return { rows: Array.from({ length: 20 }, (_, i) => row(page * 19 + i + 1)), next: page < 2 ? String(page + 1) : undefined };
  } });
  const page2 = await addon.catalog('movie', 'mdb-42', { skip: '20' }, config);
  const page1 = await addon.catalog('movie', 'mdb-42', {}, config);
  assert.equal(page1.metas.length, 20);assert.equal(page2.metas.length, 20);
  assert.equal(page1.metas[0].id, 'tt1006');assert.equal(page2.metas[0].id, 'tt1026');
  assert.equal(new Set([...page1.metas, ...page2.metas].map(m => m.id)).size, 40);
  assert.equal(calls.length, 3);
  await assert.rejects(addon.catalog('movie', 'mdb-43', {}, config), { status: 404 });
  await assert.rejects(addon.catalog('movie', 'mdb-42', { skip: 1 }, config), { status: 400 });
});

test('concurrent paging is coalesced, cache expires and language snapshots are isolated', async () => {
  let calls = 0, now = 0;
  const addon = withMdbList(createAddon(tmdb), { items: async () => { calls++; await new Promise(r => setTimeout(r, 5)); return { rows: [row(1)] }; } }, { now: () => now });
  await Promise.all([addon.catalog('movie', 'mdb-42', {}, config), addon.catalog('movie', 'mdb-42', {}, config)]);
  assert.equal(calls, 1);
  assert.equal((await addon.catalog('movie', 'mdb-42', { genre: 'Tamil' }, config)).metas.length, 0);
  assert.equal(calls, 2);
  now = 900001;await addon.catalog('movie', 'mdb-42', {}, config);assert.equal(calls, 3);
});

test('failed hydration is retried without losing a cursor page', async () => {
  let fail = true, calls = 0;
  const base = createAddon(tmdb), hydrate = base.listItem;
  base.listItem = async (...args) => { if (fail) throw new Error('temporary'); return hydrate(...args); };
  const addon = withMdbList(base, { items: async () => { calls++;return { rows: [row(1)] }; } });
  await assert.rejects(addon.catalog('movie', 'mdb-42', {}, config));fail = false;
  assert.equal((await addon.catalog('movie', 'mdb-42', {}, config)).metas.length, 1);assert.equal(calls, 2);
});

test('repeating cursors and excessive filtering fail explicitly with bounded work', async () => {
  const repeat = withMdbList(createAddon(tmdb), { items: async () => ({ rows: [], next: 'same' }) });
  await assert.rejects(repeat.catalog('movie', 'mdb-42', {}, config), /pagination repeated/);
  let count = 0;
  const filtered = withMdbList(createAddon(tmdb), { items: async () => ({ rows: [], next: String(++count) }) });
  await assert.rejects(filtered.catalog('movie', 'mdb-42', {}, config), /Too few matching/);
  assert.equal(count, 10);
});

test('HTTP setup loads lists, seals both keys, validates access and preserves providers', async t => {
  const mdbFactory = ({ apiKey }) => {
    assert.equal(apiKey, key);
    return { lists: async () => [list], info: async () => list, items: async () => ({ rows: [row(1)] }) };
  };
  const server = createServer(createAddon(tmdb), { configSecret: 's'.repeat(64), tmdbFactory: () => tmdb, mdbFactory, sharedCredential: false });
  server.listen(0, '127.0.0.1');await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve);server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const loaded = await post('/api/mdblist/lists', { mdblistKey: key });assert.equal(loaded.status, 200);assert.deepEqual((await loaded.json()).lists, [list]);
  const response = await post('/api/configure', { ...config, credential: 'a'.repeat(32), mdblistKey: key });
  assert.equal(response.status, 200);const { path } = await response.json();
  assert.equal(path.includes(key), false);assert.equal(path.includes('a'.repeat(32)), false);
  const manifest = await (await fetch(base + path)).json();assert.equal(manifest.behaviorHints.configurationRequired, false);
  const catalogue = await (await fetch(base + path.replace('manifest.json', 'catalog/movie/mdb-42.json'))).json();assert.equal(catalogue.metas[0].id, 'tt1001');
  const years = await fetch(base + path.replace('manifest.json', 'catalog/movie/years/genre=2024.json'));assert.equal(years.status, 200);
  const unconfigured = `/d/${encodeDiscovery(config)}/manifest.json`;
  assert.equal((await (await fetch(base + unconfigured)).json()).behaviorHints.configurationRequired, true);
  const html = await (await fetch(base + path.replace('manifest.json', 'configure'))).text();assert.equal(html.includes(key), false);assert.match(html, /Catalogue source/);
});

test('separate MDBList credentials cannot share catalogue snapshots', async t => {
  const secondKey = 'mdb-second-key-123456';
  const server = createServer(createAddon(tmdb), { configSecret: 's'.repeat(64), mdbFactory: ({ apiKey }) => ({ lists: async () => [list], info: async () => list, items: async () => ({ rows: [row(apiKey === key ? 1 : 2)] }) }) });
  server.listen(0, '127.0.0.1');await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve);server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [mdblistKey, expected] of [[key, 'tt1001'], [secondKey, 'tt1002'], [key, 'tt1001']]) {
    const response = await fetch(base + '/api/configure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...config, mdblistKey }) });
    assert.equal(response.status, 200);
    const { path } = await response.json();
    const result = await (await fetch(base + path.replace('manifest.json', 'catalog/movie/mdb-42.json'))).json();
    assert.equal(result.metas[0].id, expected);
  }
});

test('mixed list series cards keep existing episode metadata behavior', async () => {
  const base = createAddon(async path => {
    if (path.includes('/season/')) return { episodes: [{ season_number: 1, episode_number: 1, name: 'Pilot', air_date: '2024-01-01' }] };
    if (path.startsWith('/find')) return { tv_results: [{ id: 9 }] };
    return { id: 9, name: 'Indian series', original_language: 'hi', origin_country: ['IN'], external_ids: { imdb_id: 'tt1009' }, seasons: [{ season_number: 1 }] };
  });
  const addon = withMdbList(base, { items: async (_, type) => { assert.equal(type, 'series');return { rows: [row(9)] }; } });
  const { metas } = await addon.catalog('series', 'mdb-42', {}, config);
  assert.equal(metas[0].id, 'tt1009');
  assert.equal((await addon.meta('series', metas[0].id)).meta.videos[0].id, 'tt1009:1:1');
});
