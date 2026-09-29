export class ServiceError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function createTmdb({ token, fetcher = fetch, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  let active = 0;
  const queue = [];
  async function limited(fn) {
    if (active >= 4) await new Promise(resolve => queue.push(resolve));
    else active++;
    try { return await fn(); }
    finally { if (queue.length) queue.shift()(); else active--; }
  }
  return async function tmdb(path, params = {}) {
    if (!token) throw new ServiceError('Set TMDB_READ_ACCESS_TOKEN in the local .env file, then restart.', 503);
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    const key = url.href;
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.data;
    if (pending.has(key)) return pending.get(key);
    const task = limited(async () => {
      let response;
      try {
        response = await fetcher(url, {
          headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
          signal: AbortSignal.timeout(15000)
        });
      } catch { throw new ServiceError('TMDB could not be reached. Please try again.'); }
      if (!response.ok) {
        if (response.status === 404) throw new ServiceError('Title not found.', 404);
        if ([401, 403].includes(response.status)) throw new ServiceError('TMDB authentication failed. Check the server token.', 503);
        if (response.status === 429) throw new ServiceError('TMDB rate limit reached. Please try again shortly.', 503);
        throw new ServiceError('TMDB returned an error. Please try again.');
      }
      let data;
      try { data = await response.json(); }
      catch { throw new ServiceError('TMDB returned an invalid response.'); }
      cache.delete(key);
      if (cache.size >= 1000) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: now() + 15 * 60 * 1000 });
      return data;
    });
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  };
}
