import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createTmdb, ServiceError } from './tmdb.js';
import { createAddon } from './addon.js';

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
<a class="install" id="install">Install in Stremio</a>
<label for="manifest">Or copy this manifest URL into Stremio</label><input id="manifest" readonly aria-label="Manifest URL"><button id="copy">Copy URL</button>
<p id="status" role="status"></p><p>This add-on supplies catalogues and metadata. Playback depends on your other add-ons. Search checks the first 100 TMDB matches and keeps Indian productions.</p>
<footer><h2>Credits</h2><a href="https://www.themoviedb.org"><img width="110" alt="TMDB" src="https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"></a>
<p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p></footer></main>
<script>
const language=document.querySelector('#language'), field=document.querySelector('#manifest'), status=document.querySelector('#status');
function update(){field.value=location.origin+'/'+language.value+'/manifest.json';document.querySelector('#install').href=field.value.replace(/^https?:/, 'stremio:');}
language.addEventListener('change',update);update();
document.querySelector('#copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(field.value);status.textContent='Manifest URL copied.';}catch{field.select();status.textContent='Select and copy the URL above.';}});
fetch('/languages.json').then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}).then(items=>{
for(const item of items.sort((a,b)=>a.english_name.localeCompare(b.english_name))){const option=document.createElement('option');option.value=item.iso_639_1;option.textContent=item.english_name;language.append(option);}
const selected=location.pathname.split('/')[1];if([...language.options].some(o=>o.value===selected))language.value=selected;update();
}).catch(error=>{status.textContent=error.message;});
</script></html>`;

export function createServer(addon) {
  return http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { json(405, { error: 'Method not allowed.' }); return; }
    try {
      if (req.url.length > 4096) throw new ServiceError('URL too long.', 414);
      const url = new URL(req.url, 'http://localhost');
      let parts;
      try { parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); }
      catch { throw new ServiceError('Malformed URL.', 400); }
      let language = 'all';
      if (parts[0] === 'all' || /^[a-z]{2}$/.test(parts[0] || '')) language = parts.shift();
      if (!parts.length || (parts.length === 1 && parts[0] === 'configure')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page); return;
      }
      if (parts.length === 1 && parts[0] === 'health') { json(200, { status: 'ok', note: 'Process health only; TMDB connectivity is not checked.' }); return; }
      if (parts.length === 1 && parts[0] === 'manifest.json') { json(200, addon.manifest(language)); return; }
      if (parts.length === 1 && parts[0] === 'languages.json') { json(200, await addon.languages()); return; }
      if (parts[0] === 'catalog' && [3, 4].includes(parts.length) && parts.at(-1).endsWith('.json')) {
        const type = parts[1];
        const id = parts.length === 3 ? parts[2].slice(0, -5) : parts[2];
        // Parse the raw encoded extra string so encoded '&' in a title stays part of the search query.
        const rawExtra = parts.length === 4 ? url.pathname.split('/').at(-1).slice(0, -5) : '';
        const extra = Object.fromEntries(new URLSearchParams(rawExtra));
        json(200, await addon.catalog(type, id, extra, language)); return;
      }
      if (parts[0] === 'meta' && parts.length === 3 && parts[2].endsWith('.json')) {
        json(200, await addon.meta(parts[1], parts[2].slice(0, -5))); return;
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
  const server = createServer(createAddon(createTmdb({ token: process.env.TMDB_READ_ACCESS_TOKEN })));
  server.listen(port, host, () => console.log(`Indian Cinema is listening on ${host}:${port}. Open /configure to install.`));
}
