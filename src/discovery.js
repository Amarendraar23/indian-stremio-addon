import { ServiceError } from './tmdb.js';

export const INDIAN_LANGUAGES = ['as', 'bn', 'gu', 'hi', 'kn', 'ks', 'ml', 'mr', 'ne', 'or', 'pa', 'sa', 'sd', 'ta', 'te', 'ur'];
export const LANGUAGE_NAMES = ['Assamese', 'Bengali', 'Gujarati', 'Hindi', 'Kannada', 'Kashmiri', 'Malayalam', 'Marathi', 'Nepali', 'Odia', 'Punjabi', 'Sanskrit', 'Sindhi', 'Tamil', 'Telugu', 'Urdu'];
export const DECADES = Array.from({ length: Math.floor(new Date().getUTCFullYear() / 10) - 191 + 1 }, (_, i) => `${1910 + i * 10}s`).reverse();
export const CATALOGUE_NAMES = { popular: 'Popular', recent: 'Recently released', upcoming: 'Coming soon / Upcoming', rated: 'Highly rated', gems: 'Hidden gems (TMDB votes)', decades: 'By decade', years: 'By year', search: 'Search' };
export const CATALOGUE_KEYS = ['movie', 'series'].flatMap(type => Object.keys(CATALOGUE_NAMES).map(id => `${type}:${id}`));
export function discoveryConfig(value = 'all') {
  const input = typeof value === 'string' ? { languages: value === 'all' ? INDIAN_LANGUAGES : value.split(',') } : value;
  if (!input || !Array.isArray(input.languages) || !input.languages.length || input.languages.length > 16 || input.languages.some(l => !INDIAN_LANGUAGES.includes(l))) throw new ServiceError('Select supported Indian languages.', 400);
  const languages = INDIAN_LANGUAGES.filter(l => input.languages.includes(l));
  const source = input.source ?? 'tmdb';
  if (!['tmdb', 'mdblist'].includes(source)) throw new ServiceError('Choose TMDB or MDBList.', 400);
  const lists = input.lists ?? [];
  if (!Array.isArray(lists) || lists.length > 4 || (source === 'tmdb' && lists.length) || lists.some(l => !l || !Number.isSafeInteger(l.id) || l.id <= 0 || typeof l.name !== 'string' || !l.name.trim() || l.name.length > 80 || !Array.isArray(l.types) || !l.types.length || l.types.length > 2 || l.types.some(t => !['movie', 'series'].includes(t)))) throw new ServiceError('Choose up to four valid MDBList lists.', 400);
  if (new Set(lists.map(l => l.id)).size !== lists.length) throw new ServiceError('Remove duplicate MDBList lists.', 400);
  const normalizedLists = lists.map(l => ({ id: l.id, name: l.name.trim(), types: ['movie', 'series'].filter(t => l.types.includes(t)) }));
  const people = input.people ?? [];
  if (!Array.isArray(people) || people.length > 4 || people.some(p => !p || !['actor', 'director'].includes(p.role) || !Number.isSafeInteger(p.id) || p.id <= 0 || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100)) throw new ServiceError('Choose up to four valid actor/director collections.', 400);
  if (new Set(people.map(p => `${p.role}-${p.id}`)).size !== people.length) throw new ServiceError('Remove duplicate collections.', 400);
  const listKeys = normalizedLists.flatMap(l => l.types.map(t => `${t}:mdb-${l.id}`));
  const allowed = [...listKeys, ...CATALOGUE_KEYS];
  const selected = input.catalogues === undefined ? (source === 'mdblist' ? listKeys : CATALOGUE_KEYS) : input.catalogues;
  if (!Array.isArray(selected) || selected.length > allowed.length || selected.some(key => !allowed.includes(key))) throw new ServiceError('Select valid catalogues.', 400);
  const catalogues = allowed.filter(key => selected.includes(key));
  return { languages, catalogues, people: people.map(({ role, id, name }) => ({ role, id, name })), ...(source === 'mdblist' ? { source, lists: normalizedLists } : {}) };
}
export function encodeDiscovery(value) {
  const encoded = Buffer.from(JSON.stringify(discoveryConfig(value))).toString('base64url');
  if (encoded.length > 2800) throw new ServiceError('Preferences too large. Select fewer lists or people.', 400);
  return encoded;
}
export function decodeDiscovery(value) {
  try {
    if (!/^[A-Za-z0-9_-]{1,2800}$/.test(value)) throw new Error();
    return discoveryConfig(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch { throw new ServiceError('Invalid discovery preferences. Configure the add-on again.', 400); }
}
