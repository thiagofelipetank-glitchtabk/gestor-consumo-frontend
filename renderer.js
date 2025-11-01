// ======================================================
// GESTOR DE CONSUMO — FRONTEND PRO (Render Cloud FIXED)
// ======================================================

let API = "https://gestor-consumo-backend.onrender.com";
let currentUser = null;
let chart;

// ===============================
// CHECAGEM DE SERVIDOR
// ===============================
async function checkServer() {
  const status = document.getElementById("server-status");
  const indicator = document.getElementById("server-indicator");

  status.textContent = "🔄 Checando servidor na nuvem...";
  indicator.style.background = "gray";

  try {
    const res = await fetch(`${API}/health`, { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data.status === "ok") {
      indicator.style.background = "#3b82f6";
      document.getElementById("server-label").textContent = "Render Cloud";
      status.textContent = "☁️ Conectado à nuvem Render!";
      setTimeout(() => {
        document.getElementById("checking").style.display = "none";
        document.getElementById("auth").style.display = "block";
      }, 800);
    } else throw new Error("Resposta inválida");
  } catch (err) {
    indicator.style.background = "#ef4444";
    document.getElementById("server-label").textContent = "Offline";
    status.textContent = "❌ Falha ao conectar ao servidor.";
  }
}

document.addEventListener("DOMContentLoaded", checkServer);

// ===============================
// LOGIN
// ===============================
async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("login-msg");

  msg.textContent = "";

  if (!email || !password) {
    msg.textContent = "Preencha e-mail e senha.";
    return;
  }

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Erro ao fazer login");

    localStorage.setItem("user", JSON.stringify(data.user));
    document.getElementById("auth").style.display = "none";
    document.getElementById("dashboard").style.display = "grid";
    document.getElementById("user-name").textContent = data.user.name;

    loadDashboard();
  } catch (err) {
    msg.textContent = "❌ " + err.message;
  }
}

function logout() {
  localStorage.removeItem("user");
  location.reload();
}

// ===============================
// AUTO LOGIN
// ===============================
(function autoLogin() {
  const saved = localStorage.getItem("user");
  if (saved) {
    currentUser = JSON.parse(saved);
    document.getElementById("auth").style.display = "none";
    document.getElementById("dashboard").style.display = "grid";
    document.getElementById("user-name").textContent = currentUser.name;
    loadDashboard();
  }
})();

// ===============================
// DASHBOARD
// ===============================
async function loadDashboard() {
  try {
    const res = await fetch(`${API}/api/readings`);
    const readings = await res.json();

    const total = readings.length;
    const water = readings.filter(r => r.tipo === "agua").reduce((s, r) => s + (r.valor || 0), 0);
    const energy = readings.filter(r => r.tipo === "energia").reduce((s, r) => s + (r.valor || 0), 0);

    document.getElementById("card-readings").textContent = total;
    document.getElementById("card-water").textContent = water.toFixed(1);
    document.getElementById("card-energy").textContent = energy.toFixed(1);

    buildChart(readings);
    checkGoals(water, energy);
  } catch (e) {
    console.warn("Erro ao carregar leituras.", e);
  }
}

// ===============================
// GRÁFICO
// ===============================
function buildChart(data) {
  const ctx = document.getElementById("chart").getContext("2d");
  if (chart) chart.destroy();

  const labels = [...new Set(data.map(r => r.data))].slice(-7);
  const agua = labels.map(d => data.filter(r => r.tipo === "agua" && r.data === d)
    .reduce((sum, r) => sum + (r.valor || 0), 0));
  const energia = labels.map(d => data.filter(r => r.tipo === "energia" && r.data === d)
    .reduce((sum, r) => sum + (r.valor || 0), 0));

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Água (L)", data: agua, backgroundColor: "#3b82f6" },
        { label: "Energia (kWh)", data: energia, backgroundColor: "#f59e0b" },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
    },
  });
}

// ===============================
// METAS
// ===============================
async function checkGoals(water, energy) {
  try {
    const res = await fetch(`${API}/api/goals`);
    const goals = await res.json();
    const alertList = document.getElementById("alerts");
    alertList.innerHTML = "";

    goals.forEach(g => {
      const current = g.meter_name === "agua" ? water : energy;
      const percent = (current / g.goal_daily) * 100;
      if (percent >= g.warn_percent) {
        const li = document.createElement("li");
        li.textContent = `⚠️ ${g.meter_name} atingiu ${percent.toFixed(0)}% da meta (${g.goal_daily})`;
        alertList.appendChild(li);
      }
    });
  } catch {
    console.log("Sem metas cadastradas ainda.");
  }
}

// ===============================
// TEMA CLARO / ESCURO
// ===============================
function toggleTheme() {
  const html = document.documentElement;
  const theme = html.getAttribute("data-theme") === "light" ? "dark" : "light";
  html.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

(function loadTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
})();
