export class ServiceError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function createLimiter() {
  let active = 0;
  const queue = [];
  return async function limited(fn) {
    if (queue.length >= 500) throw new ServiceError('The add-on is busy. Please try again shortly.', 503);
    if (active >= 4) await new Promise(resolve => queue.push(resolve));
    else active++;
    try { return await fn(); }
    finally { if (queue.length) queue.shift()(); else active--; }
  };
}

export function createTmdb({ token, apiKey, fetcher = fetch, now = Date.now, maxCacheEntries = 1000, limited = createLimiter() } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function tmdb(path, params = {}) {
    if (!token && !apiKey) throw new ServiceError('Configure the add-on with your TMDB API key or read-access token.', 503);
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    if (apiKey) url.searchParams.set('api_key', apiKey);
    const key = url.href;
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.data;
    if (pending.has(key)) return pending.get(key);
    const task = limited(async () => {
      let response;
      try {
        response = await fetcher(url, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), accept: 'application/json' },
          signal: AbortSignal.timeout(15000)
        });
      } catch { throw new ServiceError('TMDB could not be reached. Please try again.'); }
      if (!response.ok) {
        if (response.status === 404) throw new ServiceError('Title not found.', 404);
        if ([401, 403].includes(response.status)) throw new ServiceError('TMDB authentication failed. Check your API key or read-access token.', 503);
        if (response.status === 429) throw new ServiceError('TMDB rate limit reached. Please try again shortly.', 503);
        throw new ServiceError('TMDB returned an error. Please try again.');
      }
      let data;
      try { data = await response.json(); }
      catch { throw new ServiceError('TMDB returned an invalid response.'); }
      cache.delete(key);
      if (cache.size >= maxCacheEntries) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: now() + 15 * 60 * 1000 });
      return data;
    });
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  };
}
