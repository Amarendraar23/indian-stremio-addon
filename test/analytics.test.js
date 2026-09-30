import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAnalytics } from '../src/analytics.js';
import { createServer } from '../src/server.js';
import { createAddon } from '../src/addon.js';

const password = 'admin-test-password-'.repeat(3), DAY = 86400000;

test('rolling distinct counts, signed IDs, persistence, privacy, expiry and reactivation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'addon-analytics-')), path = join(dir, 'stats.sqlite');
  let time = Date.UTC(2026, 8, 29, 12), store;
  try {
    store = createAnalytics({ path, password, now: () => time });
    const first = store.issue(), second = store.issue(), untouched = store.issue();
    assert.ok(store.valid(first));
    assert.equal(store.valid(first.slice(0,-1) + (first.endsWith('0') ? '1' : '0')), false);
    assert.equal(store.snapshot().activeInstallations[1], 0);
    store.record(first, true); store.record(first, true); store.record(second, false);
    store.record('forged-id', true); store.record(undefined, false);
    assert.equal(store.snapshot().activeInstallations[1], 1);
    assert.deepEqual(store.snapshot().totals, {success:3,errors:2,unidentified:2});
    time += 2 * DAY; store.record(second, true);
    assert.deepEqual(store.snapshot().activeInstallations, {1:1,7:2,30:2});
    store.close();
    assert.equal(readFileSync(path).includes(Buffer.from(first)), false);
    assert.equal(readFileSync(path).includes(Buffer.from(password)), false);
    store = createAnalytics({ path, password, now: () => time });
    assert.ok(store.valid(first)); assert.ok(store.valid(untouched));
    assert.deepEqual(store.snapshot().activeInstallations, {1:1,7:2,30:2});
    time += 8 * DAY;
    assert.deepEqual(store.snapshot().activeInstallations, {1:0,7:0,30:2});
    time += 91 * DAY;
    assert.deepEqual(store.snapshot().activeInstallations, {1:0,7:0,30:0});
    assert.equal(store.snapshot().daily.length, 0);
    store.record(first, true);
    assert.equal(store.snapshot().activeInstallations[1], 1);
  } finally { store?.close(); rmSync(dir, {recursive:true,force:true}); }
});

test('HTTP activity excludes setup/manifest/HEAD, includes data outcomes, protects admin and preserves legacy paths', async t => {
  const store = createAnalytics({path:':memory:',password});
  const addon = createAddon(async () => []);
  addon.catalog = async (_type,id) => { if(id === 'broken') throw new Error('private upstream data'); return {metas:[]}; };
  addon.meta = async () => ({meta:null});
  const server = createServer(addon,{analytics:store});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = {Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')};
  const submission = await fetch(base+'/api/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'hi'})});
  const {path} = await submission.json(); assert.match(path,/^\/i\/[a-f0-9]{32}\.[a-f0-9]{64}\/hi\/manifest.json$/);
  assert.equal((await fetch(base+path)).status,200);
  await fetch(base+'/configure'); await fetch(base+'/health');
  const catalogue = path.replace('manifest.json','catalog/movie/popular.json');
  await fetch(base+catalogue,{method:'HEAD'});
  assert.equal(store.snapshot().activeInstallations[1],0);
  await fetch(base+catalogue); await fetch(base+catalogue);
  await fetch(base+path.replace('manifest.json','meta/movie/tt1.json'));
  const failed = await fetch(base+path.replace('manifest.json','catalog/movie/broken.json'));
  assert.equal(failed.status,500); assert.equal((await failed.text()).includes('private upstream data'),false);
  await fetch(base+'/all/catalog/movie/popular.json');
  assert.deepEqual(store.snapshot().totals,{success:4,errors:1,unidentified:1});
  assert.equal(store.snapshot().activeInstallations[1],1);
  for(const endpoint of ['/admin/analytics','/admin/analytics.json']){
    const denied = await fetch(base+endpoint); assert.equal(denied.status,401);
    assert.equal(denied.headers.get('access-control-allow-origin'),null);
    assert.equal((await fetch(base+endpoint,{headers:{Authorization:'Bearer wrong'}})).status,401);
    const response = await fetch(base+endpoint,{headers:auth}); assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('x-frame-options'),'DENY');
  }
  const stats = await (await fetch(base+'/admin/analytics.json',{headers:auth})).json();
  assert.equal(JSON.stringify(stats).includes(path.split('/')[2]),false);
  assert.equal((await fetch(base+'/i/bad/all/manifest.json')).status,400);
});

test('disabled analytics preserves original links and hides dashboard; store failures do not throw', async t => {
  const server = createServer(createAddon(async () => []));
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(() => new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/admin/analytics')).status,404);
  const r = await fetch(base+'/api/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal((await r.json()).path,'/all/manifest.json');
  const store = createAnalytics({path:':memory:',password}); const id=store.issue(); store.close();
  assert.doesNotThrow(()=>store.record(id,true));
});

test('identified personal multi-language links retain encrypted credentials and preferences', async t => {
  const store = createAnalytics({path:':memory:',password});
  const factory = () => async path => path === '/configuration/languages' ? [] : {results:[]};
  const server = createServer(createAddon(async()=>[]),{analytics:store,configSecret:'s'.repeat(64),sharedCredential:false,tmdbFactory:factory});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});store.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  const credential='a'.repeat(32);
  const response=await fetch(base+'/api/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential,languages:['hi','ta'],people:[]})});
  assert.equal(response.status,200);
  const {path}=await response.json();
  assert.match(path,/^\/i\/.+\/c\/.+\/d\/.+\/manifest.json$/);
  assert.equal(path.includes(credential),false);
  const manifest=await (await fetch(base+path)).json();
  assert.equal(manifest.behaviorHints.configurationRequired,false);
  assert.deepEqual(manifest.catalogs[0].extra.find(e=>e.name==='genre').options,['Hindi','Tamil']);
  const configurePage=await (await fetch(base+path.replace('manifest.json','configure'))).text();
  assert.equal(configurePage.includes('Private dashboard'),false);
  assert.equal(configurePage.includes('tracking'),false);
  assert.equal((await fetch(base+path.replace('manifest.json','catalog/movie/popular.json'))).status,200);
  assert.equal(store.snapshot().activeInstallations[1],1);
});
