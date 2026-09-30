// Operator settings read once at startup. Every value is optional; defaults match earlier releases.
export const DEFAULT_TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const DEFAULT_LOGO_URL = 'https://indian-stremio-addon-production.up.railway.app/logo.png';

function integer(env, name, fallback, min, max) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be a whole number from ${min} to ${max}.`);
  return value;
}

function httpUrl(env, name, fallback) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${name} must be an absolute http(s) URL.`); }
  if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash || url.username || url.password) throw new Error(`${name} must be an absolute http(s) URL without credentials, a query or a fragment.`);
  return url.href.replace(/\/+$/, '');
}

export function settingsFromEnv(env = process.env) {
  return {
    tmdbBaseUrl: httpUrl(env, 'TMDB_BASE_URL', DEFAULT_TMDB_BASE_URL),
    tmdbConcurrency: integer(env, 'TMDB_CONCURRENCY', 4, 1, 256),
    tmdbQueueLimit: integer(env, 'TMDB_QUEUE_LIMIT', 500, 0, 100000),
    sharedCacheEntries: integer(env, 'TMDB_CACHE_ENTRIES', 1000, 1, 1000000),
    personalCacheEntries: integer(env, 'TMDB_PERSONAL_CACHE_ENTRIES', 100, 1, 1000000),
    personalClientLimit: integer(env, 'PERSONAL_CLIENT_LIMIT', 50, 1, 100000),
    searchPages: integer(env, 'SEARCH_MAX_PAGES', 5, 1, 5),
    setupRateLimit: integer(env, 'SETUP_RATE_LIMIT', 30, 0, 1000000),
    setupConcurrency: integer(env, 'SETUP_CONCURRENCY', 4, 1, 1000),
    requestTimeoutMs: integer(env, 'REQUEST_TIMEOUT_MS', 30000, 1000, 600000),
    logoUrl: httpUrl(env, 'LOGO_URL', DEFAULT_LOGO_URL)
  };
}
