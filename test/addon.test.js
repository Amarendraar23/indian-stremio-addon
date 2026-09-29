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
