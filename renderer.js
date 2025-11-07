// ============================================================
// Frontend 4.8 PRO (consolidado)
// - Login limpo (sem e-mail/senha preenchidos)
// - Dashboard com filtros + trifásico A/B/C
// - Usuários: filtro e exibição de permissões
// - Medidores: listagem + criação + copiar token
// - Backend: Render Cloud
// ============================================================

// 🔗 Endereço do backend
const API = "https://gestor-consumo-backend.onrender.com";

let token = null;
let currentUser = null;
let metersCache = [];

// -------------------------- HTTP Helper --------------------------
async function http(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// -------------------------- Sessão --------------------------
document.getElementById("login-btn").onclick = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("login-msg");
  msg.textContent = "Verificando...";

  try {
    const data = await http("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem("gc_token", token);
    localStorage.setItem("gc_user", JSON.stringify(currentUser));
    msg.textContent = "";
    document.getElementById("login-section").style.display = "none";
    document.getElementById("app").style.display = "grid";
    initApp();
  } catch (e) {
    msg.textContent = "Falha no login: " + e.message;
  }
};

window.addEventListener("DOMContentLoaded", () => {
  const t = localStorage.getItem("gc_token");
  const u = localStorage.getItem("gc_user");
  if (t && u) {
    token = t;
    currentUser = JSON.parse(u);
    document.getElementById("login-section").style.display = "none";
    document.getElementById("app").style.display = "grid";
    initApp();
  }
});

document.getElementById("logout-btn").onclick = () => {
  localStorage.clear();
  location.reload();
};

// -------------------------- Navegação --------------------------
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.getAttribute("data-target");
    document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
    document.getElementById(target).classList.add("active");
    if (target === "dashboard") renderDashboard();
    if (target === "usuarios") renderUsers();
    if (target === "medidores") renderMeters();
  });
});

// -------------------------- Init App --------------------------
async function initApp() {
  await preloadMeters();
  prepareDashboardFilters();
  renderDashboard();
}

// -------------------------- Cache de Medidores --------------------------
async function preloadMeters() {
  metersCache = await http("/api/meters");
}

// -------------------------- Filtros do Dashboard --------------------------
function prepareDashboardFilters() {
  const selType = document.getElementById("filter-type");
  const selMeter = document.getElementById("filter-meter");

  // Preenche lista de medidores
  selMeter.innerHTML = `<option value="">Todos os medidores</option>` +
    metersCache.map(m => `<option value="${m.id}" data-type="${m.type}">${m.name} (${m.type})</option>`).join("");

  // evento
  document.getElementById("refresh-dashboard").onclick = renderDashboard;
  selType.onchange = renderDashboard;
  selMeter.onchange = renderDashboard;
}

// -------------------------- Dashboard (Resumo do mês) --------------------------
async function renderDashboard() {
  const cont = document.getElementById("cards");
  cont.innerHTML = "<div class='card'><p>Carregando...</p></div>";

  const filterType = document.getElementById("filter-type").value;
  const filterMeterId = document.getElementById("filter-meter").value;

  try {
    await preloadMeters();
    const summary = await http("/api/summary/month");

    // Agrupar por medidor
    const byMeter = new Map();
    summary.forEach(row => {
      if (filterType && row.type !== filterType) return;
      if (!byMeter.has(row.meter_id)) byMeter.set(row.meter_id, []);
      byMeter.get(row.meter_id).push(row);
    });

    cont.innerHTML = "";

    const listToShow = metersCache.filter(m => {
      if (filterType && m.type !== filterType) return false;
      if (filterMeterId && String(m.id) !== String(filterMeterId)) return false;
      return true;
    });

    listToShow.forEach(m => {
      const rows = byMeter.get(m.id) || [];

      if (m.type === "energia-3f") {
        // Fases derivadas do nome salvo
        const faseA = rows.find(r => (r.meter_name || "").includes("Fase A"));
        const faseB = rows.find(r => (r.meter_name || "").includes("Fase B"));
        const faseC = rows.find(r => (r.meter_name || "").includes("Fase C"));
        const a = faseA ? faseA.total : 0;
        const b = faseB ? faseB.total : 0;
        const c = faseC ? faseC.total : 0;

        cont.appendChild(card(`${m.name} — Fase A`, `${a.toFixed(2)} kWh`));
        cont.appendChild(card(`${m.name} — Fase B`, `${b.toFixed(2)} kWh`));
        cont.appendChild(card(`${m.name} — Fase C`, `${c.toFixed(2)} kWh`));
      } else if (m.type === "energia") {
        const total = rows.reduce((acc, r) => acc + (r.total || 0), 0);
        cont.appendChild(card(`${m.name} (Energia)`, `${total.toFixed(2)} kWh`));
      } else if (m.type === "agua") {
        const total = rows.reduce((acc, r) => acc + (r.total || 0), 0);
        cont.appendChild(card(`${m.name} (Água)`, `${total.toFixed(2)} m³`));
      } else {
        const total = rows.reduce((acc, r) => acc + (r.total || 0), 0);
        cont.appendChild(card(`${m.name}`, `${total.toFixed(2)} unidades`));
      }
    });

    if (!cont.children.length) {
      cont.innerHTML = "<div class='card'><p>Nenhum dado para este mês com os filtros atuais.</p></div>";
    }
  } catch (e) {
    cont.innerHTML = `<div class='card'><p>Erro: ${e.message}</p></div>`;
  }
}

function card(title, value) {
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `<h3>${title}</h3><p>${value}</p>`;
  return div;
}

// -------------------------- Usuários --------------------------
async function renderUsers() {
  const tbody = document.querySelector("#users-table tbody");
  const filter = document.getElementById("filter-user").value.trim().toLowerCase();
  tbody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";

  try {
    // Por enquanto mostramos apenas o usuário logado (backend ainda não lista todos)
    const list = [currentUser];
    const filtered = list.filter(u =>
      (u.name || "").toLowerCase().includes(filter) ||
      (u.email || "").toLowerCase().includes(filter)
    );

    tbody.innerHTML = "";
    if (!filtered.length) {
      tbody.innerHTML = "<tr><td colspan='5'>Nenhum usuário encontrado.</td></tr>";
    } else {
      filtered.forEach(u => {
        const tr = document.createElement("tr");
        const allowed = (u.allowed_meters || []).map(String);
        tr.innerHTML = `
          <td>${u.name || "-"}</td>
          <td>${u.email}</td>
          <td><span class="tag">${u.role}</span></td>
          <td>${renderMeterChips(allowed)}</td>
          <td><button class="mini-btn" data-act="edit" data-id="${u.id}">Editar</button></td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5">Erro: ${e.message}</td></tr>`;
  }

  document.getElementById("filter-user").oninput = renderUsers;
}

function renderMeterChips(allowedIds) {
  if (!metersCache.length) return "-";
  return metersCache
    .filter(m => allowedIds.includes(String(m.id)))
    .map(m => `<span class="chip">${m.name}</span>`)
    .join(" ") || "<i>Sem permissões</i>";
}

// -------------------------- Medidores --------------------------
async function renderMeters() {
  const tbody = document.querySelector("#meters-table tbody");
  tbody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";

  try {
    await preloadMeters();
    if (!metersCache.length) {
      tbody.innerHTML = "<tr><td colspan='5'>Nenhum medidor cadastrado.</td></tr>";
    } else {
      tbody.innerHTML = "";
      metersCache.forEach(m => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${m.name}</td>
          <td>${m.type}</td>
          <td><code>${m.token || "-"}</code></td>
          <td>${(m.created_at || "").replace("T"," ").slice(0,19)}</td>
          <td>
            <button class="mini-btn" data-act="copy-token" data-token="${m.token || ""}">Copiar Token</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5">Erro: ${e.message}</td></tr>`;
  }

  document.getElementById("add-meter-btn").onclick = async () => {
    if (!currentUser || currentUser.role !== "admin") {
      return alert("Apenas administradores podem adicionar medidores.");
    }
    const name = prompt("Nome do medidor (ex.: Energia Total (Trifásico) ou Água - Bloco A):");
    if (!name) return;
    const type = prompt("Tipo (agua | energia | energia-3f):", "energia-3f");
    if (!type) return;

    try {
      await http("/api/meters", {
        method: "POST",
        body: JSON.stringify({ name, type })
      });
      await preloadMeters();
      renderMeters();
      alert("Medidor criado com sucesso!");
    } catch (e) {
      alert("Erro: " + e.message);
    }
  };

  tbody.querySelectorAll("button[data-act='copy-token']").forEach(btn => {
    btn.onclick = async () => {
      const t = btn.getAttribute("data-token");
      if (!t) return alert("Este medidor não tem token.");
      await navigator.clipboard.writeText(t);
      btn.textContent = "Copiado!";
      setTimeout(() => (btn.textContent = "Copiar Token"), 1200);
    };
  });
}
