// ======================================================
// FRONTEND PRO 4.1 — Auto Server + Login + Comparativos + Fase 2 (Imóveis + Financeiro)
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

  status.textContent = 'Checando…';
  indicator.style.background = 'gray'; label.textContent = 'Checando…';

  const urls = [
    { url: 'http://localhost:3000', type: 'local' },
    { url: 'https://gestor-consumo-backend.onrender.com', type: 'cloud' }
  ];

  for (const { url, type } of urls) {
    try {
      const r = await fetch(url + '/health', { cache: 'no-store' });
      if (r.ok) {
        API = url;
        indicator.style.background = (type === 'local') ? '#22c55e' : '#3b82f6';
        label.textContent = type === 'local' ? 'Servidor Local' : 'Render Cloud';
        document.getElementById('checking').style.display = 'none';
        document.getElementById('auth').style.display = 'block';
        return;
      }
    } catch {}
  }
  indicator.style.background = '#ef4444';
  label.textContent = 'Offline';
  status.textContent = 'Nenhum servidor encontrado.';
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
(function(){
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
  msg.textContent = '';

  if (!API) { msg.textContent = 'Servidor não conectado.'; return; }

  try {
    const res = await fetch(API + '/auth/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha no login');

    TOKEN = data.token;
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    localStorage.setItem('token', TOKEN);

    document.getElementById('auth').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
    document.getElementById('user-name').textContent = currentUser.name;

    await Promise.all([loadDashboard(), loadMeters(), loadUsers(), loadGoalsOptions()]);
  } catch (e) {
    msg.textContent = e.message;
  }
}

function logout() {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  location.reload();
}

(function autoLogin(){
  const u = localStorage.getItem('user');
  const t = localStorage.getItem('token');
  if (u && t) {
    currentUser = JSON.parse(u);
    TOKEN = t;
    document.getElementById('checking').style.display = 'none';
    document.getElementById('auth').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
    document.getElementById('user-name').textContent = currentUser.name;
    Promise.all([loadDashboard(), loadMeters(), loadUsers(), loadGoalsOptions()]);
  }
})();

// -------------------------
// Navegação (agora inclui Imóveis e Financeiro)
// -------------------------
function showSection(key) {
  const sections = ['dashboard','meters','readings','properties','finance','goals','reports','users'];
  sections.forEach(s => {
    const el = document.getElementById('section-' + s);
    if (el) el.style.display = (s === key) ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const map = {
    dashboard:0, meters:1, readings:2, properties:3, finance:4, goals:5, reports:6, users:7
  };
  const btn = document.querySelectorAll('.nav-btn')[map[key]];
  if (btn) btn.classList.add('active');

  if (key === 'dashboard') loadDashboard();
  if (key === 'readings') applyReadingsFilter();
  if (key === 'properties') loadProperties();
  if (key === 'finance') { loadEmployees(); setTimeout(loadAllowances, 400); }
}

// -------------------------
// DASHBOARD (mantido igual)
// -------------------------
let chartDaily, chartMonthly;
async function loadDashboard() { /* ...mantém sua lógica atual... */ }

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
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ nome, endereco, responsavel })
  });
  document.getElementById('prop-name').value = '';
  document.getElementById('prop-address').value = '';
  document.getElementById('prop-owner').value = '';
  loadProperties();
}

// -------------------------
// FUNCIONÁRIOS (Fase 2)
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
  const salario_base = parseFloat(document.getElementById('emp-salary').value.replace(',', '.')) || 0;
  if (!nome) return alert('Informe o nome do funcionário');

  await fetch(`${API}/api/funcionarios`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ nome, cargo, salario_base })
  });

  document.getElementById('emp-name').value = '';
  document.getElementById('emp-role').value = '';
  document.getElementById('emp-salary').value = '';
  loadEmployees();
}

// -------------------------
// VALES (Fase 2)
// -------------------------
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
  const valor = parseFloat(document.getElementById('allowance-value').value.replace(',', '.'));
  const descricao = document.getElementById('allowance-desc').value.trim();

  if (!funcionario_id || !data || !valor) return alert('Preencha funcionário, data e valor');

  await fetch(`${API}/api/vales`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ funcionario_id, data, valor, descricao })
  });

  document.getElementById('allowance-date').value = '';
  document.getElementById('allowance-value').value = '';
  document.getElementById('allowance-desc').value = '';
  loadAllowances();
}

// -------------------------
// UTILITÁRIOS
// -------------------------
function authHeader() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// mantém suas outras funções (dashboard, metas, relatórios etc) como estão
// ====================================================
// FIM DO ARQUIVO
// ====================================================
