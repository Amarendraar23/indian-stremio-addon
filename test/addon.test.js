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
  assert.equal(body.catalogs.length, 16);
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
  assert.ok(shelves.filter(s => !['decades', 'years'].includes(s.id)).every(s => s.extra.some(e => e.name === 'genre' && e.options.includes('Telugu') && e.options.length === 16)));
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

test('multiple languages are canonical, restrict discovery/search, and reject invalid settings', async () => {
  const { discoveryConfig, encodeDiscovery, decodeDiscovery } = await import('../src/discovery.js');
  const config = discoveryConfig({ languages: ['ta', 'hi', 'ta'] });
  assert.deepEqual(config.languages, ['hi', 'ta']);
  assert.deepEqual(decodeDiscovery(encodeDiscovery(config)), config);
  for (const languages of [[], ['en'], 'hi', [null]]) assert.throws(() => discoveryConfig({ languages }), { status: 400 });
  assert.throws(() => decodeDiscovery('bad'), { status: 400 });
  let query;
  const addon = createAddon(async (path, params) => {
    if (path.startsWith('/discover') || path.startsWith('/search')) { query = params; return { results: [{ id: 1 }, { id: 2 }, { id: 3 }] }; }
    const id = Number(path.split('/').at(-1));
    return { ...movie, id, original_language: ['hi', 'ta', 'te'][id - 1] };
  });
  assert.equal((await addon.catalog('movie', 'popular', {}, config)).metas.length, 2);
  assert.equal(query.with_original_language, 'hi|ta');
  assert.equal((await addon.catalog('movie', 'search', { search: 'Film' }, config)).metas.length, 2);
  assert.deepEqual(await addon.catalog('movie', 'popular', { genre: 'Telugu' }, config), { metas: [] });
  assert.deepEqual(addon.manifest(config).catalogs[0].extra[0].options, ['Hindi', 'Tamil']);
});

test('hidden gems enforce inclusive vote boundaries, rating, release, origin and language', async () => {
  let params;
  const fixtures = [
    { vote_count: 20 }, { vote_count: 500 }, { vote_count: 19 }, { vote_count: 501 },
    { vote_average: 6.9 }, { release_date: '2027-01-01' }, { release_date: '' },
    { adult: true }, { original_language: 'en' }, { origin_country: ['US'], production_countries: [] }
  ];
  const addon = createAddon(async (path, query) => {
    if (path.startsWith('/discover')) { params = query; return { results: fixtures.map((_, id) => ({ id })) }; }
    return { ...movie, vote_average: 7, vote_count: 100, ...fixtures[Number(path.split('/').at(-1))] };
  }, () => '2026-09-29');
  assert.equal((await addon.catalog('movie', 'gems')).metas.length, 2);
  assert.equal(params['vote_count.gte'], 20);
  assert.equal(params['vote_count.lte'], 500);
  assert.equal(params['vote_average.gte'], 7);
  assert.equal(params.sort_by, 'vote_average.desc');
});

test('decades map to movie release or TV first-air dates and cap current decade at today', async () => {
  const calls = [];
  const addon = createAddon(async (path, params) => { calls.push({ path, params }); return { results: [] }; }, () => '2026-09-29');
  assert.deepEqual(await addon.catalog('movie', 'decades'), { metas: [] });
  await assert.rejects(addon.catalog('movie', 'decades', { genre: '2030s' }), { status: 400 });
  assert.equal(calls.length, 0);
  await addon.catalog('movie', 'decades', { genre: '1990s', skip: '20' }, 'hi');
  assert.equal(calls[0].params['primary_release_date.gte'], '1990-01-01');
  assert.equal(calls[0].params['primary_release_date.lte'], '1999-12-31');
  assert.equal(calls[0].params.page, 2);
  await addon.catalog('series', 'decades', { genre: '2020s' });
  assert.equal(calls[1].params['first_air_date.gte'], '2020-01-01');
  assert.equal(calls[1].params['first_air_date.lte'], '2026-09-29');
});

test('year selectors advertise descending years for both media types', () => {
  const addon = createAddon(() => { throw new Error('Unexpected request'); }, () => '2026-09-29');
  const catalogs = addon.manifest('hi').catalogs.filter(c => c.id === 'years');
  assert.deepEqual(catalogs.map(c => c.type), ['movie', 'series']);
  for (const catalog of catalogs) {
    assert.equal(catalog.name, 'India · By year');
    const selector = catalog.extra.find(e => e.name === 'genre');
    assert.equal(selector.isRequired, true);
    assert.equal(selector.options.length, 117);
    assert.deepEqual(selector.options.slice(0, 2), ['2026', '2025']);
    assert.equal(selector.options.at(-1), '1910');
    assert.ok(catalog.extra.some(e => e.name === 'skip'));
  }
});

test('year filtering validates selection before requesting TMDB and respects page bounds', async () => {
  const addon = createAddon(() => { throw new Error('Unexpected request'); }, () => '2026-09-29');
  assert.deepEqual(await addon.catalog('movie', 'years'), { metas: [] });
  for (const genre of ['', '1909', '2027', '2024s', '2024.0', 'Hindi', ' 2024', 2024, null]) {
    await assert.rejects(addon.catalog('movie', 'years', { genre }), { status: 400 });
  }
  await assert.rejects(addon.catalog('movie', 'years', { genre: '2024', skip: '1' }), { status: 400 });
  assert.deepEqual(await addon.catalog('movie', 'years', { genre: '2024', skip: '10000' }), { metas: [] });
});

test('year discovery uses media-specific dates, inclusive boundaries, configured languages and pagination', async () => {
  for (const type of ['movie', 'series']) {
    const calls = [];
    const dateField = type === 'movie' ? 'release_date' : 'first_air_date';
    const dates = ['2024-01-01', '2024-12-31', '2023-12-31', '2025-01-01', '', null];
    const fixtures = dates.map((value, id) => ({ ...movie, id, release_date: '2024-01-01', [dateField]: value }));
    fixtures.push({ ...fixtures[0], id: 6, original_language: 'te' }, { ...fixtures[0], id: 7, adult: true },
      { ...fixtures[0], id: 8, origin_country: ['US'], production_countries: [] });
    const addon = createAddon(async (path, params) => {
      calls.push({ path, params });
      return path.startsWith('/discover') ? { results: fixtures.map(({ id }) => ({ id })) } : fixtures[Number(path.split('/').at(-1))];
    }, () => '2026-09-29');
    const result = await addon.catalog(type, 'years', { genre: '2024', skip: '20' }, { languages: ['hi', 'ta'] });
    assert.equal(result.metas.length, 2);
    const { path, params } = calls[0];
    const prefix = type === 'movie' ? 'primary_release_date' : 'first_air_date';
    assert.equal(path, type === 'movie' ? '/discover/movie' : '/discover/tv');
    assert.equal(params[`${prefix}.gte`], '2024-01-01');
    assert.equal(params[`${prefix}.lte`], '2024-12-31');
    assert.equal(params.page, 2);
    assert.equal(params.with_original_language, 'hi|ta');
    assert.equal(params.with_origin_country, 'IN');
    assert.equal(params.sort_by, 'popularity.desc');
  }
});

test('current-year catalogues exclude future releases and missing dates for movies and series', async () => {
  for (const type of ['movie', 'series']) {
    const dateField = type === 'movie' ? 'release_date' : 'first_air_date';
    const dates = ['2026-01-01', '2026-09-29', '2026-09-30', '2026-12-31', ''];
    let query;
    const addon = createAddon(async (path, params) => {
      if (path.startsWith('/discover')) { query = params; return { results: dates.map((_, id) => ({ id })) }; }
      return { ...movie, [dateField]: dates[Number(path.split('/').at(-1))] };
    }, () => '2026-09-29');
    assert.equal((await addon.catalog(type, 'years', { genre: '2026' })).metas.length, 2);
    assert.equal(query[type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte'], '2026-09-29');
  }
});

test('year catalogues work through legacy and configured HTTP routes', async t => {
  const { encodeDiscovery } = await import('../src/discovery.js');
  let query;
  const addon = createAddon(async (path, params) => {
    if (path.startsWith('/discover')) { query = params; return { results: [{ id: 1 }] }; }
    return movie;
  }, () => '2026-09-29');
  const server = createServer(addon);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const prefix of ['/all', `/d/${encodeDiscovery({ languages: ['hi', 'ta'] })}`]) {
    const response = await fetch(`${base}${prefix}/catalog/movie/years/genre=2024&skip=20.json`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).metas.length, 1);
    assert.equal(query.page, 2);
    assert.equal(query['primary_release_date.gte'], '2024-01-01');
  }
  assert.equal(query.with_original_language, 'hi|ta');
  assert.equal((await fetch(`${base}/all/catalog/movie/years/genre=bad.json`)).status, 400);
  assert.deepEqual(await (await fetch(`${base}/all/catalog/movie/years.json`)).json(), { metas: [] });
});

test('people collections verify exact acting/directing role and cannot be requested outside config', async () => {
  const config = { languages: ['hi'], people: [{ role: 'actor', id: 10, name: 'Actor' }, { role: 'director', id: 20, name: 'Director' }] };
  let query;
  const addon = createAddon(async (path, params) => {
    if (path.startsWith('/discover')) { query = params; return { results: [{ id: 1 }, { id: 2 }] }; }
    return { ...movie, credits: { cast: [{ id: 10 }], crew: [{ id: 20, job: path.endsWith('/1') ? 'Director' : 'Producer' }] } };
  });
  assert.equal(addon.manifest(config).catalogs.filter(c => c.id === 'actor-10').length, 1);
  assert.equal((await addon.catalog('movie', 'actor-10', {}, config)).metas.length, 2);
  assert.equal(query.with_cast, 10);
  assert.equal((await addon.catalog('movie', 'director-20', {}, config)).metas.length, 1);
  assert.equal(query.with_crew, 20);
  await assert.rejects(addon.catalog('series', 'actor-10', {}, config), { status: 404 });
  await assert.rejects(addon.catalog('movie', 'actor-10'), { status: 404 });
});

test('new HTTP preferences round-trip with shared and encrypted personal installs; legacy links still work', async t => {
  const tmdb = async path => path === '/configuration/languages' ? [] : path === '/search/person' ? { results: [{ id: 10, name: 'Resolved Person' }] } : path.startsWith('/person/') ? { name: 'Resolved Person' }
    : path.startsWith('/discover') ? { results: [{ id: 1 }] } : { ...movie, credits: { cast: [{ id: 10 }] } };
  const server = createServer(createAddon(tmdb), { configSecret: 's'.repeat(64), tmdbFactory: () => tmdb });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const submit = body => fetch(`${base}/api/configure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  for (const credential of ['', 'a'.repeat(32)]) {
    const response = await submit({ credential, languages: ['ta', 'hi'], people: [{ role: 'actor', id: 10, name: 'Untrusted name' }] });
    assert.equal(response.status, 200);
    const { path } = await response.json();
    assert.ok(path.includes('/d/'));
    assert.ok(!credential || !path.includes(credential));
    const manifest = await (await fetch(base + path)).json();
    assert.ok(manifest.catalogs.some(c => c.name === 'India · Starring Resolved Person'));
    assert.deepEqual(manifest.catalogs[0].extra[0].options, ['Hindi', 'Tamil']);
    const result = await (await fetch(base + path.replace('manifest.json', 'catalog/movie/actor-10.json'))).json();
    assert.equal(result.metas.length, 1);
    assert.equal((await fetch(base + path.replace('manifest.json', 'configure'))).status, 200);
  }
  assert.equal((await submit({ languages: [], people: [] })).status, 400);
  assert.equal((await submit({ languages: ['hi'], people: Array(5).fill({ role: 'actor', id: 10, name: 'x' }) })).status, 400);
  const peopleResponse = await fetch(`${base}/api/people`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personQuery: 'Name' }) });
  assert.equal(peopleResponse.status, 200);
  assert.equal((await peopleResponse.json()).people[0].name, 'Resolved Person');
  const invalidSearch = await fetch(`${base}/api/people`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personQuery: '' }) });
  assert.equal(invalidSearch.status, 400);
  assert.equal((await fetch(`${base}/d/bad/manifest.json`)).status, 400);
  assert.equal((await fetch(`${base}/hi/manifest.json`)).status, 200);
});

test('person search is bounded and excludes adult results', async () => {
  let calls = 0;
  const addon = createAddon(async (path, params) => {
    calls++;
    assert.equal(path, '/search/person');
    assert.equal(params.page, 1);
    assert.equal(params.include_adult, false);
    return { results: [{ id: 99, adult: true }, ...Array.from({ length: 20 }, (_, id) => ({ id, name: 'Person', known_for: [{ title: 'Film' }] }))] };
  });
  const results = await addon.searchPeople('Name');
  assert.equal(calls, 1);
  assert.equal(results.length, 10);
  assert.ok(!results.some(p => p.id === 99));
  assert.equal(results[0].knownFor, 'Film');
});

 test('catalogue selections round-trip, preserve legacy defaults, and reject unknown values', async () => {
  const { discoveryConfig, encodeDiscovery, decodeDiscovery, CATALOGUE_KEYS } = await import('../src/discovery.js');
  assert.deepEqual(discoveryConfig('hi').catalogues, CATALOGUE_KEYS);
  assert.deepEqual(decodeDiscovery(Buffer.from(JSON.stringify({ languages: ['hi'], people: [] })).toString('base64url')).catalogues, CATALOGUE_KEYS);
  const config = discoveryConfig({ languages: ['hi'], catalogues: ['series:search', 'movie:recent', 'movie:recent'] });
  assert.deepEqual(config.catalogues, ['movie:recent', 'series:search']);
  assert.deepEqual(decodeDiscovery(encodeDiscovery(config)), config);
  for (const catalogues of [null, 'movie:recent', ['movie:unknown'], ['tv:popular'], [null]]) {
    assert.throws(() => discoveryConfig({ languages: ['hi'], catalogues }), { status: 400 });
  }
});

test('selected manifests and routes exclude disabled catalogues without upstream requests', async () => {
  let calls = 0;
  const addon = createAddon(async path => { calls++; return path.startsWith('/discover') ? { results: [] } : movie; });
  const config = { languages: ['hi'], catalogues: ['movie:recent'], people: [{ role: 'actor', id: 10, name: 'Person' }] };
  assert.deepEqual(addon.manifest(config).catalogs.map(c => `${c.type}:${c.id}`), ['movie:recent', 'movie:actor-10']);
  for (const [type, id] of [['movie', 'popular'], ['series', 'recent'], ['movie', 'search'], ['movie', 'decades'], ['movie', 'years']]) {
    await assert.rejects(addon.catalog(type, id, {}, config), { status: 404 });
  }
  assert.equal(calls, 0);
  assert.deepEqual((await addon.catalog('movie', 'recent', {}, config)).metas, []);
  assert.equal(calls, 1);
  assert.deepEqual(addon.manifest({ languages: ['hi'], catalogues: [] }).catalogs, []);
  assert.equal((await addon.meta('movie', 'indiantmdb:movie:1')).meta.name, 'Indian Film');
});

test('HTTP configuration preserves individual catalogues for shared and personal install links', async t => {
  const tmdb = async path => path === '/configuration/languages' ? [] : { results: [] };
  const server = createServer(createAddon(tmdb), { configSecret: 's'.repeat(64), tmdbFactory: () => tmdb });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const credential of ['', 'a'.repeat(32)]) for (const catalogues of [['movie:recent'], []]) {
    const response = await fetch(`${base}/api/configure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential, language: 'hi', catalogues }) });
    assert.equal(response.status, 200);
    const { path } = await response.json();
    assert.ok(path.includes('/d/'));
    const manifest = await (await fetch(base + path)).json();
    assert.deepEqual(manifest.catalogs.map(c => `${c.type}:${c.id}`), catalogues);
    assert.equal((await fetch(base + path.replace('manifest.json', 'catalog/series/popular.json'))).status, 404);
    assert.equal((await fetch(base + path.replace('manifest.json', 'configure'))).status, 200);
  }
});

test('future shelves enforce UTC date boundaries, country and languages for movies and series', async () => {
  for (const type of ['movie', 'series']) {
    const dateKey = type === 'movie' ? 'release_date' : 'first_air_date';
    const queryKey = type === 'movie' ? 'primary_release_date' : 'first_air_date';
    const dates = ['2026-12-30', '2026-12-31', '2027-01-01', '2027-03-31', '2027-04-01', '', null, 'unknown'];
    const items = dates.map((value, i) => ({ ...movie, id: i + 1, imdb_id: `tt${100 + i}`, release_date: undefined, [dateKey]: value, vote_count: 0 }));
    items.push({ ...items[2], id: 20, adult: true }, { ...items[2], id: 21, original_language: 'ta' }, { ...items[2], id: 22, origin_country: ['US'], production_countries: [] });
    const calls = [];
    const addon = createAddon(async (path, params) => {
      calls.push({ path, params });
      return path.startsWith('/discover/') ? { results: items.map(({ id }) => ({ id })) } : items.find(item => item.id === Number(path.split('/').pop()));
    }, () => '2026-12-31');
    for (const id of ['upcoming']) {
      calls.length = 0;
      const result = await addon.catalog(type, id, { genre: 'Hindi', skip: '20' }, { languages: ['hi', 'ta'] });
      assert.deepEqual(result.metas.map(item => item.id), ['tt102', 'tt103', 'tt104']);
      assert.equal(calls[0].path, type === 'movie' ? '/discover/movie' : '/discover/tv');
      assert.equal(calls[0].params[`${queryKey}.gte`], '2027-01-01');
      assert.equal(calls[0].params[`${queryKey}.lte`], undefined);
      assert.equal(calls[0].params.sort_by, `${queryKey}.asc`);
      assert.equal(calls[0].params.page, 2);
      assert.equal(calls[0].params.with_original_language, 'hi');
      assert.equal(calls[0].params['vote_count.gte'], undefined);
      assert.ok(result.metas.every(item => item.released && item.language === 'hi'));
    }
    const before = calls.length;
    assert.deepEqual((await addon.catalog(type, 'upcoming', { skip: '10000' })).metas, []);
    assert.equal(calls.length, before);
    await assert.rejects(addon.catalog(type, 'upcoming', {}, { languages: ['hi'], catalogues: [] }), { status: 404 });
  }
});

test('future shelves are selectable and survive configuration and HTTP routes', async t => {
  const { encodeDiscovery, decodeDiscovery } = await import('../src/discovery.js');
  const catalogues = ['movie:upcoming', 'series:upcoming'];
  const encoded = encodeDiscovery({ languages: ['hi'], catalogues });
  assert.deepEqual(decodeDiscovery(encoded).catalogues, catalogues);
  const addon = createAddon(async path => path.startsWith('/discover/') ? { results: [{ id: 1 }] } : { ...movie, release_date: '2027-01-01', first_air_date: '2027-01-01' }, () => '2026-12-31');
  const server = createServer(addon);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const setup = await (await fetch(`${base}/configure`)).text();
  assert.ok(setup.includes('Coming soon / Upcoming'));
  assert.ok(setup.includes('Upcoming'));
  const manifest = await (await fetch(`${base}/d/${encoded}/manifest.json`)).json();
  assert.deepEqual(manifest.catalogs.map(c => `${c.type}:${c.id}`), catalogues);
  for (const prefix of ['/hi', `/d/${encoded}`]) for (const key of catalogues) {
    const response = await fetch(`${base}${prefix}/catalog/${key.replace(':', '/')}.json`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).metas.length, 1);
  }
});
