import { ServiceError } from './tmdb.js';

export const INDIAN_LANGUAGES = ['as', 'bn', 'gu', 'hi', 'kn', 'ks', 'ml', 'mr', 'ne', 'or', 'pa', 'sa', 'sd', 'ta', 'te', 'ur'];
export const LANGUAGE_NAMES = ['Assamese', 'Bengali', 'Gujarati', 'Hindi', 'Kannada', 'Kashmiri', 'Malayalam', 'Marathi', 'Nepali', 'Odia', 'Punjabi', 'Sanskrit', 'Sindhi', 'Tamil', 'Telugu', 'Urdu'];
export const DECADES = Array.from({ length: Math.floor(new Date().getUTCFullYear() / 10) - 191 + 1 }, (_, i) => `${1910 + i * 10}s`).reverse();
export function discoveryConfig(value = 'all') {
  const input = typeof value === 'string' ? { languages: value === 'all' ? INDIAN_LANGUAGES : value.split(',') } : value;
  if (!input || !Array.isArray(input.languages) || !input.languages.length || input.languages.length > 16 || input.languages.some(l => !INDIAN_LANGUAGES.includes(l))) throw new ServiceError('Select supported Indian languages.', 400);
  const languages = INDIAN_LANGUAGES.filter(l => input.languages.includes(l));
  const people = input.people ?? [];
  if (!Array.isArray(people) || people.length > 4 || people.some(p => !p || !['actor', 'director'].includes(p.role) || !Number.isSafeInteger(p.id) || p.id <= 0 || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100)) throw new ServiceError('Choose up to four valid actor/director collections.', 400);
  if (new Set(people.map(p => `${p.role}-${p.id}`)).size !== people.length) throw new ServiceError('Remove duplicate collections.', 400);
  return { languages, people: people.map(({ role, id, name }) => ({ role, id, name })) };
}
export function encodeDiscovery(value) { return Buffer.from(JSON.stringify(discoveryConfig(value))).toString('base64url'); }
export function decodeDiscovery(value) {
  try {
    if (!/^[A-Za-z0-9_-]{1,2800}$/.test(value)) throw new Error();
    return discoveryConfig(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch { throw new ServiceError('Invalid discovery preferences. Configure the add-on again.', 400); }
}
