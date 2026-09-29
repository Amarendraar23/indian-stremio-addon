import { ServiceError } from './tmdb.js';

// Indian scheduled languages represented in TMDB's ISO 639-1 language list.
export const INDIAN_LANGUAGES = ['as', 'bn', 'gu', 'hi', 'kn', 'ks', 'ml', 'mr', 'ne', 'or', 'pa', 'sa', 'sd', 'ta', 'te', 'ur'];
function validateLanguage(language) {
  if (language !== 'all' && !INDIAN_LANGUAGES.includes(language)) throw new ServiceError('Unsupported Indian language.', 400);
}
const kinds = { movie: 'movie', series: 'tv' };
const shelves = { popular: 'Popular', recent: 'Recently released', rated: 'Highly rated' };
const image = (path, size = 'w500') => path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? `${value}T00:00:00.000Z` : undefined;
const indian = item => item.origin_country?.includes('IN') || item.production_countries?.some(c => c.iso_3166_1 === 'IN');

export function createAddon(tmdb, today = () => new Date().toISOString().slice(0, 10)) {
  function manifest(language = 'all') {
    validateLanguage(language);
    return {
      id: `community.indian.tmdb.${language}`, version: '0.1.1',
      name: `Indian Cinema${language === 'all' ? '' : ` (${language})`}`,
      description: 'Indian movies and series in Indian languages. Metadata by TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.',
      resources: ['catalog', { name: 'meta', types: ['movie', 'series'], idPrefixes: ['tt', 'indiantmdb:'] }],
      types: ['movie', 'series'],
      behaviorHints: { configurable: true, configurationRequired: false },
      catalogs: Object.keys(kinds).flatMap(type => [
        ...Object.entries(shelves).map(([id, name]) => ({
          type, id, name: `India · ${name}`, pageSize: 20,
          extra: [{ name: 'skip' }]
        })),
        { type, id: 'search', name: 'India · Search', extra: [{ name: 'search', isRequired: true }] }
      ])
    };
  }
  async function details(type, id) {
    return tmdb(`/${kinds[type]}/${id}`, { language: 'en-US', append_to_response: 'external_ids,credits' });
  }
  function preview(type, item) {
    const imdb = item.imdb_id || item.external_ids?.imdb_id;
    return {
      id: /^tt\d+$/.test(imdb ?? '') ? imdb : `indiantmdb:${type}:${item.id}`,
      type, name: item.title || item.name || item.original_title || item.original_name,
      poster: image(item.poster_path), background: image(item.backdrop_path, 'w1280'),
      description: item.overview || '', releaseInfo: (item.release_date || item.first_air_date || '').slice(0, 4),
      released: date(item.release_date || item.first_air_date),
      genres: item.genres?.map(g => g.name), language: item.original_language,
      country: 'India', cast: item.credits?.cast?.slice(0, 12).map(c => c.name),
      director: item.credits?.crew?.filter(c => c.job === 'Director').map(c => c.name),
      runtime: item.runtime ? `${item.runtime} min` : undefined,
      links: [{ name: 'View on TMDB', category: 'Metadata', url: `https://www.themoviedb.org/${kinds[type]}/${item.id}` }]
    };
  }
  async function catalog(type, id, extra = {}, language = 'all') {
    validateLanguage(language);
    if (!Object.hasOwn(kinds, type) || !(Object.hasOwn(shelves, id) || id === 'search')) throw new ServiceError('Catalogue not found.', 404);
    const skip = Number(extra.skip ?? 0);
    if (!Number.isSafeInteger(skip) || skip < 0 || skip % 20 !== 0) throw new ServiceError('Invalid catalogue offset.', 400);
    const page = skip / 20 + 1;
    if (page > 500) return { metas: [] };
    let rows;
    if (id === 'search') {
      const query = (extra.search ?? '').trim();
      if (!query || skip) return { metas: [] };
      if (query.length > 200) throw new ServiceError('Search must be 200 characters or fewer.', 400);
      const first = await tmdb(`/search/${kinds[type]}`, { query, include_adult: false, page: 1, language: 'en-US' });
      const pages = await Promise.all(Array.from({ length: Math.min(first.total_pages || 1, 5) - 1 }, (_, i) =>
        tmdb(`/search/${kinds[type]}`, { query, include_adult: false, page: i + 2, language: 'en-US' })));
      rows = [first, ...pages].flatMap(p => p.results || []);
    } else {
      const params = { with_origin_country: 'IN', include_adult: false, page, language: 'en-US',
        with_original_language: language === 'all' ? INDIAN_LANGUAGES.join('|') : language,
        sort_by: id === 'rated' ? 'vote_average.desc' : id === 'recent' ? (type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc') : 'popularity.desc',
        'vote_count.gte': id === 'rated' ? 50 : undefined,
        [type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte']: today()
      };
      rows = (await tmdb(`/discover/${kinds[type]}`, params)).results || [];
    }
    const unique = [...new Map(rows.map(row => [row.id, row])).values()];
    const full = await Promise.all(unique.map(row => details(type, row.id)));
    return { metas: full.filter(item => !item.adult && indian(item) && INDIAN_LANGUAGES.includes(item.original_language) &&
      (language === 'all' || item.original_language === language)).map(item => preview(type, item)), cacheMaxAge: 900 };
  }
  async function meta(type, id) {
    if (!Object.hasOwn(kinds, type)) throw new ServiceError('Type not found.', 404);
    let tmdbId;
    if (/^tt\d+$/.test(id)) {
      const found = await tmdb(`/find/${id}`, { external_source: 'imdb_id' });
      tmdbId = found[type === 'movie' ? 'movie_results' : 'tv_results']?.[0]?.id;
    } else {
      const match = /^indiantmdb:(movie|series):(\d+)$/.exec(id);
      if (match?.[1] === type) tmdbId = match[2];
    }
    if (!tmdbId) return { meta: null };
    let item;
    try { item = await details(type, tmdbId); }
    catch (error) { if (error.status === 404) return { meta: null }; throw error; }
    if (!indian(item) || item.adult || !INDIAN_LANGUAGES.includes(item.original_language)) return { meta: null };
    const result = { ...preview(type, item), id };
    if (type === 'series') {
      const seasons = await Promise.all((item.seasons || []).map(s => tmdb(`/tv/${tmdbId}/season/${s.season_number}`, { language: 'en-US' })));
      // IMDb episode IDs allow stream add-ons to match episodes even for a TMDB fallback title ID.
      const videoBase = preview(type, item).id;
      result.videos = seasons.flatMap(s => (s.episodes || []).filter(e => date(e.air_date)).map(e => ({
        id: `${videoBase}:${e.season_number}:${e.episode_number}`, title: e.name || `Episode ${e.episode_number}`,
        season: e.season_number, episode: e.episode_number, released: date(e.air_date),
        overview: e.overview || '', thumbnail: image(e.still_path, 'w300')
      }))).sort((a, b) => a.season - b.season || a.episode - b.episode);
    }
    return { meta: result, cacheMaxAge: 900 };
  }
  return { manifest, catalog, meta, languages: async () => (await tmdb('/configuration/languages')).filter(item => INDIAN_LANGUAGES.includes(item.iso_639_1)).map(item => item.iso_639_1 === 'or' ? { ...item, english_name: 'Odia' } : item) };
}
