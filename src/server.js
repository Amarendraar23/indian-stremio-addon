import http from 'node:http';
import { createAnalytics, dashboard, installationPattern } from './analytics.js';
import { readFileSync } from 'node:fs';
const logo = readFileSync(new URL('./logo.png', import.meta.url));
import { pathToFileURL } from 'node:url';
import { createTmdb, createLimiter, ServiceError } from './tmdb.js';
import { createAddon, INDIAN_LANGUAGES, LANGUAGE_NAMES } from './addon.js';
import { CATALOGUE_NAMES, discoveryConfig, encodeDiscovery, decodeDiscovery } from './discovery.js';
import { createConfigCodec, credentialOptions } from './config.js';
import { createMdbList, withMdbList } from './mdblist.js';

const page = supportUrl => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Indian Cinema · Stremio</title><style>
body{margin:0;background:#10151c;color:#f0eee8;font:18px/1.6 system-ui}main{max-width:750px;margin:8vh auto;padding:28px}
h1{font-size:clamp(36px,7vw,60px);line-height:1.1}p{color:#bbc3ce}label{display:block;margin-top:24px}
select,input,button,a.install{box-sizing:border-box;padding:13px;border-radius:8px;border:1px solid #657283;font:inherit}
input[type=checkbox]{width:auto;margin-right:10px}fieldset{border:1px solid #657283;border-radius:8px;margin-top:24px}fieldset label{display:inline-block;margin:6px 16px 6px 0}select,input{width:100%;background:#202a37;color:white}button,a.install{display:inline-block;background:#eab56a;color:#17202a;cursor:pointer;margin-top:16px;text-decoration:none}
.support{margin-top:40px;padding:24px;border:1px solid #394757;border-radius:12px;background:#17202a}.support h2{margin:0;font-size:24px}.support p{margin:10px 0 18px}.support-link{display:inline-block;padding:10px 16px;border:1px solid #eab56a;border-radius:8px;text-decoration:none}.support-link:hover{background:#243142}.support-link:focus-visible{outline:3px solid #f0eee8;outline-offset:4px}
footer{margin-top:60px;font-size:14px}a{color:#eab56a}#status{color:#f4c388}</style>
<main><div>STREMIO ADD-ON</div><h1>Indian stories.<br>Indian languages.</h1>
<p>Discover Indian movies and series, with popular, recently released, and highly rated collections. Posters, title details, cast, and episodes come from TMDB.</p>
<label for="source">Catalogue source</label><select id="source"><option value="tmdb">TMDB</option><option value="mdblist">MDBList + optional TMDB collections</option></select>
<section id="mdb-settings" hidden><h2>MDBList saved lists</h2>
<label for="mdb-key">Your MDBList API key</label><input id="mdb-key" type="password" maxlength="128" autocomplete="off" spellcheck="false">
<p>Use your key from <a href="https://mdblist.com/preferences/" target="_blank" rel="noreferrer">MDBList preferences</a>. Edit list filters in MDBList. Choose Original when filtering languages there. Only Indian productions in your selected original languages will appear here, so counts can differ from MDBList.</p>
<button id="load-mdb" type="button">Load my MDBList lists</button>
<label for="mdb-id">Or add a list by numeric MDBList ID</label><input id="mdb-id" inputmode="numeric" maxlength="16" placeholder="List ID"><button id="add-mdb" type="button">Add list</button>
<p id="mdb-status" role="status"></p><div id="mdb-available"></div>
<p>Choose up to four lists. Movie and TV catalogue choices appear below. List order is preserved. Browsing checks up to 1,000 candidates per list and language selection; use focused lists for best results. MDBList refresh and API limits depend on your plan.</p></section>
<fieldset id="language"><legend>Original languages · choose one or more</legend><button type="button" id="all-languages">Select all</button><button type="button" id="clear-languages">Clear selection</button><div id="language-options"></div></fieldset>
<p>Includes Indian productions in the 16 Indian languages supported by this selector. English and other foreign-language originals are excluded. Choosing a language narrows the catalogue; it does not select dubbed audio.</p>
<p>Hidden gems are automatic: released titles rated at least 7/10 with 20–500 TMDB votes, sorted by rating. Vote counts are a rough visibility measure, not editorial recommendations. Use “By year” or “By decade” in Stremio Discover and its Genre selector to choose a year or decade. Movies use release dates; series use their first-air dates. These catalogues use your selected languages. Other shelves use Genre for language.</p>
<section id="catalogues" aria-labelledby="catalogues-title"><h2 id="catalogues-title">Choose your catalogues</h2><p id="source-help">TMDB collections</p>
<p>Uncheck collections you do not want in Stremio. Search controls this add-on's search results; By year and By decade appear in Discover. Actor/director collections are selected separately below.</p>
<button type="button" id="all-catalogues">Select all catalogues</button> <button type="button" id="clear-catalogues">Clear catalogues</button>
<fieldset id="movie-catalogues"><legend>Movies</legend></fieldset>
<fieldset id="series-catalogues"><legend>TV shows</legend></fieldset>
<p>You can turn off every catalogue and still use metadata. Generate and install a new link to apply changes.</p></section>
<h2>Actor/director movie collections</h2>
<label for="person-query">Find an actor or director by name</label>
<input id="person-query" maxlength="100" placeholder="Search TMDB people" autocomplete="off">
<label for="person-role">Collection role</label><select id="person-role"><option value="actor">Starring</option><option value="director">Directed by</option></select>
<button id="find-person" disabled>Find person</button><div id="person-results" aria-live="polite"></div>
<label for="people">Selected collections · optional, up to four</label>
<input id="people" placeholder="actor:31, director:5655" maxlength="120" autocomplete="off">
<p>Search by name after entering your credential below, then select the matching person to add a collection. You can also enter role:TMDB-person-ID pairs separated by commas. Find the ID in a person's <a href="https://www.themoviedb.org/person" target="_blank" rel="noreferrer">TMDB page</a> URL. Names are checked when you generate the link. Each becomes a named movie shelf. Director shelves require an actual Director credit; series person collections are not supported.</p>
<label for="credential">Your TMDB API key or API Read Access Token</label>
<input id="credential" type="password" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="Paste your TMDB credential">
<p id="credential-help">Use your own TMDB credential. <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">Get it from TMDB API settings</a>.</p>
<p>Your TMDB credential is sent to this server and TMDB for metadata. If selected, your MDBList key is sent to this server and MDBList for list access. Credentials are encrypted in your install link. Keep that link private: anyone with it can use your provider quotas. Stremio and the hosting provider can see the link. The server keeps temporary in-memory caches; it does not log credentials or save them in a database. Revoke the affected keys at their providers if the link is shared. TMDB remains required in MDBList mode for title details, episodes, language checks and optional TMDB collections.</p>
<button id="generate" disabled>Generate install link</button>
<div id="result" hidden><a class="install" id="install">Install in Stremio</a>
<label for="manifest">Or copy this manifest URL into Stremio</label><input id="manifest" readonly aria-label="Manifest URL"><button id="copy">Copy URL</button>
</div><p id="status" role="status"></p><p>This add-on supplies catalogues and metadata. Playback depends on your other add-ons. Search checks the first 100 TMDB matches and keeps Indian productions.</p>
${supportUrl ? `<section class="support" aria-labelledby="support-title"><h2 id="support-title">Help keep this add-on running</h2>
<p>If you find it useful, you can support hosting and development. Every contribution is optional.</p>
<a class="support-link" href="${supportUrl}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">☕ Support this project on Ko-fi <span aria-hidden="true">↗</span><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)"> (opens in a new tab)</span></a></section>` : ''}
<footer><h2>Credits</h2><a href="https://www.themoviedb.org"><img width="110" alt="TMDB" src="https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"></a>
<p>This product uses the TMDB API but is not endorsed or certified by TMDB. Optional saved lists are provided by <a href="https://mdblist.com/">MDBList</a>.</p></footer></main>
<script>
const language=document.querySelector('#language'), field=document.querySelector('#manifest'), status=document.querySelector('#status'), credential=document.querySelector('#credential'), generate=document.querySelector('#generate'), result=document.querySelector('#result');
const names=${JSON.stringify(LANGUAGE_NAMES)}, codes=${JSON.stringify(INDIAN_LANGUAGES)};
for(const [index,code] of codes.entries()){const label=document.createElement('label'), input=document.createElement('input');input.type='checkbox';input.value=code;input.checked=true;label.append(input, names[index]);document.querySelector('#language-options').append(label);}
const boxes=[...language.querySelectorAll('input')], people=document.querySelector('#people');
const catalogueNames=${JSON.stringify(CATALOGUE_NAMES)}, catalogueBoxes=[];
const source=document.querySelector('#source'), mdbKey=document.querySelector('#mdb-key'), mdbStatus=document.querySelector('#mdb-status');
let selectedLists=[], availableLists=[], selectedCatalogues=new Set(['movie','series'].flatMap(t=>Object.keys(catalogueNames).map(id=>t+':'+id))), modeSelections={}, listRevision=0;
const pathParts=location.pathname.split('/').filter(Boolean), selected=pathParts.at(-2);
if(codes.includes(selected))boxes.forEach(b=>b.checked=b.value===selected);
if(pathParts.includes('d')){try{const encoded=pathParts[pathParts.indexOf('d')+1];const config=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))));boxes.forEach(b=>b.checked=config.languages.includes(b.value));selectedCatalogues=new Set(config.catalogues===undefined?[...selectedCatalogues]:config.catalogues);people.value=(config.people||[]).map(p=>p.role+':'+p.id).join(', ');source.value=config.source||'tmdb';selectedLists=config.lists||[];availableLists=[...selectedLists];}catch{}}
let currentSource=source.value;
function rememberCatalogues(){selectedCatalogues=new Set(catalogueBoxes.filter(b=>b.checked).map(b=>b.value));}
function renderCatalogues(){
 catalogueBoxes.length=0;
 for(const type of ['movie','series']){
  const holder=document.querySelector('#'+type+'-catalogues');holder.replaceChildren();const legend=document.createElement('legend');legend.textContent=type==='movie'?'Movies':'TV shows';holder.append(legend);
  const entries=[...(source.value==='mdblist'?selectedLists.filter(l=>l.types.includes(type)).map(l=>['mdb-'+l.id,'MDBList · '+l.name]):[]),...Object.entries(catalogueNames).map(([id,name])=>[id,(source.value==='mdblist'?'TMDB · ':'')+name])];
  for(const [id,name] of entries){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=type+':'+id;input.checked=selectedCatalogues.has(input.value);label.append(input,name);holder.append(label);catalogueBoxes.push(input);}
 }
 document.querySelector('#mdb-settings').hidden=source.value!=='mdblist';
 document.querySelector('#source-help').textContent=source.value==='mdblist'?'Your MDBList shelves are shown first. All TMDB collections remain available below as optional additions. Search, years, decades and actor/director collections use TMDB.':'TMDB collections';
}
function renderLists(){
 const holder=document.querySelector('#mdb-available');holder.replaceChildren();
 for(const list of availableLists){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=selectedLists.some(l=>l.id===list.id);label.append(input,list.name+' · '+list.id);holder.append(label);input.onchange=async()=>{
  rememberCatalogues();if(input.checked){
   const expected=listRevision;input.disabled=true;
   try{const response=await fetch('/api/mdblist/lists',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mdblistKey:mdbKey.value.trim(),listId:list.id})});const data=await response.json();if(!response.ok)throw new Error(data.error);if(expected!==listRevision){input.checked=false;return;}const verified=data.lists[0];
   if(selectedLists.length>=4){input.checked=false;mdbStatus.textContent='Choose up to four lists.';return;}rememberCatalogues();selectedLists.push(verified);for(const t of verified.types)selectedCatalogues.add(t+':mdb-'+list.id);
   }catch(error){input.checked=false;mdbStatus.textContent=error.message;return;}finally{input.disabled=false;}
  }else{selectedLists=selectedLists.filter(l=>l.id!==list.id);for(const t of ['movie','series'])selectedCatalogues.delete(t+':mdb-'+list.id);}renderCatalogues();invalidate();
 };}
}
source.onchange=()=>{rememberCatalogues();modeSelections[currentSource]=new Set(selectedCatalogues);currentSource=source.value;selectedCatalogues=new Set(modeSelections[currentSource]||(currentSource==='mdblist'?selectedLists.flatMap(l=>l.types.map(t=>t+':mdb-'+l.id)):['movie','series'].flatMap(t=>Object.keys(catalogueNames).map(id=>t+':'+id))));renderCatalogues();invalidate();};
mdbKey.oninput=()=>{listRevision++;invalidate();mdbStatus.textContent='Key changed. Load lists to check access.';};
async function loadLists(manual){
 const key=mdbKey.value.trim(), expected=++listRevision;mdbStatus.textContent='Loading lists…';
 try{const body={mdblistKey:key};if(manual){const raw=document.querySelector('#mdb-id').value.trim();if(!/^[1-9][0-9]*$/.test(raw))throw new Error('Enter a numeric MDBList list ID.');body.listId=Number(raw);}
 const response=await fetch('/api/mdblist/lists',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error);if(expected!==listRevision)return;
 availableLists=[...new Map([...selectedLists,...(manual?availableLists:[]),...data.lists].map(l=>[l.id,l])).values()];renderLists();mdbStatus.textContent=data.lists.length?'Choose lists above, then choose their movie/TV catalogues below.':'No saved lists found. Create a list in MDBList or add one by ID.';
 }catch(error){if(expected===listRevision)mdbStatus.textContent=error.message;}
}
document.querySelector('#load-mdb').onclick=()=>loadLists(false);document.querySelector('#add-mdb').onclick=()=>loadLists(true);
renderCatalogues();renderLists();
document.querySelector('#all-languages').onclick=()=>{boxes.forEach(b=>b.checked=true);invalidate();};
document.querySelector('#clear-languages').onclick=()=>{boxes.forEach(b=>b.checked=false);invalidate();};
document.querySelector('#all-catalogues').onclick=()=>{catalogueBoxes.forEach(b=>b.checked=true);invalidate();};
document.querySelector('#clear-catalogues').onclick=()=>{catalogueBoxes.forEach(b=>b.checked=false);invalidate();};
document.querySelector('#catalogues').addEventListener('change',()=>{rememberCatalogues();invalidate();});
people.addEventListener('input',invalidate);
let revision=0;
const findPerson=document.querySelector('#find-person');
findPerson.addEventListener('click',async()=>{
 const container=document.querySelector('#person-results');container.replaceChildren();findPerson.disabled=true;
 try{const response=await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:credential.value.trim(),personQuery:document.querySelector('#person-query').value.trim()})});const data=await response.json();if(!response.ok)throw new Error(data.error);
 if(!data.people.length)container.textContent='No matching people found.';
 for(const person of data.people){const button=document.createElement('button');button.textContent=person.name+' · '+(person.knownFor || 'TMDB person')+' · '+person.id;button.onclick=()=>{const entries=people.value.trim()?people.value.split(',').map(p=>p.trim()):[];const entry=document.querySelector('#person-role').value+':'+person.id;if(entries.includes(entry))return;if(entries.length>=4){status.textContent='Choose up to four collections.';return;}people.value=[...entries,entry].join(', ');invalidate();button.textContent='Added '+person.name;};container.append(button);}
 }catch(error){container.textContent=error.message;}finally{findPerson.disabled=false;}
});
function invalidate(){revision++;result.hidden=true;field.value='';document.querySelector('#install').removeAttribute('href');status.textContent='';}
language.addEventListener('change',invalidate);credential.addEventListener('input',invalidate);
fetch('/configuration.json').then(r=>r.json()).then(config=>{
 generate.disabled=!config.personalKeys&&!config.sharedCredential;findPerson.disabled=generate.disabled;
 if(config.sharedCredential)document.querySelector('#credential-help').append(' Leave blank to use the shared server credential.');
 if(!config.personalKeys){credential.disabled=true;source.disabled=true;document.querySelector('#load-mdb').disabled=true;document.querySelector('#add-mdb').disabled=true;status.textContent='Personal keys are not enabled on this host yet.';}
}).catch(()=>{status.textContent='Could not load configuration. Please reload.';});
generate.addEventListener('click',async()=>{
 invalidate();const requestRevision=revision;generate.disabled=true;status.textContent='Checking configuration…';
 try{const response=await fetch('/api/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:source.value,lists:source.value==='mdblist'?selectedLists:[],mdblistKey:source.value==='mdblist'?mdbKey.value.trim():undefined,credential:credential.value.trim(),languages:boxes.filter(b=>b.checked).map(b=>b.value),catalogues:catalogueBoxes.filter(b=>b.checked).map(b=>b.value),people:people.value.trim()?people.value.split(',').map(entry=>{const pair=entry.trim().split(':');if(pair.length!==2)throw new Error('Use role:person-ID pairs.');const [role,id]=pair;return {role,id:Number(id),name:'Pending'};}):[]})});const data=await response.json();if(!response.ok)throw new Error(data.error);
 if(requestRevision!==revision){status.textContent='Settings changed. Generate a new link.';return;}
 field.value=location.origin+data.path;document.querySelector('#install').href=field.value.replace(/^https?:/,'stremio:');result.hidden=false;credential.value='';mdbKey.value='';listRevision++;status.textContent='Ready to install. Keep your personal link private.';
 }catch(error){status.textContent=error.message;}finally{generate.disabled=false;}
});
document.querySelector('#copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(field.value);status.textContent='Manifest URL copied.';}catch{field.select();status.textContent='Select and copy the URL above.';}});
</script></html>`;

export function createServer(addon, { configSecret, sharedCredential = true, tmdbFactory = createTmdb, mdbFactory = createMdbList, koFiUrl = '', analytics = null } = {}) {
  const supportUrl = koFiUrl.trim();
  if (supportUrl && !/^https:\/\/ko-fi\.com\/[a-z0-9_\-]+\/?$/i.test(supportUrl)) {
    throw new Error('KO_FI_URL must be an HTTPS Ko-fi profile URL, for example https://ko-fi.com/yourname.');
  }
  const configurationPage = page(supportUrl);
  const codec = createConfigCodec(configSecret);
  const clients = new Map();
  const limited = createLimiter();
  let configurationWindow = 0, configurationCount = 0, configurationActive = 0;
  function personalAddon(credential) {
    const key = typeof credential === 'string' ? credential : JSON.stringify(credential);
    let client = clients.get(key);
    if (!client) {
      if (clients.size >= 50) clients.delete(clients.keys().next().value);
      const tmdbCredential = typeof credential === 'string' ? credential : credential.tmdb;
      if (!tmdbCredential && !sharedCredential) throw new ServiceError('Enter your TMDB credential for metadata.', 400);
      client = tmdbCredential ? createAddon(tmdbFactory({ ...credentialOptions(tmdbCredential), maxCacheEntries: 100, limited })) : addon;
      if (typeof credential !== 'string') client = withMdbList(client, mdbFactory({ apiKey: credential.mdblist, limited }));
      clients.set(key, client);
    }
    return client;
  }
  async function configure(req, action = 'configure') {
    const personSearch = action === 'people';
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
      if (action === 'lists') {
        if (!codec.enabled) throw new ServiceError('Personal keys are not enabled on this host.', 503);
        const mdb = mdbFactory({ apiKey: data.mdblistKey, limited });
        return { lists: data.listId === undefined ? await mdb.lists() : [await mdb.info(data.listId)] };
      }
      if (personSearch && (typeof data.personQuery !== 'string' || !data.personQuery.trim() || data.personQuery.length > 100)) throw new ServiceError('Enter a person name (up to 100 characters).', 400);
      const preferences = discoveryConfig({ languages: data.languages ?? discoveryConfig(data.language || 'all').languages, people: data.people, catalogues: data.catalogues, source: data.source, lists: data.lists });
      const scoped = data.credential ? personalAddon(data.credential) : addon;
      if (!data.credential && !sharedCredential) throw new ServiceError('Enter your own TMDB API key or read-access token.', 400);
      if (personSearch) return { people: await scoped.searchPeople(data.personQuery.trim()) };
      const encoded = preferences.source === 'mdblist' ? codec.seal({ version: 2, tmdb: data.credential || '', mdblist: data.mdblistKey }) : data.credential ? codec.seal(data.credential) : null;
      await scoped.languages();
      if (preferences.source === 'mdblist') {
        const mdb = mdbFactory({ apiKey: data.mdblistKey, limited });
        // Validate even a metadata-only configuration's MDBList credential.
        if (!preferences.lists.length) await mdb.lists();
        for (const list of preferences.lists) {
          const verified = await mdb.info(list.id);
          if (list.types.some(t => !verified.types.includes(t))) throw new ServiceError('The selected MDBList media type is no longer available. Reload your lists.', 400);
          list.name = verified.name;
        }
      }
      for (const person of preferences.people) person.name = await scoped.person(person.id);
      const legacy = !preferences.source && data.catalogues === undefined && data.languages === undefined && data.people === undefined && (data.language === undefined || data.language === 'all' || INDIAN_LANGUAGES.includes(data.language));
      const suffix = legacy ? (data.language || 'all') : `d/${encodeDiscovery(preferences)}`;
      const path = `${analytics ? `/i/${analytics.issue()}` : ''}${encoded ? `/c/${encoded}` : ''}/${suffix}/manifest.json`;
      if (path.length > 3800) throw new ServiceError('Install link too long. Select fewer collections or use a TMDB API key.', 400);
      return { path };
    } finally { configurationActive--; }
  }
  return http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    let installationId, dataRequest = false;
    res.on('finish', () => { if (analytics && dataRequest && req.method === 'GET') analytics.record(installationId, res.statusCode >= 200 && res.statusCode < 300); });
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try {
      if (req.url.length > 4096) throw new ServiceError('URL too long.', 414);
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/admin/analytics' || url.pathname === '/admin/analytics.json') {
        res.removeHeader('Access-Control-Allow-Origin');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        if (!analytics) { json(404, { error: 'Not found.' }); return; }
        if (req.method !== 'GET') { json(405, { error: 'Method not allowed.' }); return; }
        if (url.pathname === '/admin/analytics') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(dashboard); return; }
        if (!analytics.authorized(req.headers.authorization)) {
          json(401, { error: 'Authentication required.' }); return;
        }
        json(200, analytics.snapshot());
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/people') { json(200, await configure(req, 'people')); return; }
      if (req.method === 'POST' && url.pathname === '/api/mdblist/lists') { json(200, await configure(req, 'lists')); return; }
      if (req.method === 'POST' && url.pathname === '/api/configure') { json(200, await configure(req)); return; }
      if (!['GET', 'HEAD'].includes(req.method)) { json(405, { error: 'Method not allowed.' }); return; }
      if (url.pathname === '/logo.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' }); res.end(logo); return;
      }
      let parts;
      try { parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); }
      catch { throw new ServiceError('Malformed URL.', 400); }
      if (parts[0] === 'i') {
        parts.shift(); installationId = parts.shift();
        if (!installationPattern.test(installationId || '')) throw new ServiceError('Invalid installation link.', 400);
      }
      let scopedAddon = addon, configured = sharedCredential, personalConfig;
      if (parts[0] === 'c') {
        parts.shift();
        personalConfig = parts.shift() || '';
      }
      let language = 'all';
      if (parts[0] === 'all' || /^[a-z]{2}$/.test(parts[0] || '')) language = parts.shift();
      if (parts[0] === 'd') { parts.shift(); language = decodeDiscovery(parts.shift() || ''); }
      if (!parts.length || (parts.length === 1 && parts[0] === 'configure')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(configurationPage); return;
      }
      if (personalConfig !== undefined) {
        const decoded = codec.open(personalConfig);
        scopedAddon = personalAddon(decoded);
        configured = language.source !== 'mdblist' || typeof decoded !== 'string';
      }
      else if (language.source === 'mdblist') configured = false;
      if (parts.length === 1 && parts[0] === 'health') { json(200, { status: 'ok', note: 'Process health only; TMDB connectivity is not checked.' }); return; }
      if (parts.length === 1 && parts[0] === 'manifest.json') { json(200, { ...scopedAddon.manifest(language), behaviorHints: { configurable: true, configurationRequired: !configured } }); return; }
      if (parts.length === 1 && parts[0] === 'configuration.json') { json(200, { personalKeys: codec.enabled, sharedCredential }); return; }
      if (parts.length === 1 && parts[0] === 'languages.json') { json(200, INDIAN_LANGUAGES.map((code, index) => ({ iso_639_1: code, english_name: LANGUAGE_NAMES[index] }))); return; }
      dataRequest = (parts[0] === 'catalog' && [3,4].includes(parts.length) || parts[0] === 'meta' && parts.length === 3) && parts.at(-1).endsWith('.json');
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

export function startServer() {
  const port = Number(process.env.PORT || 7000);
  const host = process.env.HOST || '127.0.0.1';
  const analytics = process.env.ANALYTICS_DB_PATH ? createAnalytics({ path: process.env.ANALYTICS_DB_PATH, password: process.env.ANALYTICS_ADMIN_PASSWORD }) : null;
  const server = createServer(createAddon(createTmdb({ token: process.env.TMDB_READ_ACCESS_TOKEN })), { analytics, configSecret: process.env.CONFIG_SECRET, koFiUrl: process.env.KO_FI_URL, sharedCredential: Boolean(process.env.TMDB_READ_ACCESS_TOKEN) });
  server.listen(port, host, () => console.log(`Indian Cinema is listening on ${host}:${port}. Open /configure to install.`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();
