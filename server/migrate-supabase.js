'use strict';

// One-time, loss-preserving merge of server/data.json into the normalized
// Supabase store. The local file is deleted only after a Supabase read-back
// confirms both the merged state and the exact archived source snapshot.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const localPath = path.join(__dirname, 'data.json');
const envPath = path.join(root, '.env.local');

function readSettings() {
  if (!fs.existsSync(envPath)) throw new Error('Missing .env.local in the project root.');
  const settings = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    settings[match[1]] = value;
  }
  if (!settings.SUPABASE_URL || !settings.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  return settings;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const encode = value => JSON.stringify(canonical(value));
const norm = value => String(value || '').trim().toLowerCase();

function union(remoteRows, localRows, identity, merge = (remote) => remote) {
  const out = Array.isArray(remoteRows) ? remoteRows.map(row => ({ ...row })) : [];
  const byKey = new Map(out.map((row, index) => [identity(row), index]));
  for (const local of Array.isArray(localRows) ? localRows : []) {
    const key = identity(local);
    if (byKey.has(key)) {
      const index = byKey.get(key);
      out[index] = merge(out[index], local);
    } else {
      byKey.set(key, out.length);
      out.push({ ...local });
    }
  }
  return out;
}

function mergeAsset(remote, local) {
  const merged = { ...local, ...remote };
  for (const field of ['history', 'comments']) {
    const seen = new Set();
    merged[field] = [...(remote[field] || []), ...(local[field] || [])].filter(row => {
      const key = encode(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (field === 'history') merged[field].sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime());
  }
  return merged;
}

function mergeStates(remote, local) {
  const result = { ...local, ...remote };
  result.assets = union(remote.assets, local.assets, row => norm(row.serial) || `id:${row.id}`, mergeAsset);
  result.employees = union(remote.employees, local.employees, row => norm(row.name), (r, l) => ({ ...l, ...r,
    department: r.department || l.department || '', cciId: r.cciId || l.cciId || ''
  }));
  result.users = union(remote.users, local.users, row => norm(row.username));
  result.logs = union(remote.logs, local.logs, row => encode(row));
  result.consumables = union(remote.consumables, local.consumables, row => `id:${row.id ?? ''}|${norm(row.name)}|${norm(row.category)}|${norm(row.location)}`);
  result.deskPeripherals = union(remote.deskPeripherals, local.deskPeripherals, row => `id:${row.id ?? ''}|${norm(row.deskNo)}|${norm(row.category)}|${norm(row.serial)}`);
  result.formerEmployees = union(remote.formerEmployees, local.formerEmployees,
    row => row.id !== undefined ? `id:${row.id}` : `name:${norm(row.name)}`,
    (r, l) => ({ ...l, ...r, assets: union(r.assets, l.assets, a => norm(a.serial) || `id:${a.id}`, mergeAsset) }));
  result.dellCases = union(remote.dellCases, local.dellCases, row => norm(row.caseId) || `id:${row.id}`);
  result.quickLinks = union(remote.quickLinks, local.quickLinks, row => row.id !== undefined ? `id:${row.id}` : `${norm(row.name)}|${norm(row.url)}`);
  result.offboardingChecklists = union(remote.offboardingChecklists, local.offboardingChecklists,
    row => row.id !== undefined ? `id:${row.id}` : `employee:${norm(row.employeeName || row.name)}`);
  result.employeeComments = { ...(local.employeeComments || {}), ...(remote.employeeComments || {}) };
  result.seq = Math.max(Number(remote.seq) || 1000, Number(local.seq) || 1000);
  result.assetCommentHistoryV1 = Boolean(remote.assetCommentHistoryV1 || local.assetCommentHistoryV1);
  return result;
}

async function main() {
  if (!fs.existsSync(localPath)) {
    console.log('No local database file exists; nothing to migrate.');
    return;
  }
  const local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  if (!local || typeof local !== 'object' || Array.isArray(local)) throw new Error('Local data.json is not a valid state object. It was left untouched.');
  const settings = readSettings();
  const baseUrl = settings.SUPABASE_URL.replace(/\/$/, '');
  const headers = {
    apikey: settings.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${settings.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
  async function rpc(name, body = {}) {
    const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000)
    });
    const text = await response.text();
    let value;
    try { value = text ? JSON.parse(text) : null; } catch { value = text; }
    if (!response.ok) throw new Error(`Supabase ${name} failed (${response.status}): ${typeof value === 'string' ? value.slice(0, 300) : value?.message || value?.hint || 'request rejected'}. Local database was retained.`);
    return value;
  }

  let remote;
  let archived = null;
  let useRelational = true;
  try {
    remote = await rpc('assetflow_load_state');
    archived = await rpc('assetflow_get_local_archive');
  } catch (error) {
    if (!/\b404\b|PGRST202/i.test(error.message)) throw error;
    // A safe transition path: first merge into the existing Supabase JSONB
    // row, carrying the exact local snapshot as an archive field. The SQL
    // migration later moves that archive into assetflow_migration_archives.
    useRelational = false;
    const response = await fetch(`${baseUrl}/rest/v1/assetflow_state?id=eq.main&select=data`, { headers, signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    let rows;
    try { rows = text ? JSON.parse(text) : null; } catch { rows = text; }
    if (!response.ok) throw new Error(`Supabase legacy state read failed (${response.status}). Local database was retained.`);
    if (!Array.isArray(rows) || !rows[0]?.data) throw new Error('Supabase has no existing state row to merge. Local database was retained.');
    remote = rows[0].data;
    archived = remote._localSnapshotArchive || null;
  }
  if (archived && encode(archived) === encode(local)) {
    fs.unlinkSync(localPath);
    console.log('The exact local snapshot is already archived in Supabase; removed the redundant local database file.');
    return;
  }
  if (archived) throw new Error('A different local snapshot is already archived in Supabase. Local database was retained to avoid replacing that archive.');

  const merged = mergeStates(remote, local);
  let verifiedState;
  let verifiedArchive;
  if (useRelational) {
    const result = await rpc('assetflow_save_state', { p_state: merged, p_local_archive: local });
    if (!result || result.ok !== true || result.archivedLocalSnapshot !== true) throw new Error('Supabase did not confirm the local archive. Local database was retained.');
    [verifiedState, verifiedArchive] = await Promise.all([rpc('assetflow_load_state'), rpc('assetflow_get_local_archive')]);
  } else {
    merged._localSnapshotArchive = local;
    const response = await fetch(`${baseUrl}/rest/v1/assetflow_state?on_conflict=id`, {
      method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: 'main', data: merged, updated_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Supabase merge write failed (${response.status}). Local database was retained.`);
    const check = await fetch(`${baseUrl}/rest/v1/assetflow_state?id=eq.main&select=data`, { headers, signal: AbortSignal.timeout(20000) });
    const rows = await check.json();
    if (!check.ok || !Array.isArray(rows) || !rows[0]?.data) throw new Error('Supabase merge read-back failed. Local database was retained.');
    verifiedState = rows[0].data;
    verifiedArchive = verifiedState._localSnapshotArchive;
  }
  if (encode(verifiedArchive) !== encode(local)) throw new Error('Supabase archive read-back did not match the local snapshot. Local database was retained.');
  for (const collection of ['assets', 'employees', 'users', 'logs', 'consumables', 'deskPeripherals', 'formerEmployees', 'dellCases', 'quickLinks', 'offboardingChecklists']) {
    const expected = Array.isArray(merged[collection]) ? merged[collection].length : 0;
    const actual = Array.isArray(verifiedState[collection]) ? verifiedState[collection].length : 0;
    if (actual !== expected) throw new Error(`Supabase read-back mismatch for ${collection} (${actual} of ${expected}). Local database was retained.`);
  }

  fs.unlinkSync(localPath);
  const totals = ['assets', 'employees', 'users', 'logs', 'consumables', 'deskPeripherals', 'formerEmployees', 'dellCases', 'quickLinks', 'offboardingChecklists']
    .map(key => `${key}=${verifiedState[key]?.length || 0}`).join(', ');
  console.log(`Supabase merge and read-back verified (${totals}). Removed server/data.json after archiving its exact contents in Supabase${useRelational ? '.' : ' JSONB row. Run the relational SQL migration next to move the archive into its archive table.'}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
