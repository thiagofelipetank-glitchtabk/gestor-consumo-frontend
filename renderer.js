// ============================================================
// Frontend 5.0 ULTIMATE (web/Vercel)
// - Login limpo
// - Dashboard mês: trifásico (A/B/C), custo por tarifa, última leitura
// - Filtros por tipo/medidor
// - Usuários: filtro + chips de permissões
// - Medidores: criar, copiar token, renomear fases A/B/C (local)
// - Backend: Render Cloud (URL fixa)
// ============================================================

const API = "https://gestor-consumo-backend.onrender.com";

let token = null;
let currentUser = null;
let metersCache = [];
let tariffs = { kwh_price: 0, m3_price: 0 };

// --------------- Helpers ---------------
async function http(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Phase labels (local) — { [meterId]: { A: "Apto 01", B: "Apto 02", C: "Apto 03" } }
function loadPhaseLabels() {
  try { return JSON.parse(localStorage.getItem("phase_labels") || "{}"); }
  catch { return {}; }
}
function savePhaseLabels(map) {
  localStorage.setItem("phase_labels", JSON.stringify(map));
}

// --------------- Sessão ---------------
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

// --------------- Navegação ---------------
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

// --------------- Init ---------------
async function initApp() {
  await Promise.all([preloadMeters(), preloadTariffs()]);
  prepareDashboardFilters();
  renderTariffBanner();
  renderDashboard();
}

// --------------- Dados básicos ---------------
async function preloadMeters() {
  metersCache = await http("/api/meters");
}
async function preloadTariffs() {
  try { tariffs = await http("/api/tariffs"); }
  catch { tariffs = { kwh_price: 0, m3_price: 0 }; }
}

function renderTariffBanner() {
  const el = document.getElementById("tariff-banner");
  el.innerHTML = `Tarifas vigentes: <b>Energia</b> R$ ${Number(tariffs.kwh_price||0).toFixed(2)}/kWh • <b>Água</b> R$ ${Number(tariffs.m3_price||0).toFixed(2)}/m³`;
}

// --------------- Filtros Dashboard ---------------
function prepareDashboardFilters() {
  const selType = document.getElementById("filter-type");
  const selMeter = document.getElementById("filter-meter");

  selMeter.innerHTML = `<option value="">Todos os medidores</option>` +
    metersCache.map(m => `<option value="${m.id}" data-type="${m.type}">${m.name} (${m.type})</option>`).join("");

  document.getElementById("refresh-dashboard").onclick = renderDashboard;
  selType.onchange = renderDashboard;
  selMeter.onchange = renderDashboard;
}

// --------------- Dashboard (resumo do mês) ---------------
async function renderDashboard() {
  const cont = document.getElementById("cards");
  cont.innerHTML = "<div class='card'><p>Carregando...</p></div>";

  const filterType = document.getElementById("filter-type").value;
  const filterMeterId = document.getElementById("filter-meter").value;
  const labels = loadPhaseLabels();

  try {
    await preloadMeters();
    const [summary] = await Promise.all([
      http("/api/summary/month")
    ]);

    // Agrupa por medidor
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

    // Render cards
    for (const m of listToShow) {
      const rows = byMeter.get(m.id) || [];
      let last = null;
      try { last = await http(`/api/readings/last/${m.id}`); } catch {}

      if (m.type === "energia-3f") {
        const faseA = rows.find(r => (r.meter_name || "").includes("Fase A"));
        const faseB = rows.find(r => (r.meter_name || "").includes("Fase B"));
        const faseC = rows.find(r => (r.meter_name || "").includes("Fase C"));
        const a = Number(faseA ? faseA.total : 0);
        const b = Number(faseB ? faseB.total : 0);
        const c = Number(faseC ? faseC.total : 0);

        const map = labels[m.id] || { A: "Fase A", B: "Fase B", C: "Fase C" };
        cont.appendChild(card(
          `${m.name} — ${map.A}`,
          `${a.toFixed(2)} kWh`,
          `≈ R$ ${(a * (tariffs.kwh_price || 0)).toFixed(2)}`,
          last ? `Última: ${last.value?.toFixed?.(2) ?? last.value} (${(last.created_at||"").replace("T"," ").slice(0,19)})` : "Sem última leitura"
        ));
        cont.appendChild(card(
          `${m.name} — ${map.B}`,
          `${b.toFixed(2)} kWh`,
          `≈ R$ ${(b * (tariffs.kwh_price || 0)).toFixed(2)}`,
          last ? `Última: ${last.value?.toFixed?.(2) ?? last.value} (${(last.created_at||"").replace("T"," ").slice(0,19)})` : "Sem última leitura"
        ));
        cont.appendChild(card(
          `${m.name} — ${map.C}`,
          `${c.toFixed(2)} kWh`,
          `≈ R$ ${(c * (tariffs.kwh_price || 0)).toFixed(2)}`,
          last ? `Última: ${last.value?.toFixed?.(2) ?? last.value} (${(last.created_at||"").replace("T"," ").slice(0,19)})` : "Sem última leitura"
        ));
      } else if (m.type === "energia") {
        const total = rows.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
        cont.appendChild(card(
          `${m.name} (Energia)`,
          `${total.toFixed(2)} kWh`,
          `≈ R$ ${(total * (tariffs.kwh_price || 0)).toFixed(2)}`,
          last ? `Última: ${last.value?.toFixed?.(2) ?? last.value} (${(last.created_at||"").replace("T"," ").slice(0,19)})` : "Sem última leitura"
        ));
      } else if (m.type === "agua") {
        const total = rows.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
        cont.appendChild(card(
          `${m.name} (Água)`,
          `${total.toFixed(2)} m³`,
          `≈ R$ ${(total * (tariffs.m3_price || 0)).toFixed(2)}`,
          last ? `Última: ${last.value?.toFixed?.(2) ?? last.value} (${(last.created_at||"").replace("T"," ").slice(0,19)})` : "Sem última leitura"
        ));
      } else {
        const total = rows.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
        cont.appendChild(card(
          `${m.name}`,
          `${total.toFixed(2)} unidades`,
          "",
          last ? `Última: ${last.value?.toFixed?.(2) ?? last.value} (${(last.created_at||"").replace("T"," ").slice(0,19)})` : "Sem última leitura"
        ));
      }
    }

    if (!cont.children.length) {
      cont.innerHTML = "<div class='card'><p>Nenhum dado para este mês com os filtros atuais.</p></div>";
    }
  } catch (e) {
    document.getElementById("cards").innerHTML = `<div class='card'><p>Erro: ${e.message}</p></div>`;
  }
}

function card(title, big, small = "", foot = "") {
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `<h3>${title}</h3><p style="font-size:1.25em;font-weight:600;">${big}</p>` +
                  (small ? `<p class="muted">${small}</p>` : "") +
                  (foot ? `<p class="muted">${foot}</p>` : "");
  return div;
}

// --------------- Usuários ---------------
async function renderUsers() {
  const tbody = document.querySelector("#users-table tbody");
  const filter = document.getElementById("filter-user").value.trim().toLowerCase();
  tbody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";

  try {
    // Backend ainda não lista todos; mostramos o logado com as permissões obtidas no login.
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
          <td><button class="mini-btn" data-act="edit" data-id="${u.id}" disabled style="opacity:.6;cursor:not-allowed;">Editar</button></td>
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

// --------------- Medidores ---------------
async function renderMeters() {
  const tbody = document.querySelector("#meters-table tbody");
  tbody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";

  try {
    await preloadMeters();
    if (!metersCache.length) {
      tbody.innerHTML = "<tr><td colspan='5'>Nenhum medidor cadastrado.</td></tr>";
    } else {
      const labels = loadPhaseLabels();
      tbody.innerHTML = "";
      metersCache.forEach(m => {
        const tr = document.createElement("tr");
        const created = (m.created_at || "").replace("T"," ").slice(0,19);
        const has3f = m.type === "energia-3f";
        const map = labels[m.id] || { A: "Fase A", B: "Fase B", C: "Fase C" };

        tr.innerHTML = `
          <td>${m.name}</td>
          <td>${m.type}${has3f ? ` <span class="tag">A/B/C</span>` : ""}</td>
          <td><code>${m.token || "-"}</code></td>
          <td>${created}</td>
          <td>
            <button class="mini-btn" data-act="copy-token" data-token="${m.token || ""}">Copiar Token</button>
            ${has3f ? `<button class="mini-btn" data-act="rename-phases" data-id="${m.id}">Renomear Fases</button>
            <div style="margin-top:6px;font-size:.85em;color:#475569;">${map.A} • ${map.B} • ${map.C}</div>` : ""}
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5">Erro: ${e.message}</td></tr>`;
  }

  // criar
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
      alert("Medidor criado com sucesso! Copie o token para configurar no equipamento.");
    } catch (e) {
      alert("Erro: " + e.message);
    }
  };

  // ações
  tbody.querySelectorAll("button[data-act='copy-token']").forEach(btn => {
    btn.onclick = async () => {
      const t = btn.getAttribute("data-token");
      if (!t) return alert("Este medidor não tem token.");
      await navigator.clipboard.writeText(t);
      btn.textContent = "Copiado!";
      setTimeout(() => (btn.textContent = "Copiar Token"), 1200);
    };
  });

  tbody.querySelectorAll("button[data-act='rename-phases']").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-id");
      const labels = loadPhaseLabels();
      const current = labels[id] || { A: "Fase A", B: "Fase B", C: "Fase C" };
      const A = prompt("Nome da Fase A:", current.A) ?? current.A;
      const B = prompt("Nome da Fase B:", current.B) ?? current.B;
      const C = prompt("Nome da Fase C:", current.C) ?? current.C;
      labels[id] = { A: A.trim() || "Fase A", B: B.trim() || "Fase B", C: C.trim() || "Fase C" };
      savePhaseLabels(labels);
      renderMeters();
      alert("Fases atualizadas para este medidor.");
    };
  });
}
