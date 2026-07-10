const $ = (id) => document.getElementById(id);

let projects = [];
let currentProjectId = null;
let leads = [];
let selectedLeadId = null;

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("unauthorized");
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || res.statusText);
    return body;
  }
  if (!res.ok) throw new Error(res.statusText);
  return res;
}

function setStatus(msg) {
  $("action-status").textContent = msg || "";
}

function filterQuery() {
  const params = new URLSearchParams();
  const status = $("filter-status").value;
  const minScore = $("filter-min-score").value;
  const q = $("filter-q").value.trim();
  if (status) params.set("status", status);
  if (minScore !== "") params.set("minScore", minScore);
  if (q) params.set("q", q);
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function loadMe() {
  const me = await api("/api/me");
  $("user-info").textContent = `${me.name || me.email} · ${me.email}`;
  const health = await fetch("/health").then((r) => r.json());
  if (health.bypass) $("bypass-banner").classList.remove("hidden");
}

async function loadProjects() {
  projects = await api("/api/projects");
  const sel = $("project-select");
  sel.innerHTML = "";
  for (const p of projects) {
    const opt = document.createElement("option");
    opt.value = String(p.id);
    opt.textContent = p.name;
    sel.appendChild(opt);
  }
  if (!projects.length) {
    currentProjectId = null;
    return;
  }
  if (!currentProjectId || !projects.some((p) => p.id === currentProjectId)) {
    currentProjectId = projects[0].id;
  }
  sel.value = String(currentProjectId);
}

async function loadStats() {
  if (!currentProjectId) return;
  const s = await api(`/api/projects/${currentProjectId}/stats`);
  $("kpi-total").textContent = String(s.totalLeads);
  $("kpi-new").textContent = String(s.newThisWeek);
  $("kpi-approval").textContent =
    s.approvalRate == null ? "—" : `${Math.round(s.approvalRate * 100)}%`;
  $("kpi-reply").textContent = s.replyRate == null ? "—" : String(s.replyRate);
}

function renderLeads() {
  const body = $("leads-body");
  body.innerHTML = "";
  const sorted = [...leads].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  for (const lead of sorted) {
    const tr = document.createElement("tr");
    if (lead.id === selectedLeadId) tr.classList.add("selected");
    tr.innerHTML = `
      <td>${escapeHtml(lead.company)}</td>
      <td>${escapeHtml(lead.email || "")}</td>
      <td>${lead.score ?? ""}</td>
      <td>${escapeHtml(lead.status)}</td>
      <td>${escapeHtml((lead.sources || []).join(", "))}</td>`;
    tr.addEventListener("click", () => selectLead(lead.id));
    body.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function selectLead(id) {
  selectedLeadId = id;
  const lead = leads.find((l) => l.id === id);
  renderLeads();
  if (!lead) {
    $("detail-empty").classList.remove("hidden");
    $("detail-body").classList.add("hidden");
    return;
  }
  $("detail-empty").classList.add("hidden");
  $("detail-body").classList.remove("hidden");
  $("detail-company").textContent = lead.company;
  $("detail-meta").textContent = [
    lead.website || "no website",
    lead.email || "no email",
    `score ${lead.score ?? "—"}`,
    lead.status,
  ].join(" · ");
  $("detail-reasons").textContent = lead.reasons || "(no reasons yet)";
}

async function loadLeads() {
  if (!currentProjectId) {
    leads = [];
    renderLeads();
    return;
  }
  leads = await api(`/api/projects/${currentProjectId}/leads${filterQuery()}`);
  if (selectedLeadId && !leads.some((l) => l.id === selectedLeadId)) {
    selectedLeadId = null;
  }
  renderLeads();
  if (selectedLeadId) selectLead(selectedLeadId);
  else {
    $("detail-empty").classList.remove("hidden");
    $("detail-body").classList.add("hidden");
  }
}

async function refreshAll() {
  await loadProjects();
  await loadStats();
  await loadLeads();
}

$("project-select").addEventListener("change", async (e) => {
  currentProjectId = Number(e.target.value);
  selectedLeadId = null;
  await loadStats();
  await loadLeads();
});

$("new-project-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = String(fd.get("name") || "").trim();
  const icp = String(fd.get("icp") || "").trim();
  if (!name) return;
  const created = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, icp: icp || null }),
  });
  e.target.reset();
  currentProjectId = created.id;
  await refreshAll();
  setStatus(`Created project ${created.name}`);
});

$("btn-filter").addEventListener("click", () => loadLeads());
$("filter-q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadLeads();
});

$("btn-score").addEventListener("click", async () => {
  if (!currentProjectId) return;
  setStatus("Scoring…");
  const summary = await api(`/api/projects/${currentProjectId}/score`, {
    method: "POST",
    body: "{}",
  });
  await loadStats();
  await loadLeads();
  setStatus(`Scored ${summary.scored}, errors ${summary.errors}`);
});

async function downloadExport(preset) {
  if (!currentProjectId) return;
  const q = filterQuery();
  const sep = q ? "&" : "?";
  const url = `/api/projects/${currentProjectId}/export.csv${q}${sep}preset=${preset}`;
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = "/login";
    return;
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `leads-${currentProjectId}-${preset}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(`Exported ${preset}`);
}

$("btn-export-all").addEventListener("click", () => downloadExport("all"));
$("btn-export-emails").addEventListener("click", () =>
  downloadExport("emails_only")
);

$("import-file").addEventListener("change", async (e) => {
  if (!currentProjectId) return;
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  setStatus("Importing…");
  const summary = await api(`/api/projects/${currentProjectId}/import.csv`, {
    method: "POST",
    body: JSON.stringify({ csv: text }),
  });
  e.target.value = "";
  await loadStats();
  await loadLeads();
  setStatus(`Imported kept ${summary.kept}, rejected ${summary.rejected}`);
});

$("btn-approve").addEventListener("click", async () => {
  if (!currentProjectId || !selectedLeadId) return;
  const notes = $("detail-notes").value.trim() || null;
  await api(
    `/api/projects/${currentProjectId}/leads/${selectedLeadId}/approve`,
    { method: "POST", body: JSON.stringify({ notes }) }
  );
  await loadStats();
  await loadLeads();
  setStatus("Approved");
});

$("btn-reject").addEventListener("click", async () => {
  if (!currentProjectId || !selectedLeadId) return;
  const notes = $("detail-notes").value.trim() || null;
  await api(
    `/api/projects/${currentProjectId}/leads/${selectedLeadId}/reject`,
    { method: "POST", body: JSON.stringify({ notes }) }
  );
  await loadStats();
  await loadLeads();
  setStatus("Rejected");
});

(async function init() {
  try {
    await loadMe();
    await refreshAll();
  } catch (err) {
    setStatus(err.message || String(err));
  }
})();
