import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ServiceError } from './tmdb.js';

export function credentialOptions(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{16,2048}$/.test(value)) {
    throw new ServiceError('Enter a valid TMDB API key or API Read Access Token.', 400);
  }
  return /^[a-f0-9]{32}$/i.test(value) ? { apiKey: value } : { token: value };
}

// Stateless authenticated encryption: no database and no plaintext key in install URLs.
// CONFIG_SECRET must stay unchanged across deployments and replicas.
export function createConfigCodec(secret) {
  const key = typeof secret === 'string' && secret.length >= 32
    ? createHash('sha256').update(secret).digest() : null;
  function requireKey() {
    if (!key) throw new ServiceError('Personal keys are not enabled on this host yet. Contact the operator.', 503);
  }
  return {
    enabled: Boolean(key),
    seal(credential) {
      requireKey();
      credentialOptions(credential);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
    },
    open(value) {
      requireKey();
      try {
        if (!/^[A-Za-z0-9_-]{40,2800}$/.test(value)) throw new Error();
        const data = Buffer.from(value, 'base64url');
        const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
        decipher.setAuthTag(data.subarray(12, 28));
        const credential = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
        credentialOptions(credential);
        return credential;
      } catch { throw new ServiceError('This install link is invalid. Configure the add-on again.', 400); }
    }
  };
}
