import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

const DAY = 86400000;
export const installationPattern = /^[a-f0-9]{32}\.[a-f0-9]{64}$/;
const hash = value => createHash('sha256').update(value).digest();

// The store receives only an opaque ID, an outcome, and a time. Never pass request data.
export function createAnalytics({ path, password, now = Date.now }) {
  if (typeof password !== 'string' || password.length < 32) throw new Error('ANALYTICS_ADMIN_PASSWORD must contain at least 32 characters.');
  if (!path) throw new Error('Set ANALYTICS_DB_PATH to a persistent writable location.');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`PRAGMA busy_timeout=2000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS active (id TEXT PRIMARY KEY, last_seen INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS active_time ON active(last_seen);
    CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, success INTEGER NOT NULL DEFAULT 0,
      errors INTEGER NOT NULL DEFAULT 0, unidentified INTEGER NOT NULL DEFAULT 0);
  `);
  db.prepare('INSERT OR IGNORE INTO settings VALUES (?, ?)').run('signing_key', randomBytes(32).toString('hex'));
  db.prepare('INSERT OR IGNORE INTO settings VALUES (?, ?)').run('started_at', String(now()));
  const signingKey = db.prepare('SELECT value FROM settings WHERE key=?').get('signing_key').value;
  const passwordHash = hash(password);
  const sign = id => createHmac('sha256', signingKey).update(id).digest('hex');
  function valid(id) {
    return typeof id === 'string' && installationPattern.test(id)
      && timingSafeEqual(Buffer.from(id.split('.')[1], 'hex'), Buffer.from(sign(id.split('.')[0]), 'hex'));
  }
  function prune() {
    const cutoff = now() - 90 * DAY;
    db.prepare('DELETE FROM active WHERE last_seen <= ?').run(cutoff);
    db.prepare('DELETE FROM daily WHERE day < ?').run(new Date(cutoff).toISOString().slice(0, 10));
  }
  let lastPrune = 0, failures = 0;
  return {
    issue() { const id = randomBytes(16).toString('hex'); return `${id}.${sign(id)}`; },
    valid,
    authorized(header = '') {
      let candidate = '';
      if (header.startsWith('Basic ')) {
        const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
        if (decoded.startsWith('admin:')) candidate = decoded.slice(6);
      } else if (header.startsWith('Bearer ')) candidate = header.slice(7);
      return timingSafeEqual(hash(candidate), passwordHash);
    },
    record(id, successful) {
      // Analytics failure must never interrupt catalogue or metadata delivery.
      try {
        const time = now(), day = new Date(time).toISOString().slice(0, 10), identified = valid(id);
        if (time - lastPrune >= DAY) { prune(); lastPrune = time; }
        db.exec('BEGIN');
        db.prepare(`INSERT INTO daily(day,success,errors,unidentified) VALUES (?,?,?,?)
          ON CONFLICT(day) DO UPDATE SET success=success+excluded.success,
          errors=errors+excluded.errors, unidentified=unidentified+excluded.unidentified`)
          .run(day, successful ? 1 : 0, successful ? 0 : 1, identified ? 0 : 1);
        if (successful && identified) db.prepare(`INSERT INTO active VALUES (?,?)
          ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen`).run(hash(id).toString('hex'), time);
        db.exec('COMMIT');
      } catch {
        try { db.exec('ROLLBACK'); } catch {}
        failures++;
      }
    },
    snapshot() {
      prune();
      const time = now();
      const windows = Object.fromEntries([1, 7, 30].map(days => [days, db.prepare('SELECT count(*) AS n FROM active WHERE last_seen > ?').get(time - days * DAY).n]));
      const daily = db.prepare('SELECT * FROM daily ORDER BY day DESC').all();
      const totals = daily.reduce((sum, row) => ({ success: sum.success + row.success, errors: sum.errors + row.errors, unidentified: sum.unidentified + row.unidentified }), { success: 0, errors: 0, unidentified: 0 });
      return { startedAt: new Date(Number(db.prepare('SELECT value FROM settings WHERE key=?').get('started_at').value)).toISOString(),
        asOf: new Date(time).toISOString(), activeInstallations: windows, retentionDays: 90,
        totals, errorRate: totals.success + totals.errors ? totals.errors / (totals.success + totals.errors) : 0, daily,
        recordingFailuresSinceRestart: failures };
    },
    close() { db.close(); }
  };
}

export const dashboard = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Indian Cinema · Activity</title><style>
body{margin:0;background:#10151c;color:#f0eee8;font:16px/1.6 system-ui}main{max-width:1000px;margin:40px auto;padding:24px}h1{font-size:36px}p{color:#bbc3ce}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px}.card{background:#17202a;border:1px solid #394757;border-radius:10px;padding:20px}.card strong{display:block;color:#eab56a;font-size:36px}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:10px;border-bottom:1px solid #394757}.scroll{overflow:auto}button{background:#eab56a;color:#17202a;padding:10px 18px;border:0;border-radius:6px;cursor:pointer}#error{color:#ffb4ab}</style>
<main><h1>Indian Cinema activity</h1><p>Private dashboard · active installations are estimates, not unique people.</p>
<button id="refresh">Refresh</button><p id="error" role="status"></p><div class="cards">
<div class="card">Last 24 hours<strong id="day">—</strong></div><div class="card">Last 7 days<strong id="week">—</strong></div><div class="card">Last 30 days<strong id="month">—</strong></div>
<div class="card">Successful requests<strong id="success">—</strong></div><div class="card">Error rate<strong id="rate">—</strong></div></div>
<p id="period"></p><p id="coverage"></p><p>An installation becomes active after a successful catalogue or metadata response. Stremio may fetch these automatically. Generated links, manifests, setup visits and health checks do not count. Shared links may represent several people; regenerated links count separately. Existing links remain usable but do not count toward active installations until regenerated. Daily request totals use UTC and retain up to 90 days; active counts use rolling windows.</p>
<h2>Daily requests</h2><div class="scroll"><table><thead><tr><th>UTC date</th><th>Successful</th><th>Errors</th><th>Without installation ID</th></tr></thead><tbody id="daily"></tbody></table></div></main>
<script>
async function refresh(){const error=document.querySelector('#error');error.textContent='';try{const r=await fetch('/admin/analytics.json');if(!r.ok)throw new Error('Could not load activity. Sign in again or check the service.');const s=await r.json();for(const [id,value] of Object.entries({day:s.activeInstallations[1],week:s.activeInstallations[7],month:s.activeInstallations[30],success:s.totals.success,rate:(s.errorRate*100).toFixed(1)+'%'}))document.getElementById(id).textContent=value;
document.querySelector('#period').textContent='Collection started '+s.startedAt+' · Updated '+s.asOf;
document.querySelector('#coverage').textContent=s.totals.unidentified+' requests without a valid installation ID. '+s.recordingFailuresSinceRestart+' recording failures since restart.';
const body=document.querySelector('#daily');body.replaceChildren();for(const row of s.daily){const tr=document.createElement('tr');for(const value of [row.day,row.success,row.errors,row.unidentified]){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);}
}catch(e){error.textContent=e.message;}}document.querySelector('#refresh').onclick=refresh;refresh();
</script></html>`;
