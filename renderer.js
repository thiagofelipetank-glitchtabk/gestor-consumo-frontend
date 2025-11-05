// ======================================================
// FRONTEND PRO 4.4 — Admin/User + Permissões + Abas Água/Luz
// Mantém: auto-server, leituras, metas, imóveis, exportações.
// Financeiro: somente tarifas locais por enquanto.
// ======================================================

let API = '';
let TOKEN = '';
let currentUser = null;
let currentDashTab = 'agua'; // água | energia
let chartMain, chartDaily, chartMonthly;

// -------------------------
// Detecção automática do servidor
// -------------------------
async function checkServer() {
  const status = document.getElementById('server-status');
  const indicator = document.getElementById('server-indicator');
  const label = document.getElementById('server-label');

  if (status) status.textContent = 'Checando…';
  if (indicator) indicator.classList.remove('red');
  if (label) label.textContent = 'Checando…';

  const urls = [
    { url: 'http://localhost:3000', type: 'local' },
    { url: 'https://gestor-consumo-backend.onrender.com', type: 'cloud' }
  ];

  for (const { url, type } of urls) {
    try {
      const r = await fetch(url + '/health', { cache: 'no-store' });
      if (r.ok) {
        API = url;
        if (indicator) indicator.style.background = (type === 'local') ? '#22c55e' : '#3b82f6';
        if (label) label.textContent = type === 'local' ? 'Servidor Local' : 'Render Cloud';
        const checking = document.getElementById('checking');
        const auth = document.getElementById('auth');
        if (checking) checking.style.display = 'none';
        if (auth) auth.style.display = 'block';
        return;
      }
    } catch {}
  }
  if (indicator) indicator.style.background = '#ef4444';
  if (label) label.textContent = 'Offline';
  if (status) status.textContent = 'Nenhum servidor encontrado.';
}
document.addEventListener('DOMContentLoaded', checkServer);

// -------------------------
// Tema
// -------------------------
function toggleTheme() {
  const html = document.documentElement;
  const t = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
}
(function () {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

// -------------------------
// Login
// -------------------------
async function login() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const msg = document.getElementById('login-msg');
  if (msg) msg.textContent = '';

  if (!API) { if (msg) msg.textContent = 'Servidor não conectado.'; return; }

  try {
    const res = await fetch(API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha no login');

    TOKEN = data.token;
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    localStorage.setItem('token', TOKEN);

    const auth = document.getElementById('auth');
    const app = document.getElementById('app');
    if (auth) auth.style.display = 'none';
    if (app) app.style.display = 'grid';
    document.getElementById('user-name').textContent = currentUser.name || '-';
    document.getElementById('user-role').textContent = currentUser.role || 'user';

    applyRoleVisibility();

    await Promise.allSettled([
      loadDashboard(),
      loadMeters(),
      loadGoalsOptions(),
      loadProperties(),
      loadUsersIfAdmin()
    ]);

    // carregar tarifas locais
    loadTarifasUI();
  } catch (e) {
    if (msg) msg.textContent = e.message;
  }
}

function logout() {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  location.reload();
}

(function autoLogin() {
  const u = localStorage.getItem('user');
  const t = localStorage.getItem('token');
  if (u && t) {
    currentUser = JSON.parse(u);
    TOKEN = t;
    const checking = document.getElementById('checking');
    const auth = document.getElementById('auth');
    const app = document.getElementById('app');
    if (checking) checking.style.display = 'none';
    if (auth) auth.style.display = 'none';
    if (app) app.style.display = 'grid';
    document.getElementById('user-name').textContent = currentUser.name || '-';
    document.getElementById('user-role').textContent = currentUser.role || 'user';

    applyRoleVisibility();

    Promise.allSettled([
      loadDashboard(),
      loadMeters(),
      loadGoalsOptions(),
      loadProperties(),
      loadUsersIfAdmin()
    ]);

    loadTarifasUI();
  }
})();

// -------------------------
// Role: visibilidade admin x user
// -------------------------
function applyRoleVisibility() {
  const isAdmin = currentUser?.role === 'admin';

  // Medidores: criar/reset/excluir/trocar token só admin
  document.getElementById('admin-meters-create').style.display = isAdmin ? 'flex' : 'none';
  // Imóveis: criar só admin
  document.getElementById('admin-props-create').style.display = isAdmin ? 'flex' : 'none';
  // Usuários (aba inteira) só admin
  const usersBtn = [...document.querySelectorAll('.nav-btn')].find(b => b.textContent.includes('Usuários'));
  if (usersBtn) usersBtn.style.display = isAdmin ? 'block' : 'none';
  document.getElementById('section-users').style.display = isAdmin ? 'none' : 'none';
  // Form de criar usuário só admin
  const uc = document.getElementById('admin-users-create');
  if (uc) uc.style.display = isAdmin ? 'flex' : 'none';
}

// -------------------------
// Navegação
// -------------------------
function showSection(key) {
  const sections = ['dashboard','meters','readings','properties','finance','goals','reports','users'];
  sections.forEach(s => {
    const el = document.getElementById('section-' + s);
    if (el) el.style.display = (s === key) ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const map = { dashboard:0, meters:1, readings:2, properties:3, finance:4, goals:5, reports:6, users:7 };
  const btn = document.querySelectorAll('.nav-btn')[map[key]];
  if (btn) btn.classList.add('active');

  if (key === 'dashboard') loadDashboard();
  if (key === 'readings') applyReadingsFilter();
  if (key === 'properties') loadProperties();
  if (key === 'users') loadUsersIfAdmin();
}

// -------------------------
// Utilitários
// -------------------------
function authHeader() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => alert('Copiado!'));
}
function fmtDateISO(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}
function groupBy(arr, keyFn) {
  const m = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}
function setDashTab(tab) {
  currentDashTab = tab; // 'agua' | 'energia'
  document.getElementById('tab-agua').classList.toggle('active', tab==='agua');
  document.getElementById('tab-energia').classList.toggle('active', tab==='energia');
  loadDashboard();
}

// -------------------------
// Financeiro (tarifas locais)
// -------------------------
function loadTarifasUI() {
  const tA = localStorage.getItem('tarifa_agua') || '';
  const tE = localStorage.getItem('tarifa_energia') || '';
  const a = document.getElementById('tar-agua'); if (a) a.value = tA;
  const e = document.getElementById('tar-energia'); if (e) e.value = tE;
}
function saveTarifas() {
  const a = document.getElementById('tar-agua')?.value ?? '';
  const e = document.getElementById('tar-energia')?.value ?? '';
  localStorage.setItem('tarifa_agua', a);
  localStorage.setItem('tarifa_energia', e);
  alert('Tarifas salvas localmente.');
}

// -------------------------
// DASHBOARD
// -------------------------
async function loadDashboard() {
  if (!TOKEN || !API) return;
  try {
    const res = await fetch(`${API}/api/readings?limit=1000`, { headers: authHeader() });
    const rows = await res.json();

    // Cards
    const totalReadings = rows.length;
    const water = rows.filter(r => r.type === 'agua')
      .reduce((s, r) => s + (Number(r.value ?? r.consumo_litros) || 0), 0);
    const energy = rows.filter(r => r.type === 'energia')
      .reduce((s, r) => s + (Number(r.value) || 0), 0);

    document.getElementById('card-readings').textContent = totalReadings;
    document.getElementById('card-water').textContent   = water.toFixed(1);
    document.getElementById('card-energy').textContent  = energy.toFixed(1);

    // Aba principal (água/luz) com range
    const range = Number(document.getElementById('dash-range').value || 7);
    const since = new Date(); since.setDate(since.getDate() - (range - 1));
    const sinceISO = fmtDateISO(since);
    const filtered = rows.filter(d => (d.created_at || '').slice(0,10) >= sinceISO && d.type === currentDashTab);

    const byDay = groupBy(filtered, r => (r.created_at || '').slice(0,10));
    const days = [];
    for (let i = range-1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push(fmtDateISO(d));
    }
    const values = days.map(d => (byDay.get(d) || [])
      .reduce((s, x) => s + (Number(x.value ?? x.consumo_litros) || 0), 0));
    buildMainChart(days, values, currentDashTab);

    // Comparativo diário (7d)
    const d7 = 7;
    const s7 = new Date(); s7.setDate(s7.getDate()- (d7 - 1));
    const s7ISO = fmtDateISO(s7);
    const rows7 = rows.filter(d => (d.created_at || '').slice(0,10) >= s7ISO);
    const byDayAll = groupBy(rows7, r => (r.created_at || '').slice(0,10));
    const days7 = []; for (let i= d7-1; i>=0; i--) { const d=new Date(); d.setDate(d.getDate()-i); days7.push(fmtDateISO(d)); }
    const dailyAgua = days7.map(d => (byDayAll.get(d) || []).filter(x=>x.type==='agua')
      .reduce((s,x)=> s + (Number(x.value ?? x.consumo_litros) || 0),0));
    const dailyEnergia = days7.map(d => (byDayAll.get(d) || []).filter(x=>x.type==='energia')
      .reduce((s,x)=> s + (Number(x.value) || 0),0));
    buildDailyChart(days7, dailyAgua, dailyEnergia);

    // Mensal (6 meses)
    const byMonth = groupBy(rows, r => {
      const d = new Date(r.created_at);
      if (Number.isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    });
    const months = [];
    const base = new Date();
    for (let i=5;i>=0;i--) {
      const d = new Date(base.getFullYear(), base.getMonth()-i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    }
    const mAgua = months.map(m => (byMonth.get(m)||[]).filter(x=>x.type==='agua')
      .reduce((s,x)=> s + (Number(x.value ?? x.consumo_litros)||0),0));
    const mEnergia = months.map(m => (byMonth.get(m)||[]).filter(x=>x.type==='energia')
      .reduce((s,x)=> s + (Number(x.value)||0),0));
    buildMonthlyChart(months, mAgua, mEnergia);

    // Alertas
    renderAlerts(rows);
  } catch (e) {
    console.warn('Erro dashboard:', e.message);
  }
}
function buildMainChart(labels, data, tab) {
  const ctx = document.getElementById('chart-main'); if (!ctx) return;
  if (chartMain) chartMain.destroy();
  chartMain = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: tab==='agua' ? 'Água (L)' : 'Energia (kWh)', data }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });
}
function buildDailyChart(days, agua, energia) {
  const ctx = document.getElementById('chart-daily'); if (!ctx) return;
  if (chartDaily) chartDaily.destroy();
  chartDaily = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: { labels: days, datasets: [{ label: 'Água (L)', data: agua }, { label: 'Energia (kWh)', data: energia }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });
}
function buildMonthlyChart(months, agua, energia) {
  const ctx = document.getElementById('chart-monthly'); if (!ctx) return;
  if (chartMonthly) chartMonthly.destroy();
  chartMonthly = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { labels: months, datasets: [
      { label: 'Água (L)', data: agua, tension: 0.2 },
      { label: 'Energia (kWh)', data: energia, tension: 0.2 }
    ] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });
}

// -------------------------
// MEDIDORES — listar, criar, token, reset, excluir (admin)
// -------------------------
async function loadMeters() {
  if (!API) return;
  const ul = document.getElementById('meter-list');
  if (!ul) return;

  ul.innerHTML = 'Carregando…';
  try {
    const res = await fetch(`${API}/api/meters`, { headers: authHeader() });
    if (!res.ok) throw new Error('Falha ao carregar medidores');
    const list = await res.json();

    ul.innerHTML = '';
    list.forEach(m => {
      const li = document.createElement('li');
      const endpointRaw = `${API}/api/readings/raw?token=${m.token}`;
      li.innerHTML = `
        <div class="row">
          <div><strong>${m.name}</strong> <small class="muted">(${m.type})</small></div>
          <div class="btns">
            <button class="theme-toggle admin-only" onclick="resetMeter(${m.id})">🔁 Reset</button>
            <button class="theme-toggle admin-only" onclick="regenerateToken(${m.id})">🔑 Token</button>
            <button class="theme-toggle admin-only" style="background:#ef4444;" onclick="deleteMeter(${m.id}, '${(m.name||'').replaceAll(`'`,`\\'`)}')">🗑</button>
          </div>
        </div>
        <div class="muted" style="font-size:12px;word-break:break-all;">
          <div><b>Token:</b> <code>${m.token || '-'}</code></div>
          <div><b>Endpoint GET (equipamento):</b> <code>${endpointRaw}&value=123&consumo_litros=0&vazao_lh=0</code></div>
        </div>
        <div class="btns">
          <button onclick="copyText('${endpointRaw.replaceAll(`'`,`\\'`)}')">Copiar endpoint base</button>
          <button onclick="copyText('${m.token || ''}')">Copiar token</button>
        </div>
      `;
      ul.appendChild(li);
    });

    // popular metas select
    const sel = document.getElementById('goal-meter');
    if (sel) sel.innerHTML = list.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

    // popular checkboxes no cadastro de usuários
    renderUserMeterCheckboxes(list);
    // esconder botões admin se não for admin
    const isAdmin = currentUser?.role === 'admin';
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin ? 'inline-block' : 'none');
  } catch (e) {
    ul.innerHTML = 'Erro ao carregar medidores';
  }
}
async function addMeter() {
  const name = document.getElementById('meter-name').value.trim();
  const type = document.getElementById('meter-type').value;
  if (!name) return alert('Informe o nome do medidor');

  try {
    const res = await fetch(`${API}/api/meters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ name, type })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar medidor');

    document.getElementById('meter-name').value = '';
    await loadMeters();
    alert(`Medidor criado!\nToken: ${data.token}`);
  } catch (e) {
    alert(e.message);
  }
}
async function regenerateToken(id) {
  if (!confirm('Gerar novo token? O antigo vai parar de funcionar.')) return;
  try {
    const res = await fetch(`${API}/api/meters/${id}/token/regenerate`, {
      method: 'POST',
      headers: authHeader()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao regenerar token');
    await loadMeters();
    alert('Novo token gerado!');
  } catch (e) {
    alert(e.message);
  }
}
async function resetMeter(id) {
  const defaultTag = prompt('Opcional: nome do ciclo (ex.: Kitnet 01 — João, nov/2025). Deixe vazio para "Reset Manual".', '');
  if (!confirm('Confirmar reset? O consumo atual será zerado e enviado ao histórico.')) return;

  try {
    const res = await fetch(`${API}/api/meters/${id}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ cycle_tag: defaultTag || 'Reset Manual' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao resetar');
    alert(`Reset concluído. Leituras salvas no histórico (${data.backup_rows || 0} linhas).`);
    await loadMeters();
    applyReadingsFilter().catch(()=>{});
  } catch (e) {
    alert(e.message);
  }
}
async function deleteMeter(id, name) {
  if (!confirm(`Excluir o medidor "${name}"?`)) return;
  try {
    const res = await fetch(`${API}/api/meters/${id}`, { method: 'DELETE', headers: authHeader() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir');
    await loadMeters();
    alert('Medidor excluído!');
  } catch (e) {
    alert(e.message);
  }
}

// -------------------------
// LEITURAS — filtros + export
// -------------------------
async function applyReadingsFilter() {
  const tipo = document.getElementById('filter-type')?.value || '';
  const from = document.getElementById('date-from')?.value || '';
  const to = document.getElementById('date-to')?.value || '';

  const q = new URLSearchParams();
  if (tipo) q.set('tipo', tipo);
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  q.set('limit', '500');

  const r = await fetch(API + '/api/readings?' + q.toString(), { headers: authHeader() });
  const rows = await r.json();

  const tb = document.querySelector('#readings-table tbody');
  if (!tb) return;
  tb.innerHTML = '';
  rows.forEach(x => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${x.id}</td><td>${x.meter_name || x.meter_id || '-'}</td><td>${x.type || '-'}</td><td>${x.value ?? x.consumo_litros ?? '-'}</td><td>${x.created_at}</td>`;
    tb.appendChild(tr);
  });
}
function clearReadingsFilter() {
  const a = id => document.getElementById(id);
  if (a('filter-type')) a('filter-type').value = '';
  if (a('date-from')) a('date-from').value = '';
  if (a('date-to')) a('date-to').value = '';
  applyReadingsFilter();
}
async function exportToExcel() {
  const rows = [];
  document.querySelectorAll('#readings-table tbody tr').forEach(tr => {
    const tds = [...tr.querySelectorAll('td')].map(td => td.textContent);
    rows.push({ ID: tds[0], Medidor: tds[1], Tipo: tds[2], Valor: tds[3], Data: tds[4] });
  });
  if (!rows.length) { alert('Nada para exportar.'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leituras');
  XLSX.writeFile(wb, `leituras_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
async function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.text('Relatório de Leituras', 14, 16);
  const head = [['ID', 'Medidor', 'Tipo', 'Valor', 'Data']];
  const body = [];
  document.querySelectorAll('#readings-table tbody tr').forEach(tr => {
    const tds = [...tr.querySelectorAll('td')].map(td => td.textContent);
    body.push(tds);
  });
  if (!body.length) { alert('Nada para exportar.'); return; }
  doc.autoTable({ head, body, startY: 22 });
  doc.save(`leituras_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// -------------------------
// METAS / ALERTAS
// -------------------------
async function loadGoalsOptions() {
  // ao carregar medidores, o select é populado
  await loadMeters();
}
async function saveGoal() {
  const sel = document.getElementById('goal-meter');
  const goal_daily = Number(document.getElementById('goal-daily').value || 0);
  const warn_percent = Number(document.getElementById('goal-warn').value || 90);
  const meter_id = sel?.value || null;
  const meter_name = sel?.options[sel.selectedIndex]?.text || 'geral';

  if (!goal_daily || !warn_percent) return alert('Preencha meta e %');

  const r = await fetch(API + '/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ meter_id, meter_name, goal_daily, warn_percent })
  });
  const j = await r.json();
  if (!r.ok) return alert(j.error || 'Falha ao salvar meta');
  alert('Meta salva!');
  renderAlerts();
}
async function deleteGoal() {
  alert('Remoção direta por meter_id ainda não exposta no backend. Posso incluir /api/goals/:meter_id (DELETE) se precisar.');
}
async function renderAlerts(rowsOpt) {
  const ul = document.getElementById('alerts'); if (!ul) return;
  ul.innerHTML = '';

  const [goalsRes, lastRes] = await Promise.all([
    fetch(API + '/api/goals', { headers: authHeader() }),
    rowsOpt ? Promise.resolve({ ok:true, json: async()=> rowsOpt }) : fetch(API + '/api/readings?limit=500', { headers: authHeader() })
  ]);
  const goals = await goalsRes.json();
  const rows = rowsOpt || await lastRes.json();

  const today = new Date().toISOString().slice(0, 10);
  const todayRows = rows.filter(r => (r.created_at || '').slice(0, 10) === today);

  const agua = todayRows.filter(r => r.type === 'agua')
    .reduce((s, r) => s + (Number(r.value ?? r.consumo_litros) || 0), 0);
  const energia = todayRows.filter(r => r.type === 'energia')
    .reduce((s, r) => s + (Number(r.value) || 0), 0);

  goals.forEach(g => {
    if (!g.goal_daily) return;
    const lower = (g.meter_name || '').toLowerCase();
    const current = lower.includes('agua') ? agua : (lower.includes('energia') ? energia : 0);
    const pct = current / g.goal_daily * 100;
    if (pct >= g.warn_percent) {
      const li = document.createElement('li');
      li.textContent = `⚠️ ${g.meter_name}: ${pct.toFixed(0)}% da meta diária (${g.goal_daily})`;
      ul.appendChild(li);
    }
  });
}

// -------------------------
// RELATÓRIOS (tabela por período) — usando Leituras
// -------------------------
// (Se quiser reativar a aba Relatórios, basta criar a UI — a lógica aproveita applyReadingsFilter)

// -------------------------
// IMÓVEIS (simples)
// -------------------------
async function loadProperties() {
  try {
    const res = await fetch(`${API}/api/imoveis`, { headers: authHeader() });
    const data = await res.json();
    const tbody = document.querySelector('#properties-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    data.forEach(i => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i.id}</td><td>${i.nome}</td><td>${i.endereco || '-'}</td><td>${i.responsavel || '-'}</td>`;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error('Erro ao carregar imóveis:', e.message);
  }
}
async function createProperty() {
  const nome = document.getElementById('prop-name').value.trim();
  const endereco = document.getElementById('prop-address').value.trim();
  const responsavel = document.getElementById('prop-owner').value.trim();
  if (!nome) return alert('Informe o nome do imóvel');

  const r = await fetch(`${API}/api/imoveis`, {
    method: 'POST',
    headers: {'Content-Type':'application/json', ...authHeader()},
    body: JSON.stringify({ nome, endereco, responsavel })
  });
  const j = await r.json();
  if (!r.ok) return alert(j.error || 'Falha ao cadastrar imóvel');

  document.getElementById('prop-name').value = '';
  document.getElementById('prop-address').value = '';
  document.getElementById('prop-owner').value = '';
  loadProperties();
}

// -------------------------
// USUÁRIOS (admin)
// -------------------------
function renderUserMeterCheckboxes(meters) {
  const box = document.getElementById('userCreate-meters');
  if (!box) return;
  box.innerHTML = meters.map(m => `
    <label><input type="checkbox" value="${m.id}" /> ${m.name} <small class="muted">(${m.type})</small></label>
  `).join('');
}
function getCheckedMeters(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return [];
  return [...box.querySelectorAll('input[type="checkbox"]:checked')].map(i => Number(i.value));
}
async function loadUsersIfAdmin() {
  if (currentUser?.role !== 'admin') return;
  try {
    const r = await fetch(API + '/api/users', { headers: authHeader() });
    const users = await r.json();
    const tb = document.querySelector('#users-table tbody'); if (!tb) return;
    tb.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.id}</td>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${u.role}</td>
        <td>${(u.meter_ids_permitidos||[]).join(', ') || '-'}</td>
        <td>
          <button class="theme-toggle" onclick='promptEditUser(${u.id}, ${JSON.stringify(u.meter_ids_permitidos||[]).replaceAll("'", "\\'")})'>Editar</button>
          <button class="theme-toggle" style="background:#ef4444;" onclick="deleteUser(${u.id})">Remover</button>
        </td>
      `;
      tb.appendChild(tr);
    });
  } catch (e) {
    console.error('Erro ao listar usuários', e.message);
  }
}
async function createUser() {
  const name = document.getElementById('userCreate-name').value.trim();
  const email = document.getElementById('userCreate-email').value.trim();
  const password = document.getElementById('userCreate-password').value;
  const role = document.getElementById('userCreate-role').value;
  const meters = getCheckedMeters('userCreate-meters');

  if (!name || !email || !password) return alert('Preencha nome, e-mail e senha');
  const r = await fetch(API + '/api/users', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', ...authHeader() },
    body: JSON.stringify({ name, email, password, role, meter_ids_permitidos: meters })
  });
  const j = await r.json();
  if (!r.ok) return alert(j.error || 'Falha ao criar usuário');
  alert('Usuário criado!');
  document.getElementById('userCreate-name').value = '';
  document.getElementById('userCreate-email').value = '';
  document.getElementById('userCreate-password').value = '';
  document.getElementById('userCreate-role').value = 'user';
  document.querySelectorAll('#userCreate-meters input[type="checkbox"]').forEach(c => c.checked = false);
  loadUsersIfAdmin();
}
function promptEditUser(id, currentMeters) {
  const newName = prompt('Novo nome (deixe vazio para manter):', '');
  const newEmail = prompt('Novo e-mail (deixe vazio para manter):', '');
  const newPassword = prompt('Nova senha (deixe vazio para manter):', '');
  const newRole = prompt('Role (admin|user, deixe vazio para manter):', '');
  const newMetersCsv = prompt('IDs de medidores permitidos (separe por vírgula). Atual irá substituir o atual:', (currentMeters || []).join(','));
  const meter_ids_permitidos = newMetersCsv ? newMetersCsv.split(',').map(s => Number(s.trim())).filter(Boolean) : undefined;
  updateUser(id, { name: newName || undefined, email: newEmail || undefined, password: newPassword || undefined, role: newRole || undefined, meter_ids_permitidos });
}
async function updateUser(id, payload) {
  const r = await fetch(API + '/api/users/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type':'application/json', ...authHeader() },
    body: JSON.stringify(payload)
  });
  const j = await r.json();
  if (!r.ok) return alert(j.error || 'Falha ao atualizar usuário');
  alert('Usuário atualizado!');
  loadUsersIfAdmin();
}
async function deleteUser(id) {
  if (!confirm('Remover este usuário?')) return;
  const r = await fetch(API + '/api/users/' + id, { method:'DELETE', headers: authHeader() });
  const j = await r.json();
  if (!r.ok) return alert(j.error || 'Falha ao remover');
  alert('Usuário removido!');
  loadUsersIfAdmin();
}
