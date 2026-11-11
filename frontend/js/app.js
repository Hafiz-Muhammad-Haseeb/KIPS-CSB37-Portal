function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  const success = type === "success";
  toast.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-xl text-xs font-black text-white transition-all transform translate-y-2 opacity-0 flex items-center space-x-2 ${success ? "bg-emerald-600" : "bg-rose-600"}`;

  const icon = document.createElement("i");
  icon.className = `fa-solid ${success ? "fa-circle-check" : "fa-triangle-exclamation"} text-sm`;
  icon.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.textContent = String(message ?? "");

  toast.append(icon, text);
  container.appendChild(toast);

  requestAnimationFrame(() =>
    toast.classList.remove("translate-y-2", "opacity-0"),
  );
  window.setTimeout(() => {
    toast.classList.add("translate-y-2", "opacity-0");
    window.setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function sanitizeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );
}

// =========================================
// SHARED DATA / FORMATTING HELPERS
// =========================================
function getLocalISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPKR(value) {
  const amount = Number(value || 0);
  return `PKR ${Number.isFinite(amount) ? amount.toLocaleString("en-PK") : "0"}`;
}

function safeStorageGet(key, fallback = null) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch (error) {
    console.warn(`Browser storage unavailable for ${key}.`, error);
    return fallback;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
    return true;
  } catch (error) {
    console.warn(`Browser storage unavailable for ${key}.`, error);
    return false;
  }
}

function getFineFinancials(fine) {
  const assessed = Math.max(
    0,
    Number(
      fine?.amount ?? fine?.assessedAmountPkr ?? fine?.assessed_amount_pkr ?? 0,
    ) || 0,
  );
  const rawPaid = fine?.paidAmount ?? fine?.paid_amount;
  const rawWaived = fine?.waivedAmount ?? fine?.waived_amount;
  const status = String(fine?.status || "").toUpperCase();
  const paid = Math.max(
    0,
    Number(rawPaid ?? (status === "PAID" ? assessed : 0)) || 0,
  );
  const waived = Math.max(
    0,
    Number(
      rawWaived ?? (status === "WAIVED" ? Math.max(0, assessed - paid) : 0),
    ) || 0,
  );
  return { assessed, paid, waived, due: Math.max(0, assessed - paid - waived) };
}

function getFineDisplayStatus(fine) {
  const raw = String(fine?.status || "PENDING").toUpperCase();
  if (raw === "CANCELLED") return "Cancelled";
  const { assessed, paid, waived } = getFineFinancials(fine);
  if (waived > 0 && paid + waived >= assessed) return "Waived";
  if (assessed > 0 && paid >= assessed) return "Paid";
  if (paid > 0) return "Partial";
  if (raw === "UNPAID" || raw === "PENDING") return "Pending";
  if (raw === "OVERDUE") return "Overdue";
  return fine?.status || "Pending";
}

let recordIdSequence = 0;

function generateUniqueRecordId(prefix, records) {
  const existingIds = new Set(records.map((record) => String(record.id)));

  let id;

  do {
    recordIdSequence += 1;

    const timestamp = Date.now().toString(36).toUpperCase();

    id = `${prefix}-${timestamp}-${recordIdSequence.toString(36).toUpperCase()}`;
  } while (existingIds.has(id));

  return id;
}

// APPLICATION DATA
// Real portal records are loaded from the authenticated Spring Boot API.
// localStorage is intentionally not used for student/fine/payment/expense records.
let students = [];
let fines = [];
let expenses = [];
let accessLogs = [];

let currentUserRole = "GUEST";
let currentStudentFilter = "ALL";
let currentView = "dashboard";

let sessionStartTime = null;

let barChartInstance = null;
let statusChartInstance = null;

let base64ProofImage = "";

function saveData() {
  // Compatibility only: student/fine/payment/expense/audit data is persisted by Spring Boot.
  // Do not add business records to localStorage here.
  return false;
}

function toggleTheme() {
  const html = document.documentElement;
  const nextTheme = html.classList.contains("dark") ? "light" : "dark";
  html.classList.toggle("dark", nextTheme === "dark");
  safeStorageSet("kips_theme", nextTheme);
  syncThemeIcon();
  if (currentView === "analytics") renderCharts();
}

function syncThemeIcon() {
  const icon = document.getElementById("themeToggleIcon");
  if (!icon) return;
  icon.className = document.documentElement.classList.contains("dark")
    ? "fa-solid fa-sun text-sm text-amber-400"
    : "fa-solid fa-moon text-sm text-amber-600";
}

function applyThemeOnLoad() {
  const savedTheme = safeStorageGet("kips_theme", "dark");
  const theme = savedTheme === "light" ? "light" : "dark";
  document.documentElement.classList.toggle("dark", theme === "dark");
  syncThemeIcon();
}

function openTermsModal() {
  document.getElementById("termsModal")?.classList.remove("hidden");
}

function closeTermsModal() {
  document.getElementById("termsModal")?.classList.add("hidden");
}

// =========================================
// LOGIN SYSTEM
// =========================================

async function handlePortalLogin(event) {
  event.preventDefault();
  const username = document.getElementById("loginUsername")?.value.trim();
  const password = document.getElementById("loginIdentifier")?.value || "";
  const form = event.currentTarget;

  if (!username || !password) {
    showToast("Username aur password dono required hain.", "error");
    return;
  }
  if (!window.CSB37API || !window.CSB37Auth) {
    showToast(
      "Authentication module load nahi hua. Page ko local web server se open karein.",
      "error",
    );
    return;
  }

  setFormBusy(form, true);
  try {
    await window.CSB37API.login({ username, password });
    currentUserRole = window.CSB37Auth.user.role;
    sessionStartTime = Date.now();
    if (!window.CSB37Portal?.reload)
      throw new Error("Server data module load nahi hua.");
    await window.CSB37Portal.reload();
    document.getElementById("view-login")?.classList.add("hidden");
    document.getElementById("appContainer")?.classList.remove("hidden");
    applyRoleUI();
    switchView("dashboard");
    showToast(`Welcome ${window.CSB37Auth.user.name || username}.`, "success");
  } catch (error) {
    showToast(error.message || "Login unsuccessful.", "error");
  } finally {
    setFormBusy(form, false);
  }
}

function handleLogout() {
  window.CSB37Auth?.clear();
  currentUserRole = "GUEST";
  currentStudentFilter = "ALL";
  students = [];
  fines = [];
  expenses = [];
  accessLogs = [];
  sessionStartTime = null;
  base64ProofImage = "";

  closeSidebar();
  document.getElementById("appContainer")?.classList.add("hidden");
  document.getElementById("view-login")?.classList.remove("hidden");
  const username = document.getElementById("loginUsername");
  const password = document.getElementById("loginIdentifier");
  if (username) username.value = "";
  if (password) password.value = "";
  showToast("Signed out. Please sign in again.", "success");
}

function setSidebarOpen(shouldOpen) {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (!sidebar || !overlay) return;

  // Desktop: sidebar remains in the layout and overlay never captures input.
  if (window.innerWidth >= 1024) {
    sidebar.classList.remove("-translate-x-full");
    overlay.classList.add("hidden", "pointer-events-none");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("sidebar-open");
    return;
  }

  sidebar.classList.toggle("-translate-x-full", !shouldOpen);
  overlay.classList.toggle("hidden", !shouldOpen);
  overlay.classList.toggle("pointer-events-none", !shouldOpen);
  overlay.setAttribute("aria-hidden", String(!shouldOpen));
  document.body.classList.toggle("sidebar-open", shouldOpen);
}

function openSidebar() {
  setSidebarOpen(true);
}

function closeSidebar() {
  setSidebarOpen(false);
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  setSidebarOpen(sidebar.classList.contains("-translate-x-full"));
}

function setFormBusy(form, busy) {
  if (!form) return;
  form
    .querySelectorAll('button[type="submit"], input[type="submit"]')
    .forEach((button) => {
      button.disabled = Boolean(busy);
      button.classList.toggle("opacity-60", Boolean(busy));
      button.classList.toggle("cursor-not-allowed", Boolean(busy));
      button.setAttribute("aria-busy", String(Boolean(busy)));
    });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidebar();
});

window.addEventListener("resize", () => setSidebarOpen(false));

function applyRoleUI() {
  const role = window.CSB37Auth?.user?.role || currentUserRole || "GUEST";
  currentUserRole = role;
  const isAdmin = role === "ADMIN";
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("hidden", !isAdmin);
  });
  document.querySelectorAll(".student-only").forEach((element) => {
    element.classList.toggle("hidden", isAdmin || role === "GUEST");
  });
}

function populateStudentSelectors() {
  const headerSelect = document.getElementById("studentSelector");
  const modalSelect = document.getElementById("modalStudentSelect");
  const options = students.map((student) => ({
    roll: String(student.roll ?? student.rollNumber ?? ""),
    name: String(student.name ?? student.fullName ?? ""),
  }));

  if (headerSelect) {
    headerSelect.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "ALL";
    allOption.textContent = "ALL (Class Overview)";
    headerSelect.appendChild(allOption);
    options.forEach((student) => {
      const option = document.createElement("option");
      option.value = student.roll;
      option.textContent = `${student.roll} - ${student.name}`;
      headerSelect.appendChild(option);
    });
    headerSelect.value = options.some(
      (student) => student.roll === currentStudentFilter,
    )
      ? currentStudentFilter
      : "ALL";
  }

  if (modalSelect) {
    modalSelect.replaceChildren();
    options.forEach((student) => {
      const option = document.createElement("option");
      option.value = student.roll;
      option.textContent = `${student.roll} - ${student.name}`;
      modalSelect.appendChild(option);
    });
  }
}

function changeStudentProfile() {
  if (currentUserRole !== "ADMIN") return;
  const selector = document.getElementById("studentSelector");
  if (!selector) return;
  currentStudentFilter = selector.value || "ALL";
  refreshAllViews();
}

// =========================================
// VIEW NAVIGATION
// =========================================

function switchView(viewId) {
  const role = window.CSB37Auth?.user?.role || currentUserRole;
  const adminOnlyViews = ["whatsapp", "attendance", "accesslogs", "settings"];
  if (adminOnlyViews.includes(viewId) && role !== "ADMIN") {
    showToast("Admin permission required.", "error");
    closeSidebar();
    return;
  }

  const targetView = document.getElementById(`view-${viewId}`);
  if (!targetView) {
    console.warn(`CSB-37 Nexus: view not found: ${viewId}`);
    showToast("Requested page is not available.", "error");
    closeSidebar();
    return;
  }

  currentView = viewId;
  document
    .querySelectorAll(".content-view")
    .forEach((view) => view.classList.add("hidden"));
  targetView.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.remove(
      "bg-slate-800/80",
      "text-white",
      "border-amber-500/30",
    );
    button.setAttribute("aria-current", "false");
  });
  const activeButton = document.getElementById(`nav-${viewId}`);
  if (activeButton) {
    activeButton.classList.add(
      "bg-slate-800/80",
      "text-white",
      "border-amber-500/30",
    );
    activeButton.setAttribute("aria-current", "page");
  }

  const titles = {
    dashboard: "Dashboard Overview",
    fines: "Fine Records Database",
    students: "Students Directory",
    rules: "Rules & Policies Portal",
    analytics: "Analytics & Charts",
    appeals: "Dispute Appeals Management",
    calculator: "Fine Estimator Tool",
    fund: "Class Fund & Expenses Ledger",
    accesslogs: "Access & Session Telemetry Logs",
    settings: "Settings & Backup",
    attendance: "Attendance Register",
    leaves:
      role === "ADMIN" ? "Leave Applications Management" : "Apply for Leave",
    whatsapp: "WhatsApp Management",
    updates: "New Updates & Announcements",
  };
  const title = document.getElementById("pageTitle");
  if (title) title.textContent = titles[viewId] || "Portal";

  closeSidebar();
  refreshAllViews();

  if (
    viewId === "attendance" &&
    typeof window.loadAttendanceRegister === "function"
  )
    window.loadAttendanceRegister();
  if (viewId === "leaves" && typeof window.renderLeaves === "function")
    window.renderLeaves();
  if (
    viewId === "whatsapp" &&
    typeof window.renderWhatsAppManagement === "function"
  )
    window.renderWhatsAppManagement();
  if (viewId === "updates" && typeof window.renderAnnouncements === "function")
    window.renderAnnouncements();
}

function refreshAllViews() {
  const renderers = [
    updateStats,
    renderDashboardRecent,
    renderHonorRoll,
    renderFinesTable,
    renderStudentsDirectory,
    renderExpensesTable,
    renderAppeals,
    renderAccessLogs,
    updateAppealsBadge,
  ];
  renderers.forEach((renderer) => {
    try {
      if (typeof renderer === "function") renderer();
    } catch (error) {
      console.error(
        `CSB-37 render error in ${renderer.name || "view"}:`,
        error,
      );
    }
  });
  if (currentView === "analytics") {
    try {
      renderCharts();
    } catch (error) {
      console.error("Analytics rendering failed:", error);
    }
  }
}

function getFilteredFines() {
  const rows = Array.isArray(fines) ? fines : [];
  if (currentUserRole === "ADMIN" && currentStudentFilter === "ALL")
    return rows;
  return rows.filter(
    (fine) =>
      String(fine.roll ?? fine.rollNumber ?? "") ===
      String(currentStudentFilter),
  );
}

function updateStats() {
  const list = getFilteredFines().filter(
    (fine) => getFineDisplayStatus(fine) !== "Cancelled",
  );
  const totalCollected = list.reduce(
    (sum, fine) => sum + getFineFinancials(fine).paid,
    0,
  );
  const totalWaived = list.reduce(
    (sum, fine) => sum + getFineFinancials(fine).waived,
    0,
  );
  const totalPending = list.reduce(
    (sum, fine) => sum + getFineFinancials(fine).due,
    0,
  );
  const totalSpent = (expenses || []).reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );
  const remainingFund = totalCollected - totalSpent;

  const values = {
    statTotalCollected: formatPKR(totalCollected),
    statTotalSpent: formatPKR(totalSpent),
    statRemainingFund: formatPKR(remainingFund),
    statTotalPending: formatPKR(totalPending),
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });

  const waivedElement = document.getElementById("statTotalWaived");
  if (waivedElement) waivedElement.textContent = formatPKR(totalWaived);
}

function renderHonorRoll() {
  const container = document.getElementById("honorRollContainer");
  if (!container) return;
  container.replaceChildren();
  const eligible = students.filter((student) => {
    const activeFines = fines.filter(
      (fine) =>
        String(fine.roll) === String(student.roll) &&
        getFineDisplayStatus(fine) !== "Cancelled",
    );
    return activeFines.every((fine) => getFineFinancials(fine).due <= 0);
  });
  if (!eligible.length) {
    container.innerHTML =
      '<span class="text-xs text-slate-400 font-bold">No students currently on honor roll.</span>';
    return;
  }
  eligible.forEach((student) => {
    const badge = document.createElement("div");
    badge.className =
      "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-black flex items-center space-x-1.5 shadow-sm";
    badge.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-500" aria-hidden="true"></i><span>${sanitizeHTML(student.name)} (${sanitizeHTML(student.roll)})</span>`;
    container.appendChild(badge);
  });
}

// =========================================
// DASHBOARD RECENT FINE RECORDS
// =========================================

function renderDashboardRecent() {
  const tbody = document.getElementById("dashboardRecentTable");
  if (!tbody) return;
  tbody.replaceChildren();

  const rows = [...getFilteredFines()]
    .sort((a, b) => {
      const left = String(a.occurrenceDate ?? a.date ?? "");
      const right = String(b.occurrenceDate ?? b.date ?? "");
      return right.localeCompare(left);
    })
    .slice(0, 5);

  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="py-4 text-center text-slate-400 font-semibold">No recent fine records found.</td></tr>';
    return;
  }

  rows.forEach((fine) => {
    const row = document.createElement("tr");
    const status = getFineDisplayStatus(fine);
    const statusClass =
      status === "Paid"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
        : status === "Waived"
          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
          : status === "Cancelled"
            ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    row.innerHTML = `
      <td class="py-3"><div class="font-bold">${sanitizeHTML(fine.name)}</div><div class="text-[11px] text-slate-400">${sanitizeHTML(fine.roll)}</div></td>
      <td class="py-3 font-medium text-slate-600 dark:text-slate-300">${sanitizeHTML(fine.reason)}</td>
      <td class="py-3 font-black">${formatPKR(getFineFinancials(fine).assessed)}</td>
      <td class="py-3"><span class="px-2.5 py-1 rounded-full text-xs font-black ${statusClass}">${sanitizeHTML(status)}</span></td>`;
    tbody.appendChild(row);
  });
}

function renderFinesTable() {
  const tbody = document.getElementById("finesTableBody");
  if (!tbody) return;
  tbody.replaceChildren();

  const search = String(document.getElementById("searchInput")?.value || "")
    .trim()
    .toLowerCase();
  const statusFilter = document.getElementById("statusFilter")?.value || "ALL";
  const reasonFilter = document.getElementById("reasonFilter")?.value || "ALL";
  const rows = getFilteredFines().filter((fine) => {
    const name = String(fine.name ?? "");
    const roll = String(fine.roll ?? "");
    const reason = String(fine.reason ?? "");
    const status = getFineDisplayStatus(fine);
    const searchMatch =
      !search || `${name} ${roll} ${reason}`.toLowerCase().includes(search);
    const statusMatch =
      statusFilter === "ALL" ||
      status === statusFilter ||
      (statusFilter === "Pending" && status === "Overdue");
    const reasonMatch = reasonFilter === "ALL" || reason === reasonFilter;
    return searchMatch && statusMatch && reasonMatch;
  });

  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="py-6 text-center text-slate-400 font-semibold">No matching fine records found.</td></tr>';
    return;
  }

  rows.forEach((fine) => {
    const id = String(fine.id ?? "");
    const safeId = sanitizeHTML(id);
    const { assessed, paid, waived, due } = getFineFinancials(fine);
    const status = getFineDisplayStatus(fine);
    const isAdmin = currentUserRole === "ADMIN";
    const appeal = fine.appeal || null;
    let statusClass =
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    if (status === "Paid")
      statusClass =
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300";
    else if (status === "Waived")
      statusClass =
        "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300";
    else if (status === "Cancelled")
      statusClass =
        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    else if (status === "Partial")
      statusClass =
        "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300";

    let actionHTML = "";
    if (isAdmin) {
      const canCancel = paid === 0 && waived === 0 && status !== "Cancelled";
      const canPay = due > 0 && status !== "Cancelled";
      actionHTML = `<div class="flex flex-wrap items-center justify-center gap-1.5">
        <button type="button" onclick="toggleFineStatus('${safeId}')" title="Record payment" ${!canPay ? "disabled" : ""} class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"><i class="fa-solid fa-money-bill-wave"></i></button>
        <button type="button" onclick="editFine('${safeId}')" title="Edit" class="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold"><i class="fa-solid fa-pen"></i></button>
        <button type="button" onclick="waiveFineBalance('${safeId}')" title="Record approved waiver" ${due <= 0 || status === "Cancelled" ? "disabled" : ""} class="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold disabled:opacity-40"><i class="fa-solid fa-hand-holding-heart"></i></button>
        <button type="button" onclick="deleteFine('${safeId}')" title="Cancel fine (only if no payment/waiver)" ${!canCancel ? "disabled" : ""} class="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-bold disabled:opacity-40"><i class="fa-solid fa-ban"></i></button>
        ${paid > 0 ? `<button type="button" onclick="openReceiptModal('${safeId}')" title="Statement / receipt" class="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold"><i class="fa-solid fa-print"></i></button>` : ""}
      </div>`;
    } else if (due <= 0 && paid > 0) {
      actionHTML = `<button type="button" onclick="openReceiptModal('${safeId}')" class="bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 font-black text-xs px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800"><i class="fa-solid fa-file-invoice mr-1"></i> Statement</button>`;
    } else if (appeal) {
      const appealStatus = String(appeal.status || "Pending");
      actionHTML = `<div class="flex flex-wrap items-center gap-1.5 justify-center"><span class="text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800">Appeal: ${sanitizeHTML(appealStatus)}</span>${appeal.proofFileId || appeal.image ? `<button type="button" onclick="openProofViewerForFine('${safeId}')" class="p-1.5 bg-slate-100 dark:bg-slate-800 text-amber-500 rounded-lg" title="View attached proof"><i class="fa-solid fa-image"></i></button>` : ""}</div>`;
    } else if (due > 0 && !["Cancelled", "Waived"].includes(status)) {
      actionHTML = `<button type="button" onclick="openAppealModal('${safeId}')" class="bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 text-rose-600 dark:text-rose-300 font-black text-xs px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 transition-all">Dispute Appeal</button>`;
    }

    const row = document.createElement("tr");
    row.className = "hover:bg-[#f7f5f0] dark:hover:bg-[#12171e] transition-all";
    row.innerHTML = `
      <td class="py-3 px-4 font-bold text-slate-500 dark:text-slate-400">${sanitizeHTML(fine.roll)}</td>
      <td class="py-3 px-4 font-black text-[#1e2530] dark:text-white">${sanitizeHTML(fine.name)}</td>
      <td class="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">${sanitizeHTML(fine.reason)}</td>
      <td class="py-3 px-4 font-black"><div>${formatPKR(assessed)}</div><div class="mt-1 text-[10px] leading-4 font-semibold text-slate-500 dark:text-slate-400">Paid ${formatPKR(paid)} · Waived ${formatPKR(waived)}<br>Due ${formatPKR(due)}</div></td>
      <td class="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 font-bold">${sanitizeHTML(String(fine.date || ""))}</td>
      <td class="py-3 px-4"><span class="px-2.5 py-1 rounded-full text-xs font-black ${statusClass}">${sanitizeHTML(status)}</span></td>
      <td class="py-3 px-4 text-center">${actionHTML}</td>`;
    tbody.appendChild(row);
  });
}

function renderStudentsDirectory() {
  const grid = document.getElementById("studentsDirectoryGrid");

  if (!grid) return;

  grid.innerHTML = "";

  students.forEach((s) => {
    const studentFines = fines.filter((f) => f.roll === s.roll);

    const totalDue = studentFines
      .filter((f) => f.status === "Pending")
      .reduce((sum, f) => sum + f.amount, 0);

    const totalPaid = studentFines
      .filter((f) => f.status === "Paid")
      .reduce((sum, f) => sum + f.amount, 0);

    const card = document.createElement("div");

    card.className = "card-premium p-5 rounded-2xl shadow-sm space-y-3";

    card.innerHTML = `
            <div class="flex justify-between items-start">

                <div>
                    <span class="text-xs font-black text-amber-600 bg-amber-50 dark:bg-amber-900/40 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800">

                        ${sanitizeHTML(s.roll)}

                    </span>

                    <h4 class="font-black text-base mt-2">
                        ${sanitizeHTML(s.name)}
                    </h4>
                </div>

                <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold border border-indigo-200 dark:border-indigo-800">

                    <i class="fa-solid fa-user-graduate"></i>

                </div>

            </div>

            <div class="grid grid-cols-2 gap-2 pt-2 text-xs font-bold">

                <div class="bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300">

                    <span>Pending Dues</span>

                    <div class="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">
                        PKR ${totalDue}
                    </div>

                </div>

                <div class="bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300">

                    <span>Cleared</span>

                    <div class="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                        PKR ${totalPaid}
                    </div>

                </div>

            </div>

            <div class="pt-2 flex justify-between items-center text-xs">

                <button onclick="viewStudentProfileFines('${s.roll}')"
                    class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">

                    View Fines &rarr;

                </button>

                ${
                  currentUserRole === "ADMIN"
                    ? `
                            <button onclick="confirmRemoveStudent('${sanitizeHTML(s.roll)}', '${sanitizeHTML(s.name.replace(/'/g, "\\'"))}')"
                                class="text-rose-500 hover:text-rose-700 font-bold"
                                title="Remove Student">

                                <i class="fa-solid fa-trash"></i>

                            </button>
                        `
                    : ""
                }

            </div>
        `;

    grid.appendChild(card);
  });
}

// =========================================
// STUDENT & EXPENSE DELETE SYSTEM
// =========================================

let studentRollToDelete = null;
let expenseIdToDelete = null;

function confirmRemoveStudent(roll, name) {
  // Only admin is allowed to remove students
  if (currentUserRole !== "ADMIN") {
    showToast("Only an administrator can remove students.", "error");

    return;
  }

  studentRollToDelete = String(roll || "");

  expenseIdToDelete = null;

  const message = document.getElementById("deleteModalText");
  const modal = document.getElementById("customDeleteModal");

  if (!studentRollToDelete || !message || !modal) {
    showToast("Unable to open the student removal dialog.", "error");

    return;
  }

  message.textContent = `Permanently remove student ${name} (${studentRollToDelete}) and all associated fines?`;

  modal.classList.remove("hidden");
}

function confirmRemoveExpense(id) {
  studentRollToDelete = null;

  expenseIdToDelete = id;

  document.getElementById("deleteModalText").innerText =
    "Permanently remove this class expense record?";

  document.getElementById("customDeleteModal").classList.remove("hidden");
}

function closeDeleteModal() {
  studentRollToDelete = null;

  expenseIdToDelete = null;

  document.getElementById("customDeleteModal").classList.add("hidden");
}

// =========================================
// EXECUTE STUDENT / EXPENSE REMOVAL
// =========================================

function executeItemRemoval() {
  if (currentUserRole !== "ADMIN") {
    closeDeleteModal();

    showToast("Only an administrator can remove records.", "error");

    return;
  }

  if (studentRollToDelete) {
    const rollToRemove = studentRollToDelete;

    const exists = students.some((s) => s.roll === rollToRemove);

    if (!exists) {
      closeDeleteModal();

      showToast(
        "Student record was not found. Refresh and try again.",
        "error",
      );

      return;
    }

    // Remove selected student
    students = students.filter((s) => s.roll !== rollToRemove);

    // Remove all fines belonging to that student
    fines = fines.filter((f) => f.roll !== rollToRemove);

    // Reset the current student filter if necessary
    if (currentStudentFilter === rollToRemove) {
      currentStudentFilter = "ALL";
    }

    saveData();

    // Update student selection dropdowns
    populateStudentSelectors();

    closeDeleteModal();

    refreshAllViews();

    showToast(
      "Student permanently removed along with associated records.",
      "success",
    );
  } else if (expenseIdToDelete) {
    const idToRemove = expenseIdToDelete;

    expenses = expenses.filter((e) => e.id !== idToRemove);

    saveData();

    closeDeleteModal();

    refreshAllViews();

    showToast("Class expense record deleted successfully.", "success");
  } else {
    closeDeleteModal();

    showToast("No record was selected for removal.", "error");
  }
}

// =========================================
// VIEW SPECIFIC STUDENT FINE PROFILE
// =========================================

function viewStudentProfileFines(roll) {
  currentStudentFilter = roll;

  const selector = document.getElementById("studentSelector");

  if (selector) {
    selector.value = roll;
  }

  switchView("fines");

  const search = document.getElementById("searchInput");

  if (search) {
    search.value = roll;
  }

  renderFinesTable();
}
// =========================================
// CLASS FUND & EXPENSES TABLE
// =========================================

function renderExpensesTable() {
  const tbody = document.getElementById("expensesTableBody");
  if (!tbody) return;
  tbody.replaceChildren();

  const activeFines = (fines || []).filter(
    (fine) => getFineDisplayStatus(fine) !== "Cancelled",
  );
  const totalCollected = activeFines.reduce(
    (sum, fine) => sum + getFineFinancials(fine).paid,
    0,
  );
  const totalSpent = (expenses || []).reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );
  const remaining = totalCollected - totalSpent;

  const totals = {
    fundTotalCollected: formatPKR(totalCollected),
    fundTotalSpent: formatPKR(totalSpent),
    fundCurrentBalance: formatPKR(remaining),
  };
  Object.entries(totals).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });

  if (!expenses.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="py-6 text-center text-slate-400 font-semibold">No class expenses logged yet.</td></tr>';
    return;
  }

  [...expenses].reverse().forEach((expense) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-[#f7f5f0] dark:hover:bg-[#12171e] transition-all";
    const action =
      currentUserRole === "ADMIN"
        ? `<button type="button" onclick="confirmRemoveExpense('${sanitizeHTML(String(expense.id))}')" title="Delete Expense" class="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-bold"><i class="fa-solid fa-trash"></i></button>`
        : "";
    row.innerHTML = `
      <td class="py-3 px-4 font-bold text-slate-500 dark:text-slate-400">${sanitizeHTML(String(expense.date || ""))}</td>
      <td class="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">${sanitizeHTML(String(expense.comment || ""))}</td>
      <td class="py-3 px-4"><span class="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-lg text-xs font-black">${sanitizeHTML(String(expense.category || ""))}</span></td>
      <td class="py-3 px-4 font-black text-rose-600 dark:text-rose-400">${formatPKR(expense.amount)}</td>
      <td class="py-3 px-4 text-center admin-only">${action}</td>`;
    tbody.appendChild(row);
  });
  applyRoleUI();
}

// =========================================
// ACCESS & SESSION LOGS
// =========================================

function renderAccessLogs() {
  const tbody = document.getElementById("accessLogsTableBody");

  if (!tbody) return;

  tbody.innerHTML = "";

  if (currentUserRole !== "ADMIN") {
    tbody.innerHTML = `
            <tr>
                <td colspan="4"
                    class="py-6 text-center text-rose-500 font-semibold">
                    Administrator access required.
                </td>
            </tr>
        `;

    return;
  }

  if (accessLogs.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="4"
                    class="py-6 text-center text-slate-400 font-semibold">
                    No access telemetry logs recorded yet.
                </td>
            </tr>
        `;

    return;
  }

  accessLogs.forEach((log) => {
    const tr = document.createElement("tr");

    tr.className = "hover:bg-[#f7f5f0] dark:hover:bg-[#12171e] transition-all";

    const agent = String(log.agent || "");

    tr.innerHTML = `
            <td class="py-3 px-4 font-black text-cyan-600 dark:text-cyan-400">
                ${sanitizeHTML(String(log.user || "Unknown"))}
            </td>

            <td class="py-3 px-4 font-bold text-slate-600 dark:text-slate-300">
                ${sanitizeHTML(String(log.timestamp || ""))}
            </td>

            <td class="py-3 px-4 text-xs font-semibold text-slate-500">
                ${sanitizeHTML(String(log.device || "Unknown"))}
                (${sanitizeHTML(agent.slice(0, 45))}...)
            </td>

            <td class="py-3 px-4 font-black text-emerald-600">
                ${sanitizeHTML(String(log.durationSeconds || "Active session"))}
            </td>
        `;

    tbody.appendChild(tr);
  });
}

// =========================================
// CLEAR ACCESS LOGS
// =========================================

function clearAccessLogs() {
  if (currentUserRole !== "ADMIN") {
    showToast("Administrator permission required.", "error");

    return;
  }

  if (!confirm("Clear all access and session telemetry logs?")) {
    return;
  }

  accessLogs = [];

  saveData();

  renderAccessLogs();

  showToast("Access logs cleared.", "success");
}

// =========================================
// DISPUTE & LEAVE APPEALS
// =========================================

function renderAppeals() {
  const container = document.getElementById("appealsContainer");

  if (!container) return;

  container.innerHTML = "";

  const list = getFilteredFines().filter(
    (f) => f.appeal !== null && f.appeal !== undefined,
  );

  if (list.length === 0) {
    container.innerHTML = `
            <div class="p-6 text-center text-slate-400 font-semibold card-premium rounded-xl">
                No dispute or emergency leave appeals submitted yet.
            </div>
        `;

    return;
  }

  list.forEach((f) => {
    const div = document.createElement("div");

    div.className = "card-premium p-4 rounded-xl space-y-3";

    let adminActions = "";

    if (currentUserRole === "ADMIN" && f.appeal.status === "Pending") {
      adminActions = `
                <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-[#e2dcd4] dark:border-[#334155]">

                    <button
                        onclick="resolveAppeal('${sanitizeHTML(String(f.id))}', 'Approved')"
                        class="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-3.5 py-2 rounded-xl shadow">

                        Clear / Forgive Fine
                    </button>

                    <button
                        onclick="resolveAppeal('${sanitizeHTML(String(f.id))}', 'Rejected')"
                        class="bg-rose-600 hover:bg-rose-700 text-white font-black text-xs px-3.5 py-2 rounded-xl shadow">

                        Reject Appeal
                    </button>

                </div>
            `;
    }

    const appealStatus = f.appeal.status || "Pending";

    const statusClass =
      appealStatus === "Approved"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
        : appealStatus === "Rejected"
          ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";

    div.innerHTML = `
            <div class="flex flex-wrap justify-between items-center gap-2">

                <span class="font-black text-sm">
                    ${sanitizeHTML(String(f.name))}
                    (${sanitizeHTML(String(f.roll))})
                </span>

                <span class="px-2.5 py-0.5 rounded-full text-xs font-black ${statusClass}">
                    ${sanitizeHTML(String(appealStatus))}
                </span>

            </div>

            <div class="text-xs text-slate-600 dark:text-slate-300 font-semibold">

                <span class="font-bold">Fine:</span>
                ${sanitizeHTML(String(f.reason))}
                (PKR ${Number(f.amount || 0)})

            </div>

            <div class="bg-slate-50 dark:bg-[#0f172a] p-3 rounded-lg border border-[#e2dcd4] dark:border-[#334155] text-xs font-semibold flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">

                <div class="break-words">
                    <span class="font-black">Student Note:</span>
                    ${sanitizeHTML(String(f.appeal.text || ""))}
                </div>

                ${
                  f.appeal.image
                    ? `
                            <button
                                onclick="openProofViewerForFine('${sanitizeHTML(String(f.id))}')"
                                class="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3 py-1.5 rounded-lg text-xs shrink-0 flex items-center space-x-1.5">

                                <i class="fa-solid fa-image"></i>
                                <span>View Proof</span>

                            </button>
                        `
                    : ""
                }

            </div>

            ${adminActions}
        `;

    container.appendChild(div);
  });
}

// =========================================
// ADD CLASS EXPENSE MODAL
// =========================================

function openAddExpenseModal() {
  if (currentUserRole !== "ADMIN") {
    showToast("Only administrators can add class expenses.", "error");

    return;
  }

  document.getElementById("expenseComment").value = "";

  document.getElementById("expenseAmount").value = "";

  document.getElementById("expenseDate").value = getLocalISODate();

  document.getElementById("expenseModal").classList.remove("hidden");
}

function closeAddExpenseModal() {
  document.getElementById("expenseModal").classList.add("hidden");
}

// =========================================
// SAVE CLASS EXPENSE
// =========================================

function saveExpense(e) {
  e.preventDefault();

  if (currentUserRole !== "ADMIN") {
    showToast("Administrator permission required.", "error");

    return;
  }

  const category = document.getElementById("expenseCategory").value;

  const comment = document.getElementById("expenseComment").value.trim();

  const amount = Number(document.getElementById("expenseAmount").value);

  const date = document.getElementById("expenseDate").value;

  if (
    !category ||
    !comment ||
    !date ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    showToast("Please enter valid expense details.", "error");

    return;
  }

  const newExp = {
    id: generateUniqueRecordId("E", expenses),
    category,
    comment,
    amount,
    date,
  };

  expenses.push(newExp);

  saveData();

  closeAddExpenseModal();

  refreshAllViews();

  showToast("Class expense logged successfully!", "success");
}

// =========================================
// APPEALS NOTIFICATION BADGE
// =========================================

function updateAppealsBadge() {
  const count = fines.filter(
    (f) => f.appeal && f.appeal.status === "Pending",
  ).length;

  const badge = document.getElementById("sidebarAppealsBadge");

  if (badge) {
    badge.innerText = count;
  }
}

// =========================================
// OPEN APPEAL MODAL
// =========================================

function openAppealModal(id) {
  if (currentUserRole !== "STUDENT") {
    showToast("Only students can submit their own fine appeals.", "error");

    return;
  }

  const fine = fines.find((item) => item.id === id);

  if (!fine || fine.roll !== currentStudentFilter) {
    showToast("You cannot submit an appeal for this fine.", "error");

    return;
  }

  if (fine.status !== "Pending") {
    showToast("Only pending fines can be disputed.", "error");

    return;
  }

  if (fine.appeal && fine.appeal.status === "Pending") {
    showToast("An appeal for this fine is already pending.", "error");

    return;
  }

  document.getElementById("appealFineId").value = id;

  document.getElementById("appealReasonText").value = "";

  document.getElementById("appealImageInput").value = "";

  document.getElementById("imagePreviewContainer").classList.add("hidden");

  document.getElementById("imagePreviewTag").src = "";

  base64ProofImage = "";

  document.getElementById("appealModal").classList.remove("hidden");
}

function closeAppealModal() {
  document.getElementById("appealModal").classList.add("hidden");

  base64ProofImage = "";
}

// =========================================
// IMAGE UPLOAD & PREVIEW
// =========================================

function handleImagePreview(e) {
  const file = e.target.files && e.target.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Please select a valid image file.", "error");

    e.target.value = "";

    return;
  }

  // Keep proof uploads small for reliable server transfer.
  const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

  if (file.size > MAX_IMAGE_SIZE) {
    showToast(
      "Image is too large. Please select an image under 2 MB.",
      "error",
    );

    e.target.value = "";

    return;
  }

  const reader = new FileReader();

  reader.onload = function (evt) {
    base64ProofImage = evt.target.result;

    const preview = document.getElementById("imagePreviewTag");
    const previewContainer = document.getElementById("imagePreviewContainer");

    if (preview && previewContainer) {
      preview.src = base64ProofImage;

      previewContainer.classList.remove("hidden");
    }
  };

  reader.onerror = function () {
    base64ProofImage = "";

    showToast("Unable to read the selected image.", "error");
  };

  reader.readAsDataURL(file);
}

// =========================================
// SUBMIT STUDENT APPEAL
// =========================================

function submitAppeal(e) {
  e.preventDefault();

  if (currentUserRole !== "STUDENT") {
    showToast("Only students can submit appeals.", "error");

    return;
  }

  const id = document.getElementById("appealFineId").value;

  const text = document.getElementById("appealReasonText").value.trim();

  if (!text) {
    showToast("Please explain your appeal.", "error");

    return;
  }

  if (!base64ProofImage) {
    showToast("Mandatory: Please attach your supporting proof image.", "error");

    return;
  }

  const fine = fines.find((item) => item.id === id);

  if (!fine || fine.roll !== currentStudentFilter) {
    showToast("Fine record not found or access denied.", "error");

    return;
  }

  if (fine.status !== "Pending") {
    showToast("Only pending fines can be appealed.", "error");

    return;
  }

  if (fine.appeal && fine.appeal.status === "Pending") {
    showToast("An appeal is already pending for this fine.", "error");

    return;
  }

  fine.appeal = {
    text,
    image: base64ProofImage,
    status: "Pending",
  };

  try {
    saveData();
  } catch (error) {
    console.error("Appeal save error:", error);

    fine.appeal = null;

    showToast("Storage limit reached. Please use a smaller image.", "error");

    return;
  }

  closeAppealModal();

  refreshAllViews();

  showToast("Dispute appeal with proof submitted successfully!", "success");
}

// =========================================
// APPEAL PROOF IMAGE VIEWER
// =========================================

function openProofViewer(imgSrc) {
  if (typeof imgSrc !== "string" || !imgSrc.startsWith("data:image/")) {
    showToast("Invalid proof image.", "error");

    return;
  }

  document.getElementById("proofModalImg").src = imgSrc;

  document.getElementById("proofViewerModal").classList.remove("hidden");
}

// Find proof using its fine record ID
function openProofViewerForFine(fineId) {
  const fine = fines.find((item) => item.id === fineId);

  if (!fine || !fine.appeal || !fine.appeal.image) {
    showToast("Proof image not found.", "error");

    return;
  }

  openProofViewer(fine.appeal.image);
}

function closeProofViewer() {
  document.getElementById("proofViewerModal").classList.add("hidden");

  document.getElementById("proofModalImg").src = "";
}

// =========================================
// FINE CALCULATOR
// =========================================

function calculateFineEstimate() {
  const tests = Math.max(
    0,
    parseInt(document.getElementById("calcTestDays")?.value || 0, 10) || 0,
  );

  const study = Math.max(
    0,
    parseInt(document.getElementById("calcStudyDays")?.value || 0, 10) || 0,
  );

  const saturdays = Math.max(
    0,
    parseInt(document.getElementById("calcSaturdays")?.value || 0, 10) || 0,
  );

  const incidents = Math.max(
    0,
    parseInt(document.getElementById("calcIncidents")?.value || 0, 10) || 0,
  );

  const tFine = tests * 200;

  const sFine = study * 150;

  const satFine = saturdays * 500;

  const incFine = incidents * 100;

  const total = tFine + sFine + satFine + incFine;

  const breakdownTest = document.getElementById("calcBreakdownTest");

  const breakdownStudy = document.getElementById("calcBreakdownStudy");

  const breakdownSaturday = document.getElementById("calcBreakdownSaturday");

  const breakdownIncidents = document.getElementById("calcBreakdownIncidents");

  const totalElement = document.getElementById("calcTotalEstimate");

  if (breakdownTest) {
    breakdownTest.innerText = `PKR ${tFine.toLocaleString()}`;
  }

  if (breakdownStudy) {
    breakdownStudy.innerText = `PKR ${sFine.toLocaleString()}`;
  }

  if (breakdownSaturday) {
    breakdownSaturday.innerText = `PKR ${satFine.toLocaleString()}`;
  }

  if (breakdownIncidents) {
    breakdownIncidents.innerText = `PKR ${incFine.toLocaleString()}`;
  }

  if (totalElement) {
    totalElement.innerText = `PKR ${total.toLocaleString()}`;
  }
}
// =========================================
// ANALYTICS & CHARTS
// =========================================

function renderCharts() {
  const isDark = document.documentElement.classList.contains("dark");

  const textColor = isDark ? "#f8fafc" : "#1e2530";
  const gridColor = isDark ? "#334155" : "#e2dcd4";

  const reasonSums = {};

  getFilteredFines().forEach((f) => {
    reasonSums[f.reason] = (reasonSums[f.reason] || 0) + Number(f.amount || 0);
  });

  const statusSums = {
    Paid: 0,
    Pending: 0,
  };

  getFilteredFines().forEach((f) => {
    if (f.status === "Paid") {
      statusSums.Paid += Number(f.amount || 0);
    }

    if (f.status === "Pending") {
      statusSums.Pending += Number(f.amount || 0);
    }
  });

  // BAR CHART
  if (barChartInstance) {
    barChartInstance.destroy();
    barChartInstance = null;
  }

  const canvas1 = document.getElementById("reasonsBarChart");

  if (canvas1 && typeof Chart !== "undefined") {
    const ctx1 = canvas1.getContext("2d");

    barChartInstance = new Chart(ctx1, {
      type: "bar",

      data: {
        labels: Object.keys(reasonSums),

        datasets: [
          {
            label: "Total Fine Amount (PKR)",
            data: Object.values(reasonSums),
            backgroundColor: "#f59e0b",
            borderRadius: 8,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            labels: {
              color: textColor,
              font: {
                weight: "bold",
              },
            },
          },
        },

        scales: {
          x: {
            ticks: {
              color: textColor,
              font: {
                size: 10,
              },
            },

            grid: {
              color: gridColor,
            },
          },

          y: {
            ticks: {
              color: textColor,
            },

            grid: {
              color: gridColor,
            },
          },
        },
      },
    });
  }

  // DOUGHNUT CHART
  if (statusChartInstance) {
    statusChartInstance.destroy();
    statusChartInstance = null;
  }

  const canvas2 = document.getElementById("statusChart");

  if (canvas2 && typeof Chart !== "undefined") {
    const ctx2 = canvas2.getContext("2d");

    statusChartInstance = new Chart(ctx2, {
      type: "doughnut",

      data: {
        labels: ["Paid Collections", "Pending Dues"],

        datasets: [
          {
            data: [statusSums.Paid, statusSums.Pending],

            backgroundColor: ["#10b981", "#f59e0b"],
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            labels: {
              color: textColor,
              font: {
                weight: "bold",
              },
            },
          },
        },
      },
    });
  }
}

// =========================================
// ADD FINE MODAL
// =========================================

function openAddFineModal() {
  if (currentUserRole !== "ADMIN") {
    showToast("Only an administrator can create fine records.", "error");
    return;
  }
  if (!students.length) {
    showToast("Please register a student before creating a fine.", "error");
    return;
  }
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  };
  setValue("fineEditId", "");
  const modalTitle = document.getElementById("fineModalTitle");
  if (modalTitle) modalTitle.textContent = "New Fine Entry";
  setValue("modalReasonSelect", "Absent during Test");
  setValue("modalAmountInput", "200");
  setValue("modalStatusSelect", "Pending");
  setValue("modalFineDate", getLocalISODate());
  setValue("modalWeekType", "");
  populateStudentSelectors();
  const studentSelect = document.getElementById("modalStudentSelect");
  if (studentSelect) studentSelect.disabled = false;
  document.getElementById("fineModal")?.classList.remove("hidden");
}

function closeFineModal() {
  document.getElementById("fineModal").classList.add("hidden");
}

// =========================================
// DEFAULT FINE AMOUNT
// =========================================

function updateDefaultAmount() {
  const reason = document.getElementById("modalReasonSelect").value;

  const amounts = {
    "Absent during Test": 200,
    "Leave during Test": 200,
    "Absent during Study Days": 150,
    "Absent on Saturday": 500,
    "Exceeded Study Days Leave": 150,
    "Late Arrival": 100,
    "Uniform Violation": 100,
    "Mobile Usage": 300,
  };

  document.getElementById("modalAmountInput").value = amounts[reason] || 150;
}

// =========================================
// SAVE / UPDATE FINE
// =========================================

function saveFine(e) {
  e.preventDefault();

  if (currentUserRole !== "ADMIN") {
    showToast("Administrator permission required.", "error");

    return;
  }

  const editId = document.getElementById("fineEditId").value;

  const roll = document.getElementById("modalStudentSelect").value;

  const student = students.find((s) => s.roll === roll);

  const reason = document.getElementById("modalReasonSelect").value;

  const amount = Number(document.getElementById("modalAmountInput").value);

  const status = document.getElementById("modalStatusSelect").value;

  // Validate student
  if (!student) {
    showToast("Please select a valid student.", "error");

    return;
  }

  // Validate amount
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    showToast("Please enter a valid positive whole-number amount.", "error");

    return;
  }

  // Validate status
  if (!["Paid", "Pending"].includes(status)) {
    showToast("Invalid fine payment status.", "error");

    return;
  }

  if (!reason) {
    showToast("Please select a violation reason.", "error");

    return;
  }

  if (editId) {
    const fine = fines.find((item) => item.id === editId);

    if (!fine) {
      showToast("Fine record not found.", "error");

      return;
    }

    fine.roll = roll;
    fine.name = student.name;
    fine.reason = reason;
    fine.amount = amount;
    fine.status = status;

    showToast("Fine record updated successfully!", "success");
  } else {
    const newFine = {
      id: generateUniqueRecordId("F", fines),

      roll: roll,

      name: student.name,

      reason: reason,

      amount: amount,

      date: new Date().toISOString().split("T")[0],

      status: status,

      appeal: null,
    };

    fines.push(newFine);

    showToast("New fine logged successfully!", "success");
  }

  saveData();

  closeFineModal();

  refreshAllViews();
}

// =========================================
// EDIT FINE
// =========================================

function editFine(id) {
  if (currentUserRole !== "ADMIN") {
    showToast("Only administrators can edit fine records.", "error");

    return;
  }

  const fine = fines.find((item) => item.id === id);

  if (!fine) {
    showToast("Fine record not found.", "error");

    return;
  }

  document.getElementById("fineEditId").value = fine.id;

  document.getElementById("fineModalTitle").innerText = "Edit Fine Record";

  populateStudentSelectors();

  document.getElementById("modalStudentSelect").value = fine.roll;

  document.getElementById("modalReasonSelect").value = fine.reason;

  document.getElementById("modalAmountInput").value = fine.amount;

  document.getElementById("modalStatusSelect").value = fine.status;

  document.getElementById("fineModal").classList.remove("hidden");
}

// =========================================
// TOGGLE FINE PAYMENT STATUS
// =========================================

function toggleFineStatus(id) {
  if (currentUserRole !== "ADMIN") {
    showToast("Administrator permission required.", "error");

    return;
  }

  const fine = fines.find((item) => item.id === id);

  if (!fine) {
    showToast("Fine record not found.", "error");

    return;
  }

  fine.status = fine.status === "Paid" ? "Pending" : "Paid";

  saveData();

  refreshAllViews();

  showToast(`Fine status changed to ${fine.status}.`, "success");
}

// =========================================
// DELETE FINE
// =========================================

function deleteFine(id) {
  if (currentUserRole !== "ADMIN") {
    showToast("Only administrators can delete fine records.", "error");

    return;
  }

  const fine = fines.find((item) => item.id === id);

  if (!fine) {
    showToast("Fine record not found.", "error");

    return;
  }

  if (!confirm("Are you sure you want to delete this fine record?")) {
    return;
  }

  fines = fines.filter((item) => item.id !== id);

  saveData();

  refreshAllViews();

  showToast("Fine record deleted successfully.", "success");
}

// =========================================
// PRINTABLE FINE RECEIPT
// =========================================

function openReceiptModal(id) {
  const fine = fines.find((item) => item.id === id);

  if (!fine) {
    showToast("Receipt record not found.", "error");

    return;
  }

  // A student may view only their own receipt.
  if (currentUserRole === "STUDENT" && fine.roll !== currentStudentFilter) {
    showToast("You cannot access another student’s receipt.", "error");

    return;
  }

  if (fine.status !== "Paid") {
    showToast("Receipt is available only for paid fines.", "error");

    return;
  }

  document.getElementById("rcptId").innerText = fine.id;

  document.getElementById("rcptRoll").innerText = fine.roll;

  document.getElementById("rcptName").innerText = fine.name;

  document.getElementById("rcptReason").innerText = fine.reason;

  document.getElementById("rcptDate").innerText = fine.date;

  document.getElementById("rcptAmount").innerText =
    `PKR ${Number(fine.amount).toLocaleString()}`;

  document.getElementById("receiptModal").classList.remove("hidden");
}

function closeReceiptModal() {
  document.getElementById("receiptModal").classList.add("hidden");
}

// =========================================
// ADD STUDENT MODAL
// =========================================

function openAddStudentModal() {
  if (currentUserRole !== "ADMIN") {
    showToast("Only administrators can register students.", "error");

    return;
  }

  document.getElementById("newRollNo").value = "";

  document.getElementById("newName").value = "";

  document.getElementById("studentModal").classList.remove("hidden");
}

function closeStudentModal() {
  document.getElementById("studentModal").classList.add("hidden");
}

// =========================================
// REGISTER NEW STUDENT
// =========================================

function saveStudent(e) {
  e.preventDefault();

  if (currentUserRole !== "ADMIN") {
    showToast("Administrator permission required.", "error");

    return;
  }

  const roll = document.getElementById("newRollNo").value.trim();

  const name = document.getElementById("newName").value.trim();

  if (!roll || !name) {
    showToast("Please enter both student name and roll number.", "error");

    return;
  }

  // Prevent duplicate roll numbers, ignoring letter case.
  const alreadyExists = students.some(
    (s) => s.roll.toLowerCase() === roll.toLowerCase(),
  );

  if (alreadyExists) {
    showToast("Student roll number already exists!", "error");

    return;
  }

  students.push({
    roll,
    name,
  });

  saveData();

  closeStudentModal();

  populateStudentSelectors();

  refreshAllViews();

  showToast("Student registered successfully!", "success");
}

// =========================================
// RESOLVE STUDENT APPEAL
// =========================================

function resolveAppeal(id, status) {
  if (currentUserRole !== "ADMIN") {
    showToast("Only administrators can resolve appeals.", "error");

    return;
  }

  if (!["Approved", "Rejected"].includes(status)) {
    showToast("Invalid appeal decision.", "error");

    return;
  }

  const fine = fines.find((item) => item.id === id);

  if (!fine || !fine.appeal) {
    showToast("Appeal record not found.", "error");

    return;
  }

  if (fine.appeal.status !== "Pending") {
    showToast("This appeal has already been reviewed.", "error");

    return;
  }

  fine.appeal.status = status;

  // Approved appeal clears the fine.
  if (status === "Approved") {
    fine.status = "Paid";
  }

  saveData();

  refreshAllViews();

  showToast(`Appeal ${status}.`, "success");
}

// =========================================
// UPDATE DASHBOARD ANNOUNCEMENT
// =========================================

function updateAnnouncement() {
  if (currentUserRole !== "ADMIN") {
    showToast("Only administrators can update announcements.", "error");

    return;
  }

  const input = document.getElementById("newAnnouncementInput");

  const text = input.value.trim();

  if (!text) {
    showToast("Please enter an announcement text!", "error");

    return;
  }

  document.getElementById("announcementText").innerText = text;

  input.value = "";

  showToast("Announcement updated on Dashboard!", "success");
}

// =========================================
// BULK CLEAR PENDING FINES
// =========================================

function bulkClearFines() {
  if (currentUserRole !== "ADMIN") {
    showToast("Only administrators can clear fines in bulk.", "error");

    return;
  }

  const confirmed = confirm(
    "Clear all currently pending fines for the selected scope?",
  );

  if (!confirmed) {
    return;
  }

  const list = getFilteredFines();

  let clearedCount = 0;

  list.forEach((f) => {
    if (f.status === "Pending") {
      f.status = "Paid";
      clearedCount++;
    }
  });

  saveData();

  refreshAllViews();

  showToast(`${clearedCount} pending fine record(s) cleared.`, "success");
}
// =========================================
// FILE DOWNLOAD HELPER
// =========================================

function downloadFile(content, filename, mimeType) {
  try {
    const blob = new Blob([content], { type: mimeType });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);

    return true;
  } catch (error) {
    console.error("Download error:", error);

    showToast("Unable to generate the download file.", "error");

    return false;
  }
}

// =========================================
// CSV VALUE ESCAPING
// =========================================

function escapeCSV(value) {
  let text = String(value ?? "");

  // Reduce spreadsheet formula injection risk.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }

  return '"' + text.replace(/"/g, '""') + '"';
}

// =========================================
// EXPORT FINE RECORDS AS CSV
// =========================================

function exportCSV() {
  const headers = [
    "Roll Number",
    "Student Name",
    "Reason",
    "Amount",
    "Date",
    "Status",
  ];

  const rows = [headers.map(escapeCSV).join(",")];

  getFilteredFines().forEach((f) => {
    const row = [f.roll, f.name, f.reason, f.amount, f.date, f.status];

    rows.push(row.map(escapeCSV).join(","));
  });

  const csvContent = "\uFEFF" + rows.join("\r\n");

  const success = downloadFile(
    csvContent,
    "KIPS_CSB37_Fine_Records.csv",
    "text/csv;charset=utf-8;",
  );

  if (success) {
    showToast("CSV Export generated successfully!", "success");
  }
}

// =========================================
// EXPORT COMPLETE DATA AS JSON BACKUP
// =========================================

function exportDataJSON() {
  if (currentUserRole !== "ADMIN") {
    showToast(
      "Only administrators can export the complete database backup.",
      "error",
    );

    return;
  }

  const data = {
    application: "KIPS College CSB-37 Fine Management Portal",

    backupDate: new Date().toISOString(),

    version: "4.8",

    students: students,

    fines: fines,

    expenses: expenses,

    accessLogs: accessLogs,
  };

  try {
    const jsonContent = JSON.stringify(data, null, 2);

    const success = downloadFile(
      jsonContent,
      "KIPS_CSB37_Backup.json",
      "application/json;charset=utf-8;",
    );

    if (success) {
      showToast("JSON Backup downloaded successfully!", "success");
    }
  } catch (error) {
    console.error("JSON backup error:", error);

    showToast("Unable to generate JSON backup.", "error");
  }
}

// =========================================
// AI SUPPORT CHATBOT
// =========================================

function toggleAIChat() {
  const win = document.getElementById("aiChatWindow");

  if (win) {
    win.classList.toggle("hidden");
  }
}

// =========================================
// QUICK CHAT PROMPTS
// =========================================

function sendQuickPrompt(promptText) {
  const input = document.getElementById("aiUserInput");

  if (input) {
    input.value = promptText;

    sendAIMessage();
  }
}

// =========================================
// CHAT ENTER KEY HANDLER
// =========================================

function handleAIKeypress(e) {
  if (e.key === "Enter") {
    e.preventDefault();

    sendAIMessage();
  }
}

// =========================================
// ADD USER MESSAGE TO CHAT
// =========================================

function addUserChatMessage(message) {
  const container = document.getElementById("aiChatMessages");

  if (!container) return;

  const messageWrapper = document.createElement("div");

  messageWrapper.className = "flex items-end justify-end space-x-2";

  const messageBubble = document.createElement("div");

  messageBubble.className =
    "bg-amber-500 text-slate-950 p-3 rounded-2xl shadow-sm text-xs font-bold max-w-[80%] break-words";

  // textContent prevents HTML injection from user input.
  messageBubble.textContent = message;

  messageWrapper.appendChild(messageBubble);

  container.appendChild(messageWrapper);

  container.scrollTop = container.scrollHeight;
}

// =========================================
// ADD ASSISTANT MESSAGE TO CHAT
// =========================================

function addAssistantChatMessage(message) {
  const container = document.getElementById("aiChatMessages");

  if (!container) return;

  const messageWrapper = document.createElement("div");

  messageWrapper.className = "flex items-start space-x-2";

  const avatar = document.createElement("div");

  avatar.className =
    "w-7 h-7 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-black shrink-0 text-xs shadow-md";

  avatar.innerHTML = '<i class="fa-solid fa-bolt"></i>';

  const messageBubble = document.createElement("div");

  messageBubble.className =
    "bg-white dark:bg-[#1e293b] p-3 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold max-w-[85%] leading-relaxed text-xs break-words";

  // The assistant replies contain application-generated HTML.
  messageBubble.innerHTML = message;

  messageWrapper.appendChild(avatar);

  messageWrapper.appendChild(messageBubble);

  container.appendChild(messageWrapper);

  container.scrollTop = container.scrollHeight;
}

// =========================================
// GENERATE LOCAL ASSISTANT RESPONSE
// =========================================

function generateAssistantReply(text) {
  const lower = text.toLowerCase();

  let reply = "";

  // =====================================
  // STUDENT RECORD LOOKUP
  // =====================================

  const availableStudents =
    currentUserRole === "ADMIN"
      ? students
      : students.filter((s) => s.roll === currentStudentFilter);

  const matchedStudent = availableStudents.find(
    (s) =>
      lower.includes(s.name.toLowerCase()) ||
      lower.includes(s.roll.toLowerCase()),
  );

  if (matchedStudent) {
    const studentFines = fines.filter((f) => f.roll === matchedStudent.roll);

    const pendingAmt = studentFines
      .filter((f) => f.status === "Pending")
      .reduce((sum, f) => sum + Number(f.amount || 0), 0);

    const paidAmt = studentFines
      .filter((f) => f.status === "Paid")
      .reduce((sum, f) => sum + Number(f.amount || 0), 0);

    reply =
      `<strong>Record for ${sanitizeHTML(matchedStudent.name)} (${sanitizeHTML(matchedStudent.roll)}):</strong><br>` +
      `Pending Dues: <strong>PKR ${pendingAmt.toLocaleString()}</strong><br>` +
      `Cleared Payments: PKR ${paidAmt.toLocaleString()}<br>` +
      `Total Fine Records: ${studentFines.length}<br>` +
      (pendingAmt > 0
        ? "<em>Please clear pending dues or submit a dispute appeal with supporting proof.</em>"
        : "<em>Status: Zero Pending Dues.</em>");
  }

  // =====================================
  // WEBSITE CREATOR
  // =====================================
  else if (
    lower.includes("founder") ||
    lower.includes("creator") ||
    lower.includes("developer") ||
    lower.includes("haseeb") ||
    lower.includes("who made")
  ) {
    reply =
      "<strong>Website Creator & Developer:</strong><br>" +
      "This KIPS College CSB-37 Fine Management Portal was designed and developed by Hafiz Muhammad Haseeb.";
  }

  // =====================================
  // CLASS FUND SUMMARY
  // =====================================
  else if (
    lower.includes("fund") ||
    lower.includes("balance") ||
    lower.includes("expense") ||
    lower.includes("sweet") ||
    lower.includes("party")
  ) {
    const totalCollected = fines
      .filter((f) => f.status === "Paid")
      .reduce((sum, f) => sum + Number(f.amount || 0), 0);

    const totalSpent = expenses.reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0,
    );

    const currentBalance = totalCollected - totalSpent;

    reply =
      "<strong>Class CSB-37 Fund Summary:</strong><br>" +
      `Total Fine Collected: PKR ${totalCollected.toLocaleString()}<br>` +
      `Total Event Expenses: PKR ${totalSpent.toLocaleString()}<br>` +
      `<strong>Current Balance: PKR ${currentBalance.toLocaleString()}</strong><br>` +
      "All expense records are available in the Class Fund & Expenses Ledger.";
  }

  // =====================================
  // TEST ATTENDANCE POLICY
  // =====================================
  else if (lower.includes("test")) {
    reply =
      "<strong>Test Attendance Policy:</strong><br>" +
      "Absence or leave on a scheduled test day carries a fine of <strong>PKR 200</strong> per missed test.";
  }

  // =====================================
  // STUDY DAYS POLICY
  // =====================================
  else if (lower.includes("study") || lower.includes("limit")) {
    reply =
      "<strong>Study Days Policy:</strong><br>" +
      "Missing study preparation days results in a <strong>PKR 150</strong> fine per missed day.<br>" +
      "The monthly approved study-day leave limit is 2 days.";
  }

  // =====================================
  // SATURDAY POLICY
  // =====================================
  else if (lower.includes("saturday")) {
    reply =
      "<strong>Saturday Attendance Policy:</strong><br>" +
      "Saturday attendance is mandatory. Absence or leave on Saturday incurs a fine of <strong>PKR 500</strong>.";
  }

  // =====================================
  // DISPUTE & LEAVE APPEALS
  // =====================================
  else if (
    lower.includes("appeal") ||
    lower.includes("marriage") ||
    lower.includes("medical") ||
    lower.includes("dispute") ||
    lower.includes("proof") ||
    lower.includes("leave")
  ) {
    reply =
      "<strong>Emergency Leave & Appeals Policy:</strong><br>" +
      "Marriage leave allows up to 3 approved leaves according to the stated policy.<br>" +
      "To submit an appeal, open Fine Records and select Dispute Appeal next to an eligible pending fine.<br>" +
      "Attach the required supporting image before submission.";
  }

  // =====================================
  // SECURITY & PRIVACY
  // =====================================
  else if (
    lower.includes("secure") ||
    lower.includes("privacy") ||
    lower.includes("trust") ||
    lower.includes("encryption") ||
    lower.includes("bot")
  ) {
    reply =
      "<strong>Security & Privacy Information:</strong><br>" +
      "Student, fine, payment and expense records are retrieved from the authenticated server API.<br>" +
      "Access is controlled by server-side role checks. Uploaded proof documents are stored privately.<br>" +
      "Theme preference is stored in this browser; business records are stored in PostgreSQL.";
  }

  // =====================================
  // GREETINGS
  // =====================================
  else if (
    lower.includes("hello") ||
    lower.includes("hi") ||
    lower.includes("aoa") ||
    lower.includes("assalam")
  ) {
    reply =
      "Walaikum Assalam! How can I help you with CSB-37 fine rules, student records, appeals or class fund information?";
  }

  // =====================================
  // DEFAULT RESPONSE
  // =====================================
  else {
    reply =
      "I can help you with the following portal information:<br><br>" +
      "1. Student fine records<br>" +
      "2. Test absence fine<br>" +
      "3. Saturday attendance penalty<br>" +
      "4. Study days leave policy<br>" +
      "5. Class Fund balance<br>" +
      "6. Dispute and emergency leave appeals<br><br>" +
      "Please ask a question about one of these topics.";
  }

  return reply;
}

// =========================================
// SEND CHAT MESSAGE
// =========================================

// function sendAIMessage() {
//   const input = document.getElementById("aiUserInput");

//   if (!input) return;

//   const text = input.value.trim();

//   if (!text) return;

//   // Show user message
//   addUserChatMessage(text);

//   input.value = "";

//   // Generate response
//   setTimeout(() => {
//     const reply = generateAssistantReply(text);

//     addAssistantChatMessage(reply);
//   }, 400);
// }

// ============================================================
// CSB-37 NEXUS — AI SUPPORT CHATBOT
// Developer credits + existing portal assistance
// ============================================================

const CSB37_DEVELOPMENT_TEAM = {
  project: "CSB-37 Nexus",

  members: [
    {
      name: "Hafiz Muhammad Haseeb",
      role: "Founder & Developer",
    },
    {
      name: "Muhammad Arslan Farooq",
      role: "Full-Stack Developer",
      expertise: [
        "Full-Stack Development",
        "Laravel",
        "Spring Boot",
        "Backend Engineering",
        "REST API Development",
        "Database Architecture & Management",
        "Application Security",
        "Server Infrastructure",
      ],
    },
  ],

  description:
    "A collaborative development team responsible for the engineering and technical implementation of CSB-37 Nexus.",
};

// ============================================================
// CHAT WINDOW
// ============================================================

function toggleAIChat() {
  const win = document.getElementById("aiChatWindow");

  if (!win) return;

  win.classList.toggle("hidden");

  if (!win.classList.contains("hidden")) {
    const input = document.getElementById("aiUserInput");

    if (input) {
      setTimeout(() => input.focus(), 100);
    }
  }
}

// ============================================================
// QUICK PROMPTS
// ============================================================

function sendQuickPrompt(promptText) {
  const input = document.getElementById("aiUserInput");

  if (!input || !promptText) return;

  input.value = promptText;

  sendAIMessage();
}

// ============================================================
// ENTER KEY HANDLER
// ============================================================

function handleAIKeypress(e) {
  if (e.key === "Enter") {
    e.preventDefault();

    sendAIMessage();
  }
}

// ============================================================
// SAFE USER MESSAGE RENDERING
// ============================================================

function addUserChatMessage(message) {
  const container = document.getElementById("aiChatMessages");

  if (!container) return;

  const wrapper = document.createElement("div");

  wrapper.className = "flex items-end justify-end space-x-2";

  const bubble = document.createElement("div");

  bubble.className =
    "bg-amber-500 text-slate-950 p-3 rounded-2xl shadow-sm text-xs font-bold max-w-[80%] break-words";

  bubble.textContent = message;

  wrapper.appendChild(bubble);

  container.appendChild(wrapper);

  container.scrollTop = container.scrollHeight;
}

// ============================================================
// ASSISTANT MESSAGE RENDERING
// ============================================================

function addAssistantChatMessage(message) {
  const container = document.getElementById("aiChatMessages");

  if (!container) return;

  const wrapper = document.createElement("div");

  wrapper.className = "flex items-start space-x-2";

  const avatar = document.createElement("div");

  avatar.className =
    "w-7 h-7 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-black shrink-0 text-xs shadow-md";

  avatar.innerHTML = '<i class="fa-solid fa-bolt"></i>';

  const bubble = document.createElement("div");

  bubble.className =
    "bg-white dark:bg-[#1e293b] p-3 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-semibold max-w-[85%] leading-relaxed text-xs break-words";

  // Only application-generated HTML is passed here.
  bubble.innerHTML = message;

  wrapper.appendChild(avatar);

  wrapper.appendChild(bubble);

  container.appendChild(wrapper);

  container.scrollTop = container.scrollHeight;
}

// ============================================================
// TEXT NORMALIZATION
// ============================================================

function normalizeAIText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// DEVELOPMENT TEAM RESPONSE
// ============================================================

// ============================================================
// CSB-37 NEXUS — SEPARATE DEVELOPER PROFILES
// ============================================================

function generateDeveloperReply(lower) {
  // ------------------------------------------
  // IDENTIFY INDIVIDUAL DEVELOPERS
  // ------------------------------------------

  const asksAboutHaseeb =
    lower.includes("haseeb") ||
    lower.includes("hafiz") ||
    lower.includes("muhammad haseeb");

  const asksAboutArslan =
    lower.includes("arslan") || lower.includes("muhammad arslan");

  const asksAboutCredentials =
    lower.includes("degree") ||
    lower.includes("qualification") ||
    lower.includes("education") ||
    lower.includes("navttc") ||
    lower.includes("government") ||
    lower.includes("verified") ||
    lower.includes("verification") ||
    lower.includes("certificate") ||
    lower.includes("certification");

  const asksAboutTeam =
    lower.includes("team") ||
    lower.includes("developers") ||
    lower.includes("development team") ||
    lower.includes("creator") ||
    lower.includes("created") ||
    lower.includes("developed") ||
    lower.includes("who made") ||
    lower.includes("who built") ||
    lower.includes("website owner");

  // ========================================================
  // 1. HAFIZ MUHAMMAD HASEEB — INDIVIDUAL PROFILE
  // ========================================================

  if (asksAboutHaseeb) {
    if (asksAboutCredentials) {
      return `
        <strong>Hafiz Muhammad Haseeb</strong><br>
        <span class="text-amber-600 dark:text-amber-400">
          Founder & Developer
        </span><br><br>

        <strong>Educational Background:</strong><br>
        • Institution: KIPS College<br>
        • Qualification: Intermediate<br><br>

        <strong>Professional & Technical Background:</strong><br>
        • Frontend Development<br>
        • Backend Development<br>
        • Python Programming<br>
        • Python Libraries & Ecosystem<br>
        • Laravel Framework<br>
        • Spring Boot Framework<br><br>

        <strong>Verification:</strong><br>
        Government-related verification has been reported.
        Specific issuing authorities, credentials and verification
        records should be confirmed through official documentation.
      `;
    }

    return `
      <strong>Hafiz Muhammad Haseeb</strong><br>

      <span class="text-amber-600 dark:text-amber-400">
        Founder & Developer — CSB-37 Nexus
      </span><br><br>

      Hafiz Muhammad Haseeb is the founder and developer
      of the CSB-37 Nexus platform, with an academic background
      at KIPS College and a strong focus on software development.<br><br>

      <strong>Education:</strong><br>
      • KIPS College<br>
      • Intermediate<br><br>

      <strong>Technical Expertise:</strong><br>
      • Frontend Development<br>
      • Backend Development<br>
      • Python Programming & Libraries<br>
      • Laravel Framework<br>
      • Spring Boot Framework<br><br>

      <strong>Development Interests:</strong><br>
      • Full-Stack Application Development<br>
      • Software Engineering<br>
      • Database-Driven Applications<br>
      • Backend Architecture<br>
      • Modern Web Technologies<br><br>

      <em>
        His profile reflects his reported educational background
        and technical capabilities.
      </em>
    `;
  }
  // ------------------------------------------
  // CSB-37 NEXUS WEBSITE FOUNDER / DEVELOPER
  // ------------------------------------------

  const asksCSB37Founder =
    lower.includes("csb 37 founder") ||
    lower.includes("csb-37 founder") ||
    lower.includes("founder of csb 37") ||
    lower.includes("who founded csb 37") ||
    lower.includes("who is csb 37 founder") ||
    lower.includes("csb37 founder") ||
    lower.includes("founder of nexus") ||
    lower.includes("nexus founder") ||
    lower.includes("who created csb 37") ||
    lower.includes("who made csb 37 website") ||
    lower.includes("who developed csb 37 website") ||
    lower.includes("who built csb 37 portal") ||
    lower.includes("website creator") ||
    lower.includes("website founder") ||
    lower.includes("portal developer") ||
    lower.includes("who developed this website") ||
    lower.includes("who created this website") ||
    lower.includes("who made this website");

  if (asksCSB37Founder) {
    return `
    <strong>CSB-37 Nexus — Founder & Developer</strong><br><br>

    <strong>Hafiz Muhammad Haseeb</strong> is the founder
    and lead developer of the CSB-37 Nexus Portal.<br><br>

    He is responsible for the concept, planning, development,
    and implementation of this student fine-management platform.<br><br>

    <strong>Development Team:</strong><br>
    • Hafiz Muhammad Haseeb — Founder & Lead Developer<br>
    • Muhammad Arslan Farooq — Development Team Member
`;
  }

  // ========================================================
  // 2. MUHAMMAD ARSLAN FAROOQ — INDIVIDUAL PROFILE
  // ========================================================

  if (asksAboutArslan) {
    if (asksAboutCredentials) {
      return `
        <strong>Muhammad Arslan Farooq</strong><br><br>

        <strong>Educational & Professional Credentials</strong><br><br>

        Muhammad Arslan Farooq's educational background and
        professional credentials have been reported by the
        development team as including government-associated
        verification, NAVTTC-related qualifications and other
        professional or international credentials.<br><br>

        Exact degree titles, issuing authorities and certificate
        details should be confirmed through official documentation.<br><br>

        The portal does not publish unverified certificate numbers
        or claim institutional endorsements without evidence.
      `;
    }

    return `
      <strong>Muhammad Arslan Farooq</strong><br>

      <span class="text-amber-600 dark:text-amber-400">
        Full-Stack Developer
      </span><br><br>

      Muhammad Arslan Farooq is a member of the
      CSB-37 Nexus development team.<br><br>

      <strong>Technical Expertise:</strong><br>
      • Full-Stack Application Development<br>
      • Laravel Development<br>
      • Spring Boot Development<br>
      • Backend Engineering<br>
      • REST API Development<br>
      • Database Architecture & Management<br>
      • Application Security<br>
      • Server Infrastructure<br><br>

      His technical contributions cover multiple areas
      of application development and engineering.
    `;
  }

  // ========================================================
  // 3. COMPLETE DEVELOPMENT TEAM
  // ========================================================

  if (asksAboutTeam) {
    return `
      <strong>CSB-37 Nexus — Development Team</strong><br><br>

      This platform is developed through the collaborative
      work of two development team members:<br><br>

      <strong>1. Hafiz Muhammad Haseeb</strong><br>

      <span class="text-amber-600 dark:text-amber-400">
        Founder & Developer
      </span><br>

      Technical Areas:<br>
      • Frontend Development<br>
      • Backend Development<br>
      • Python Programming<br>
      • Laravel<br>
      • Spring Boot<br><br>

      <strong>2. Muhammad Arslan Farooq</strong><br>

      <span class="text-amber-600 dark:text-amber-400">
        Full-Stack Developer
      </span><br>

      Technical Areas:<br>
      • Full-Stack Development<br>
      • Laravel<br>
      • Spring Boot<br>
      • REST APIs<br>
      • Database Architecture<br>
      • Application Security<br><br>

      Both members contribute to the development
      and engineering of CSB-37 Nexus.
    `;
  }

  const asksKIPSFounder =
    lower.includes("kips founder") ||
    lower.includes("founder of kips") ||
    lower.includes("who founded kips") ||
    lower.includes("who is kips founder") ||
    lower.includes("founder kips") ||
    lower.includes("kips founder name");

  if (asksKIPSFounder) {
    return `
  <strong>KIPS Education System — Founder</strong><br><br>

  <strong>Mr. Abid Wazir Khan</strong><br>
  <span class="text-amber-600 dark:text-amber-400">
    Founder & Chief Executive
  </span><br><br>

  Mr. Abid Wazir Khan founded KIPS Education System
  in 1992. A Civil Engineer by profession and a graduate
  of UET, he established an evening coaching academy
  named Knowledge-Inn Academy.<br><br>

  The institution later evolved into Knowledge Inn
  Preparatory School, giving rise to the acronym KIPS.<br><br>

  <strong>Official Sources:</strong><br>

  <a href="https://kipsschool.com/about-us/"
     target="_blank" rel="noopener noreferrer"
     class="text-amber-600 underline">
     KIPS School — Official History
  </a><br>

  <a href="https://kipscolleges.com/about-us/"
     target="_blank" rel="noopener noreferrer"
     class="text-amber-600 underline">
     KIPS College — About Us
  </a>
`;
  }

  // ========================================================
  // KIPS EDUCATION SYSTEM — COMPLETE INSTITUTIONAL HISTORY
  // ========================================================

  const asksAboutKIPS =
    lower === "kips" ||
    lower === "kip" ||
    lower === "college" ||
    lower.includes("kips") ||
    lower.includes("kip college") ||
    lower.includes("kips college") ||
    lower.includes("knowledge inn") ||
    lower.includes("knowledge-in") ||
    lower.includes("history of kips") ||
    lower.includes("about college") ||
    lower.includes("about kips");

  if (asksAboutKIPS) {
    return `
      <strong>KIPS EDUCATION SYSTEM</strong><br>
      <span class="text-amber-600 dark:text-amber-400">
        Knowledge • Excellence • Education
      </span><br><br>

      <strong>1. Introduction</strong><br>
      KIPS is one of Pakistan's established private
      educational networks, offering academic learning,
      examination preparation and professional development
      opportunities.<br><br>

      <strong>2. Historical Background</strong><br>
      KIPS Education System was founded in 1992 by
      Mr. Abid Wazir Khan, a UET graduate and education
      entrepreneur.<br><br>

      Its journey began with an evening coaching academy
      called Knowledge-Inn. It later evolved into
      Knowledge Inn Preparatory School, giving rise
      to the name KIPS.<br><br>

      <strong>3. KIPS College Foundation</strong><br>
      KIPS College began its journey in 2004 with a focus
      on conceptual and knowledge-based intermediate education.
      It subsequently expanded its academic network
      across Pakistan.<br><br>

      <strong>4. Founder & Leadership</strong><br>
      • Founder: Mr. Abid Wazir Khan<br>
      • Chief Executive: Mr. Abid Wazir Khan<br>
      • Managing Director: Mr. Salman Maqsood<br><br>

      <strong>5. Educational Network</strong><br>
      KIPS Education System operates across multiple
      educational domains, including:<br>
      • KIPS Schools<br>
      • KIPS Colleges<br>
      • KIPS Preparations<br>
      • Entry Test Preparation<br>
      • Competitive Examination Preparation<br>
      • Foreign Test Preparation<br>
      • School of Languages<br>
      • KIPS Publications<br><br>

      <strong>6. Academic Programs</strong><br>
      • Intermediate Education<br>
      • Pre-Medical<br>
      • Pre-Engineering<br>
      • ICS / Computer Science<br>
      • Entry Test Preparation<br>
      • Academic Revision & Test Sessions<br><br>

      <strong>7. Educational Philosophy</strong><br>
      KIPS emphasizes conceptual learning, academic
      excellence, discipline, character development
      and continuous improvement.<br><br>

      <strong>8. Vision</strong><br>
      Transforming lives through accessible quality
      education for a brighter future and a better world.<br><br>

      <strong>9. Mission</strong><br>
      Empowering students with quality education,
      knowledge, skills and values to achieve their
      potential and contribute positively to society.<br><br>

      <strong>10. KIPS & CSB-37 Nexus</strong><br>
      CSB-37 Nexus is an independently developed
      digital class-management platform associated
      with the CSB-37 student community at KIPS College.<br><br>

      <strong>Official Resources:</strong><br>
      <a href="https://kips.edu.pk/about-us/"
         target="_blank" rel="noopener noreferrer"
         class="text-amber-600 underline">
         KIPS Education System
      </a><br>
      <a href="https://kipscolleges.com/about-us/"
         target="_blank" rel="noopener noreferrer"
         class="text-amber-600 underline">
         KIPS College — About Us
      </a><br><br>

      <em>
        Historical and institutional information is based
        on publicly available KIPS publications and official
        website information.
      </em>
    `;
  }

  return null;
}

// ============================================================
// GENERATE LOCAL ASSISTANT RESPONSE
// ============================================================

function generateAssistantReply(text) {
  const lower = normalizeAIText(text);

  let reply = "";

  // ========================================================
  // 1. DEVELOPMENT TEAM — CHECK FIRST
  // ========================================================

  const developerReply = generateDeveloperReply(lower);

  if (developerReply) {
    return developerReply;
  }

  // ========================================================
  // 2. STUDENT RECORD LOOKUP
  // ========================================================

  const availableStudents =
    currentUserRole === "ADMIN"
      ? students
      : students.filter((s) => s.roll === currentStudentFilter);

  const matchedStudent = availableStudents.find((s) => {
    const studentName = normalizeAIText(s.name);

    const studentRoll = normalizeAIText(s.roll);

    return lower.includes(studentName) || lower.includes(studentRoll);
  });

  if (matchedStudent) {
    const studentFines = fines.filter((f) => f.roll === matchedStudent.roll);

    const pendingAmt = studentFines
      .filter((f) => f.status === "Pending")
      .reduce((sum, f) => sum + Number(f.amount || 0), 0);

    const paidAmt = studentFines
      .filter((f) => f.status === "Paid")
      .reduce((sum, f) => sum + Number(f.amount || 0), 0);

    return `
          <strong>
              Record for ${sanitizeHTML(matchedStudent.name)}
              (${sanitizeHTML(matchedStudent.roll)})
          </strong><br><br>

          Pending Dues:
          <strong>PKR ${pendingAmt.toLocaleString()}</strong><br>

          Cleared Payments:
          PKR ${paidAmt.toLocaleString()}<br>

          Total Fine Records:
          ${studentFines.length}<br><br>

          ${
            pendingAmt > 0
              ? "<em>Please review pending dues or submit a dispute appeal with supporting proof.</em>"
              : "<em>Status: Zero Pending Dues.</em>"
          }
      `;
  }

  // ========================================================
  // 3. CLASS FUND SUMMARY
  // ========================================================

  if (
    lower.includes("fund") ||
    lower.includes("balance") ||
    lower.includes("expense") ||
    lower.includes("sweet") ||
    lower.includes("party")
  ) {
    const totalCollected = fines
      .filter((f) => f.status === "Paid")
      .reduce((sum, f) => sum + Number(f.amount || 0), 0);

    const totalSpent = expenses.reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0,
    );

    const currentBalance = totalCollected - totalSpent;

    reply = `
          <strong>Class CSB-37 Fund Summary</strong><br><br>

          Total Fine Collected:
          PKR ${totalCollected.toLocaleString()}<br>

          Total Event Expenses:
          PKR ${totalSpent.toLocaleString()}<br>

          <strong>
              Current Balance:
              PKR ${currentBalance.toLocaleString()}
          </strong><br><br>

          All expense records are available in the
          Class Fund & Expenses Ledger.
      `;

    return reply;
  }

  // ========================================================
  // 4. TEST ATTENDANCE POLICY
  // ========================================================

  if (lower.includes("test")) {
    return `
          <strong>Test Attendance Policy</strong><br><br>

          Absence or leave on a scheduled test day carries
          a fine of <strong>PKR 200</strong> per missed test.
      `;
  }

  // ========================================================
  // 5. STUDY DAYS POLICY
  // ========================================================

  if (lower.includes("study") || lower.includes("limit")) {
    return `
          <strong>Study Days Policy</strong><br><br>

          Missing study preparation days results in a
          <strong>PKR 150</strong> fine per missed day.<br><br>

          The monthly approved study-day leave limit is 2 days.
      `;
  }

  // ========================================================
  // 6. SATURDAY POLICY
  // ========================================================

  if (lower.includes("saturday")) {
    return `
          <strong>Saturday Attendance Policy</strong><br><br>

          Saturday attendance is mandatory.
          Absence or leave on Saturday incurs a fine of
          <strong>PKR 500</strong>.
      `;
  }

  // ========================================================
  // 7. DISPUTE & LEAVE APPEALS
  // ========================================================

  if (
    lower.includes("appeal") ||
    lower.includes("marriage") ||
    lower.includes("medical") ||
    lower.includes("dispute") ||
    lower.includes("proof") ||
    lower.includes("leave")
  ) {
    return `
          <strong>Emergency Leave & Appeals Policy</strong><br><br>

          Marriage leave allows up to 3 approved leaves
          according to the stated policy.<br><br>

          To submit an appeal, open Fine Records and select
          Dispute Appeal next to an eligible pending fine.<br><br>

          Attach the required supporting image before submission.
      `;
  }

  // ========================================================
  // 8. SECURITY & PRIVACY
  // ========================================================

  if (
    lower.includes("secure") ||
    lower.includes("privacy") ||
    lower.includes("trust") ||
    lower.includes("encryption") ||
    lower.includes("security")
  ) {
    return `
          <strong>Security & Privacy Information</strong><br><br>

          Student, fine, payment and expense records are
          handled through the portal's configured data
          access mechanisms.<br><br>

          Access permissions and server-side security
          controls depend on the deployed backend configuration.<br><br>

          Avoid sharing passwords or confidential student
          information with unauthorized individuals.
      `;
  }

  // ========================================================
  // 9. GREETINGS
  // ========================================================

  if (/^(hello|hi|hey|aoa|assalam|assalam o alaikum)\b/.test(lower)) {
    return `
          Walaikum Assalam!<br><br>

          Welcome to CSB-37 Nexus. I can help you with
          fine rules, student records, class funds,
          leave applications and dispute appeals.<br><br>

          You can also ask about our development team.
      `;
  }

  // ========================================================
  // 10. DEFAULT RESPONSE
  // ========================================================

  return `
      <strong>CSB-37 AI Assistant</strong><br><br>

      I can help you with:<br><br>

      1. Student fine records<br>
      2. Test absence fines<br>
      3. Saturday attendance penalties<br>
      4. Study-day leave policies<br>
      5. Class fund balance<br>
      6. Dispute and emergency leave appeals<br>
      7. Development team and technical expertise<br><br>

      Please ask a question about one of these topics.
  `;
}

// ============================================================
// SEND CHAT MESSAGE
// ============================================================

function sendAIMessage() {
  const input = document.getElementById("aiUserInput");

  if (!input) return;

  const text = input.value.trim();

  if (!text) return;

  // Display user's message.
  addUserChatMessage(text);

  input.value = "";

  input.focus();

  // Generate local response.
  setTimeout(() => {
    try {
      const reply = generateAssistantReply(text);

      addAssistantChatMessage(reply);
    } catch (error) {
      console.error("CSB-37 AI Assistant Error:", error);

      addAssistantChatMessage(
        "Sorry, I could not process your request. Please try again.",
      );
    }
  }, 350);
}

// =========================================
// APPLICATION INITIALIZATION
// =========================================

document.addEventListener(
  "DOMContentLoaded",
  function initializeCsb37Portal() {
    console.info("KIPS CSB-37 Portal initializing...");
    try {
      applyThemeOnLoad();
    } catch (error) {
      console.error("Theme initialization failed:", error);
    }
    try {
      populateStudentSelectors();
    } catch (error) {
      console.error("Student selector initialization failed:", error);
    }
    try {
      calculateFineEstimate();
    } catch (error) {
      console.error("Fine calculator initialization failed:", error);
    }
    try {
      updateAppealsBadge();
    } catch (error) {
      console.error("Appeal badge initialization failed:", error);
    }
    try {
      refreshAllViews();
    } catch (error) {
      console.error("Initial view rendering failed:", error);
    }

    // portal-enhancements.js loads before DOMContentLoaded and replaces several handlers.
    // Re-apply one sidebar controller after that layer has registered its overrides.
    window.setSidebarOpen = setSidebarOpen;
    window.openSidebar = openSidebar;
    window.closeSidebar = closeSidebar;
    window.toggleSidebar = toggleSidebar;

    const enhancedSwitchView = window.switchView;
    if (
      typeof enhancedSwitchView === "function" &&
      !enhancedSwitchView.__csb37SidebarWrapped
    ) {
      const wrappedSwitchView = function (viewId) {
        const result = enhancedSwitchView.apply(this, arguments);
        closeSidebar();
        return result;
      };
      wrappedSwitchView.__csb37SidebarWrapped = true;
      window.switchView = wrappedSwitchView;
    }

    const enhancedLogout = window.handleLogout;
    if (
      typeof enhancedLogout === "function" &&
      !enhancedLogout.__csb37RoleWrapped
    ) {
      const wrappedLogout = function () {
        const result = enhancedLogout.apply(this, arguments);
        currentUserRole = "GUEST";
        currentStudentFilter = "ALL";
        closeSidebar();
        return result;
      };
      wrappedLogout.__csb37RoleWrapped = true;
      window.handleLogout = wrappedLogout;
    }

    // Optional read-only modules must not prevent the core dashboard from opening.
    // The main portal, student list and fine list remain critical; module feeds may
    // degrade to an empty state with a visible warning instead of aborting login.
    if (window.CSB37API) {
      const fallbackMethods = new Map([
        ["leaves", []],
        ["appeals", []],
        ["notices", []],
        ["attendance", []],
        ["expenses", []],
        ["audit", []],
        ["notifications", []],
        ["schedule", null],
      ]);
      const warnedMethods = new Set();
      const apiClient = window.CSB37API;
      const resilientApi = {};
      Object.keys(apiClient).forEach((methodName) => {
        const original = apiClient[methodName];
        if (fallbackMethods.has(methodName) && typeof original === "function") {
          resilientApi[methodName] = async (...args) => {
            try {
              return await original(...args);
            } catch (error) {
              console.warn(
                `Optional CSB-37 API module '${methodName}' unavailable:`,
                error,
              );
              if (!warnedMethods.has(methodName)) {
                warnedMethods.add(methodName);
                showToast(
                  `${methodName} data is temporarily unavailable. Other portal sections can still be used.`,
                  "error",
                );
              }
              return fallbackMethods.get(methodName);
            }
          };
        } else {
          resilientApi[methodName] = original;
        }
      });
      window.CSB37API = Object.freeze(resilientApi);
    }

    // API-backed submit handlers are installed by portal-enhancements.js.
    // Guard their forms against rapid double-click / duplicate POST requests without
    // changing button HTML, labels, classes, or the existing visual design.
    const guardedSubmitHandlers = [
      "saveFine",
      "saveStudent",
      "saveExpense",
      "submitAppeal",
      "submitLeaveApplication",
      "createAnnouncement",
      "saveClassSchedule",
    ];
    guardedSubmitHandlers.forEach((handlerName) => {
      const original = window[handlerName];
      if (typeof original !== "function" || original.__csb37SubmitGuarded)
        return;
      const guarded = async function (...args) {
        const event = args[0];
        const form =
          event?.currentTarget?.tagName === "FORM" ? event.currentTarget : null;
        if (form?.dataset.csb37Submitting === "true") return;

        // Creating a fine and then recording its initial payment are separate API
        // transactions in the current backend. Do not start that two-write workflow
        // automatically; create Pending first, then record an actual payment separately.
        if (handlerName === "saveFine") {
          const isNewFine = !document.getElementById("fineEditId")?.value;
          const selectedStatus =
            document.getElementById("modalStatusSelect")?.value;
          if (isNewFine && selectedStatus === "Paid") {
            showToast(
              "Pehle fine ko Pending status ke sath save karein. Us ke baad payment action se received amount record karein.",
              "error",
            );
            return;
          }
        }

        if (form) {
          form.dataset.csb37Submitting = "true";
          setFormBusy(form, true);
        }
        try {
          return await original.apply(this, args);
        } finally {
          if (form) {
            setFormBusy(form, false);
            delete form.dataset.csb37Submitting;
          }
        }
      };
      guarded.__csb37SubmitGuarded = true;
      window[handlerName] = guarded;
    });

    // Avoid a predictable 409 from the API for fines that already have a payment
    // or waiver. The backend remains the final authority and still validates it.
    const enhancedDeleteFine = window.deleteFine;
    if (
      typeof enhancedDeleteFine === "function" &&
      !enhancedDeleteFine.__csb37SettlementGuarded
    ) {
      const guardedDeleteFine = function (id) {
        const fine = fines.find((item) => String(item.id) === String(id));
        if (!fine) {
          showToast("Fine record not found.", "error");
          return;
        }
        const financials = getFineFinancials(fine);
        if (financials.paid > 0 || financials.waived > 0) {
          showToast(
            "Is fine par payment ya waiver record hai; financial history preserve karne ke liye isay cancel nahi kiya ja sakta.",
            "error",
          );
          return;
        }
        return enhancedDeleteFine.apply(this, arguments);
      };
      guardedDeleteFine.__csb37SettlementGuarded = true;
      window.deleteFine = guardedDeleteFine;
    }

    // Theme preference is optional browser state. A privacy/storage exception must
    // never break the portal UI after the theme class has been changed.
    ["applyThemeOnLoad", "toggleTheme"].forEach((handlerName) => {
      const original = window[handlerName];
      if (typeof original !== "function" || original.__csb37StorageGuarded)
        return;
      const guardedTheme = function (...args) {
        try {
          return original.apply(this, args);
        } catch (error) {
          console.warn(
            `Theme preference could not be stored (${handlerName}).`,
            error,
          );
          syncThemeIcon();
        }
      };
      guardedTheme.__csb37StorageGuarded = true;
      window[handlerName] = guardedTheme;
    });

    console.info("KIPS CSB-37 Portal ready.");
  },
  { once: true },
);

// Expose shared controllers for inline HTML attributes and the API enhancement layer.
window.setSidebarOpen = setSidebarOpen;
window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;
window.toggleSidebar = toggleSidebar;
