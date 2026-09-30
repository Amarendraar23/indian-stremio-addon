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
  assert.equal(body.catalogs.length, 12);
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
  assert.ok(shelves.filter(s => s.id !== 'decades').every(s => s.extra.some(e => e.name === 'genre' && e.options.includes('Telugu') && e.options.length === 16)));
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

test('operator settings default to earlier behaviour and reject invalid values', async () => {
  const { settingsFromEnv, DEFAULT_TMDB_BASE_URL, DEFAULT_LOGO_URL } = await import('../src/settings.js');
  const defaults = settingsFromEnv({});
  assert.equal(defaults.tmdbBaseUrl, DEFAULT_TMDB_BASE_URL);
  assert.equal(defaults.logoUrl, DEFAULT_LOGO_URL);
  assert.deepEqual([defaults.tmdbConcurrency, defaults.tmdbQueueLimit, defaults.searchPages, defaults.setupRateLimit, defaults.setupConcurrency], [4, 500, 5, 30, 4]);
  const custom = settingsFromEnv({ TMDB_BASE_URL: 'http://cache.internal/tmdb/3/', TMDB_CONCURRENCY: '32', SEARCH_MAX_PAGES: '1', SETUP_RATE_LIMIT: '0', LOGO_URL: 'https://addon.example/logo.png' });
  assert.equal(custom.tmdbBaseUrl, 'http://cache.internal/tmdb/3');
  assert.deepEqual([custom.tmdbConcurrency, custom.searchPages, custom.setupRateLimit, custom.logoUrl], [32, 1, 0, 'https://addon.example/logo.png']);
  for (const env of [{ TMDB_CONCURRENCY: '0' }, { TMDB_CONCURRENCY: '2.5' }, { SEARCH_MAX_PAGES: '6' }, { TMDB_BASE_URL: 'ftp://x' }, { TMDB_BASE_URL: 'https://x/3?api_key=1' }, { TMDB_BASE_URL: 'https://user:pass@x/3' }, { LOGO_URL: 'logo.png' }]) {
    assert.throws(() => settingsFromEnv(env), Error);
  }
});

test('TMDB base URL is configurable and still carries API keys', async () => {
  const tmdb = createTmdb({ apiKey: 'a'.repeat(32), baseUrl: 'http://cache.internal/tmdb/3', fetcher: async url => {
    assert.equal(url.origin + url.pathname, 'http://cache.internal/tmdb/3/movie/1');
    assert.equal(url.searchParams.get('api_key'), 'a'.repeat(32));
    return { ok: true, json: async () => ({}) };
  } });
  await tmdb('/movie/1');
});

test('limiter honours configured concurrency and queue size', async () => {
  const { createLimiter } = await import('../src/tmdb.js');
  const limited = createLimiter({ concurrency: 2, queueLimit: 0 });
  let release, active = 0, peak = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const job = () => limited(async () => { peak = Math.max(peak, ++active); await gate; active--; });
  const running = [job(), job()];
  // A queued job would wait for the gate forever, so race it against a timer.
  const overflow = await Promise.race([job().then(() => 'queued', error => error.status), new Promise(resolve => setTimeout(resolve, 200, 'queued'))]);
  assert.equal(overflow, 503);
  release();
  await Promise.all(running);
  assert.equal(peak, 2);
});

test('search page count and logo URL are configurable', async () => {
  const searched = [];
  const addon = createAddon(async (path, params) => {
    if (path.startsWith('/search')) { searched.push(params.page); return { total_pages: 9, results: [] }; }
    return movie;
  }, undefined, { searchPages: 2, logoUrl: 'https://addon.example/logo.png' });
  await addon.catalog('movie', 'search', { search: 'Film' });
  assert.deepEqual(searched.sort(), [1, 2]);
  assert.equal(addon.manifest().logo, 'https://addon.example/logo.png');
});

test('a slow setup upload does not hold a setup slot, and the setup rate limit can be disabled', async t => {
  const { connect } = await import('node:net');
  const server = createServer(createAddon(async () => []), { setupConcurrency: 1, setupRateLimit: 0 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const { port } = server.address();
  const slow = connect(port, '127.0.0.1');
  slow.on('error', () => {});
  slow.write('POST /api/configure HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{');
  await new Promise(resolve => setTimeout(resolve, 50));
  const statuses = [];
  for (let i = 0; i < 35; i++) {
    statuses.push((await fetch(`http://127.0.0.1:${port}/api/configure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"languages":[]}' })).status);
  }
  assert.deepEqual([...new Set(statuses)], [400]);
  slow.destroy();
});
