/* Shared helpers: BASE_URL handling, fetch wrappers, toasts, qs */
(() => {
  const base = (localStorage.getItem('BASE_URL') || '').trim();
  const BASE_URL = base || location.origin.replace(/\/+$/, '');
  function setCurrentNav(path) {
    document.querySelectorAll('nav a').forEach(a => { if (a.getAttribute('href')?.endsWith(path)) a.setAttribute('aria-current', 'page'); });
  }
  const showToast = function(msg, type='info') {
    const el = document.querySelector('#toast'); if (!el) return;
    el.textContent = msg;
    el.style.borderColor = type==='error' ? '#8b1f1f' : type==='ok' ? '#1f8b4c' : '#2b3a5e';
    el.classList.add('show'); setTimeout(()=>el.classList.remove('show'), 3500);
  };
  async function api(path, opts={}) {
    const r = await fetch(`${BASE_URL}${path}`, { headers:{'content-type':'application/json', ...(opts.headers||{})}, ...opts });
    const text = await r.text();
    let body; try { body = text ? JSON.parse(text) : {}; } catch { body = {raw:text}; }
    if (!r.ok) throw Object.assign(new Error(body?.error?.message || r.statusText), {status:r.status, body});
    return body;
  }
  function $(sel, root=document){ return root.querySelector(sel); }
  function $all(sel, root=document){ return [...root.querySelectorAll(sel)]; }

  function StatsCard(root, items){
    const el = typeof root==='string'? $(root): root; el.innerHTML='';
    (items||[]).forEach(x=>{
      const d=document.createElement('div'); d.className='stat';
      d.innerHTML = `<div class="label">${x.label}</div><div class="value">${x.value}</div>`;
      el.appendChild(d);
    });
  }

  function DataTable(root, rows, opts={}){
    const el = typeof root==='string'? $(root): root; const pageSize=opts.pageSize||20; let page=0; let sortKey=null; let asc=true; let data=rows||[]; const filter=opts.filter||'';
    function apply(){ let r=[...data]; if(filter){ r=r.filter(x=>JSON.stringify(x).toLowerCase().includes(filter.toLowerCase())); }
      if(sortKey){ r.sort((a,b)=>{ const va=a[sortKey]; const vb=b[sortKey]; return (va>vb?1:-1)*(asc?1:-1); }); }
      const start=page*pageSize; const slice=r.slice(start,start+pageSize); const cols=opts.columns||(slice[0]?Object.keys(slice[0]):[]);
      el.innerHTML = `<table class="table"><thead><tr>${cols.map(c=>`<th data-k="${c}">${c}</th>`).join('')}</tr></thead><tbody>${slice.map(row=>`<tr>${cols.map(c=>`<td>${row[c]}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="row"><button id="prev">Prev</button><span>${start+1}-${start+slice.length}</span><button id="next">Next</button></div>`;
      $all('th', el).forEach(th=> th.onclick = ()=>{ const k=th.getAttribute('data-k'); if(sortKey===k){ asc=!asc; } else { sortKey=k; asc=true; } apply(); });
      $('#prev', el).onclick = ()=>{ if(page>0){ page--; apply(); } };
      $('#next', el).onclick = ()=>{ if((page+1)*pageSize < r.length){ page++; apply(); } };
    }
    apply();
    return { setRows:(r)=>{ data=r||[]; page=0; apply(); } };
  }

  function FilterChips(root, values, onChange){
    const el = typeof root==='string'? $(root): root; function render(){ el.innerHTML=(values||[]).map(v=>`<span class="chip" data-v="${v}">${v} ×</span>`).join(''); $all('.chip', el).forEach(c=> c.onclick = ()=>{ const v=c.getAttribute('data-v'); values=values.filter(x=>x!==v); render(); onChange(values); }); }
    render(); return { add:(v)=>{ if(v && !values.includes(v)){ values.push(v); render(); onChange(values);} } };
  }

  function JSONPreview(root, obj){ const el=typeof root==='string'? $(root):root; el.className='json'; el.textContent = JSON.stringify(obj, null, 2); }

  function QueryBuilder(root){ const el=typeof root==='string'? $(root):root; el.innerHTML = `<label>Tenant <input id="qb_t" value="default"/></label><label>Last seconds <input id="qb_s" type="number" value="3600"/></label><label>Contains any <input id="qb_c" placeholder="fail,error"/></label>`; return { dsl: ()=>({ search:{ tenant_ids:[($('#qb_t',el).value||'default')], time_range:{ last_seconds: (+$('#qb_s',el).value||3600) }, where: ($('#qb_c',el).value? { op:'contains_any', args:['message', $('#qb_c',el).value.split(',').map(s=>s.trim()).filter(Boolean)] } : undefined), limit:100 } }) };
  }

  function SigmaEditor(root){ const el=typeof root==='string'? $(root):root; el.innerHTML = `<textarea id="sig" rows="12" placeholder="Paste Sigma YAML..."></textarea><div class="row"><button id="compile">Compile</button><button id="create">Create</button></div><pre id="out" class="json">—</pre>`; return { onCompile:(cb)=> $('#compile',el).onclick=()=>cb($('#sig',el).value), onCreate:(cb)=> $('#create',el).onclick=()=>cb($('#sig',el).value), setOut:(o)=> $('#out',el).textContent=o } }

  // Export on window (no global var declarations to avoid id collisions)
  window.BASE_URL = BASE_URL;
  window.setCurrentNav = window.setCurrentNav || setCurrentNav;
  if (typeof window.toast !== 'function') { window.toast = showToast; }
  window.api = window.api || api;
  window.$ = window.$ || $;
  window.$all = window.$all || $all;
  window.StatsCard = window.StatsCard || StatsCard;
  window.DataTable = window.DataTable || DataTable;
  window.FilterChips = window.FilterChips || FilterChips;
  window.JSONPreview = window.JSONPreview || JSONPreview;
  window.QueryBuilder = window.QueryBuilder || QueryBuilder;
  window.SigmaEditor = window.SigmaEditor || SigmaEditor;
  // Timestamp formatter helper
  function formatMaybeTs(key, value){
    const isTsKey = /(_at|timestamp)$/i.test(String(key||''));
    const n = (typeof value === 'string' && /^\d{10}$/.test(value)) ? parseInt(value,10) : (typeof value==='number'? value : NaN);
    if (isTsKey && Number.isFinite(n) && n > 946684800 && n < 4102444800) {
      try { return new Date(n*1000).toLocaleString(); } catch { return value; }
    }
    return value;
  }
  window.formatMaybeTs = window.formatMaybeTs || formatMaybeTs;
  // Ensure a consistent Admin header on all admin pages
  (function ensureHeader(){
    if (document.querySelector('header .title')) return;
    const hdr = document.createElement('header');
    hdr.innerHTML = `
      <div class="title">SIEM Admin</div>
      <nav aria-label="Admin">
        <a href="/ui/v2/admin/index.html">Home</a>
        <a href="/ui/v2/admin/tenants.html">Tenants</a>
        <a href="/ui/v2/admin/log-sources.html">Log Sources</a>
        <a href="/ui/v2/admin/parsers.html">Parsers</a>
        <a href="/ui/v2/admin/streaming.html">Streaming</a>
        <a href="/ui/v2/admin/rules.html">Rules</a>
        <a href="/ui/v2/admin/storage.html">Storage</a>
        <a href="/ui/v2/admin/api-keys.html">API Keys</a>
      </nav>`;
    document.body.insertBefore(hdr, document.body.firstChild);
  })();
})();

