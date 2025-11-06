// ============================================================
// Gestor de Consumo — FRONTEND 4.1 (Localhost Edition)
// Corrigido: /auth/login | Conectado ao backend local
// ============================================================

const API = "http://localhost:3000"; // <-- ajuste para nuvem quando subir
let user = null;
let token = null;
let allMeters = [];
let tariffs = { kwh_price: 0, m3_price: 0 };
let charts = { agua: null, energia: null };

// ------------------------------------------------------------
// LOGIN
// ------------------------------------------------------------
document.getElementById("login-btn").onclick = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("login-msg");
  msg.textContent = "Verificando...";

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao entrar");

    token = data.token;
    user = data.user;
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", JSON.stringify(user));

    msg.textContent = "";
    document.getElementById("login-section").style.display = "none";
    document.getElementById("app").style.display = "grid";
    initApp();
  } catch (err) {
    console.error(err);
    msg.textContent = "Falha no login: " + err.message;
  }
};

// ------------------------------------------------------------
// LOGOUT
// ------------------------------------------------------------
document.getElementById("logout-btn").onclick = () => {
  localStorage.clear();
  location.reload();
};

// ------------------------------------------------------------
// RELOAD SESSION
// ------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  const t = localStorage.getItem("auth_token");
  const u = localStorage.getItem("auth_user");
  if (t && u) {
    token = t;
    user = JSON.parse(u);
    document.getElementById("login-section").style.display = "none";
    document.getElementById("app").style.display = "grid";
    initApp();
  }
});

// ------------------------------------------------------------
// INICIALIZA APP
// ------------------------------------------------------------
async function initApp() {
  setupNav();
  if (user.role === "admin") {
    document.getElementById("users-btn").style.display = "block";
    document.getElementById("save-tariffs").disabled = false;
  } else {
    document.getElementById("users-btn").style.display = "none";
    document.getElementById("save-tariffs").disabled = true;
  }

  await Promise.all([loadMeters(), loadTariffs()]);
  renderDashboard();
  renderMeterSelectors();
  renderTariffFields();
}

// ------------------------------------------------------------
// NAVEGAÇÃO ENTRE ABAS
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// CARREGA MEDIDORES
// ------------------------------------------------------------
async function loadMeters() {
  const res = await fetch(`${API}/api/meters`);
  allMeters = await res.json();
}

// ------------------------------------------------------------
// CARREGA TARIFAS
// ------------------------------------------------------------
async function loadTariffs() {
  const res = await fetch(`${API}/api/tariffs`);
  tariffs = await res.json() || { kwh_price: 0, m3_price: 0 };
}

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
    const res = await fetch(`${API}/api/tariffs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kwh_price: kwh, m3_price: m3 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao salvar");
    msg.textContent = "Tarifas atualizadas com sucesso.";
    await loadTariffs();
  } catch (err) {
    msg.textContent = err.message;
  }
};

// ------------------------------------------------------------
// DASHBOARD
// ------------------------------------------------------------
async function renderDashboard() {
  const cont = document.getElementById("dashboard-cards");
  cont.innerHTML = "";
  const energia = allMeters.filter((m) => m.type === "energia");
  const agua = allMeters.filter((m) => m.type === "agua");

  const totalEnergia = await sumLastValues("energia");
  const totalAgua = await sumLastValues("agua");

  const custoE = totalEnergia * (tariffs.kwh_price || 0);
  const custoA = totalAgua * (tariffs.m3_price || 0);

  cont.innerHTML = `
    <div class="card"><h3>Energia</h3><p>${totalEnergia.toFixed(2)} kWh</p><p>R$ ${custoE.toFixed(2)}</p></div>
    <div class="card"><h3>Água</h3><p>${totalAgua.toFixed(2)} m³</p><p>R$ ${custoA.toFixed(2)}</p></div>
  `;
}

async function sumLastValues(tipo) {
  const res = await fetch(`${API}/api/readings?tipo=${tipo}&limit=1000`);
  const data = await res.json();
  if (!Array.isArray(data)) return 0;
  let total = 0;
  const grouped = {};
  data.forEach((r) => {
    if (!grouped[r.meter_id] || grouped[r.meter_id].id < r.id) {
      grouped[r.meter_id] = r;
    }
  });
  Object.values(grouped).forEach((r) => (total += r.value || 0));
  return total;
}

// ------------------------------------------------------------
// FILTROS DE MEDIDORES
// ------------------------------------------------------------
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

  aguaSel.innerHTML = `<option value="">Todos</option>` +
    aguaMeters.map(m => `<option value="${m.id}">${m.name}</option>`).join("");
  energiaSel.innerHTML = `<option value="">Todos</option>` +
    energiaMeters.map(m => `<option value="${m.id}">${m.name}</option>`).join("");

  document.getElementById("agua-apply").onclick = renderAguaCharts;
  document.getElementById("energia-apply").onclick = renderEnergiaCharts;
  renderAguaCharts();
  renderEnergiaCharts();
}

// ------------------------------------------------------------
// FUNÇÕES DE LEITURA E GRÁFICOS
// ------------------------------------------------------------
async function fetchReadings(tipo) {
  const res = await fetch(`${API}/api/readings?tipo=${tipo}&limit=5000`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function filterByDateAndMeter(rows, daysBack, meterId) {
  const since = new Date();
  since.setHours(0,0,0,0);
  since.setDate(since.getDate() - (Number(daysBack) || 7));
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

  const outDays = [];
  const outVals = [];
  const today = new Date();
  const range = tipo === "agua"
    ? Number(document.getElementById("agua-range").value || 7)
    : Number(document.getElementById("energia-range").value || 7);

  for (let i = (range - 1); i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = d.toISOString().slice(0,10);
    outDays.push(k);
    outVals.push(Number(map.get(k) || 0));
  }
  return { days: outDays, vals: outVals };
}

function makeChartLine(canvasId, labels, label, data, unit = "") {
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label, data, borderWidth: 2, tension: 0.25 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => `${v} ${unit}` } } }
    }
  });
}

// ------------------------------------------------------------
// GRÁFICOS
// ------------------------------------------------------------
async function renderAguaCharts() {
  const meterId = document.getElementById("agua-meter").value || "";
  const rangeDays = Number(document.getElementById("agua-range").value || 7);
  const rows = await fetchReadings("agua");
  const filtered = filterByDateAndMeter(rows, rangeDays, meterId);
  const { days, vals } = aggregateDaily(filtered, "agua");

  const total = vals.reduce((a,b)=>a+b,0);
  const custo = total * (tariffs.m3_price || 0);

  document.getElementById("agua-total").textContent = total.toFixed(2) + " m³";
  document.getElementById("agua-cost").textContent = "R$ " + custo.toFixed(2);

  if (charts.agua) charts.agua.destroy();
  charts.agua = makeChartLine("agua-chart", days, "Consumo de Água (m³)", vals, "m³");
}

async function renderEnergiaCharts() {
  const meterId = document.getElementById("energia-meter").value || "";
  const rangeDays = Number(document.getElementById("energia-range").value || 7);
  const rows = await fetchReadings("energia");
  const filtered = filterByDateAndMeter(rows, rangeDays, meterId);
  const { days, vals } = aggregateDaily(filtered, "energia");

  const total = vals.reduce((a,b)=>a+b,0);
  const custo = total * (tariffs.kwh_price || 0);

  document.getElementById("energia-total").textContent = total.toFixed(2) + " kWh";
  document.getElementById("energia-cost").textContent = "R$ " + custo.toFixed(2);

  if (charts.energia) charts.energia.destroy();
  charts.energia = makeChartLine("energia-chart", days, "Consumo de Energia (kWh)", vals, "kWh");
}
