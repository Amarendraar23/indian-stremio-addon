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

const page = supportUrl => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>Indian Cinema · Stremio</title><style>
:root{color-scheme:light dark;--bg:#f3f2f8;--panel:#fff;--ink:#292633;--muted:#696473;--line:#ddd9e8;--accent:#655099;--on-accent:#fff;--soft:#eae5f4;--error:#ab263d;font:15px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#15141c;--panel:#211f2c;--ink:#f3f0f8;--muted:#b9b3c7;--line:#413b52;--accent:#c7b5f3;--on-accent:#291d46;--soft:#332c44;--error:#ffb1bd}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink)}[hidden]{display:none!important}button,input,select{font:inherit}button,a,summary,input,select{-webkit-tap-highlight-color:transparent}button,summary{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.55}a{color:var(--accent);text-underline-offset:3px}button:focus-visible,a:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid var(--accent);outline-offset:4px}p{margin:8px 0;color:var(--muted)}h1,h2,h3{line-height:1.2}h1{font-size:clamp(28px,3vw,37px);letter-spacing:-1.2px;font-weight:550;margin:14px 0}h2{font-size:clamp(24px,3vw,30px);letter-spacing:-.8px;font-weight:600;margin:10px 0 12px}h3{font-size:17px;font-weight:600;margin:24px 0 10px}
.site-header{max-width:1152px;margin:auto;padding:26px 36px;display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:11px;font-size:18px;font-weight:650;letter-spacing:-.5px}.brand img{border-radius:9px}.eyebrow{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted)}main{max-width:1152px;margin:48px auto;padding:0 36px;display:grid;grid-template-columns:250px minmax(0,1fr);gap:44px;align-items:start}.intro{padding:16px 0}.intro>p{max-width:240px;font-size:14px}.steps{display:grid;gap:9px;margin-top:30px}.step{border:0;border-radius:10px;background:transparent;color:var(--muted);padding:12px;display:flex;gap:12px;align-items:center;text-align:left}.step[aria-current=step]{background:var(--panel);color:var(--ink)}.step-number{display:grid;place-items:center;border:1px solid var(--line);border-radius:50%;width:28px;height:28px;flex:none;font-size:12px}.step[aria-current=step] .step-number{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}.panel{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:32px;min-width:0}.step-pane:focus{outline:none}.step-pane>p{max-width:550px}.small{font-size:13px}.field{display:block;font-weight:550;margin:20px 0 6px}input:not([type=checkbox]),select{display:block;width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--ink);font-size:16px}input::placeholder{color:var(--muted)}input[type=checkbox]{accent-color:var(--accent);width:16px;height:16px;margin:0;flex:none}fieldset{min-width:0;border:0;padding:0;margin:24px 0 0}legend{font-weight:550;padding:0;margin-bottom:10px}.selection-tools{display:flex;align-items:center;flex-wrap:wrap;gap:6px 18px;margin-bottom:12px}.text-button{border:0;padding:3px 0;background:none;color:var(--accent);font-size:13px;text-decoration:underline;text-underline-offset:3px}#language-options{display:flex;flex-wrap:wrap;gap:8px}#language-options label{display:flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid var(--line);border-radius:8px;background:var(--bg);font-size:13px;cursor:pointer}#language-options label:has(:checked){border-color:var(--accent);background:var(--soft);color:var(--accent)}.count{font-size:12px;color:var(--muted);margin-top:12px}details{border-top:1px solid var(--line);margin-top:22px;padding-top:16px}summary{font-size:14px;font-weight:550}details p{font-size:13px;line-height:1.7}details details{margin-top:16px}.catalogue-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.catalogue-grid label,#mdb-available label{display:flex;gap:9px;align-items:center;padding:6px 0;font-size:13px}.catalogue-grid fieldset{margin-top:16px}.catalogue-grid legend{font-size:14px}.secondary{border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:9px 13px;border-radius:8px;margin-top:10px}.inline-controls{display:flex;gap:10px;align-items:center}.inline-controls input{flex:1;min-width:0}.inline-controls button{flex:none;margin:0}#person-results{display:grid;gap:8px}#person-results button{border:1px solid var(--line);background:var(--bg);color:var(--ink);text-align:left;padding:10px 12px;border-radius:8px}#person-results:not(:empty){margin-top:12px}.review{margin:18px 0 20px;padding:12px 15px;border-radius:9px;background:var(--bg);font-size:13px;color:var(--muted)}.actions{display:flex;align-items:center;gap:20px;margin-top:28px}.primary,.install{display:inline-flex;align-items:center;justify-content:center;gap:10px;border:0;border-radius:10px;padding:13px 20px;background:var(--accent);color:var(--on-accent);font-weight:650;text-decoration:none;min-height:48px}.actions .primary{flex:1}#back{font-size:14px}#result{border-top:1px solid var(--line);padding-top:24px;margin-top:24px}#result .install{width:100%}#result input{font-size:13px}#status,#mdb-status,#wizard-error{font-size:13px;overflow-wrap:anywhere}#status:empty,#mdb-status:empty,#wizard-error:empty{display:none}#status{margin-top:16px}#wizard-error{color:var(--error);margin-top:20px}.privacy-note{font-size:12px;margin-top:14px}.site-footer{max-width:1080px;margin:0 auto 32px;padding:24px 0;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;justify-content:space-between;gap:20px;font-size:12px;color:var(--muted)}.site-footer p{margin:0}.credits{max-width:650px}.credits img{display:block;margin-top:16px;margin-bottom:10px}.support-link{display:inline-flex;gap:8px;align-items:center;text-decoration:none;font-size:13px}.skip-link{position:absolute;top:8px;left:8px;transform:translateY(-180%);padding:8px 14px;background:var(--panel);z-index:2}.skip-link:focus{transform:none}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:760px){.site-header{padding:20px 24px}main{grid-template-columns:1fr;gap:22px;padding:0 24px;margin:24px auto}.intro{padding:0}.intro>p{max-width:none}.intro h1 br{display:none}.steps{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:20px;gap:6px}.step{flex-direction:column;align-items:flex-start;gap:8px;font-size:12px;padding:10px}.panel{padding:24px}.site-footer{margin:0 24px 24px}.catalogue-grid{gap:14px}}
@media(max-width:400px){.site-header{padding:18px}.brand{font-size:16px}.brand img{width:28px;height:28px}.site-header .eyebrow{font-size:10px}main{padding:0 16px}.panel{padding:20px}.catalogue-grid{grid-template-columns:1fr;gap:0}.inline-controls{flex-wrap:wrap}.inline-controls input{flex-basis:100%}.site-footer{margin:0 16px 24px}#language-options label{padding:8px 9px}}
@media(pointer:coarse){.text-button,summary{min-height:44px;display:inline-flex;align-items:center}.selection-tools{gap:4px 18px}#language-options label,.catalogue-grid label,#mdb-available label{min-height:44px}}
</style></head><body>
<a class="skip-link" href="#setup">Skip to setup</a>
<header class="site-header"><div class="brand"><img src="/logo.png" alt="" width="34" height="34">Indian Cinema</div><span class="eyebrow">For Stremio</span></header>
<main><aside class="intro"><span class="eyebrow">Make yourself at home</span><h1>A little setup.<br> A lot to discover.</h1><p>Build your Indian cinema collection in three steps.</p><nav class="steps" aria-label="Setup steps">
<button type="button" class="step" data-step="0" aria-controls="step-languages" aria-current="step"><span class="step-number">1</span><span>Your languages</span></button>
<button type="button" class="step" data-step="1" aria-controls="step-collections"><span class="step-number">2</span><span>Your collections</span></button>
<button type="button" class="step" data-step="2" aria-controls="step-connect"><span class="step-number">3</span><span>Connect &amp; install</span></button></nav></aside>
<div class="panel" id="setup">
<section class="step-pane" id="step-languages" aria-labelledby="languages-title"><span class="eyebrow">Step 1 of 3</span><h2 id="languages-title" tabindex="-1">What do you like to watch?</h2><p>Choose one or more original Indian languages.</p>
<fieldset id="language"><legend class="sr-only">Original languages</legend><div class="selection-tools"><button class="text-button" type="button" id="all-languages">Select all</button><button class="text-button" type="button" id="clear-languages">Clear selection</button></div><div id="language-options"></div></fieldset><p id="language-count" class="count" aria-live="polite"></p><p class="small">This filters original languages, not dubbed audio.</p>
<details><summary>Which titles are included?</summary><p>Indian productions in the 16 supported original languages. English and other foreign-language originals are excluded. Some languages may have fewer titles available.</p></details></section>
<section class="step-pane" id="step-collections" aria-labelledby="collections-title" hidden><span class="eyebrow">Step 2 of 3</span><h2 id="collections-title" tabindex="-1">Pick your collections</h2><p>Start with TMDB or bring your saved MDBList lists.</p>
<label class="field" for="source">Catalogue source</label><select id="source"><option value="tmdb">TMDB</option><option value="mdblist">MDBList + optional TMDB collections</option></select>
<section id="mdb-settings" hidden><h3>MDBList saved lists</h3><label class="field" for="mdb-key">Your MDBList API key</label><input id="mdb-key" type="password" maxlength="128" autocomplete="off" spellcheck="false"><p class="small">Get your key from <a href="https://mdblist.com/preferences/" target="_blank" rel="noreferrer">MDBList preferences</a>.</p><button class="secondary" id="load-mdb" type="button">Load my MDBList lists</button><label class="field" for="mdb-id">Or add a list by numeric MDBList ID</label><div class="inline-controls"><input id="mdb-id" inputmode="numeric" maxlength="16" placeholder="List ID"><button class="secondary" id="add-mdb" type="button">Add list</button></div><p id="mdb-status" role="status"></p><div id="mdb-available"></div><details><summary>List filters &amp; limits</summary><p>Choose up to four lists. List order is preserved. Edit filters in MDBList and choose Original when filtering languages there. Only Indian productions in your selected original languages appear here, so counts may differ.</p><p>Browsing checks up to 1,000 candidates per list and language selection. Use focused lists for best results. Refresh and API limits depend on your MDBList plan.</p></details></section>
<details id="catalogue-details"><summary>Choose movie &amp; TV collections <span class="small" id="catalogue-count"></span></summary><section id="catalogues" aria-labelledby="catalogues-title"><h3 id="catalogues-title">Your Stremio shelves</h3><p id="source-help" class="small">TMDB collections</p><div class="selection-tools"><button class="text-button" type="button" id="all-catalogues">Select all catalogues</button><button class="text-button" type="button" id="clear-catalogues">Clear catalogues</button></div><div class="catalogue-grid"><fieldset id="movie-catalogues"><legend>Movies</legend></fieldset><fieldset id="series-catalogues"><legend>TV shows</legend></fieldset></div><p class="small">Turn off any collection you do not want. Turning off every catalogue keeps metadata available. Actor and director shelves can be added in the next step.</p></section></details>
<details><summary>How collections work</summary><p>Hidden gems are automatic: released titles rated at least 7/10 with 20–500 TMDB votes, sorted by rating. Vote counts are a rough visibility measure, not editorial recommendations.</p><p>Use “By year” or “By decade” in Stremio Discover and its Genre selector to choose a year or decade. Movies use release dates; series use first-air dates. These collections use your selected languages. Other shelves use Genre for language.</p><p>Search controls this add-on's search results. It checks the first 100 TMDB matches and keeps Indian productions.</p></details></section>
<section class="step-pane" id="step-connect" aria-labelledby="connect-title" hidden><span class="eyebrow">Step 3 of 3</span><h2 id="connect-title" tabindex="-1">Connect &amp; make it yours</h2><p>TMDB provides title details, posters and episodes.</p><div id="review" class="review"></div>
<label class="field" for="credential">Your TMDB API key or API Read Access Token</label><input id="credential" type="password" autocomplete="off" spellcheck="false" maxlength="2048" placeholder="Paste your TMDB credential" aria-describedby="credential-help"><p id="credential-help" class="small">Use your own credential from <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">TMDB API settings</a>.</p>
<details id="people-details"><summary>Actor &amp; director collections · optional</summary><p>Enter your TMDB credential above, then search by name to add up to four movie shelves.</p><label class="field" for="person-query">Find an actor or director</label><input id="person-query" maxlength="100" placeholder="Search TMDB people" autocomplete="off"><label class="field" for="person-role">Collection role</label><select id="person-role"><option value="actor">Starring</option><option value="director">Directed by</option></select><button class="secondary" type="button" id="find-person" disabled>Find person</button><div id="person-results" aria-live="polite"></div><label class="field" for="people">Selected collections · up to four</label><input id="people" placeholder="actor:31, director:5655" maxlength="120" autocomplete="off"><details><summary>Using person IDs</summary><p>You can enter role:TMDB-person-ID pairs separated by commas. Find IDs in the person's <a href="https://www.themoviedb.org/person" target="_blank" rel="noreferrer">TMDB page</a> URL. Names are checked when generating your link. Director shelves require an actual Director credit. Series person collections are not supported.</p></details></details>
<p class="privacy-note">Keep your install link private. Anyone with it can use your provider quotas.</p><details><summary>Privacy &amp; provider details</summary><p>Your TMDB credential is sent to this server and TMDB for metadata. If selected, your MDBList key is sent to this server and MDBList for list access. Credentials are encrypted in your install link. Stremio and the hosting provider can see the link.</p><p>The server keeps temporary in-memory caches. It does not log credentials or save them in a database. Revoke the affected keys at their providers if the link is shared. TMDB is required in MDBList mode for title details, episodes, language checks and optional TMDB collections.</p></details>
<div id="result" hidden><a class="install" id="install">Install in Stremio ↗</a><label class="field" for="manifest">Or copy this manifest URL into Stremio</label><div class="inline-controls"><input id="manifest" readonly aria-label="Manifest URL"><button class="secondary" type="button" id="copy">Copy URL</button></div><p class="small">Generate and install a new link whenever you change your settings.</p></div></section>
<p id="wizard-error" role="alert"></p><div class="actions"><button class="text-button" type="button" id="back" hidden>Back</button><button class="primary" type="button" id="next">Continue →</button><button class="primary" type="button" id="generate" disabled hidden>Generate install link →</button></div><p id="status" role="status"></p><noscript><p>This setup needs JavaScript. Enable it to choose your languages and generate an install link.</p></noscript></div></main>
<footer class="site-footer"><div class="credits"><p>Catalogues &amp; metadata only. Playback depends on your other add-ons.</p><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><img width="90" alt="TMDB" src="https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"></a><p>This product uses the TMDB API but is not endorsed or certified by TMDB.<br>Optional saved lists by <a href="https://mdblist.com/" target="_blank" rel="noreferrer">MDBList</a>.</p></div>
${supportUrl ? `<a class="support-link" href="${supportUrl}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">♡ Support on Ko-fi ↗<span class="sr-only"> (opens in a new tab; optional contribution)</span></a>` : ''}</footer>
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
let step=0;
const panes=[...document.querySelectorAll('.step-pane')], stepButtons=[...document.querySelectorAll('[data-step]')];
const next=document.querySelector('#next'), back=document.querySelector('#back'), wizardError=document.querySelector('#wizard-error');
function updateSummary(){
 const languageCount=boxes.filter(b=>b.checked).length, catalogueCount=catalogueBoxes.filter(b=>b.checked).length;
 document.querySelector('#language-count').textContent=languageCount+' of 16 selected';
 document.querySelector('#catalogue-count').textContent=' · '+catalogueCount+' selected';
 const personCount=people.value.trim()?people.value.split(',').filter(p=>p.trim()).length:0;
 document.querySelector('#review').textContent=languageCount+' original language'+(languageCount===1?'':'s')+' · '+catalogueCount+' catalogue'+(catalogueCount===1?'':'s')+' · '+(source.value==='mdblist'?'MDBList + TMDB':'TMDB')+(personCount?' · '+personCount+' person collection'+(personCount===1?'':'s'):'');
}
function showStep(index,focus=true){
 if(index>0&&!boxes.some(b=>b.checked)){
  showStep(0,false);wizardError.textContent='Choose at least one original language to continue.';boxes[0].focus();return;
 }
 step=index;panes.forEach((pane,i)=>pane.hidden=i!==step);
 stepButtons.forEach((button,i)=>{if(i===step)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
 next.hidden=step===2;generate.hidden=step!==2||!result.hidden;back.hidden=step===0;wizardError.textContent='';updateSummary();
 if(focus)panes[step].querySelector('h2').focus();
}
stepButtons.forEach(button=>button.addEventListener('click',()=>showStep(Number(button.dataset.step))));
next.addEventListener('click',()=>showStep(Math.min(2,step+1)));
back.addEventListener('click',()=>showStep(Math.max(0,step-1)));
showStep(0,false);
const findPerson=document.querySelector('#find-person');
findPerson.addEventListener('click',async()=>{
 const container=document.querySelector('#person-results');container.replaceChildren();findPerson.disabled=true;
 try{const response=await fetch('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:credential.value.trim(),personQuery:document.querySelector('#person-query').value.trim()})});const data=await response.json();if(!response.ok)throw new Error(data.error);
 if(!data.people.length)container.textContent='No matching people found.';
 for(const person of data.people){const button=document.createElement('button');button.textContent=person.name+' · '+(person.knownFor || 'TMDB person')+' · '+person.id;button.onclick=()=>{const entries=people.value.trim()?people.value.split(',').map(p=>p.trim()):[];const entry=document.querySelector('#person-role').value+':'+person.id;if(entries.includes(entry))return;if(entries.length>=4){status.textContent='Choose up to four collections.';return;}people.value=[...entries,entry].join(', ');invalidate();button.textContent='Added '+person.name;};container.append(button);}
 }catch(error){container.textContent=error.message;}finally{findPerson.disabled=false;}
});
function invalidate(){revision++;result.hidden=true;generate.hidden=step!==2;field.value='';document.querySelector('#install').removeAttribute('href');status.textContent='';wizardError.textContent='';updateSummary();}
language.addEventListener('change',invalidate);credential.addEventListener('input',invalidate);
fetch('/configuration.json').then(r=>r.json()).then(config=>{
 generate.disabled=!config.personalKeys&&!config.sharedCredential;findPerson.disabled=generate.disabled;
 if(config.sharedCredential)document.querySelector('#credential-help').append(' Leave blank to use the shared server credential.');
 if(!config.personalKeys){credential.disabled=true;source.disabled=true;document.querySelector('#load-mdb').disabled=true;document.querySelector('#add-mdb').disabled=true;status.textContent='Personal keys are not enabled on this host yet.';}
}).catch(()=>{status.textContent='Could not load configuration. Please reload.';});
generate.addEventListener('click',async()=>{
 if(!boxes.some(b=>b.checked)){showStep(0);wizardError.textContent='Choose at least one original language to continue.';return;}
 invalidate();const requestRevision=revision;generate.disabled=true;status.textContent='Checking configuration…';
 try{const response=await fetch('/api/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:source.value,lists:source.value==='mdblist'?selectedLists:[],mdblistKey:source.value==='mdblist'?mdbKey.value.trim():undefined,credential:credential.value.trim(),languages:boxes.filter(b=>b.checked).map(b=>b.value),catalogues:catalogueBoxes.filter(b=>b.checked).map(b=>b.value),people:people.value.trim()?people.value.split(',').map(entry=>{const pair=entry.trim().split(':');if(pair.length!==2)throw new Error('Use role:person-ID pairs.');const [role,id]=pair;return {role,id:Number(id),name:'Pending'};}):[]})});const data=await response.json();if(!response.ok)throw new Error(data.error);
 if(requestRevision!==revision){status.textContent='Settings changed. Generate a new link.';return;}
 field.value=location.origin+data.path;document.querySelector('#install').href=field.value.replace(/^https?:/,'stremio:');result.hidden=false;credential.value='';mdbKey.value='';listRevision++;status.textContent='Ready to install. Keep your personal link private.';showStep(2,false);document.querySelector('#install').focus();
 }catch(error){status.textContent=error.message;}finally{generate.disabled=false;}
});
document.querySelector('#copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(field.value);status.textContent='Manifest URL copied.';}catch{field.select();status.textContent='Select and copy the URL above.';}});
</script></body></html>`;

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
