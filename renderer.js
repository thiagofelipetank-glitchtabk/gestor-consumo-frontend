// ============================================================
// FRONTEND 4.6 — Login Pro, Dashboard Mês, Trifásico, Filtros
// ============================================================

const API = "http://localhost:3000";
let user = null;
let token = null;
let allMeters = [];
let tariffs = { kwh_price: 0, m3_price: 0 };
let charts = { agua: null, energia: null };
let usersCache = [];

// LOGIN
document.getElementById("login-btn").onclick = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("login-msg");
  msg.textContent = "Verificando...";
  try {
    const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao entrar");
    token = data.token; user = data.user;
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", JSON.stringify(user));
    msg.textContent = "";
    document.getElementById("login-section").style.display = "none";
    document.getElementById("app").style.display = "grid";
    initApp();
  } catch (e) { msg.textContent = "Falha no login: " + e.message; }
};
document.getElementById("logout-btn").onclick = () => { localStorage.clear(); location.reload(); };
window.addEventListener("DOMContentLoaded", () => {
  const t = localStorage.getItem("auth_token"); const u = localStorage.getItem("auth_user");
  if (t && u) { token = t; user = JSON.parse(u); document.getElementById("login-section").style.display = "none"; document.getElementById("app").style.display = "grid"; initApp(); }
});

// INIT
async function initApp() {
  setupNav();
  const isAdmin = user?.role === "admin";
  document.getElementById("nav-users").style.display = isAdmin ? "block" : "none";
  document.getElementById("nav-meters").style.display = isAdmin ? "block" : "none";
  document.getElementById("nav-3f").style.display = isAdmin ? "block" : "none";
  document.getElementById("save-tariffs").disabled = !isAdmin;

  await Promise.all([loadMeters(), loadTariffs()]);
  renderMeterSelectors();
  renderTariffFields();

  // Dashboard mês atual
  const now = new Date(); document.getElementById("month-input").value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  await renderDashboardMonth();

  if (isAdmin) {
    await loadUsers();
    renderUsersTable();
    renderMetersTable();
    initTrifasicoUI();
  }

  document.getElementById("refresh-month").onclick = renderDashboardMonth;
}

// NAV
function setupNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.getAttribute("data-target");
      document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
      document.getElementById(target).classList.add("active");
    });
  });
}

// LOADERS
async function loadMeters() {
  const res = await fetch(`${API}/api/meters`); allMeters = await res.json();
}
async function loadTariffs() {
  const res = await fetch(`${API}/api/tariffs`); tariffs = (await res.json()) || { kwh_price: 0, m3_price: 0 };
}
async function loadUsers() {
  const res = await fetch(`${API}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
  usersCache = res.ok ? await res.json() : [];
}

// TARIFAS
function renderTariffFields() {
  document.getElementById("kwh-price").value = tariffs.kwh_price || "";
  document.getElementById("m3-price").value = tariffs.m3_price || "";
}
document.getElementById("save-tariffs").onclick = async () => {
  const msg = document.getElementById("tariff-msg");
  msg.textContent = "Salvando...";
  const kwh = parseFloat(document.getElementById("kwh-price").value);
  const m3 = parseFloat(document.getElementById("m3-price").value);
  try {
    const res = await fetch(`${API}/api/tariffs`, { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` }, body: JSON.stringify({ kwh_price:kwh, m3_price:m3 }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || "Erro ao salvar");
    msg.textContent = "Tarifas atualizadas.";
    await loadTariffs();
  } catch (e) { msg.textContent = e.message; }
};

// DASHBOARD MÊS
async function renderDashboardMonth() {
  const cont = document.getElementById("dashboard-cards");
  cont.innerHTML = "Carregando...";
  const month = document.getElementById("month-input").value || new Date().toISOString().slice(0,7);
  const res = await fetch(`${API}/api/summary/month?month=${month}`);
  const data = await res.json();
  const visibleIds = new Set(user?.role === "admin" ? allMeters.map(m=>m.id) : (user?.allowed_meters || []));
  const kwhPrice = +tariffs.kwh_price || 0;
  const m3Price = +tariffs.m3_price || 0;

  // Só mostra medidores ‘agua’ e ‘energia’ (os ‘energia-3f’ são pais)
  const list = data.filter(r => (r.type === "agua" || r.type === "energia") && visibleIds.has(r.meter_id));

  cont.innerHTML = list.map(r => {
    const unit = r.type === "agua" ? "m³" : "kWh";
    const price = r.type === "agua" ? m3Price : kwhPrice;
    const cost = (r.month_total * price).toFixed(2);
    return `
      <div class="card">
        <h3>${r.meter_name} <span class="tag">${r.type}</span></h3>
        <p>${r.month_total.toFixed(2)} ${unit}</p>
        <p>R$ ${cost}</p>
      </div>
    `;
  }).join("") || "<p>Nenhum dado para o mês selecionado.</p>";
}

// SELECTORS + GRÁFICOS (sem alterações de lógica principal)
function renderMeterSelectors() {
  let visibleMeters = [...allMeters];
  if (user && user.allowed_meters && Array.isArray(user.allowed_meters) && user.role !== "admin") {
    const set = new Set(user.allowed_meters.map(String));
    visibleMeters = allMeters.filter(m => set.has(String(m.id)));
  }
  const aguaSel = document.getElementById("agua-meter");
  const energiaSel = document.getElementById("energia-meter");
  const aguaMeters = visibleMeters.filter(m => m.type === "agua");
  const energiaMeters = visibleMeters.filter(m => m.type === "energia");

  aguaSel.innerHTML = `<option value="">Todos</option>` + aguaMeters.map(m => `<option value="${m.id}">${m.name}</option>`).join("");
  energiaSel.innerHTML = `<option value="">Todos</option>` + energiaMeters.map(m => `<option value="${m.id}">${m.name}</option>`).join("");

  document.getElementById("agua-apply").onclick = renderAguaCharts;
  document.getElementById("energia-apply").onclick = renderEnergiaCharts;
  renderAguaCharts(); renderEnergiaCharts();
}
async function fetchReadings(tipo) {
  const res = await fetch(`${API}/api/readings?tipo=${tipo}&limit=5000`); const data = await res.json();
  return Array.isArray(data) ? data : [];
}
function filterByDateAndMeter(rows, daysBack, meterId) {
  const since = new Date(); since.setHours(0,0,0,0); since.setDate(since.getDate() - (Number(daysBack) || 7));
  const sinceISO = since.toISOString().slice(0,10);
  return rows.filter(r => {
    const day = (r.created_at || "").slice(0,10);
    if (day < sinceISO) return false;
    if (meterId && String(r.meter_id) !== String(meterId)) return false;
    return true;
  });
}
function aggregateDaily(rows, tipo) {
  const map = new Map();
  rows.forEach(r => {
    const day = (r.created_at || "").slice(0,10);
    const val = Number(r.value ?? r.consumo_litros) || 0;
    map.set(day, (map.get(day) || 0) + val);
  });
  const outDays = []; const outVals = [];
  const today = new Date();
  const range = tipo === "agua"
    ? Number(document.getElementById("agua-range").value || 7)
    : Number(document.getElementById("energia-range").value || 7);
  for (let i = (range - 1); i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const k = d.toISOString().slice(0,10); outDays.push(k); outVals.push(Number(map.get(k) || 0));
  }
  return { days: outDays, vals: outVals };
}
function makeChartLine(canvasId, labels, label, data, unit = "") {
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label, data, borderWidth: 2, tension: 0.25 }] },
    options: { responsive: true, plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => `${v} ${unit}` } } } }
  });
}
async function renderAguaCharts() {
  const meterId = document.getElementById("agua-meter").value || "";
  const rangeDays = Number(document.getElementById("agua-range").value || 7);
  const rows = await fetchReadings("agua"); const filtered = filterByDateAndMeter(rows, rangeDays, meterId);
  const { days, vals } = aggregateDaily(filtered, "agua");
  const total = vals.reduce((a,b)=>a+b,0); const custo = total * (tariffs.m3_price || 0);
  document.getElementById("agua-total").textContent = total.toFixed(2) + " m³";
  document.getElementById("agua-cost").textContent = "R$ " + custo.toFixed(2);
  if (charts.agua) charts.agua.destroy(); charts.agua = makeChartLine("agua-chart", days, "Consumo de Água (m³)", vals, "m³");
}
async function renderEnergiaCharts() {
  const meterId = document.getElementById("energia-meter").value || "";
  const rangeDays = Number(document.getElementById("energia-range").value || 7);
  const rows = await fetchReadings("energia"); const filtered = filterByDateAndMeter(rows, rangeDays, meterId);
  const { days, vals } = aggregateDaily(filtered, "energia");
  const total = vals.reduce((a,b)=>a+b,0); const custo = total * (tariffs.kwh_price || 0);
  document.getElementById("energia-total").textContent = total.toFixed(2) + " kWh";
  document.getElementById("energia-cost").textContent = "R$ " + custo.toFixed(2);
  if (charts.energia) charts.energia.destroy(); charts.energia = makeChartLine("energia-chart", days, "Consumo de Energia (kWh)", vals, "kWh");
}

// ADMIN — Usuários (filtro de permissões)
document.getElementById("u-create").onclick = async () => {
  const msg = document.getElementById("u-msg");
  msg.textContent = "Criando usuário...";
  const name = document.getElementById("u-name").value.trim();
  const email = document.getElementById("u-email").value.trim();
  const password = document.getElementById("u-pass").value;
  const role = document.getElementById("u-role").value;
  try {
    const res = await fetch(`${API}/api/users`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, email, password, role, meter_ids: [] }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || "Erro ao criar usuário");
    document.getElementById("u-name").value = ""; document.getElementById("u-email").value = "";
    document.getElementById("u-pass").value = ""; document.getElementById("u-role").value = "user";
    msg.textContent = "Usuário criado.";
    await loadUsers(); renderUsersTable();
  } catch (e) { msg.textContent = e.message; }
};

function renderUsersTable() {
  const tbody = document.getElementById("u-tbody");
  tbody.innerHTML = "";

  const filterInput = document.getElementById("perm-filter");
  const meters = allMeters; // cache
  const renderRow = (u) => {
    const query = (filterInput.value || "").toLowerCase();
    const meterChecks = meters
      .filter(m => (m.type === "agua" || m.type === "energia")) // não listar pais 3F
      .filter(m => m.name.toLowerCase().includes(query))
      .map(m => {
        const checked = u.allowed_meters?.includes(m.id) ? "checked" : "";
        return `<label class="tag"><input type="checkbox" data-user="${u.id}" data-meter="${m.id}" ${checked}/> ${m.name}</label>`;
      }).join(" ");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.name}</td>
      <td>${u.email}</td>
      <td><span class="tag">${u.role}</span></td>
      <td>${meterChecks || "<span class='small'>Nenhum medidor corresponde ao filtro.</span>"}</td>
      <td>
        <button data-act="save" data-id="${u.id}">Aplicar</button>
        <button data-act="del" data-id="${u.id}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  };

  usersCache.forEach(renderRow);

  // ações
  const attach = () => {
    tbody.querySelectorAll("button[data-act='save']").forEach(btn => {
      btn.onclick = async () => {
        const uid = btn.getAttribute("data-id");
        const checks = tbody.querySelectorAll(`input[type="checkbox"][data-user="${uid}"]`);
        const meter_ids = []; checks.forEach(c => { if (c.checked) meter_ids.push(Number(c.getAttribute("data-meter"))); });
        try {
          const res = await fetch(`${API}/api/users/${uid}/permissions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ meter_ids }) });
          const data = await res.json(); if (!res.ok) throw new Error(data.error || "Erro ao salvar permissões");
          alert("Permissões atualizadas.");
          await loadUsers(); renderUsersTable();
        } catch (e) { alert(e.message); }
      };
    });
    tbody.querySelectorAll("button[data-act='del']").forEach(btn => {
      btn.onclick = async () => {
        const uid = btn.getAttribute("data-id");
        if (!confirm("Excluir usuário?")) return;
        try {
          const res = await fetch(`${API}/api/users/${uid}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
          const data = await res.json(); if (!res.ok) throw new Error(data.error || "Erro ao excluir usuário");
          await loadUsers(); renderUsersTable();
        } catch (e) { alert(e.message); }
      };
    });
  };
  attach();

  // re-render ao digitar filtro
  document.getElementById("perm-filter").oninput = () => { renderUsersTable(); };
}

// ADMIN — Medidores
document.getElementById("m-create").onclick = async () => {
  const name = document.getElementById("m-name").value.trim();
  const type = document.getElementById("m-type").value;
  const msg = document.getElementById("m-msg");
  msg.textContent = "Criando medidor...";
  try {
    const res = await fetch(`${API}/api/meters`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, type }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || "Erro ao criar medidor");
    msg.textContent = `Medidor criado. ${data.meter.token ? "Token: "+data.meter.token : ""}`;
    document.getElementById("m-name").value = "";
    await loadMeters(); renderMetersTable(); renderMeterSelectors(); initTrifasicoUI();
  } catch (e) { msg.textContent = e.message; }
};

function renderMetersTable() {
  const tbody = document.getElementById("m-tbody"); tbody.innerHTML = "";
  allMeters.forEach(m => {
    if (m.type === "energia-3f" || m.type === "energia" || m.type === "agua") {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${m.id}</td>
        <td>${m.name}</td>
        <td><span class="tag">${m.type}</span></td>
        <td class="small">${m.token || "-"}</td>
        <td class="small">${m.created_at || "-"}</td>
        <td><button data-act="del" data-id="${m.id}">Excluir</button></td>
      `;
      tbody.appendChild(tr);
    }
  });
  tbody.querySelectorAll("button[data-act='del']").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-id");
      if (!confirm("Excluir medidor e suas leituras/permissões?")) return;
      try {
        const res = await fetch(`${API}/api/meters/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json(); if (!res.ok) throw new Error(data.error || "Erro ao excluir medidor");
        await loadMeters(); renderMetersTable(); renderMeterSelectors(); initTrifasicoUI();
      } catch (e) { alert(e.message); }
    };
  });
}

// ADMIN — Trifásico (mapa fases)
async function initTrifasicoUI() {
  const parentSel = document.getElementById("map-parent");
  if (!parentSel) return;
  const parents = allMeters.filter(m => m.type === "energia-3f");
  parentSel.innerHTML = parents.map(p => `<option value="${p.id}">${p.name} (${p.token})</option>`).join("");
  parentSel.onchange = loadMapEditor;
  document.getElementById("map-autocreate").onclick = async () => {
    const id = parentSel.value; if (!id) return;
    await fetch(`${API}/api/energy3ph/${id}/autocreate`, { method:"POST", headers: { Authorization: `Bearer ${token}` } });
    await loadMeters(); await loadMapEditor();
  };
  await loadMapEditor();
}
async function loadMapEditor() {
  const parentId = document.getElementById("map-parent").value;
  if (!parentId) return;
  const res = await fetch(`${API}/api/energy3ph/${parentId}/map`, { headers: { Authorization: `Bearer ${token}` } });
  const map = res.ok ? await res.json() : [];
  // listar medidores de energia para escolher child
  const energiaMeters = allMeters.filter(m => m.type === "energia");
  const editor = document.getElementById("map-editor");
  const phases = ["A","B","C"];
  editor.innerHTML = phases.map(ph => {
    const row = map.find(x => x.phase === ph) || {};
    const select = `<select data-phase="${ph}">` + energiaMeters.map(m => `<option value="${m.id}" ${row.child_meter_id===m.id?"selected":""}>${m.name}</option>`).join("") + `</select>`;
    const label = `<input type="text" data-phase-label="${ph}" placeholder="Ex: Apto 01" value="${row.label || ""}"/>`;
    return `<div class="row mt"><strong>Fase ${ph}</strong> ${select} ${label}</div>`;
  }).join("") + `<div class="mt"><button id="map-save">Salvar Mapeamento</button></div>`;
  document.getElementById("map-save").onclick = async () => {
    const payload = { map: [] };
    ["A","B","C"].forEach(ph => {
      const sel = editor.querySelector(`select[data-phase="${ph}"]`);
      const lbl = editor.querySelector(`input[data-phase-label="${ph}"]`);
      if (sel && sel.value) payload.map.push({ phase: ph, child_meter_id: Number(sel.value), label: (lbl?.value || null) });
    });
    const res2 = await fetch(`${API}/api/energy3ph/${parentId}/map`, { method:"POST", headers: { "Content-Type":"application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    if (!res2.ok) { const d = await res2.json(); alert(d.error || "Erro ao salvar mapeamento"); return; }
    alert("Mapeamento salvo.");
  };
}
