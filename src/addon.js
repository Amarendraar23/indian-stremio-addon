import { ServiceError } from './tmdb.js';

import { INDIAN_LANGUAGES, LANGUAGE_NAMES, DECADES, discoveryConfig } from './discovery.js';
export { INDIAN_LANGUAGES, LANGUAGE_NAMES } from './discovery.js';
const kinds = { movie: 'movie', series: 'tv' };
const shelves = { popular: 'Popular', recent: 'Recently released', rated: 'Highly rated', gems: 'Hidden gems (TMDB votes)' };
const image = (path, size = 'w500') => path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? `${value}T00:00:00.000Z` : undefined;
const indian = item => item.origin_country?.includes('IN') || item.production_countries?.some(c => c.iso_3166_1 === 'IN');

export function createAddon(tmdb, today = () => new Date().toISOString().slice(0, 10)) {
  function manifest(language = 'all') {
    const config = discoveryConfig(language);
    const key = config.languages.length === 16 ? 'all' : config.languages.join(',');
    const languageFilter = { name: 'genre', options: config.languages.map(l => LANGUAGE_NAMES[INDIAN_LANGUAGES.indexOf(l)]) };
    return {
      id: `community.indian.tmdb.${key.replaceAll(',', '.')}`, version: '0.4.0',
      stremioAddonsConfig: {
        issuer: 'https://stremio-addons.net',
        signature: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..29Z7WuiwGRXCSH0gpRid2Q.m6xIX3W44s0wA1IYGi4_TszhIA9o6LziBjSu_CadgCcHXSZOyUQKqpyS8i57IXqvwYhSdaC2bbn_AximTC4YXYyz1-nZwbqbWE9Ko9UouROjkayZbplQGG9YjLRJrfb4.1jtRv2pgK4QVe8ceD6YHSA'
      },
      logo: 'https://indian-stremio-addon-production.up.railway.app/logo.png',
      name: `Indian Cinema${key === 'all' ? '' : ` (${key})`}`,
      description: 'Indian movies and series: popular, recent, highly rated, automatic hidden gems, decades and optional actor/director movie collections. Metadata by TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.',
      resources: ['catalog', { name: 'meta', types: ['movie', 'series'], idPrefixes: ['tt', 'indiantmdb:'] }],
      types: ['movie', 'series'],
      behaviorHints: { configurable: true, configurationRequired: false },
      catalogs: Object.keys(kinds).flatMap(type => [
        ...Object.entries(shelves).map(([id, name]) => ({
          type, id, name: `India · ${name}`, pageSize: 20,
          extra: [languageFilter, { name: 'skip' }]
        })),
        { type, id: 'decades', name: 'India · By decade', pageSize: 20, extra: [{ name: 'genre', options: DECADES, isRequired: true }, { name: 'skip' }] },
        ...(type === 'movie' ? config.people.map(p => ({ type, id: `${p.role}-${p.id}`, name: `India · ${p.role === 'actor' ? 'Starring' : 'Directed by'} ${p.name}`, pageSize: 20, extra: [languageFilter, { name: 'skip' }] })) : []),
        { type, id: 'search', name: 'India · Search', extra: [{ name: 'search', isRequired: true }, languageFilter] }
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
    const config = discoveryConfig(language);
    let languages = config.languages;
    const person = config.people.find(p => `${p.role}-${p.id}` === id);
    const decade = id === 'decades' ? extra.genre : undefined;
    if (decade && !DECADES.includes(decade)) throw new ServiceError('Unsupported decade.', 400);
    if (!Object.hasOwn(kinds, type) || !(Object.hasOwn(shelves, id) || id === 'search' || id === 'decades' || (type === 'movie' && person))) throw new ServiceError('Catalogue not found.', 404);
    if (id === 'decades' && !decade) return { metas: [] };
    if (extra.genre && id !== 'decades') {
      const selected = INDIAN_LANGUAGES[LANGUAGE_NAMES.indexOf(extra.genre)];
      if (!selected) throw new ServiceError('Unsupported Indian language filter.', 400);
      if (!languages.includes(selected)) return { metas: [] };
      languages = [selected];
    }
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
      rows = [first, ...pages].flatMap(p => (p.results || []).slice(0, 20));
    } else {
      const params = { with_origin_country: 'IN', include_adult: false, page, language: 'en-US',
        with_original_language: languages.join('|'),
        sort_by: ['rated', 'gems'].includes(id) ? 'vote_average.desc' : id === 'recent' ? (type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc') : 'popularity.desc',
        'vote_count.gte': id === 'gems' ? 20 : id === 'rated' ? 50 : undefined,
        'vote_count.lte': id === 'gems' ? 500 : undefined,
        'vote_average.gte': id === 'gems' ? 7 : undefined,
        with_cast: person?.role === 'actor' ? person.id : undefined,
        with_crew: person?.role === 'director' ? person.id : undefined,
        [type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte']: decade ? `${parseInt(decade)}-01-01` : undefined,
        [type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte']: decade ? [`${parseInt(decade) + 9}-12-31`, today()].sort()[0] : today()
      };
      rows = ((await tmdb(`/discover/${kinds[type]}`, params)).results || []).slice(0, 20);
    }
    const unique = [...new Map(rows.map(row => [row.id, row])).values()];
    const full = await Promise.all(unique.map(row => details(type, row.id)));
    return { metas: full.filter(item => !item.adult && indian(item) && INDIAN_LANGUAGES.includes(item.original_language) &&
      languages.includes(item.original_language) &&
      (!person || (person.role === 'actor' ? item.credits?.cast?.some(c => c.id === person.id) : item.credits?.crew?.some(c => c.id === person.id && c.job === 'Director'))) &&
      (!decade || ((item.release_date || item.first_air_date || '') >= `${parseInt(decade)}-01-01` && (item.release_date || item.first_air_date || '') <= [`${parseInt(decade) + 9}-12-31`, today()].sort()[0])) &&
      (id !== 'gems' || (item.vote_average >= 7 && item.vote_count >= 20 && item.vote_count <= 500 && Boolean(item.release_date || item.first_air_date) && (item.release_date || item.first_air_date) <= today()))).map(item => {
        const result = preview(type, item);
        return { ...result, name: `${result.name} · ${LANGUAGE_NAMES[INDIAN_LANGUAGES.indexOf(item.original_language)]}` };
      }), cacheMaxAge: 900 };
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
  return { manifest, catalog, meta, searchPeople: async query => {
    const result = await tmdb('/search/person', { query, include_adult: false, page: 1, language: 'en-US' });
    return (result.results || []).filter(p => !p.adult).slice(0, 10).map(p => ({ id: p.id, name: p.name, knownFor: (p.known_for || []).map(t => t.title || t.name).filter(Boolean).slice(0, 2).join(', ') }));
  }, person: async id => {
    if (!Number.isSafeInteger(id) || id <= 0) throw new ServiceError('Enter a valid TMDB person ID.', 400);
    const p = await tmdb(`/person/${id}`, { language: 'en-US' });
    if (p.adult || !p.name) throw new ServiceError('Person unavailable.', 400);
    return p.name;
  }, languages: async () => (await tmdb('/configuration/languages')).filter(item => INDIAN_LANGUAGES.includes(item.iso_639_1)).map(item => item.iso_639_1 === 'or' ? { ...item, english_name: 'Odia' } : item) };
}
