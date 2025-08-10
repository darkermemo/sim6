<script>
/* Shared helpers: BASE_URL handling, fetch wrappers, toasts, qs */
const BASE_URL = (localStorage.getItem('BASE_URL') || '').trim() || (location.origin.replace(/\/+$, ''));
function setCurrentNav(path) {
  document.querySelectorAll('nav a').forEach(a => { if (a.getAttribute('href')?.endsWith(path)) a.setAttribute('aria-current', 'page'); });
}
function toast(msg, type='info') {
  const el = document.querySelector('#toast'); if (!el) return;
  el.textContent = msg;
  el.style.borderColor = type==='error' ? '#8b1f1f' : type==='ok' ? '#1f8b4c' : '#2b3a5e';
  el.classList.add('show'); setTimeout(()=>el.classList.remove('show'), 3500);
}
async function api(path, opts={}) {
  const r = await fetch(`${BASE_URL}${path}`, { headers:{'content-type':'application/json', ...(opts.headers||{})}, ...opts });
  const text = await r.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = {raw:text}; }
  if (!r.ok) throw Object.assign(new Error(body?.error?.message || r.statusText), {status:r.status, body});
  return body;
}
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return [...root.querySelectorAll(sel)]; }
</script>

