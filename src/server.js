import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createTmdb, createLimiter, ServiceError } from './tmdb.js';
import { createAddon, INDIAN_LANGUAGES, LANGUAGE_NAMES } from './addon.js';
import { createConfigCodec, credentialOptions } from './config.js';

const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Indian Cinema · Stremio</title><style>
body{margin:0;background:#10151c;color:#f0eee8;font:18px/1.6 system-ui}main{max-width:750px;margin:8vh auto;padding:28px}
h1{font-size:clamp(36px,7vw,60px);line-height:1.1}p{color:#bbc3ce}label{display:block;margin-top:24px}
select,input,button,a.install{box-sizing:border-box;padding:13px;border-radius:8px;border:1px solid #657283;font:inherit}
select,input{width:100%;background:#202a37;color:white}button,a.install{display:inline-block;background:#eab56a;color:#17202a;cursor:pointer;margin-top:16px;text-decoration:none}
footer{margin-top:60px;font-size:14px}a{color:#eab56a}#status{color:#f4c388}</style>
<main><div>STREMIO ADD-ON</div><h1>Indian stories.<br>Indian languages.</h1>
<p>Discover Indian movies and series, with popular, recently released, and highly rated collections. Posters, title details, cast, and episodes come from TMDB.</p>
<label for="language">Original language</label><select id="language"><option value="all">All Indian languages · recommended</option></select>
<p>Includes Indian productions in the 16 Indian languages supported by this selector. English and other foreign-language originals are excluded. Choosing a language narrows the catalogue; it does not select dubbed audio.</p>
<label for="credential">Your TMDB API key or API Read Access Token</label>
<input id="credential" type="password" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="Paste your TMDB credential">
<p id="credential-help">Use your own TMDB credential. <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">Get it from TMDB API settings</a>.</p>
<p>Your credential is sent to this add-on server and TMDB to fetch metadata. It is encrypted in your install link. Keep that link private: anyone with it can use your TMDB quota. Stremio and the hosting provider can see the link. The server keeps temporary in-memory caches; it does not log credentials or save them in a database. Revoke the credential at TMDB if the link is shared.</p>
<button id="generate" disabled>Generate install link</button>
<div id="result" hidden><a class="install" id="install">Install in Stremio</a>
<label for="manifest">Or copy this manifest URL into Stremio</label><input id="manifest" readonly aria-label="Manifest URL"><button id="copy">Copy URL</button>
</div><p id="status" role="status"></p><p>This add-on supplies catalogues and metadata. Playback depends on your other add-ons. Search checks the first 100 TMDB matches and keeps Indian productions.</p>
<footer><h2>Credits</h2><a href="https://www.themoviedb.org"><img width="110" alt="TMDB" src="https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"></a>
<p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p></footer></main>
<script>
const language=document.querySelector('#language'), field=document.querySelector('#manifest'), status=document.querySelector('#status'), credential=document.querySelector('#credential'), generate=document.querySelector('#generate'), result=document.querySelector('#result');
const names=${JSON.stringify(LANGUAGE_NAMES)}, codes=${JSON.stringify(INDIAN_LANGUAGES)};
for(const [index,code] of codes.entries()){const option=document.createElement('option');option.value=code;option.textContent=names[index];language.append(option);}
const selected=location.pathname.split('/').at(-2);if([...language.options].some(o=>o.value===selected))language.value=selected;
function invalidate(){result.hidden=true;field.value='';document.querySelector('#install').removeAttribute('href');status.textContent='';}
language.addEventListener('change',invalidate);credential.addEventListener('input',invalidate);
fetch('/configuration.json').then(r=>r.json()).then(config=>{
 generate.disabled=!config.personalKeys&&!config.sharedCredential;
 if(config.sharedCredential)document.querySelector('#credential-help').append(' Leave blank to use the shared server credential.');
 if(!config.personalKeys){credential.disabled=true;status.textContent='Personal keys are not enabled on this host yet.';}
}).catch(()=>{status.textContent='Could not load configuration. Please reload.';});
generate.addEventListener('click',async()=>{
 invalidate();generate.disabled=true;status.textContent='Checking configuration…';
 try{const response=await fetch('/api/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:credential.value.trim(),language:language.value})});const data=await response.json();if(!response.ok)throw new Error(data.error);
 field.value=location.origin+data.path;document.querySelector('#install').href=field.value.replace(/^https?:/,'stremio:');result.hidden=false;credential.value='';status.textContent='Ready to install. Keep your personal link private.';
 }catch(error){status.textContent=error.message;}finally{generate.disabled=false;}
});
document.querySelector('#copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(field.value);status.textContent='Manifest URL copied.';}catch{field.select();status.textContent='Select and copy the URL above.';}});
</script></html>`;

export function createServer(addon, { configSecret, sharedCredential = true, tmdbFactory = createTmdb } = {}) {
  const codec = createConfigCodec(configSecret);
  const clients = new Map();
  const limited = createLimiter();
  let configurationWindow = 0, configurationCount = 0, configurationActive = 0;
  function personalAddon(credential) {
    let client = clients.get(credential);
    if (!client) {
      if (clients.size >= 50) clients.delete(clients.keys().next().value);
      client = createAddon(tmdbFactory({ ...credentialOptions(credential), maxCacheEntries: 100, limited }));
      clients.set(credential, client);
    }
    return client;
  }
  async function configure(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new ServiceError('Send JSON configuration.', 415);
    const minute = Math.floor(Date.now() / 60000);
    if (minute !== configurationWindow) { configurationWindow = minute; configurationCount = 0; }
    if (++configurationCount > 30 || configurationActive >= 4) throw new ServiceError('Too many setup requests. Try again in a minute.', 429);
    configurationActive++;
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 4096) throw new ServiceError('Configuration too large.', 413);
      }
      let data;
      try { data = JSON.parse(body); } catch { throw new ServiceError('Invalid configuration.', 400); }
      if (!data || typeof data !== 'object') throw new ServiceError('Invalid configuration.', 400);
      const language = data.language || 'all';
      addon.manifest(language); // Validate against the same language allowlist used for catalogues.
      if (!data.credential) {
        if (!sharedCredential) throw new ServiceError('Enter your own TMDB API key or read-access token.', 400);
        await addon.languages();
        return { path: `/${language}/manifest.json` };
      }
      const encoded = codec.seal(data.credential);
      await personalAddon(data.credential).languages(); // Validate upstream before issuing an install link.
      return { path: `/c/${encoded}/${language}/manifest.json` };
    } finally { configurationActive--; }
  }
  return http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try {
      if (req.url.length > 4096) throw new ServiceError('URL too long.', 414);
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'POST' && url.pathname === '/api/configure') { json(200, await configure(req)); return; }
      if (!['GET', 'HEAD'].includes(req.method)) { json(405, { error: 'Method not allowed.' }); return; }
      let parts;
      try { parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); }
      catch { throw new ServiceError('Malformed URL.', 400); }
      let scopedAddon = addon, configured = sharedCredential, personalConfig;
      if (parts[0] === 'c') {
        parts.shift();
        personalConfig = parts.shift() || '';
      }
      let language = 'all';
      if (parts[0] === 'all' || /^[a-z]{2}$/.test(parts[0] || '')) language = parts.shift();
      if (!parts.length || (parts.length === 1 && parts[0] === 'configure')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page); return;
      }
      if (personalConfig !== undefined) {
        scopedAddon = personalAddon(codec.open(personalConfig));
        configured = true;
      }
      if (parts.length === 1 && parts[0] === 'health') { json(200, { status: 'ok', note: 'Process health only; TMDB connectivity is not checked.' }); return; }
      if (parts.length === 1 && parts[0] === 'manifest.json') { json(200, { ...scopedAddon.manifest(language), behaviorHints: { configurable: true, configurationRequired: !configured } }); return; }
      if (parts.length === 1 && parts[0] === 'configuration.json') { json(200, { personalKeys: codec.enabled, sharedCredential }); return; }
      if (parts.length === 1 && parts[0] === 'languages.json') { json(200, INDIAN_LANGUAGES.map((code, index) => ({ iso_639_1: code, english_name: LANGUAGE_NAMES[index] }))); return; }
      if (!configured) throw new ServiceError('Configure the add-on with your own TMDB credential first.', 503);
      if (parts[0] === 'catalog' && [3, 4].includes(parts.length) && parts.at(-1).endsWith('.json')) {
        const type = parts[1];
        const id = parts.length === 3 ? parts[2].slice(0, -5) : parts[2];
        // Parse the raw encoded extra string so encoded '&' in a title stays part of the search query.
        const rawExtra = parts.length === 4 ? url.pathname.split('/').at(-1).slice(0, -5) : '';
        const extra = Object.fromEntries(new URLSearchParams(rawExtra));
        json(200, await scopedAddon.catalog(type, id, extra, language)); return;
      }
      if (parts[0] === 'meta' && parts.length === 3 && parts[2].endsWith('.json')) {
        json(200, await scopedAddon.meta(parts[1], parts[2].slice(0, -5))); return;
      }
      throw new ServiceError('Not found.', 404);
    } catch (error) {
      // Do not return stack traces, request headers, tokens, or upstream bodies.
      json(error instanceof ServiceError ? error.status : 500, { error: error instanceof ServiceError ? error.message : 'The add-on could not complete this request.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 7000);
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer(createAddon(createTmdb({ token: process.env.TMDB_READ_ACCESS_TOKEN })), { configSecret: process.env.CONFIG_SECRET, sharedCredential: Boolean(process.env.TMDB_READ_ACCESS_TOKEN) });
  server.listen(port, host, () => console.log(`Indian Cinema is listening on ${host}:${port}. Open /configure to install.`));
}
