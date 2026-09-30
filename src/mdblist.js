import { createLimiter, ServiceError } from './tmdb.js';
import { validateMdbKey } from './config.js';
import { discoveryConfig, INDIAN_LANGUAGES, LANGUAGE_NAMES } from './discovery.js';

// Only read fixed MDBList API routes. Keys never enter caller-visible errors.
export function createMdbList({ apiKey, fetcher = fetch, limited = createLimiter() } = {}) {
  validateMdbKey(apiKey);
  async function read(path, params = {}) {
    return limited(async () => {
      const url = new URL(`https://api.mdblist.com${path}`);
      url.searchParams.set('apikey', apiKey);
      for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
      let response;
      try { response = await fetcher(url, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
      catch { throw new ServiceError('MDBList could not be reached. Please try again.'); }
      if ([401, 403].includes(response.status)) throw new ServiceError('MDBList access denied. Check your API key and list access.', 503);
      if (response.status === 404) throw new ServiceError('MDBList list not found or no longer accessible.', 404);
      if (response.status === 429) throw new ServiceError('MDBList quota reached. Try again later.', 503);
      if (!response.ok || response.status === 202) throw new ServiceError('MDBList is not ready. Please try again later.', 503);
      let data;
      try { data = await response.json(); } catch { throw new ServiceError('MDBList returned an invalid response.'); }
      return { data, more: response.headers?.get('X-Has-More') === 'true' };
    });
  }
  function idPath(id) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new ServiceError('Enter a valid MDBList numeric list ID.', 400);
    return `/lists/${id}`;
  }
  function list(data) {
    if (!data || !Number.isSafeInteger(data.id) || data.id <= 0 || typeof data.name !== 'string' || !data.name.trim()) throw new ServiceError('MDBList returned invalid list details.');
    return { id: data.id, name: data.name.trim().slice(0, 80), types: data.mediatype === 'movie' ? ['movie'] : data.mediatype === 'show' ? ['series'] : ['movie', 'series'] };
  }
  return {
    async lists() {
      const { data } = await read('/lists/user', { sort: 'name' });
      if (!Array.isArray(data)) throw new ServiceError('MDBList returned invalid lists.');
      return data.slice(0, 300).map(list);
    },
    async info(id) {
      const { data } = await read(idPath(id));
      // The live API returns a singleton array; the published schema also allows
      // consumers to expect an object. Never pick arbitrarily from multiple lists.
      const result = list(Array.isArray(data) && data.length === 1 ? data[0] : data);
      if (result.id !== id) throw new ServiceError('MDBList returned a different list.');
      return result;
    },
    async items(id, type, cursor) {
      if (!['movie', 'series'].includes(type)) throw new ServiceError('Invalid media type.', 400);
      const { data, more } = await read(`${idPath(id)}/items`, { mediatype: type === 'movie' ? 'movie' : 'show', limit: 20, sort: 'rank', order: 'asc', cursor });
      const rows = data?.[type === 'movie' ? 'movies' : 'shows'];
      const next = data?.next_cursor ?? data?.pagination?.next_cursor;
      if (!Array.isArray(rows) || rows.length > 20 || (next != null && (typeof next !== 'string' || next.length > 2048)) || (more && !next)) throw new ServiceError('MDBList returned invalid pagination.');
      return { rows, next: next || undefined };
    }
  };
}

// Per-credential, per-language ordered snapshots bridge cursor paging to Stremio skip.
export function withMdbList(base, mdb, { now = Date.now } = {}) {
  const snapshots = new Map();
  return {
    ...base,
    async catalog(type, id, extra = {}, value = 'all') {
      if (!id.startsWith('mdb-')) return base.catalog(type, id, extra, value);
      const config = discoveryConfig(value);
      const list = config.lists?.find(l => `mdb-${l.id}` === id && l.types.includes(type));
      if (!list || !config.catalogues.includes(`${type}:${id}`)) throw new ServiceError('Catalogue not found.', 404);
      const skip = Number(extra.skip ?? 0);
      if (!Number.isSafeInteger(skip) || skip < 0 || skip % 20 !== 0) throw new ServiceError('Invalid catalogue offset.', 400);
      if (skip >= 1000) throw new ServiceError('MDBList browsing is limited to the first 1,000 candidates. Narrow the saved list.', 400);
      let languages = config.languages;
      if (extra.genre) {
        const code = INDIAN_LANGUAGES[LANGUAGE_NAMES.indexOf(extra.genre)];
        if (!code) throw new ServiceError('Unsupported Indian language filter.', 400);
        if (!languages.includes(code)) return { metas: [] };
        languages = [code];
      }
      const key = JSON.stringify([list.id, type, languages]);
      let state = snapshots.get(key);
      if (!state || (state.expires <= now() && !state.running)) {
        if (snapshots.size >= 12) {
          const removable = [...snapshots].find(([, s]) => !s.running);
          if (!removable) throw new ServiceError('MDBList is busy. Try again shortly.', 503);
          snapshots.delete(removable[0]);
        }
        state = { metas: [], seen: new Set(), cursors: new Set(), cursor: undefined, done: false, scanned: 0, expires: now() + 900000, running: null };
        snapshots.set(key, state);
      }
      // Serialize readers of the same snapshot without caching rejected promises.
      while (state.running) await state.running;
      const fill = async () => {
        let scannedThisRequest = 0;
        while (state.metas.length < skip + 20 && !state.done) {
          if (state.scanned >= 1000 || scannedThisRequest >= 200) throw new ServiceError('Too few matching Indian titles in this MDBList list. Narrow its country and Original language filters, then retry.', 503);
          const page = await mdb.items(list.id, type, state.cursor);
          if (page.next && (page.next === state.cursor || state.cursors.has(page.next))) throw new ServiceError('MDBList pagination repeated. Please try again later.');
          const metas = await Promise.all(page.rows.map(row => base.listItem(type, row, languages)));
          for (const meta of metas) if (meta && !state.seen.has(meta.id)) { state.seen.add(meta.id); state.metas.push(meta); }
          state.scanned += Math.max(page.rows.length, 20);
          scannedThisRequest += Math.max(page.rows.length, 20);
          if (page.next) state.cursors.add(page.next);
          state.cursor = page.next;
          state.done = !page.next;
        }
      };
      state.running = fill();
      try { await state.running; } finally { state.running = null; }
      return { metas: state.metas.slice(skip, skip + 20), cacheMaxAge: Math.max(0, Math.floor((state.expires - now()) / 1000)) };
    }
  };
}
