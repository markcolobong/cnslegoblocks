// XML "database" stored at data/records.xml in your GitHub repo
const OWNER  = 'markcolobong';
const REPO   = 'cnslegoblocks';
const BRANCH = 'main';
const FILE_PATH = 'data/records.xml';

const RAW_URL      = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${FILE_PATH}`;
const CONTENTS_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;

let GITHUB_TOKEN = null; // set after admin login

var XmlGitHubStorage = {
  setToken(token){ GITHUB_TOKEN = (token || '').trim() || null; },

  async load(){
    try{
      if (GITHUB_TOKEN) {
        const res = await fetch(`${CONTENTS_URL}?ref=${encodeURIComponent(BRANCH)}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });
        if (res.status === 404) return [];
        if (!res.ok) return [];
        const json = await res.json();
        const xmlText = decodeBase64Utf8(json.content || '');
        return parseXmlToRecords(xmlText);
      }
      const res = await fetch(RAW_URL, { cache: 'no-store' });
      if(!res.ok) return [];
      const text = await res.text();
      return parseXmlToRecords(text);
    }catch{
      return [];
    }
  },

  async upsertOne(record){
    const all = await this.load();
    const idx = all.findIndex(r => r.id === record.id);
    if (idx >= 0) all[idx] = record; else all.push(record);
    await saveAllToGitHub(all, 'Upsert record from Lego Settings UI');
  },

  async replaceAll(records){
    await saveAllToGitHub(records, 'Replace all records from Lego Settings UI');
  },

  async deleteOne(id){
    const all = await this.load();
    const next = all.filter(r => r.id !== id);
    await saveAllToGitHub(next, 'Delete record from Lego Settings UI');
  }
};

async function saveAllToGitHub(records, message){
  if (!GITHUB_TOKEN) throw new Error('Not authorized: missing GitHub token for write');

  let sha = null;
  const metaRes = await fetch(`${CONTENTS_URL}?ref=${encodeURIComponent(BRANCH)}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (metaRes.status === 200) {
    const meta = await metaRes.json();
    sha = meta.sha;
  } else if (metaRes.status !== 404) {
    const t = await metaRes.text();
    throw new Error('Failed reading file metadata: ' + t);
  }

  const xml = buildXml(records);
  const content = base64EncodeUtf8(xml);

  const putRes = await fetch(CONTENTS_URL, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({
      message: message || 'Update data/records.xml',
      content,
      sha,
      branch: BRANCH
    })
  });

  if (!putRes.ok) {
    const err = await putRes.json().catch(()=>({}));
    throw new Error(err.message || 'GitHub save failed');
  }
}

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
      links.push({
        label: L.getAttribute('label') || '',
        url:   L.getAttribute('url')   || ''
      });
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

function buildXml(records){
  const esc = s => String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
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

function cssEscape(s){ return String(s ?? '').replace(/"/g, '\\"'); }

function base64EncodeUtf8(str){ return btoa(unescape(encodeURIComponent(str))); }
function decodeBase64Utf8(b64){
  try { return decodeURIComponent(escape(atob(b64))); }
  catch { return ''; }
}

// expose globally
if (typeof window !== 'undefined') window.XmlGitHubStorage = XmlGitHubStorage;
