// ============================================================
// Frontend 4.7 PRO - Conecta ao backend Render
// - Login limpo (sem preencher email/senha)
// - Dashboard: resume mês por medidor/fase (energia-3f fatiado)
// - Usuários: lista + filtro + binding de permissões
// - Medidores: CRUD básico + exibição de token
// ============================================================

const API = window.APP_CONFIG.API_URL;
let token = null;
let currentUser = null;
let metersCache = [];

// --------------- Helpers HTTP ---------------
async function http(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
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
    msg.textContent = e.message;
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
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.getAttribute("data-target");
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.getElementById(target).classList.add("active");
    if (target === "dashboard") renderDashboard();
    if (target === "usuarios") renderUsers();
    if (target === "medidores") renderMeters();
  });
});

// --------------- Inicialização ---------------
async function initApp() {
  await preloadMeters();
  renderDashboard();
}

// --------------- Medidores (cache) ---------------
async function preloadMeters() {
  metersCache = await http("/api/meters");
}

// --------------- Dashboard (Resumo do mês) ---------------
async function renderDashboard() {
  const cont = document.getElementById("cards");
  cont.innerHTML = "<div class='card'><p>Carregando...</p></div>";

  try {
    await preloadMeters();
    // Pega sumário mensal (soma por meter_id/meter_name/type)
    const summary = await http("/api/summary/month");

    // Para medidores energia-3f, vamos derivar as 3 fases a partir do nome salvo:
    // O backend grava como "Nome do Medidor - Fase A/B/C".
    // Agrupamos por medidor e mostramos 3 cards (A/B/C).
    const byMeter = new Map(); // meter_id -> array
    summary.forEach(row => {
      if (!byMeter.has(row.meter_id)) byMeter.set(row.meter_id, []);
      byMeter.get(row.meter_id).push(row);
    });

    cont.innerHTML = "";
    metersCache.forEach(m => {
      const rows = byMeter.get(m.id) || [];
      if (m.type === "energia-3f") {
        // filtra fases
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
      cont.innerHTML = "<div class='card'><p>Nenhum dado para este mês ainda.</p></div>";
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

// --------------- Usuários (lista + filtro + permissões) ---------------
async function renderUsers() {
  const tbody = document.querySelector("#users-table tbody");
  const filter = document.getElementById("filter-user").value.trim().toLowerCase();
  tbody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";

  try {
    // Não temos rota GET /auth/users no backend atual,
    // então listaremos apenas o usuário logado como demonstração.
    // (Se quiser, eu te mando as rotas /auth/users, /auth/users/:id, etc.)
    const list = [currentUser]; // placeholder

    // filtra
    const filtered = list.filter(u =>
      (u.name || "").toLowerCase().includes(filter) ||
      (u.email || "").toLowerCase().includes(filter)
    );

    // monta
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

  // filtro live
  document.getElementById("filter-user").oninput = renderUsers;
}

function renderMeterChips(allowedIds) {
  if (!metersCache.length) return "-";
  return metersCache
    .filter(m => allowedIds.includes(String(m.id)))
    .map(m => `<span class="chip">${m.name}</span>`)
    .join(" ") || "<i>Sem permissões</i>";
}

// --------------- Medidores (lista + add) ---------------
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

  // ações da tabela (copiar token)
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
