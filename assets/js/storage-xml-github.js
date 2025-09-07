// assets/js/storage-xml-github.js
// GitHub XML storage using the Contents API directly from the browser
const OWNER  = 'markcolobong';
const REPO   = 'cnslegoblocks';
const BRANCH = 'main';
const FILE_PATH = 'data/records.xml';

const RAW_URL      = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${FILE_PATH}`;
const CONTENTS_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
const SS_LAST_SHA  = 'lego_last_commit_sha';

let GITHUB_TOKEN = null;

/* ========= helpers ========= */
function sanitizeToken(t){
  return (t||'').trim()
    .replace(/^[\"']+|[\"']+$/g,'')
    .replace(/\s+/g,'')
    .replace(/[\u200B-\u200D\uFEFF]/g,'');
}
async function ghFetch(url, init={}){
  const headers = Object.assign({
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }, init.headers || {});
  const token = sanitizeToken(GITHUB_TOKEN || '');
  if (!token) return fetch(url, Object.assign({}, init, { headers }));
  // Try token → Bearer → Basic (maximize compatibility)
  let res = await fetch(url, Object.assign({}, init, { headers: Object.assign({}, headers, { Authorization: `token ${token}` }) }));
  if (res.status !== 401) return res;
  res = await fetch(url, Object.assign({}, init, { headers: Object.assign({}, headers, { Authorization: `Bearer ${token}` }) }));
  if (res.status !== 401) return res;
  return fetch(url, Object.assign({}, init, { headers: Object.assign({}, headers, { Authorization: 'Basic ' + btoa('x:' + token) }) }));
}
function cssEscape(s){ return String(s ?? '').replace(/"/g, '\\"'); }
function base64EncodeUtf8(str){ return btoa(unescape(encodeURIComponent(str))); }
function decodeBase64Utf8(b64){ try { return decodeURIComponent(escape(atob(b64))); } catch { return ''; } }

function parseXmlToRecords(xmlText){
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) return [];
  const root = doc.querySelector('Records');
  if (!root) return [];
  const records = [];
  root.querySelectorAll('Record').forEach(node => {
    const text = tag => (node.querySelector(tag)?.textContent ?? '');
    const tier = name => {
      const el = node.querySelector(`Tiers > T[name="${cssEscape(name)}"]`);
      return el ? el.textContent : 'Applicable';
    };
    const id = node.getAttribute('id') || '';
    const links = [];
    node.querySelectorAll('Links > Link').forEach(L => {
      links.push({ label: L.getAttribute('label') || '', url: L.getAttribute('url') || '' });
    });
    records.push({
      id,
      category: text('Category'),
      phase: text('Phase'),
      activity: text('Activity'),
      outcome: text('Outcome'),
      presentationOwner: text('PresentationOwner'),
      contentOwner: text('ContentOwner'),
      notes: text('Notes'),
      links,
      tiers: {
        tier_1:  tier('tier_1'),
        tier_1_1:tier('tier_1_1'),
        tier_1_2:tier('tier_1_2'),
        tier_2:  tier('tier_2'),
        tier_2_1:tier('tier_2_1'),
        tier_3:  tier('tier_3'),
        tier_3_1:tier('tier_3_1'),
        tier_3_2:tier('tier_3_2')
      }
    });
  });
  return records;
}

/* ========= core I/O ========= */
async function getCurrentSha(ref = BRANCH){
  const res = await ghFetch(`${CONTENTS_URL}?ref=${encodeURIComponent(ref)}`, { method: 'GET', cache: 'no-store' });
  if (res.status === 200){
    const meta = await res.json();
    return meta.sha || null;
  }
  if (res.status === 404) return null; // file doesn't exist yet
  const t = await res.text();
  throw new Error('Failed reading file metadata: ' + t);
}

/**
 * Save entire array to GitHub with conflict handling.
 * Stores the returned commit/content SHA so we can re-read the *exact* version we wrote.
 */
async function saveAllToGitHub(records, message){
  if (!GITHUB_TOKEN) throw new Error('Not authorized: missing GitHub token for write');

  const xml = buildXml(records);
  const content = base64EncodeUtf8(xml);

  async function put(shaToUse){
    return ghFetch(CONTENTS_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message || 'Update data/records.xml',
        content,
        sha: shaToUse || undefined, // omit to create file
        branch: BRANCH
      })
    });
  }

  // always use the latest sha to start
  let sha = await getCurrentSha(BRANCH);
  let res = await put(sha);

  // On SHA mismatch: refresh and retry once
  if (!res.ok) {
    let errBody;
    try { errBody = await res.json(); } catch { errBody = {}; }
    const msg = String(errBody?.message || '');
    const isShaMismatch = res.status === 409 || res.status === 422 || /does not match|sha/i.test(msg);
    if (isShaMismatch) {
      sha = await getCurrentSha(BRANCH);
      res = await put(sha);
    }
  }

  if (!res.ok) {
    let err; try { err = await res.json(); } catch { err = {}; }
    throw new Error(err?.message || ('GitHub save failed ('+res.status+')'));
  }

  // Record the *exact* SHA and notify the page
  let json = {};
  try { json = await res.json(); } catch {}
  const savedSha = json?.content?.sha || json?.commit?.sha || null;
  if (savedSha) {
    try { sessionStorage.setItem(SS_LAST_SHA, savedSha); } catch {}
  }
  try {
    window.dispatchEvent(new CustomEvent('lego:recordsSaved', {
      detail: { sha: savedSha || null, count: records.length }
    }));
  } catch {}

  return savedSha;
}

/* ========= XML <-> JS ========= */
function buildXml(records){
  const esc = s => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const escAttr = s => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&apos;");
  const tier = (name, val) => `    <T name="${escAttr(name)}">${esc(val)}</T>\n`;
  const link = (l) => `    <Link label="${escAttr(l.label||'')}" url="${escAttr(l.url||'')}"/>\n`;

  let out = `<?xml version="1.0" encoding="UTF-8"?>\n<Records version="1">\n`;
  for (const r of records) {
    out += `  <Record id="${escAttr(r.id)}">\n`;
    out += `    <Category>${esc(r.category)}</Category>\n`;
    out += `    <Phase>${esc(r.phase)}</Phase>\n`;
    out += `    <Activity>${esc(r.activity)}</Activity>\n`;
    out += `    <Outcome>${esc(r.outcome)}</Outcome>\n`;
    out += `    <PresentationOwner>${esc(r.presentationOwner)}</PresentationOwner>\n`;
    out += `    <ContentOwner>${esc(r.contentOwner)}</ContentOwner>\n`;
    out += `    <Notes>${esc(r.notes)}</Notes>\n`;
    out += `    <Links>\n${(r.links||[]).map(link).join('')}    </Links>\n`;
    out += `    <Tiers>\n`;
    out += tier('tier_1',  r.tiers?.tier_1);
    out += tier('tier_1_1',r.tiers?.tier_1_1);
    out += tier('tier_1_2',r.tiers?.tier_1_2);
    out += tier('tier_2',  r.tiers?.tier_2);
    out += tier('tier_2_1',r.tiers?.tier_2_1);
    out += tier('tier_3',  r.tiers?.tier_3);
    out += tier('tier_3_1',r.tiers?.tier_3_1);
    out += tier('tier_3_2',r.tiers?.tier_3_2);
    out += `    </Tiers>\n`;
    out += `  </Record>\n`;
  }
  out += `</Records>\n`;
  return out;
}

/* ========= public API ========= */
const XmlGitHubStorage = {
  setToken(token){ GITHUB_TOKEN = sanitizeToken(token); },
  hasToken(){ return !!GITHUB_TOKEN; },

  // Load at a specific commit/branch/tag ref (token required)
  async loadAtRef(ref){
    try{
      const r = await ghFetch(`${CONTENTS_URL}?ref=${encodeURIComponent(ref)}`, { method:'GET', cache:'no-store' });
      if (!r.ok) return [];
      const json = await r.json();
      const xmlText = decodeBase64Utf8((json.content || '').replace(/\n/g,''));
      return parseXmlToRecords(xmlText);
    }catch{ return []; }
  },

  // Use the last saved SHA when available, else normal load
  async loadFreshPreferringSha(){
    const ref = (sessionStorage.getItem(SS_LAST_SHA) || '').trim();
    if (ref && this.hasToken()) {
      const viaSha = await this.loadAtRef(ref);
      if (viaSha && viaSha.length) return viaSha;
      // fall through to normal load if empty (e.g., just created file)
    }
    return this.load();
  },

  async load(){
    try{
      if (GITHUB_TOKEN) {
        const res = await ghFetch(`${CONTENTS_URL}?ref=${encodeURIComponent(BRANCH)}`, { method: 'GET', cache:'no-store' });
        if (res.status === 404) return [];
        if (!res.ok) return [];
        const json = await res.json();
        const xmlText = decodeBase64Utf8((json.content || '').replace(/\n/g,''));
        return parseXmlToRecords(xmlText);
      }
      // Public read fallback (works for public repos)
      const res = await fetch(RAW_URL + '?_=' + Date.now(), { cache: 'no-store' });
      if(!res.ok) return [];
      const text = await res.text();
      return parseXmlToRecords(text);
    }catch{
      return [];
    }
  },

  async upsertOne(record){
    const all = await this.loadFreshPreferringSha();
    const idx = all.findIndex(r => r.id === record.id);
    if (idx >= 0) all[idx] = record; else all.push(record);
    await saveAllToGitHub(all, 'Upsert record from Lego Settings UI');
  },

  async updateOneById(record){
    if (!record?.id) throw new Error('Missing record id');
    const all = await this.loadFreshPreferringSha();
    const idx = all.findIndex(r => r.id === record.id);
    if (idx === -1) throw new Error('Record not found: ' + record.id);
    all[idx] = record;
    await saveAllToGitHub(all, 'Update record ' + record.id + ' from Lego Settings UI');
  },

  async replaceAll(records){
    await saveAllToGitHub(records, 'Replace all records from Lego Settings UI');
  },

  async deleteOne(id){
    const all = await this.loadFreshPreferringSha();
    const next = all.filter(r => r.id !== id);
    await saveAllToGitHub(next, 'Delete record from Lego Settings UI');
  }
};

if (typeof window !== 'undefined') window.XmlGitHubStorage = XmlGitHubStorage;
