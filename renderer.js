// ======================================================
// FRONTEND PRO 4.4 — Auto Server + Login + Comparativos
// + Fase 2 (Imóveis/Financeiro) + Reset Seguro + Histórico/Restore
// ======================================================

let API = '';
let TOKEN = '';
let currentUser = null;

// -------------------------
// Detecção automática do servidor
// -------------------------
async function checkServer() {
  const status = document.getElementById('server-status');
  const indicator = document.getElementById('server-indicator');
  const label = document.getElementById('server-label');

  if (status) status.textContent = 'Checando…';
  if (indicator) indicator.style.background = 'gray';
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
    const uname = document.getElementById('user-name');
    if (uname) uname.textContent = currentUser.name;

    await Promise.all([
      loadDashboard(),
      loadMeters(),
      loadGoalsOptions(),
      loadProperties(),
      loadEmployees().then(() => setTimeout(loadAllowances, 300)).catch(()=>{}),
      // histórico inicial
      loadBackups()
    ]);
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
    const uname = document.getElementById('user-name');
    if (uname) uname.textContent = currentUser.name;

    Promise.all([
      loadDashboard(),
      loadMeters(),
      loadGoalsOptions(),
      loadProperties(),
      loadEmployees().then(() => setTimeout(loadAllowances, 300)).catch(()=>{}),
      loadBackups()
    ]);
  }
})();

// -------------------------
// Navegação
// -------------------------
function showSection(key) {
  const sections = ['dashboard','meters','readings','properties','finance','goals','reports','users','history'];
  sections.forEach(s => {
    const el = document.getElementById('section-' + s);
    if (el) el.style.display = (s === key) ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const map = { dashboard:0, meters:1, readings:2, properties:3, finance:4, goals:5, reports:6, users:7, history:8 };
  const btn = document.querySelectorAll('.nav-btn')[map[key]];
  if (btn) btn.classList.add('active');

  if (key === 'dashboard') loadDashboard();
  if (key === 'readings') applyReadingsFilter();
  if (key === 'properties') loadProperties();
  if (key === 'finance') { loadEmployees().then(() => setTimeout(loadAllowances, 300)).catch(()=>{}); }
  if (key === 'history') loadBackups();
}

// -------------------------
// Utils
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

// -------------------------
// DASHBOARD (agregação no frontend)
// -------------------------
let chartDaily, chartMonthly;

async function loadDashboard() {
  if (!TOKEN || !API) return;

  try {
    const res = await fetch(`${API}/api/readings?limit=1000`, { headers: authHeader() });
    const rows = await res.json();

    // Cards
    const totalReadings = rows.length;
    const water = rows.filter(r => r.type === 'agua').reduce((s, r) => s + (Number(r.value ?? r.consumo_litros) || 0), 0);
    const energy = rows.filter(r => r.type === 'energia').reduce((s, r) => s + (Number(r.value) || 0), 0);

    const cR = document.getElementById('card-readings');
    const cW = document.getElementById('card-water');
    const cE = document.getElementById('card-energy');
    if (cR) cR.textContent = totalReadings;
    if (cW) cW.textContent = water.toFixed(1);
    if (cE) cE.textContent = energy.toFixed(1);

    // Séries por dia (7 dias)
    const byDay = groupBy(rows, r => (r.created_at || '').slice(0, 10));
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(fmtDateISO(d));
    }
    const dailyAgua = days.map(d => (byDay.get(d) || []).filter(x => x.type === 'agua')
      .reduce((s, x) => s + (Number(x.value ?? x.consumo_litros) || 0), 0));
    const dailyEnergia = days.map(d => (byDay.get(d) || []).filter(x => x.type === 'energia')
      .reduce((s, x) => s + (Number(x.value) || 0), 0));
    buildDailyChart(days, dailyAgua, dailyEnergia);

    // Mensal (6 meses)
    const byMonth = groupBy(rows, r => {
      const d = new Date(r.created_at);
      if (Number.isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const months = [];
    const base = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const mAgua = months.map(m => (byMonth.get(m) || []).filter(x => x.type === 'agua')
      .reduce((s, x) => s + (Number(x.value ?? x.consumo_litros) || 0), 0));
    const mEnergia = months.map(m => (byMonth.get(m) || []).filter(x => x.type === 'energia')
      .reduce((s, x) => s + (Number(x.value) || 0), 0));
    buildMonthlyChart(months, mAgua, mEnergia);

    // Alertas
    renderAlerts();
  } catch (e) {
    console.warn('Erro dashboard:', e.message);
  }
}

function buildDailyChart(days, agua, energia) {
  const ctx = document.getElementById('chart-daily');
  if (!ctx) return;
  if (chartDaily) chartDaily.destroy();
  chartDaily = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: { labels: days, datasets: [{ label: 'Água (L)', data: agua }, { label: 'Energia (kWh)', data: energia }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });
}
function buildMonthlyChart(months, agua, energia) {
  const ctx = document.getElementById('chart-monthly');
  if (!ctx) return;
  if (chartMonthly) chartMonthly.destroy();
  chartMonthly = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { labels: months, datasets: [{ label: 'Água (L)', data: agua, tension: 0.2 }, { label: 'Energia (kWh)', data: energia, tension: 0.2 }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
  });
}

// -------------------------
// MEDIDORES — listar, criar, token, reset, excluir
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
      li.style.display = 'grid';
      li.style.gridTemplateColumns = '1fr';
      li.style.gap = '8px';
      li.style.border = '1px solid var(--line)';
      li.style.borderRadius = '10px';
      li.style.padding = '12px';

      const endpoint = `${API}/api/readings?token=${m.token}`;

      li.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
          <div>
            <strong>${m.name}</strong>
            <small style="opacity:.8">(${m.type})</small>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="theme-toggle" onclick="resetMeter(${m.id})">🔁 Resetar consumo</button>
            <button class="theme-toggle" onclick="regenerateToken(${m.id})">🔑 Regenerar token</button>
            <button class="theme-toggle" onclick="deleteMeter(${m.id}, '${(m.name||'').replaceAll(`'`,`\\'`)}')">🗑️ Excluir</button>
          </div>
        </div>
        <div style="font-size:12px;color:var(--muted);word-break:break-all;">
          <div><b>Token:</b> <code>${m.token || '-'}</code></div>
          <div><b>Endpoint (HTTP):</b> <code>${endpoint}</code></div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button onclick="copyText('${endpoint.replaceAll(`'`,`\\'`)}')">Copiar endpoint</button>
          <button onclick="copyText('${m.token || ''}')">Copiar token</button>
        </div>
      `;
      ul.appendChild(li);
    });

    // metas select
    const sel = document.getElementById('goal-meter');
    if (sel) sel.innerHTML = list.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
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
    const res = await fetch(`${API}/api/meters/${id}/token/regenerate`, { method: 'POST', headers: authHeader() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao regenerar token');
    await loadMeters();
    alert('Novo token gerado!');
  } catch (e) {
    alert(e.message);
  }
}
async function resetMeter(id) {
  const defaultTag = prompt('Opcional: nome do ciclo (ex.: Kitnet 01 — João, nov/2025). Deixe em branco para "Reset Manual".', '');
  if (!confirm('Confirmar reset? O consumo atual será zerado e irá para o histórico.')) return;

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
    loadBackups().catch(()=>{});
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
  if (document.getElementById('filter-type')) document.getElementById('filter-type').value = '';
  if (document.getElementById('date-from')) document.getElementById('date-from').value = '';
  if (document.getElementById('date-to')) document.getElementById('date-to').value = '';
  applyReadingsFilter();
}

async function exportToExcel() {
  const rows = [];
  document.querySelectorAll('#readings-table tbody tr').forEach(tr => {
    const tds = [...tr.querySelectorAll('td')].map(td => td.textContent);
    rows.push({ ID: tds[0], Medidor: tds[1], Tipo: tds[2], Valor: tds[3], Data: tds[4] });
  });
  if (!rows.length) { alert('Nada para exportar. Gere uma listagem em Leituras.'); return; }
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
  if (!body.length) { alert('Nada para exportar. Gere uma listagem em Leituras.'); return; }
  doc.autoTable({ head, body, startY: 22 });
  doc.save(`leituras_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// -------------------------
// METAS / ALERTAS
// -------------------------
async function loadGoalsOptions() { await loadMeters(); }
async function saveGoal() {
  const sel = document.getElementById('goal-meter');
  const goal_daily = Number(document.getElementById('goal-daily').value || 0);
  const warn_percent = Number(document.getElementById('goal-warn').value || 90);
  const meter_id = sel?.value || null;
  const meter_name = sel?.options[sel.selectedIndex]?.text || 'geral';

  if (!goal_daily || !warn_percent) return alert('Preencha meta e %');

  await fetch(API + '/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ meter_id, meter_name, goal_daily, warn_percent })
  });
  alert('Meta salva!');
  renderAlerts();
}
async function deleteGoal() {
  alert('Remoção direta por meter_id ainda não exposta no backend. Se precisar, adiciono /api/goals/:meter_id (DELETE).');
}
async function renderAlerts() {
  const ul = document.getElementById('alerts');
  if (!ul) return;
  ul.innerHTML = '';

  const [goalsRes, lastRes] = await Promise.all([
    fetch(API + '/api/goals', { headers: authHeader() }),
    fetch(API + '/api/readings?limit=500', { headers: authHeader() })
  ]);
  const goals = await goalsRes.json();
  const rows = await lastRes.json();

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
// RELATÓRIOS — gera tabela pelas leituras
// -------------------------
async function generateReport() {
  const days = Number(document.getElementById('report-range')?.value || '7');

  const res = await fetch(`${API}/api/readings?limit=1000`, { headers: authHeader() });
  const data = await res.json();

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = fmtDateISO(since);

  const filtered = data.filter(d => (d.created_at || '').slice(0, 10) >= sinceISO);

  const perDay = groupBy(filtered, r => (r.created_at || '').slice(0, 10));
  const rows = [];
  for (const [day, list] of Array.from(perDay.entries()).sort()) {
    const acqua = list.filter(x => x.type === 'agua')
      .reduce((s, x) => s + (Number(x.value ?? x.consumo_litros) || 0), 0);
    const power = list.filter(x => x.type === 'energia')
      .reduce((s, x) => s + (Number(x.value) || 0), 0);

    if (acqua) rows.push({ day, type: 'agua', total: acqua });
    if (power) rows.push({ day, type: 'energia', total: power });
  }

  const tb = document.querySelector('#report-table tbody');
  if (!tb) return;
  tb.innerHTML = '';
  rows.forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${d.day}</td><td>${d.type}</td><td>${Number(d.total || 0).toFixed(2)}</td>`;
    tb.appendChild(tr);
  });
}

// -------------------------
// IMÓVEIS (Fase 2)
// -------------------------
async function loadProperties() {
  try {
    const res = await fetch(`${API}/api/imoveis`);
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

  await fetch(`${API}/api/imoveis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, endereco, responsavel })
  });
  document.getElementById('prop-name').value = '';
  document.getElementById('prop-address').value = '';
  document.getElementById('prop-owner').value = '';
  loadProperties();
}

// -------------------------
// FINANCEIRO — Funcionários/Vales (Fase 2)
// -------------------------
async function loadEmployees() {
  try {
    const res = await fetch(`${API}/api/funcionarios`);
    const data = await res.json();
    const tbody = document.querySelector('#employees-table tbody');
    const select = document.getElementById('allowance-emp');
    if (tbody) tbody.innerHTML = '';
    if (select) select.innerHTML = '';

    data.forEach(f => {
      if (tbody) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${f.id}</td><td>${f.nome}</td><td>${f.cargo || '-'}</td><td>${f.salario_base ?? '-'}</td>`;
        tbody.appendChild(tr);
      }
      if (select) {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.nome;
        select.appendChild(opt);
      }
    });
  } catch (e) {
    console.error('Erro ao carregar funcionários:', e.message);
  }
}
async function addEmployee() {
  const nome = document.getElementById('emp-name').value.trim();
  const cargo = document.getElementById('emp-role').value.trim();
  const salario_base = parseFloat((document.getElementById('emp-salary').value || '').replace(',', '.')) || 0;
  if (!nome) return alert('Informe o nome do funcionário');

  await fetch(`${API}/api/funcionarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, cargo, salario_base })
  });

  document.getElementById('emp-name').value = '';
  document.getElementById('emp-role').value = '';
  document.getElementById('emp-salary').value = '';
  loadEmployees();
}
async function loadAllowances() {
  const sel = document.getElementById('allowance-emp');
  const tbody = document.querySelector('#allowances-table tbody');
  if (!sel || !tbody) return;

  const funcionario_id = sel.value;
  if (!funcionario_id) { tbody.innerHTML = ''; return; }

  try {
    const res = await fetch(`${API}/api/vales/${funcionario_id}`);
    const data = await res.json();
    const empName = sel.options[sel.selectedIndex]?.text || '-';
    tbody.innerHTML = '';
    data.forEach(v => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${empName}</td><td>${v.data}</td><td>R$ ${Number(v.valor).toFixed(2)}</td><td>${v.descricao || '-'}</td>`;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error('Erro ao carregar vales:', e.message);
  }
}
async function addAllowance() {
  const funcionario_id = document.getElementById('allowance-emp').value;
  const data = document.getElementById('allowance-date').value;
  const valor = parseFloat((document.getElementById('allowance-value').value || '').replace(',', '.'));
  const descricao = document.getElementById('allowance-desc').value.trim();

  if (!funcionario_id || !data || !valor) return alert('Preencha funcionário, data e valor');

  await fetch(`${API}/api/vales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ funcionario_id, data, valor, descricao })
  });

  document.getElementById('allowance-date').value = '';
  document.getElementById('allowance-value').value = '';
  document.getElementById('allowance-desc').value = '';
  loadAllowances();
}

// -------------------------
// HISTÓRICO DE RESETS (Backups) — listar e restaurar
// -------------------------
async function loadBackups() {
  const tbody = document.querySelector('#history-table tbody');
  if (!tbody) return;
  const cycleFilter = document.getElementById('history-cycle')?.value || '';
  const meterFilter = document.getElementById('history-meter')?.value || '';
  const from = document.getElementById('history-from')?.value || '';
  const to = document.getElementById('history-to')?.value || '';

  const q = new URLSearchParams();
  if (cycleFilter) q.set('cycle', cycleFilter);
  if (meterFilter) q.set('meter_id', meterFilter);
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  q.set('limit', '1000');

  const res = await fetch(`${API}/api/backups?` + q.toString(), { headers: authHeader() });
  const data = await res.json();

  // popular select de medidores se existir
  const sel = document.getElementById('history-meter');
  if (sel && sel.options.length <= 1) {
    // carrega medidores e popula
    try {
      const r = await fetch(`${API}/api/meters`, { headers: authHeader() });
      const meters = await r.json();
      meters.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.name} (${m.type})`;
        sel.appendChild(opt);
      });
    } catch {}
  }

  tbody.innerHTML = '';
  if (!data.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="7" style="color:#94a3b8;">Sem backups ainda.</td>`;
    tbody.appendChild(tr);
    return;
  }

  data.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="backup-check" value="${b.id}"/></td>
      <td>${b.id}</td>
      <td>${b.cycle_tag || '-'}</td>
      <td>${b.meter_name || '-'}</td>
      <td>${b.type || '-'}</td>
      <td>${b.value ?? b.consumo_litros ?? '-'}</td>
      <td>${b.backup_at}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function restoreSelected(purge) {
  const checks = Array.from(document.querySelectorAll('.backup-check:checked'));
  if (!checks.length) return alert('Selecione pelo menos 1 backup para restaurar.');

  const ids = checks.map(c => Number(c.value));
  const res = await fetch(`${API}/api/backups/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ backup_ids: ids, purge: !!purge })
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Falha ao restaurar');

  alert(`Restore ok — ${data.restored} leituras restauradas${purge ? ` e ${data.removed} removidas do backup` : ''}.`);
  applyReadingsFilter().catch(()=>{});
  loadBackups();
}

async function restoreByCycle() {
  const meter_id = document.getElementById('history-meter')?.value || '';
  const cycle = document.getElementById('history-cycle')?.value || '';
  const purge = document.getElementById('history-purge')?.checked || false;
  if (!meter_id || !cycle) return alert('Informe um medidor e uma etiqueta de ciclo.');

  const res = await fetch(`${API}/api/backups/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ meter_id: Number(meter_id), cycle_tag: cycle, purge })
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Falha ao restaurar ciclo');

  alert(`Restore por ciclo ok — ${data.restored} leituras restauradas${purge ? ` e ${data.removed} removidas do backup` : ''}.`);
  applyReadingsFilter().catch(()=>{});
  loadBackups();
}

// -------------------------
// (Opcional) Usuários — placeholder
// -------------------------
async function loadUsers() {
  const tb = document.querySelector('#users-table tbody');
  if (!tb) return;
  tb.innerHTML = `<tr><td colspan="5">Gerenciamento de usuários não exposto no backend (multiusuário virá na próxima fase).</td></tr>`;
}
async function createUser() {
  alert('Criação de usuários pelo frontend ainda não está exposta no backend. Posso adicionar rotas /api/users na próxima fase.');
}
