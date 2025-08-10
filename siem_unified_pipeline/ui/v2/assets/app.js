/* App shell injector: adds header + sidebar + content wrapper on v2 pages */
(function(){
  if (document.body.classList.contains('app-shell')) return;
  function el(tag, attrs={}, html){ const e=document.createElement(tag); Object.entries(attrs||{}).forEach(([k,v])=>e.setAttribute(k,v)); if(html!=null) e.innerHTML=html; return e; }
  function current(path){ return location.pathname.endsWith(path); }
  const shell = el('div', { class:'app' });
  const aside = el('aside', { class:'aside' });
  aside.innerHTML = `
    <nav aria-label="Primary">
      <div style="margin:8px 0; font-weight:700">Navigation</div>
      <div><a href="/ui/v2/dashboard.html">Overview</a></div>
      <div><a href="/ui/v2/search.html">Search</a></div>
      <div><a href="/ui/v2/alerts.html">Alerts</a></div>
      <div><a href="/ui/v2/admin/rules.html">Rules</a></div>
      <div><a href="/ui/v2/admin/parsers.html">Parsers</a></div>
      <div><a href="/ui/v2/admin/log-sources.html">Log Sources</a></div>
      <div><a href="/ui/v2/admin/tenants.html">Tenants</a></div>
      <div><a href="/ui/v2/admin/streaming.html">Streaming</a></div>
      <div><a href="/ui/v2/investigations/index.html">Investigations</a></div>
      <div><a href="/ui/v2/admin/index.html">Admin</a></div>
    </nav>`;
  // mark current
  aside.querySelectorAll('a').forEach(a=>{ if (a.getAttribute('href') && location.pathname.endsWith(a.getAttribute('href').split('/').pop())) a.setAttribute('aria-current','page'); });

  const header = el('header', { class:'header' });
  header.innerHTML = `
    <div style="font-weight:700">SIEM</div>
    <div class="badge">v2</div>
    <div style="margin-left:auto; display:flex; gap:8px; align-items:center">
      <label style="display:flex; gap:6px; align-items:center;">
        <span class="small">Theme</span>
        <select id="theme"><option>dark</option><option>light</option></select>
      </label>
    </div>`;
  // theme toggle
  const theme = (localStorage.getItem('ui_theme')||'dark');
  header.querySelector('#theme').value = theme;
  document.documentElement.dataset.theme = theme;
  header.querySelector('#theme').addEventListener('change', (e)=>{
    const t=e.target.value; localStorage.setItem('ui_theme', t); document.documentElement.dataset.theme = t;
  });

  const content = el('main', { class:'content', role:'main' });
  // Move existing children into content, unless a top-level header already exists
  const existing = Array.from(document.body.childNodes);
  existing.forEach(n=>{ if(!(n.nodeType===Node.ELEMENT_NODE && (n.tagName.toLowerCase()==='script' || n.classList?.contains('app') ))) content.appendChild(n); });
  shell.appendChild(aside); shell.appendChild(el('div'));
  // The header sits on top of content within the right column
  const right = shell.lastChild; right.appendChild(header); right.appendChild(content); right.className='';
  document.body.innerHTML=''; document.body.appendChild(shell); document.body.classList.add('app-shell');
})();


