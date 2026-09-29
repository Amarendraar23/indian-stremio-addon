import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAddon, INDIAN_LANGUAGES } from '../src/addon.js';
import { createTmdb } from '../src/tmdb.js';
import { createServer } from '../src/server.js';

const movie = { id: 1, title: 'Indian Film', original_language: 'hi', origin_country: ['IN'], production_countries: [{ iso_3166_1: 'IN' }], release_date: '2024-01-01', imdb_id: 'tt1234567' };

test('discovery combines Indian country and language filters', async () => {
  const calls = [];
  const addon = createAddon(async (path, params) => {
    calls.push({ path, params });
    return path.startsWith('/discover') ? { results: [{ id: 1 }] } : movie;
  }, () => '2026-09-29');
  const result = await addon.catalog('movie', 'recent', { skip: '20' });
  assert.equal(calls[0].params.with_origin_country, 'IN');
  assert.equal(calls[0].params.with_original_language, INDIAN_LANGUAGES.join('|'));
  assert.equal(calls[0].params.page, 2);
  assert.equal(calls[0].params['primary_release_date.lte'], '2026-09-29');
  assert.equal(result.metas[0].id, 'tt1234567');
  assert.equal(result.metas[0].language, 'hi');
  assert.equal(result.metas[0].imdbRating, undefined);
});

test('language-specific series sorting and vote threshold', async () => {
  let query;
  const addon = createAddon(async (_, params) => { query = params; return { results: [] }; });
  await addon.catalog('series', 'rated', {}, 'ta');
  assert.equal(query.with_original_language, 'ta');
  assert.equal(query['vote_count.gte'], 50);
  await addon.catalog('series', 'recent');
  assert.equal(query.sort_by, 'first_air_date.desc');
});

test('search checks Indian origin, excludes adult titles, and deduplicates', async () => {
  const addon = createAddon(async path => {
    if (path.startsWith('/search')) return { total_pages: 2, results: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    if (path.endsWith('/2')) return { ...movie, id: 2, origin_country: ['US'], production_countries: [{ iso_3166_1: 'US' }] };
    if (path.endsWith('/3')) return { ...movie, id: 3, adult: true };
    return movie;
  });
  assert.equal((await addon.catalog('movie', 'search', { search: 'Film' })).metas.length, 1);
});

test('missing IMDb IDs retain a stable TMDB fallback', async () => {
  const addon = createAddon(async path => path.startsWith('/discover') ? { results: [{ id: 1 }] } : { ...movie, imdb_id: null });
  assert.equal((await addon.catalog('movie', 'popular')).metas[0].id, 'indiantmdb:movie:1');
});

test('series metadata uses IMDb episode IDs and omits unknown air dates', async () => {
  const addon = createAddon(async path => {
    if (path.startsWith('/find')) return { tv_results: [{ id: 8 }] };
    if (path.includes('/season/')) return { episodes: [
      { season_number: 1, episode_number: 1, name: 'Pilot', air_date: '2024-02-01' },
      { season_number: 1, episode_number: 2, name: 'Unknown', air_date: null }
    ] };
    return { id: 8, name: 'Indian Series', original_language: 'hi', origin_country: ['IN'], external_ids: { imdb_id: 'tt1234568' }, seasons: [{ season_number: 1 }] };
  });
  const { meta } = await addon.meta('series', 'tt1234568');
  assert.equal(meta.videos.length, 1);
  assert.equal(meta.videos[0].id, 'tt1234568:1:1');
  assert.equal(meta.videos[0].released, '2024-02-01T00:00:00.000Z');
  assert.equal((await addon.meta('series', 'indiantmdb:movie:8')).meta, null);
});

test('metadata declines non-Indian titles', async () => {
  const addon = createAddon(async () => ({ id: 1, title: 'Foreign film', origin_country: ['US'] }));
  assert.equal((await addon.meta('movie', 'indiantmdb:movie:1')).meta, null);
});

test('offset validation and discovery limit avoid upstream requests', async () => {
  const addon = createAddon(() => { throw new Error('Unexpected request'); });
  for (const skip of ['-20', 'abc', '1']) await assert.rejects(addon.catalog('movie', 'popular', { skip }), { status: 400 });
  assert.deepEqual(await addon.catalog('movie', 'popular', { skip: '10000' }), { metas: [] });
});

test('TMDB client deduplicates, caches, expires and sends token only in header', async () => {
  let calls = 0, now = 0;
  const tmdb = createTmdb({ token: 'test-secret', now: () => now, fetcher: async (url, options) => {
    calls++;
    assert.equal(url.href.includes('test-secret'), false);
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    return { ok: true, json: async () => ({ results: [] }) };
  } });
  await Promise.all([tmdb('/discover/movie'), tmdb('/discover/movie')]);
  await tmdb('/discover/movie');
  assert.equal(calls, 1);
  now = 900001;
  await tmdb('/discover/movie');
  assert.equal(calls, 2);
});

test('missing credentials and rate limits are clear and safe', async () => {
  await assert.rejects(createTmdb()('/configuration/languages'), { status: 503 });
  const tmdb = createTmdb({ token: 'test-secret', fetcher: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(tmdb('/movie/1'), error => error.status === 503 && !error.message.includes('test-secret'));
});

test('HTTP manifest, CORS, configuration, encoded search, and errors', async t => {
  let received;
  const addon = createAddon(async () => []);
  addon.catalog = async (...args) => { received = args; return { metas: [] }; };
  const server = createServer(addon);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const manifest = await fetch(`${base}/all/manifest.json`);
  assert.equal(manifest.headers.get('access-control-allow-origin'), '*');
  const body = await manifest.json();
  assert.equal(body.catalogs.length, 8);
  assert.deepEqual(body.types, ['movie', 'series']);
  assert.ok((await (await fetch(`${base}/configure`)).text()).includes('Indian languages'));
  await fetch(`${base}/ta/catalog/movie/search/search=A%26B.json`);
  assert.equal(received[2].search, 'A&B');
  assert.equal(received[3], 'ta');
  assert.equal((await fetch(`${base}/not-found`)).status, 404);
  assert.equal((await fetch(`${base}/%ZZ`)).status, 400);
  assert.equal((await fetch(`${base}/manifest.json`, { method: 'POST' })).status, 405);
});


test('foreign original languages are excluded from discovery, search and metadata', async () => {
  const addon = createAddon(async path => path.startsWith('/discover') || path.startsWith('/search')
    ? { results: [{ id: 1 }], total_pages: 1 } : { ...movie, original_language: 'en' });
  assert.deepEqual((await addon.catalog('movie', 'popular')).metas, []);
  assert.deepEqual((await addon.catalog('movie', 'search', { search: 'Film' })).metas, []);
  assert.equal((await addon.meta('movie', 'indiantmdb:movie:1')).meta, null);
  await assert.rejects(addon.catalog('movie', 'popular', {}, 'en'), { status: 400 });
  assert.throws(() => addon.manifest('fr'), { status: 400 });
});

test('selector exposes only supported Indian languages and uses the Odia label', async () => {
  const addon = createAddon(async () => [{ iso_639_1: 'en', english_name: 'English' }, { iso_639_1: 'hi', english_name: 'Hindi' }, { iso_639_1: 'or', english_name: 'Oriya' }]);
  assert.deepEqual(await addon.languages(), [{ iso_639_1: 'hi', english_name: 'Hindi' }, { iso_639_1: 'or', english_name: 'Odia' }]);
});

test('TMDB API keys use the documented query parameter without a bearer header', async () => {
  const tmdb = createTmdb({ apiKey: 'a'.repeat(32), fetcher: async (url, options) => {
    assert.equal(url.origin, 'https://api.themoviedb.org');
    assert.equal(url.searchParams.get('api_key'), 'a'.repeat(32));
    assert.equal(options.headers.Authorization, undefined);
    return { ok: true, json: async () => [] };
  } });
  await tmdb('/configuration/languages');
});

test('encrypted configuration survives restarts and rejects tampering and a changed secret', async () => {
  const { createConfigCodec } = await import('../src/config.js');
  const codec = createConfigCodec('s'.repeat(64));
  const credential = 'a'.repeat(32);
  const encoded = codec.seal(credential);
  assert.equal(encoded.includes(credential), false);
  assert.equal(createConfigCodec('s'.repeat(64)).open(encoded), credential);
  assert.throws(() => codec.open('X' + encoded.slice(1)), { status: 400 });
  assert.throws(() => createConfigCodec('t'.repeat(64)).open(encoded), { status: 400 });
  assert.throws(() => createConfigCodec().seal(credential), { status: 503 });
});

test('personal configuration validates credentials, isolates users, and produces installable manifests', async t => {
  const seen = [];
  const factory = options => createTmdb({ ...options, fetcher: async (url, request) => {
    const key = url.searchParams.get('api_key') || request.headers.Authorization;
    seen.push(key);
    if (key === 'c'.repeat(32)) return { ok: false, status: 401 };
    const data = url.pathname.endsWith('/configuration/languages') ? []
      : url.pathname.includes('/discover/') ? { results: [{ id: 1 }] }
      : { ...movie, title: key === 'a'.repeat(32) ? 'First account' : 'Second account' };
    return { ok: true, json: async () => data };
  } });
  const server = createServer(createAddon(createTmdb()), { configSecret: 's'.repeat(64), sharedCredential: false, tmdbFactory: factory });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const submit = body => fetch(`${base}/api/configure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await (await fetch(`${base}/manifest.json`)).json()).behaviorHints.configurationRequired, true);
  assert.equal((await fetch(`${base}/all/catalog/movie/popular.json`)).status, 503);
  assert.equal((await fetch(`${base}/languages.json`)).status, 200);
  assert.equal((await submit({ language: 'all' })).status, 400);
  assert.equal((await submit({ credential: 'a'.repeat(32), language: 'en' })).status, 400);
  const rejected = await submit({ credential: 'c'.repeat(32) });
  assert.equal(rejected.status, 503);
  assert.equal((await rejected.text()).includes('c'.repeat(32)), false);
  const paths = [];
  for (const credential of ['a'.repeat(32), 'b'.repeat(32)]) {
    const response = await submit({ credential, language: 'hi' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const { path } = await response.json();
    assert.equal(path.includes(credential), false);
    paths.push(path);
    assert.equal((await (await fetch(base + path)).json()).behaviorHints.configurationRequired, false);
    const page = await fetch(base + path.replace('manifest.json', 'configure'));
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
    assert.equal((await page.text()).includes(credential), false);
  }
  for (const [index, path] of paths.entries()) {
    const response = await fetch(base + path.replace('manifest.json', 'catalog/movie/popular.json'));
    assert.equal((await response.json()).metas[0].name, index === 0 ? 'First account · Hindi' : 'Second account · Hindi');
  }
  assert.ok(seen.includes('a'.repeat(32)) && seen.includes('b'.repeat(32)));
  assert.equal((await fetch(`${base}/c/invalid/all/manifest.json`)).status, 400);
  assert.equal((await submit({ credential: 'x'.repeat(5000) })).status, 413);
});


test('language catalogue filter narrows discovery and labels cards without changing IDs or metadata names', async () => {
  let query;
  const addon = createAddon(async (path, params) => {
    if (path.startsWith('/discover')) { query = params; return { results: [{ id: 1 }] }; }
    return { ...movie, original_language: 'te', title: 'RRR' };
  });
  const shelves = addon.manifest().catalogs;
  assert.ok(shelves.every(s => s.extra.some(e => e.name === 'genre' && e.options.includes('Telugu') && e.options.length === 16)));
  const result = await addon.catalog('movie', 'popular', { genre: 'Telugu', skip: '20' });
  assert.equal(query.with_original_language, 'te');
  assert.equal(query.page, 2);
  assert.equal(result.metas[0].name, 'RRR · Telugu');
  assert.equal(result.metas[0].id, movie.imdb_id);
  assert.equal((await addon.meta('movie', 'indiantmdb:movie:1')).meta.name, 'RRR');
  assert.deepEqual((await addon.catalog('movie', 'popular', { genre: 'Hindi' })).metas, []);
  await assert.rejects(addon.catalog('movie', 'popular', { genre: 'English' }), { status: 400 });
  assert.deepEqual((await addon.catalog('movie', 'popular', { genre: 'Telugu' }, 'hi')).metas, []);
  assert.deepEqual(addon.manifest('hi').catalogs[0].extra[0].options, ['Hindi']);
});

test('series search applies language filter and card labels', async () => {
  const addon = createAddon(async path => path.startsWith('/search') ? { results: [{ id: 1 }], total_pages: 1 }
    : { ...movie, name: 'Series', title: undefined, original_language: 'ta' });
  assert.equal((await addon.catalog('series', 'search', { search: 'Series', genre: 'Tamil' })).metas[0].name, 'Series · Tamil');
  assert.deepEqual((await addon.catalog('series', 'search', { search: 'Series', genre: 'Telugu' })).metas, []);
});
