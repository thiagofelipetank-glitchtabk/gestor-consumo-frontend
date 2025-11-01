// ================== CONFIG / ESTADO ==================
let API = "";
let TOKEN = "";
let CURRENT_USER = null;
let chart;

// ================== DETECÇÃO DE BACKEND ==================
function setIndicator(type, text) {
  const dot = document.getElementById('server-indicator');
  const label = document.getElementById('server-label');
  const colors = { local:'#22c55e', cloud:'#3b82f6', offline:'#ef4444', wait:'#aaa' };
  dot.style.background = colors[type] || '#aaa';
  label.textContent = text;
}

async function detectServer() {
  setIndicator('wait', 'Checando…');
  const urls = [
  { url: "https://gestor-consumo-backend.onrender.com", type: "cloud" },
];
;
;
  for (const u of urls) {
    try {
      const r = await fetch(u.url + '/health', { cache:'no-store' });
      if (r.ok) {
        API = u.url;
        setIndicator(u.key, u.label);
        document.getElementById('checking').style.display = 'none';
        document.getElementById('auth').style.display = 'block';
        return;
      }
    } catch {}
  }
  setIndicator('offline', 'Offline');
  document.getElementById('checking').textContent = '❌ Nenhum servidor encontrado.';
}

// ================== TEMA ==================
function toggleTheme(){
  const html = document.documentElement;
  const theme = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}
(function loadTheme(){
  document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'dark');
})();

// ================== AUTH ==================
async function login(){
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  const msg = document.getElementById('login-msg'); msg.textContent = '';

  if (!API) { msg.textContent = 'Servidor não detectado ainda.'; return; }

  try {
    const r = await fetch(API + '/auth/login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Falha no login');

    TOKEN = data.token;
    CURRENT_USER = data.user;
    localStorage.setItem('token', TOKEN);
    localStorage.setItem('user', JSON.stringify(CURRENT_USER));

    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard').style.display = 'grid';
    document.getElementById('user-name').textContent = CURRENT_USER.name;

    await loadDashboard();
    await loadMeters();
    await reloadReadings();
    await loadGoals();
    await loadUsers();
  } catch(e) {
    msg.textContent = e.message;
  }
}
function logout(){
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  location.reload();
}
(function autoLogin(){
  TOKEN = localStorage.getItem('token') || "";
  const u = localStorage.getItem('user');
  if (TOKEN && u) {
    CURRENT_USER = JSON.parse(u);
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('dashboard').style.display = 'grid';
    document.getElementById('user-name').textContent = CURRENT_USER.name;
    loadDashboard(); loadMeters(); reloadReadings(); loadGoals(); loadUsers();
  }
})();

// ================== NAV ==================
function showSection(id){
  document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
  document.getElementById(id).style.display = 'block';
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  [...document.querySelectorAll('.nav-btn')].find(b => b.textContent.includes(document.getElementById(id).querySelector('h2').textContent.split(' ')[0]))?.classList.add('active');
}

// ================== DASHBOARD ==================
async function loadDashboard(){
  if (!API) return;
  // Leituras
  const r = await fetch(API + '/api/readings?limit=500');
  const all = await r.json();

  const total = all.length;
  const water = all.filter(x => x.type === 'agua').reduce((s,x)=>s+(x.value||0),0);
  const energy= all.filter(x => x.type === 'energia').reduce((s,x)=>s+(x.value||0),0);
  document.getElementById('card-readings').textContent = total;
  document.getElementById('card-water').textContent = water.toFixed(1);
  document.getElementById('card-energy').textContent = energy.toFixed(1);

  // Alertas do dia
  const a = await fetch(API + '/api/alerts/today'); const alerts = await a.json();
  const ul = document.getElementById('alerts'); ul.innerHTML = '';
  document.getElementById('card-alerts').textContent = alerts.length;
  alerts.forEach(al => {
    const li = document.createElement('li');
    li.textContent = `⚠️ ${al.meter.toUpperCase()} atingiu ${al.percent}% da meta (Hoje: ${al.current.toFixed(1)} / Meta: ${al.goal})`;
    ul.appendChild(li);
  });

  // Comparativo
  buildDailyChart();
}

async function buildDailyChart(){
  const r = await fetch(API + '/api/consumption/daily?days=7');
  const rows = await r.json();
  const days = [...new Set(rows.map(x=>x.day))];
  const agua = days.map(d => (rows.find(x=>x.day===d && x.type==='agua')?.total_value)||0);
  const energia = days.map(d => (rows.find(x=>x.day===d && x.type==='energia')?.total_value)||0);

  const ctx = document.getElementById('chart').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type:'bar',
    data:{ labels:days, datasets:[
      { label:'Água (L)', data:agua, backgroundColor:'#3b82f6' },
      { label:'Energia (kWh)', data:energia, backgroundColor:'#f59e0b' }
    ]},
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } }, plugins:{ legend:{ position:'bottom' } } }
  });
}

// ================== MEDIDORES ==================
async function loadMeters(){
  if (!TOKEN) return;
  const r = await fetch(API + '/api/meters', { headers:{ Authorization:`Bearer ${TOKEN}` } });
  const rows = await r.json();
  const tbody = document.getElementById('meter-list'); tbody.innerHTML = '';
  rows.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.id}</td><td>${m.name}</td><td>${m.type}</td><td>${m.location||''}</td>
      <td><button class="theme-toggle" onclick="deleteMeter(${m.id})">Excluir</button></td>`;
    tbody.appendChild(tr);
  });
}
async function addMeter(){
  const name = document.getElementById('meter-name').value.trim();
  const type = document.getElementById('meter-type').value;
  const location = document.getElementById('meter-location').value.trim();
  if (!name) return alert('Informe o nome');
  const r = await fetch(API + '/api/meters', {
    method:'POST',
    headers:{'Content-Type':'application/json', Authorization:`Bearer ${TOKEN}`},
    body: JSON.stringify({ name, type, location })
  });
  if (!r.ok) return alert('Erro ao criar medidor');
  await loadMeters();
}
async function deleteMeter(id){
  if (!confirm('Excluir medidor?')) return;
  const r = await fetch(API + `/api/meters/${id}`, {
    method:'DELETE', headers:{ Authorization:`Bearer ${TOKEN}` }
  });
  if (!r.ok) return alert('Erro ao excluir');
  await loadMeters();
}

// ================== LEITURAS ==================
async function reloadReadings(){
  const r = await fetch(API + '/api/readings?limit=200');
  const rows = await r.json();
  const tbody = document.getElementById('readings-table'); tbody.innerHTML = '';
  rows.forEach(x=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${x.id}</td>
      <td>${x.meter_name||x.meter_id||''}</td>
      <td>${x.type}</td>
      <td>${(x.value??'').toString()}</td>
      <td>${x.created_at||''}</td>`;
    tbody.appendChild(tr);
  });
}
function exportExcel(){
  const rows = [...document.querySelectorAll('#readings-table tr')].map(tr => [...tr.children].map(td=>td.textContent));
  const headers = rows.shift() || [];
  const aoa = [headers, ...rows];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Leituras');
  XLSX.writeFile(wb, 'leituras.xlsx');
}

// ================== METAS (GOALS) ==================
async function loadGoals(){
  if (!TOKEN) return;
  const r = await fetch(API + '/api/goals', { headers:{ Authorization:`Bearer ${TOKEN}` } });
  const rows = await r.json();
  const tbody = document.getElementById('goals-table'); tbody.innerHTML='';
  rows.forEach(g=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${g.meter_id}</td><td>${g.meter_name}</td><td>${g.goal_daily}</td><td>${g.warn_percent}</td>`;
    tbody.appendChild(tr);
  });
}
async function saveGoal(){
  const meter_id = document.getElementById('goal-meter-id').value.trim();
  const meter_name = document.getElementById('goal-meter-name').value.trim();
  const goal_daily = Number(document.getElementById('goal-daily').value);
  const warn_percent = Number(document.getElementById('goal-warn').value||80);
  if (!meter_id || !meter_name || !goal_daily) return alert('Preencha os campos');
  const r = await fetch(API + '/api/goals', {
    method:'POST',
    headers:{'Content-Type':'application/json', Authorization:`Bearer ${TOKEN}`},
    body: JSON.stringify({ meter_id, meter_name, goal_daily, warn_percent })
  });
  if (!r.ok) return alert('Erro ao salvar meta');
  await loadGoals();
}
async function deleteGoal(){
  const meter_id = document.getElementById('goal-meter-id').value.trim();
  if (!meter_id) return alert('Informe o meter_id');
  if (!confirm('Remover meta?')) return;
  const r = await fetch(API + `/api/goals/${meter_id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${TOKEN}` } });
  if (!r.ok) return alert('Erro ao remover meta');
  await loadGoals();
}

// ================== USUÁRIOS ==================
async function loadUsers(){
  if (!TOKEN) return;
  const r = await fetch(API + '/api/users', { headers:{ Authorization:`Bearer ${TOKEN}` } });
  if (!r.ok) return; // não-admin não acessa
  const rows = await r.json();
  const tbody = document.getElementById('users-table'); tbody.innerHTML='';
  rows.forEach(u=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td>${u.created_at||''}</td>
      <td><button class="theme-toggle" onclick="deleteUser(${u.id})">Excluir</button></td>`;
    tbody.appendChild(tr);
  });
}
async function createUser(){
  const name = document.getElementById('user-name').value.trim();
  const email = document.getElementById('user-email').value.trim();
  const password = document.getElementById('user-password').value.trim();
  const role = document.getElementById('user-role').value;
  if (!name || !email || !password) return alert('Preencha os campos');
  const r = await fetch(API + '/api/users', {
    method:'POST',
    headers:{'Content-Type':'application/json', Authorization:`Bearer ${TOKEN}`},
    body: JSON.stringify({ name, email, password, role })
  });
  if (!r.ok) return alert('Erro ao criar usuário');
  await loadUsers();
}
async function deleteUser(id){
  if (!confirm('Excluir usuário?')) return;
  const r = await fetch(API + `/api/users/${id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${TOKEN}` } });
  if (!r.ok) return alert('Erro ao excluir');
  await loadUsers();
}

// ================== AUTO ==================
document.addEventListener('DOMContentLoaded', detectServer);
setInterval(() => {
  if (document.getElementById('section-dashboard').style.display !== 'none') loadDashboard();
}, 30000);
