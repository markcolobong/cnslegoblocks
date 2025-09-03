(() => {
  const LS_KEY = 'settings_records_v10';   // kept for safety fallback
  const AUTH_KEY = 'lego_auth';

  // CSV headers
  const TABLE_HEADERS = [
    "Category","Phase","Activity","Key Outcome / Key Message","Presentation Owner","Content Owner",
    "Notes","URL/Links",
    "Tier 1","Tier 1.1","Tier 1.2","Tier 2","Tier 2.1","Tier 3","Tier 3.1","Tier 3.2"
  ];

  const TIER_IDS = ["tier_1","tier_1_1","tier_1_2","tier_2","tier_2_1","tier_3","tier_3_1","tier_3_2"];
  const TIER_OPTIONS = ["Applicable", "Not Applicable", "Case to Case"];
  const TIER_NAMES = {
    tier_1:'T1', tier_1_1:'T1.1', tier_1_2:'T1.2',
    tier_2:'T2', tier_2_1:'T2.1',
    tier_3:'T3', tier_3_1:'T3.1', tier_3_2:'T3.2'
  };

  const els = {
    app: document.getElementById('app'),
    gate: document.getElementById('gate'),
    gateUser: document.getElementById('gateUser'),
    gatePass: document.getElementById('gatePass'),
    gateEnter: document.getElementById('gateEnter'),

    tableBody: document.querySelector('#dataTable tbody'),
    countPill: document.getElementById('countPill'),
    search: document.getElementById('search'),

    exportLink: document.getElementById('exportLink'),
    importLink: document.getElementById('importLink'),
    clearAllLink: document.getElementById('clearAllLink'),
    csvFile: document.getElementById('csvFile'),

    templateCsvLink: document.getElementById('templateCsvLink'),
    openAddBtn: document.getElementById('openAddBtn'),

    overlay: document.getElementById('modalOverlay'),
    modalTitle: document.getElementById('modalTitle'),
    closeModalBtn: document.getElementById('closeModalBtn'),

    detailsOverlay: document.getElementById('detailsOverlay'),
    detailsTitle: document.getElementById('detailsTitle'),
    detailsBody: document.getElementById('detailsBody'),
    closeDetailsBtn: document.getElementById('closeDetailsBtn'),
    detailsEditBtn: document.getElementById('detailsEditBtn'),
    detailsDeleteBtn: document.getElementById('detailsDeleteBtn'),

    form: document.getElementById('recordForm'),
    recordId: document.getElementById('recordId'),
    category: document.getElementById('category'),
    phase: document.getElementById('phase'),
    activity: document.getElementById('activity'),
    outcome: document.getElementById('outcome'),
    presentationOwner: document.getElementById('presentationOwner'),
    contentOwner: document.getElementById('contentOwner'),
    notes: document.getElementById('notes'),
    linksContainer: document.getElementById('linksContainer'),
    addLinkBtn: document.getElementById('addLinkBtn'),
    submitBtn: document.getElementById('submitBtn'),
    resetBtn: document.getElementById('resetBtn'),
    editDeleteBtn: document.getElementById('editDeleteBtn'),

    tiers: Array.from(document.querySelectorAll('select.tier')),
  };

  /* ---------- ACTIVE MENU HIGHLIGHT (optional if IDs exist) ---------- */
  (function markActive() {
    document.getElementById('menuLegoBlocks')?.classList.add('active');
    document.getElementById('menuSettings')?.classList.add('active');
  })();

  /* ---------- LOGIN ---------- */
  const unlock = () => {
    els.gate && (els.gate.style.display = 'none');
    els.app && (els.app.style.display = 'block');
    els.search && setTimeout(() => els.search.focus(), 0);
  };
  const lock = () => {
    els.gate && (els.gate.style.display = 'flex');
    els.app && (els.app.style.display = 'none');
  };

  if (sessionStorage.getItem(AUTH_KEY) === '1') {
    unlock();
  } else {
    lock();
  }

  els.gateEnter?.addEventListener('click', () => {
    const u = (els.gateUser?.value || '').trim();
    const p = (els.gatePass?.value || '').trim();
    if (u === 'admin' && p === '+mark') {
      sessionStorage.setItem(AUTH_KEY, '1');
      unlock();

      // Prompt once for GitHub PAT to enable saving to data/records.xml
      // (Keep this in session only; do NOT hardcode)
      const token = prompt('Paste a GitHub Personal Access Token with repo contents:write to save to data/records.xml.\n(Leave blank to skip and keep changes local only.)');
      if (token && window.XmlGitHubStorage) {
        window.XmlGitHubStorage.setToken(token);
      }
    } else {
      alert('Invalid credentials.');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (els.gate && els.gate.style.display !== 'none' && e.key === 'Enter') {
      e.preventDefault(); els.gateEnter?.click();
    }
  });

  /* ---------- INIT TIER SELECTS ---------- */
  els.tiers.forEach(sel => { TIER_OPTIONS.forEach(opt => sel.add(new Option(opt,opt))); sel.value="Applicable"; });

  /* ---------- STORAGE SHIMS (wired to XML-in-GitHub, fallback to local) ---------- */
  async function load(){
    if (window.XmlGitHubStorage) {
      const arr = await window.XmlGitHubStorage.load();
      if (Array.isArray(arr) && arr.length) return arr;
    }
    // fallback local (empty or previous session)
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
  }
  async function saveAll(records){
    if (window.XmlGitHubStorage && window.XmlGitHubStorage.replaceAll) {
      try {
        await window.XmlGitHubStorage.replaceAll(records);
        return { ok:true, mode:'github' };
      } catch (e){
        // fallback local to avoid data loss
        localStorage.setItem(LS_KEY, JSON.stringify(records));
        alert('Saving to GitHub failed. Changes saved locally this session.\n' + (e.message || e));
        return { ok:true, mode:'local' };
      }
    } else {
      localStorage.setItem(LS_KEY, JSON.stringify(records));
      return { ok:true, mode:'local' };
    }
  }
  async function saveOne(record){
    if (window.XmlGitHubStorage && window.XmlGitHubStorage.upsertOne) {
      try {
        await window.XmlGitHubStorage.upsertOne(record);
        return { ok:true, mode:'github' };
      } catch(e){
        // fallback: merge then local
        const cur = await load();
        const idx = cur.findIndex(r => r.id === record.id);
        if (idx >= 0) cur[idx] = record; else cur.push(record);
        localStorage.setItem(LS_KEY, JSON.stringify(cur));
        alert('Saving to GitHub failed. Changes saved locally this session.\n' + (e.message || e));
        return { ok:true, mode:'local' };
      }
    } else {
      const cur = await load();
      const idx = cur.findIndex(r => r.id === record.id);
      if (idx >= 0) cur[idx] = record; else cur.push(record);
      localStorage.setItem(LS_KEY, JSON.stringify(cur));
      return { ok:true, mode:'local' };
    }
  }
  async function removeOne(id){
    if (window.XmlGitHubStorage && window.XmlGitHubStorage.deleteOne) {
      try {
        await window.XmlGitHubStorage.deleteOne(id);
        return { ok:true, mode:'github' };
      } catch(e){
        const cur = await load();
        const next = cur.filter(r => r.id !== id);
        localStorage.setItem(LS_KEY, JSON.stringify(next));
        alert('Deleting on GitHub failed. Local list updated this session.\n' + (e.message || e));
        return { ok:true, mode:'local' };
      }
    } else {
      const cur = await load();
      const next = cur.filter(r => r.id !== id);
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      return { ok:true, mode:'local' };
    }
  }

  /* ---------- MODALS ---------- */
  const openModal = (title="Add Record") => { els.modalTitle.textContent = title; els.overlay.style.display='flex'; els.overlay.setAttribute('aria-hidden','false'); };
  const closeModal = () => { els.overlay.style.display='none'; els.overlay.setAttribute('aria-hidden','true'); };
  const setAddMode = ()=>{ els.recordId.value=''; els.submitBtn.textContent='Save'; els.resetBtn.style.display='inline-flex'; els.editDeleteBtn.style.display='none'; };
  const setEditMode = ()=>{ els.submitBtn.textContent='Update'; els.resetBtn.style.display='none'; els.editDeleteBtn.style.display='inline-flex'; };

  els.openAddBtn?.addEventListener('click', ()=>{ resetForm(); setAddMode(); openModal("Add Record"); });
  els.closeModalBtn?.addEventListener('click', closeModal);
  els.overlay?.addEventListener('click', (e)=>{ if(e.target===els.overlay) closeModal(); });

  /* ---------- DETAILS MODAL ---------- */
  const brickFor = (v) => {
    const val=(v||'').toLowerCase();
    const cls = val==='applicable' ? 'green' : (val==='case to case' ? 'orange' : 'gray');
    const title = val==='applicable' ? 'Applicable' : (val==='case to case' ? 'Case to Case' : 'Not Applicable');
    return `<span class="brick ${cls}" title="${attr(title)}" aria-label="${attr(title)}"></span>`;
  };
  const renderTiersReadonly = (tiers={}) => {
    return `<div class="tiers-readonly">
      ${TIER_IDS.map(id => {
        const val = tiers[id] || '';
        return `<span class="tier-pill">${brickFor(val)} <span>${TIER_NAMES[id]}: ${safe(val)}</span></span>`;
      }).join('')}
    </div>`;
  };

  const openDetails = (rec) => {
    els.detailsTitle.textContent = `${safe(rec.category)} • ${safe(rec.activity)}`;
    const links=(rec.links||[]).map((l,i)=>`<a href="${attr(normalizeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${safe(l.label||('Link '+(i+1)))}</a>`).join(' ');
    els.detailsBody.innerHTML = `
      <div class="kv"><div class="k">Category</div><div>${safe(rec.category||'')}</div></div>
      <div class="kv"><div class="k">Phase</div><div>${safe(rec.phase||'')}</div></div>
      <div class="kv"><div class="k">Activity</div><div>${safe(rec.activity||'')}</div></div>
      <div class="kv"><div class="k">Key Outcome / Key Message</div><div>${safe(rec.outcome||'')}</div></div>
      <div class="kv"><div class="k">Presentation Owner</div><div>${safe(rec.presentationOwner||'')}</div></div>
      <div class="kv"><div class="k">Content Owner</div><div>${safe(rec.contentOwner||'')}</div></div>
      <div class="kv"><div class="k">Notes</div><div>${safe(rec.notes||'')}</div></div>
      <div class="kv"><div class="k">URL / Links</div><div>${links || '—'}</div></div>
      <div class="kv"><div class="k">Tiers</div><div>${renderTiersReadonly(rec.tiers)}</div></div>`;
    els.detailsEditBtn.onclick = ()=>{ closeDetails(); editRecord(rec.id); };
    els.detailsDeleteBtn.onclick = async ()=>{ closeDetails(); await deleteRecord(rec.id); };
    els.detailsOverlay.style.display='flex'; els.detailsOverlay.setAttribute('aria-hidden','false');
  };
  const closeDetails = () => { els.detailsOverlay.style.display='none'; els.detailsOverlay.setAttribute('aria-hidden','true'); };
  els.closeDetailsBtn?.addEventListener('click', closeDetails);
  els.detailsOverlay?.addEventListener('click', (e)=>{ if(e.target===els.detailsOverlay) closeDetails(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ if(els.overlay?.style.display==='flex') closeModal(); if(els.detailsOverlay?.style.display==='flex') closeDetails(); } });

  /* ---------- UTILS ---------- */
  const safe = (s) => escapeHTML(normalizeText(s));
  const attr = (s) => String(s ?? '').replace(/"/g,'&quot;');
  function escapeHTML(s){ return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
  function normalizeText(s){
    let t = String(s ?? '');
    t = t.replace(/\uFFFD/g, "'")
         .replace(/[“”]/g, '"')
         .replace(/[‘’]/g, "'")
         .replace(/\u2013|\u2014/g, '-')   // en/em dash -> hyphen
         .replace(/\u00A0/g, ' ');
    return t;
  }
  function normalizeUrl(input){
    if(!input) return '';
    const s = String(input).trim();
    if (s.startsWith('/') || s.startsWith('./') || s.startsWith('../') || s.startsWith('#')) return s;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return s; // has scheme
    return 'https://' + s;
  }
  const trunc = (s, n=160) => { s = String(s||''); return s.length>n ? s.slice(0, n-1) + '…' : s; };

  /* ---------- RENDER TABLE (row-level expand; auto “More” if any column is truncated) ---------- */
  const outcomeCache = {}; // { id: { full, short } }

  async function renderTable() {
    const records = await load();
    const q = (els.search?.value || "").trim().toLowerCase();
    const filtered = records.filter(r=>{
      const text=[r.category,r.phase,r.activity,r.outcome,r.presentationOwner,r.contentOwner,r.notes]
        .concat((r.links||[]).map(l=>`${l.label} ${l.url}`)).concat(Object.values(r.tiers||{})).join(' ').toLowerCase();
      return !q || text.includes(q);
    });

    let rows='';
    filtered.forEach(r=>{
      const full = normalizeText(r.outcome||'');
      const short = trunc(full, 160);
      outcomeCache[r.id] = { full, short };

      const outcomeCell = `<span class="outcome-text">${escapeHTML(short)}</span>`;
      rows+=`<tr data-id="${r.id}">
        <td class="cat" title="${safe(r.category)}">${safe(r.category)}</td>
        <td class="phase" title="${safe(r.phase)}">${safe(r.phase)}</td>
        <td class="activity" title="${safe(r.activity)}">${safe(r.activity)}</td>
        <td class="outcome" title="${safe(full)}">${outcomeCell}</td>
        <td class="tier">${brickFor((r.tiers||{}).tier_1)}</td>
        <td class="tier">${brickFor((r.tiers||{}).tier_1_1)}</td>
        <td class="tier">${brickFor((r.tiers||{}).tier_1_2)}</td>
        <td class="tier">${brickFor((r.tiers||{}).tier_2)}</td>
        <td class="tier">${brickFor((r.tiers||{}).tier_2_1)}</td>
        <td class="tier">${brickFor((r.tiers||{}).tier_3)}</td>
        <td class="tier">${brickFor((r.tiers||{}).tier_3_1)}</td>
        <td class="tier">${brickFor((r.tiers||{}).tier_3_2)}</td>
        <td class="actions">
          <div class="table-actions">
            <button class="btn btn-ghost btn-sm" onclick="window.viewDetails('${r.id}')">View Details</button>
            <button class="btn btn-danger btn-sm" onclick="window.deleteRecord('${r.id}')">Delete</button>
          </div>
        </td>
      </tr>`;
    });

    els.tableBody && (els.tableBody.innerHTML = rows || `<tr><td colspan="13" class="muted">No records yet.</td></tr>`);
    els.countPill && (els.countPill.textContent = `${filtered.length} record${filtered.length!==1?'s':''}`);

    requestAnimationFrame(applyMoreButtons);
  }

  function isTruncated(el){
    if(!el) return false;
    if (el.scrollWidth - 1 > el.clientWidth) return true;   // horizontal
    if (el.scrollHeight - 1 > el.clientHeight) return true; // vertical (clamp)
    return false;
  }

  function applyMoreButtons(){
    els.tableBody?.querySelectorAll('tr').forEach(tr=>{
      const id = tr.getAttribute('data-id');
      const outcomeTd = tr.querySelector('td.outcome');
      const outcomeSpan = outcomeTd?.querySelector('.outcome-text');
      const catTd = tr.querySelector('td.cat');
      const phaseTd = tr.querySelector('td.phase');
      const actTd = tr.querySelector('td.activity');
      const cache = outcomeCache[id];

      const anyOverflow =
        isTruncated(catTd) || isTruncated(phaseTd) || isTruncated(actTd) ||
        isTruncated(outcomeSpan) || (cache && cache.full.length > cache.short.length);

      const existingBtn = outcomeTd?.querySelector('.more-toggle');

      if (anyOverflow) {
        if (!existingBtn && outcomeTd && outcomeSpan) {
          const btn = document.createElement('button');
          btn.className = 'link-inline more-toggle';
          btn.textContent = 'More';
          btn.setAttribute('data-expanded','0');
          outcomeTd.appendChild(document.createTextNode(' '));
          outcomeTd.appendChild(btn);
        }
      } else {
        existingBtn?.remove();
        if (outcomeSpan && cache) outcomeSpan.textContent = cache.full;
      }
    });
  }

  els.tableBody?.addEventListener('click', (e) => {
    const btn = e.target.closest('.more-toggle');
    if (!btn) return;
    const tr = btn.closest('tr'); if(!tr) return;
    const id = tr.getAttribute('data-id');
    const cache = outcomeCache[id]; if(!cache) return;
    const outcomeSpan = tr.querySelector('td.outcome .outcome-text');
    const expanded = btn.getAttribute('data-expanded') === '1';

    if (expanded) {
      outcomeSpan.textContent = cache.short;
      btn.textContent = 'More';
      btn.setAttribute('data-expanded','0');
      tr.classList.remove('row-expanded');
    } else {
      outcomeSpan.textContent = cache.full;
      btn.textContent = 'Less';
      btn.setAttribute('data-expanded','1');
      tr.classList.add('row-expanded');
    }
  });

  window.viewDetails = (id) => { (async () => {
    const rec = (await load()).find(r => r.id === id);
    if(rec) openDetails(rec);
  })(); };

  /* ---------- LINKS UI (Label | URL | Remove in 3 columns) ---------- */
  const addLinkRow = (labelVal='', urlVal='') => {
    const row = document.createElement('div');
    row.className='links-row';
    row.innerHTML = `
      <div>
        <label>Label</label>
        <input type="text" class="link-label" placeholder="e.g., Agenda" value="${attr(labelVal)}">
      </div>
      <div>
        <label>URL</label>
        <input type="text" class="link-url" placeholder="example.com/page or https://example.com" value="${attr(urlVal)}">
      </div>
      <div>
        <label>&nbsp;</label>
        <button type="button" class="btn btn-danger btn-sm">Remove</button>
      </div>`;
    row.querySelector('button').addEventListener('click', ()=> row.remove());
    els.linksContainer.appendChild(row);
  };
  els.addLinkBtn?.addEventListener('click', ()=> addLinkRow());
  const getLinksFromUI = () => Array.from(els.linksContainer.querySelectorAll('.links-row')).map(r=>{
    const label = normalizeText(r.querySelector('.link-label').value.trim());
    let url = r.querySelector('.link-url').value.trim();
    if(!url) return null;
    url = normalizeUrl(url);
    return { label: label || url, url };
  }).filter(Boolean);
  const setLinksUI = (links=[]) => { els.linksContainer.innerHTML=''; if(!links.length) addLinkRow(); links.forEach(l=> addLinkRow(l.label||'', l.url||'')); };

  /* ---------- COLLECT / VALIDATE ---------- */
  const collectFormData = async () => {
    const tiers={}; TIER_IDS.forEach(id=> { tiers[id]=document.getElementById(id).value; });
    return {
      id: els.recordId.value || `rec_${Date.now()}`,
      category: els.category.value, phase: els.phase.value,
      activity: normalizeText(els.activity.value.trim()),
      outcome: normalizeText(els.outcome.value.trim()),
      presentationOwner: normalizeText(els.presentationOwner.value.trim()),
      contentOwner: normalizeText(els.contentOwner.value.trim()),
      notes: normalizeText(els.notes.value.trim()),
      links: getLinksFromUI(), tiers
    };
  };
  const mandatoryCheck = (d) => {
    if(!d.category) return "Category is required.";
    if(!d.phase) return "Phase is required.";
    if(!d.activity) return "Activity is required.";
    if(!d.outcome) return "Key Outcome / Key Message is required.";
    for(const k of TIER_IDS){ if(!(d.tiers||{})[k]) return "All Tier fields are required."; }
    return null;
  };
  const resetForm = () => {
    els.recordId.value=''; els.form.reset(); els.tiers.forEach(sel=> sel.value="Applicable");
    setLinksUI([]); els.submitBtn.textContent='Save';
  };

  /* ---------- SUBMIT ---------- */
  els.form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const data = await collectFormData();
    const err=mandatoryCheck(data); if(err){ alert(err); return; }

    // Use single upsert for efficiency
    try {
      await saveOne(data);
    } catch (ex) {
      alert('Save failed: ' + (ex.message || ex));
      return;
    }
    resetForm(); closeModal(); renderTable();
  });

  els.resetBtn?.addEventListener('click', resetForm);
  els.editDeleteBtn?.addEventListener('click', async ()=>{ const id = els.recordId.value; if(id){ closeModal(); await deleteRecord(id); }});
  els.search?.addEventListener('input', renderTable);

  /* ---------- EXPORT / IMPORT ---------- */
  document.getElementById('templateCsvLink')?.addEventListener('click', (e)=>{
    e.preventDefault();
    const csv = TABLE_HEADERS.join(',') + '\n';
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {href:url, download:'Import template.csv'});
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  document.getElementById('exportLink')?.addEventListener('click', async (e)=>{
    e.preventDefault();
    const records = await load();
    const headers = ['', ...TABLE_HEADERS];
    const lines = [ headers.join(',') ];
    records.forEach(r=>{
      const links = (r.links||[]).map(l=>`${(l.label||'').replace(/"/g,'""')}|${(l.url||'').replace(/"/g,'""')}`).join(' || ');
      const row = [
        '',
        r.category||'', r.phase||'', r.activity||'', r.outcome||'',
        r.presentationOwner||'', r.contentOwner||'', r.notes||'',
        links,
        (r.tiers||{}).tier_1||'', (r.tiers||{}).tier_1_1||'', (r.tiers||{}).tier_1_2||'',
        (r.tiers||{}).tier_2||'', (r.tiers||{}).tier_2_1||'',
        (r.tiers||{}).tier_3||'', (r.tiers||{}).tier_3_1||'', (r.tiers||{}).tier_3_2||'',
      ];
      lines.push(row.map(csvEscape).join(','));
    });
    const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {href:url, download:'settings-records.csv'});
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  document.getElementById('importLink')?.addEventListener('click', (e)=>{ e.preventDefault(); els.csvFile?.click(); });
  els.csvFile?.addEventListener('change', async (e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    try{
      const text = await f.text();
      const rows = parseCSV(text);
      if(rows.length === 0) throw new Error('Empty CSV.');
      let headers = rows[0].map(h => String(h||'').trim());
      const leadingBlank = headers[0] === '';
      if(leadingBlank) headers = headers.slice(1);

      const wanted = TABLE_HEADERS.map(h => h.toLowerCase());
      const idxMap = {};
      headers.forEach((h,i)=>{ const j = wanted.indexOf(h.toLowerCase()); if(j>=0) idxMap[wanted[j]] = i; });

      let added = 0;
      const newRecords = await load(); // start with current
      for(let r=1; r<rows.length; r++){
        const row = rows[r];
        if(!row || row.every(c => String(c||'').trim()==='')) continue;

        const get = (title) => { const i = idxMap[title.toLowerCase()]; if(i===undefined) return ''; const v = String(row[leadingBlank ? i+1 : i] ?? '').trim(); return normalizeText(v); };

        const tiers = {
          tier_1: get("Tier 1") || "Applicable",
          tier_1_1: get("Tier 1.1") || "Applicable",
          tier_1_2: get("Tier 1.2") || "Applicable",
          tier_2: get("Tier 2") || "Applicable",
          tier_2_1: get("Tier 2.1") || "Applicable",
          tier_3: get("Tier 3") || "Applicable",
          tier_3_1: get("Tier 3.1") || "Applicable",
          tier_3_2: get("Tier 3.2") || "Applicable",
        };

        const rec = {
          id: `rec_${Date.now()}_${r}`,
          category: get("Category"), phase: get("Phase"), activity: get("Activity"), outcome: get("Key Outcome / Key Message"),
          presentationOwner: get("Presentation Owner"), contentOwner: get("Content Owner"),
          notes: get("Notes"),
          links: parseLinksCsv(get("URL/Links")).map(l => ({ label: normalizeText(l.label), url: normalizeUrl(l.url) })),
          tiers
        };

        if((rec.category && rec.category.trim()!=='') || (rec.activity && rec.activity.trim()!=='')){
          newRecords.push(rec); added++;
        }
      }
      await saveAll(newRecords);
      renderTable(); e.target.value = ''; showToast(`Import complete. Added ${added} row(s).`);
    }catch(err){ alert('Import failed: ' + (err.message || err)); }
  });

  /* ---------- HELPERS ---------- */
  const csvEscape = (v) => { const s=String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
  function parseCSV(text){
    const rows = []; let row = []; let cur = ''; let inQuotes = false;
    for(let i=0;i<text.length;i++){
      const ch = text[i];
      if(inQuotes){
        if(ch === '"'){ if(text[i+1] === '"'){ cur += '"'; i++; } else { inQuotes = false; } }
        else { cur += ch; }
      }else{
        if(ch === '"'){ inQuotes = true; }
        else if(ch === ','){ row.push(cur); cur=''; }
        else if(ch === '\r'){ }
        else if(ch === '\n'){ row.push(cur); rows.push(row); row=[]; cur=''; }
        else { cur += ch; }
      }
    }
    row.push(cur); rows.push(row);
    return rows;
  }
  function parseLinksCsv(s){
    const raw = String(s||'').trim(); if(!raw) return [];
    return raw.split('||').map(x=>x.trim()).filter(Boolean).map(pair=>{
      const [label,url] = pair.split('|').map(y=> (y??'').trim());
      if(!url) return null;
      return { label: label || url, url };
    }).filter(Boolean);
  }

  /* ---------- ROW ACTIONS ---------- */
  window.editRecord = async (id) => {
    const rec = (await load()).find(r => r.id === id); if(!rec) return;
    els.recordId.value = rec.id;
    els.category.value = rec.category; els.phase.value = rec.phase;
    els.activity.value = normalizeText(rec.activity || ''); els.outcome.value = normalizeText(rec.outcome || '');
    els.presentationOwner.value = normalizeText(rec.presentationOwner || ''); els.contentOwner.value = normalizeText(rec.contentOwner || '');
    els.notes.value = normalizeText(rec.notes || '');
    setLinksUI(rec.links || []);
    TIER_IDS.forEach(t => { const el=document.getElementById(t); if(el) el.value=(rec.tiers||{})[t] || "Applicable"; });
    setEditMode(); openModal("Edit Record");
  };

  async function deleteRecord(id){
    if(!confirm('Delete this record?')) return;
    try {
      await removeOne(id);
    } catch(e){
      alert('Delete failed: ' + (e.message || e));
      return;
    }
    renderTable();
  }
  window.deleteRecord = deleteRecord;

  /* ---------- CLEAR ALL (master key) ---------- */
  document.getElementById('clearAllLink')?.addEventListener('click', async (e)=>{
    e.preventDefault();
    const ans = prompt('Enter the master key to delete:');
    if(ans === '+mark'){
      try { await saveAll([]); }catch(ex){ alert('Save failed: ' + (ex.message || ex)); return; }
      renderTable(); resetForm(); alert('All records deleted.');
    } else if(ans !== null){ alert('Incorrect master key. Nothing was deleted.'); }
  });

  /* ---------- TOAST ---------- */
  function showToast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3500); }

  /* ---------- START ---------- */
  renderTable();
})();
