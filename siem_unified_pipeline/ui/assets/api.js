const UI = {
  BASE: localStorage.getItem('BASE_URL') || '',
  setBase(url){ localStorage.setItem('BASE_URL', url||''); this.BASE = url||''; },
  headers(){ return {'content-type':'application/json'}; },
  async req(path, opts={}) {
    const url = (this.BASE || '') + path;
    const res = await fetch(url, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: {...this.headers(), ...(opts.headers||{})},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const raw = await res.text();
    let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = {raw}; }
    if (!res.ok) throw {status:res.status, data, url};
    return data;
  },
  schemaFields(){ return this.req('/api/v2/schema/fields'); },
  schemaEnums(){ return this.req('/api/v2/schema/enums'); },
  searchCompile(dsl){ return this.req('/api/v2/search/compile', {body: dsl}); },
  searchEstimate(dsl){ return this.req('/api/v2/search/estimate', {body:{dsl}}); },
  searchExecute(dsl){ return this.req('/api/v2/search/execute', {body:{dsl}}); },
  searchFacets(dsl, field, k){ return this.req('/api/v2/search/facets', {body:{dsl, field, k}}); },
  rulesList(q=''){ return this.req('/api/v2/rules'+q); },
  ruleCreate(body){ return this.req('/api/v2/rules', {body}); },
  ruleGet(id){ return this.req(`/api/v2/rules/${id}`); },
  ruleDryRun(id, limit=50){ return this.req(`/api/v2/rules/${id}/dry-run`, {body:{limit}}); },
  ruleRunNow(id, limit=500){ return this.req(`/api/v2/rules/${id}/run-now`, {body:{limit}}); },
  alertsList(q=''){ return this.req('/api/v2/alerts'+q); },
  alertPatch(id, body){ return this.req(`/api/v2/alerts/${id}`, {method:'PATCH', body}); },
  health(){ return this.req('/health'); },
  metrics(){ return fetch((this.BASE||'') + '/metrics').then(r=>r.text()); },
  toast(msg, type='ok'){
    const t = document.getElementById('toast'); if(!t) return;
    t.textContent = msg; t.className = 'toast '+type; t.style.opacity=1;
    setTimeout(()=>t.style.opacity=0, 2600);
  },
  fmtJSON(o){ return JSON.stringify(o, null, 2); },
};

// Expose globally for inline pages that reference UI.* helpers
// eslint-disable-next-line no-undef
window.UI = UI;

