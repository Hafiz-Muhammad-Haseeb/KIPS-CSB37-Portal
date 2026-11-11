// SHA-256 Hashing helper for student credentials & audit integrity
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");

  toast.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-xl text-xs font-black text-white transition-all transform translate-y-2 opacity-0 flex items-center space-x-2 ${type === "success" ? "bg-emerald-600" : "bg-rose-600"}`;

  toast.innerHTML = `<i class="fa-solid ${type === "success" ? "fa-circle-check" : "fa-triangle-exclamation"} text-sm"></i><span>${sanitizeHTML(message)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  }, 10);

  setTimeout(() => {
    toast.classList.add("translate-y-2", "opacity-0");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function sanitizeHTML(str) {
  if (typeof str !== "string") return str;

  return str.replace(/[&<>"']/g, function (m) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[m];
  });
}

// Generate IDs that remain unique even when multiple records are saved quickly.
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

const defaultStudents = [
  { roll: "CSB-37-001", name: "Abdullah Khan" },
  { roll: "CSB-37-002", name: "Fatima Noor" },
  { roll: "CSB-37-003", name: "Hamza Ahmed" },
  { roll: "CSB-37-004", name: "Ayesha Siddiqui" },
  { roll: "CSB-37-005", name: "Bilal Chaudhry" },
  { roll: "CSB-37-006", name: "Zainab Tariq" },
];

const defaultFines = [
  {
    id: "F-101",
    roll: "CSB-37-001",
    name: "Abdullah Khan",
    reason: "Absent during Test",
    amount: 200,
    date: "2026-10-24",
    status: "Paid",
    appeal: null,
  },
  {
    id: "F-102",
    roll: "CSB-37-003",
    name: "Hamza Ahmed",
    reason: "Absent on Saturday",
    amount: 500,
    date: "2026-10-25",
    status: "Pending",
    appeal: null,
  },
  {
    id: "F-103",
    roll: "CSB-37-002",
    name: "Fatima Noor",
    reason: "Absent during Study Days",
    amount: 150,
    date: "2026-10-26",
    status: "Pending",
    appeal: null,
  },
  {
    id: "F-104",
    roll: "CSB-37-005",
    name: "Bilal Chaudhry",
    reason: "Late Arrival",
    amount: 100,
    date: "2026-10-28",
    status: "Paid",
    appeal: null,
  },
];

const defaultExpenses = [
  {
    id: "E-101",
    category: "Cultural Day Refreshments",
    comment: "Sweets and samosas for CSB-37 Cultural Day",
    amount: 1200,
    date: "2026-10-20",
  },
  {
    id: "E-102",
    category: "Teachers' Day Gift & Sweets",
    comment: "Bouquet and sweets presentation for faculty",
    amount: 2500,
    date: "2026-10-05",
  },
];

// APPLICATION DATA
let students =
  JSON.parse(localStorage.getItem("kips_students")) || defaultStudents;
let fines = JSON.parse(localStorage.getItem("kips_fines")) || defaultFines;
let expenses =
  JSON.parse(localStorage.getItem("kips_expenses")) || defaultExpenses;
let accessLogs = JSON.parse(localStorage.getItem("kips_access_logs")) || [];

let currentUserRole = "STUDENT";
let currentStudentFilter = "ALL";
let currentView = "dashboard";

let sessionStartTime = null;

let barChartInstance = null;
let statusChartInstance = null;

let base64ProofImage = "";

function saveData() {
  localStorage.setItem("kips_students", JSON.stringify(students));
  localStorage.setItem("kips_fines", JSON.stringify(fines));
  localStorage.setItem("kips_expenses", JSON.stringify(expenses));
  localStorage.setItem("kips_access_logs", JSON.stringify(accessLogs));
}

function toggleTheme() {
  const html = document.documentElement;
  const icon = document.getElementById("themeToggleIcon");

  if (html.classList.contains("dark")) {
    html.classList.remove("dark");
    localStorage.setItem("kips_theme", "light");

    if (icon) {
      icon.className = "fa-solid fa-moon text-sm";
    }
  } else {
    html.classList.add("dark");
    localStorage.setItem("kips_theme", "dark");

    if (icon) {
      icon.className = "fa-solid fa-sun text-sm text-amber-400";
    }
  }

  if (currentView === "analytics") {
    renderCharts();
  }
}

function applyThemeOnLoad() {
  const savedTheme = localStorage.getItem("kips_theme");
  const icon = document.getElementById("themeToggleIcon");

  if (savedTheme !== "light") {
    document.documentElement.classList.add("dark");
    localStorage.setItem("kips_theme", "dark");

    if (icon) {
      icon.className = "fa-solid fa-sun text-sm text-amber-400";
    }
  } else {
    document.documentElement.classList.remove("dark");

    if (icon) {
      icon.className = "fa-solid fa-moon text-sm";
    }
  }
}

function openTermsModal() {
  document.getElementById("termsModal").classList.remove("hidden");
}

function closeTermsModal() {
  document.getElementById("termsModal").classList.add("hidden");
}

// =========================================
// LOGIN SYSTEM
// =========================================

function handlePortalLogin(e) {
  e.preventDefault();

  const rawName = document.getElementById("loginUsername").value.trim();
  const identifier = document.getElementById("loginIdentifier").value.trim();

  let matchedStudent = null;

  if (
    rawName === "Sir_Waqeel_" &&
    identifier === "Sir_Waqeel_@369TopperClass"
  ) {
    currentUserRole = "ADMIN";

    showToast("Welcome Administrator Sir Waqeel!", "success");
  } else {
    matchedStudent = students.find(
      (s) =>
        s.roll.toLowerCase() === identifier.toLowerCase() &&
        s.name.toLowerCase() === rawName.toLowerCase(),
    );

    if (!matchedStudent) {
      showToast(
        "Verification Failed: Name and Roll Number do not match CSB-37 records!",
        "error",
      );
      return;
    }

    currentUserRole = "STUDENT";
    currentStudentFilter = matchedStudent.roll;

    showToast(
      `Verified & Logged in securely as ${matchedStudent.name}!`,
      "success",
    );
  }

  const now = new Date();

  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString();

  const userAgent = navigator.userAgent;

  const deviceType = /Mobile|Android|iPhone/i.test(userAgent)
    ? "Mobile / Tablet"
    : "Desktop / Laptop";

  const logEntry = {
    id: "LOG-" + Date.now(),

    user:
      currentUserRole === "ADMIN"
        ? "Sir Waqeel (Admin)"
        : `${matchedStudent.name} (${matchedStudent.roll})`,

    timestamp: `${dateStr} at ${timeStr}`,
    device: deviceType,
    agent: userAgent,
    durationSeconds: 0,
  };

  accessLogs.unshift(logEntry);

  saveData();

  sessionStartTime = Date.now();

  document.getElementById("view-login").classList.add("hidden");
  document.getElementById("appContainer").classList.remove("hidden");

  applyRoleUI();
  populateStudentSelectors();

  if (currentUserRole === "STUDENT") {
    const headerSelect = document.getElementById("studentSelector");

    if (headerSelect) {
      headerSelect.value = currentStudentFilter;
    }
  }

  switchView("dashboard");
}

function handleLogout() {
  if (sessionStartTime && accessLogs.length > 0) {
    const durationMs = Date.now() - sessionStartTime;
    const durationSecs = Math.floor(durationMs / 1000);

    const mins = Math.floor(durationSecs / 60);
    const secs = durationSecs % 60;

    accessLogs[0].durationSeconds = `${mins}m ${secs}s`;

    saveData();
  }

  document.getElementById("appContainer").classList.add("hidden");
  document.getElementById("view-login").classList.remove("hidden");

  document.getElementById("loginIdentifier").value = "";

  showToast("Logged out securely.", "success");
}

// =========================================
// SIDEBAR & ROLE ACCESS
// =========================================

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");

  sidebar.classList.toggle("-translate-x-full");
  overlay.classList.toggle("hidden");
}

function applyRoleUI() {
  const adminElements = document.querySelectorAll(".admin-only");

  if (currentUserRole === "ADMIN") {
    adminElements.forEach((el) => el.classList.remove("hidden"));
  } else {
    adminElements.forEach((el) => el.classList.add("hidden"));
  }
}

function populateStudentSelectors() {
  const headerSelect = document.getElementById("studentSelector");
  const modalSelect = document.getElementById("modalStudentSelect");

  if (headerSelect) {
    headerSelect.innerHTML =
      '<option value="ALL">ALL (Class Overview)</option>';

    students.forEach((s) => {
      const opt = document.createElement("option");

      opt.value = s.roll;
      opt.text = `${s.roll} - ${s.name}`;

      headerSelect.appendChild(opt);
    });

    headerSelect.value = currentStudentFilter;
  }

  if (modalSelect) {
    modalSelect.innerHTML = "";

    students.forEach((s) => {
      const opt = document.createElement("option");

      opt.value = s.roll;
      opt.text = `${s.roll} - ${s.name}`;

      modalSelect.appendChild(opt);
    });
  }
}

function changeStudentProfile() {
  const headerSelect = document.getElementById("studentSelector");

  currentStudentFilter = headerSelect.value;

  refreshAllViews();
}
// =========================================
// VIEW NAVIGATION
// =========================================

function switchView(viewId) {
  currentView = viewId;

  document.querySelectorAll(".content-view").forEach((v) => {
    v.classList.add("hidden");
  });

  const targetView = document.getElementById(`view-${viewId}`);

  if (targetView) {
    targetView.classList.remove("hidden");
  }

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.remove(
      "bg-slate-800/80",
      "text-white",
      "border-amber-500/30",
    );
  });

  const activeBtn = document.getElementById(`nav-${viewId}`);

  if (activeBtn) {
    activeBtn.classList.add(
      "bg-slate-800/80",
      "text-white",
      "border-amber-500/30",
    );
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
  };

  const pageTitle = document.getElementById("pageTitle");

  if (pageTitle) {
    pageTitle.innerText = titles[viewId] || "Portal";
  }

  // Automatically close sidebar on mobile
  if (window.innerWidth < 1024) {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");

    if (sidebar && !sidebar.classList.contains("-translate-x-full")) {
      sidebar.classList.add("-translate-x-full");

      if (overlay) {
        overlay.classList.add("hidden");
      }
    }
  }

  refreshAllViews();
}

// =========================================
// REFRESH ALL DASHBOARD COMPONENTS
// =========================================

function refreshAllViews() {
  updateStats();
  renderDashboardRecent();
  renderHonorRoll();
  renderFinesTable();
  renderStudentsDirectory();
  renderExpensesTable();
  renderAppeals();
  renderAccessLogs();
  updateAppealsBadge();

  if (currentView === "analytics") {
    renderCharts();
  }
}

// =========================================
// FILTER FINES BY SELECTED STUDENT
// =========================================

function getFilteredFines() {
  if (currentStudentFilter === "ALL") {
    return fines;
  }

  return fines.filter((f) => f.roll === currentStudentFilter);
}

// =========================================
// UPDATE DASHBOARD STATISTICS
// =========================================

function updateStats() {
  const list = getFilteredFines();

  const totalCollected = list
    .filter((f) => f.status === "Paid")
    .reduce((sum, f) => sum + f.amount, 0);

  const totalPending = list
    .filter((f) => f.status === "Pending")
    .reduce((sum, f) => sum + f.amount, 0);

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

  const remainingFund = Math.max(0, totalCollected - totalSpent);

  const collectedElement = document.getElementById("statTotalCollected");
  const spentElement = document.getElementById("statTotalSpent");
  const remainingElement = document.getElementById("statRemainingFund");
  const pendingElement = document.getElementById("statTotalPending");

  if (collectedElement) {
    collectedElement.innerText = `PKR ${totalCollected.toLocaleString()}`;
  }

  if (spentElement) {
    spentElement.innerText = `PKR ${totalSpent.toLocaleString()}`;
  }

  if (remainingElement) {
    remainingElement.innerText = `PKR ${remainingFund.toLocaleString()}`;
  }

  if (pendingElement) {
    pendingElement.innerText = `PKR ${totalPending.toLocaleString()}`;
  }
}

// =========================================
// STUDENT HONOR ROLL
// =========================================

function renderHonorRoll() {
  const container = document.getElementById("honorRollContainer");

  if (!container) return;

  container.innerHTML = "";

  const honorStudents = students.filter((s) => {
    const pending = fines.filter(
      (f) => f.roll === s.roll && f.status === "Pending",
    );

    return pending.length === 0;
  });

  if (honorStudents.length === 0) {
    container.innerHTML = `
            <span class="text-xs text-slate-400 font-bold">
                No students currently on honor roll.
            </span>
        `;

    return;
  }

  honorStudents.forEach((s) => {
    const badge = document.createElement("div");

    badge.className =
      "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-black flex items-center space-x-1.5 shadow-sm";

    badge.innerHTML = `
            <i class="fa-solid fa-circle-check text-emerald-500"></i>
            <span>
                ${sanitizeHTML(s.name)} (${sanitizeHTML(s.roll)})
            </span>
        `;

    container.appendChild(badge);
  });
}

// =========================================
// DASHBOARD RECENT FINE RECORDS
// =========================================

function renderDashboardRecent() {
  const tbody = document.getElementById("dashboardRecentTable");

  if (!tbody) return;

  tbody.innerHTML = "";

  const list = [...getFilteredFines()].reverse().slice(0, 5);

  if (list.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="4"
                    class="py-4 text-center text-slate-400 font-semibold">
                    No recent fine records found.
                </td>
            </tr>
        `;

    return;
  }

  list.forEach((f) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
            <td class="py-3">
                <div class="font-bold">
                    ${sanitizeHTML(f.name)}
                </div>

                <div class="text-[11px] text-slate-400">
                    ${sanitizeHTML(f.roll)}
                </div>
            </td>

            <td class="py-3 font-medium text-slate-600 dark:text-slate-300">
                ${sanitizeHTML(f.reason)}
            </td>

            <td class="py-3 font-black">
                PKR ${f.amount}
            </td>

            <td class="py-3">
                <span class="px-2.5 py-1 rounded-full text-xs font-black ${f.status === "Paid"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
      }">
                    ${sanitizeHTML(f.status)}
                </span>
            </td>
        `;

    tbody.appendChild(tr);
  });
}

// =========================================
// FINE RECORDS TABLE
// =========================================

function renderFinesTable() {
  const tbody = document.getElementById("finesTableBody");

  if (!tbody) return;

  tbody.innerHTML = "";

  const searchElement = document.getElementById("searchInput");
  const statusElement = document.getElementById("statusFilter");
  const reasonElement = document.getElementById("reasonFilter");

  const search = searchElement ? searchElement.value.toLowerCase() : "";

  const statusFilter = statusElement ? statusElement.value : "ALL";

  const reasonFilter = reasonElement ? reasonElement.value : "ALL";

  const list = getFilteredFines();

  const filtered = list.filter((f) => {
    const matchSearch =
      f.name.toLowerCase().includes(search) ||
      f.roll.toLowerCase().includes(search) ||
      f.reason.toLowerCase().includes(search);

    const matchStatus = statusFilter === "ALL" || f.status === statusFilter;

    const matchReason = reasonFilter === "ALL" || f.reason === reasonFilter;

    return matchSearch && matchStatus && matchReason;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="7"
                    class="py-6 text-center text-slate-400 font-semibold">
                    No matching fine records found.
                </td>
            </tr>
        `;

    return;
  }

  filtered.forEach((f) => {
    const tr = document.createElement("tr");

    tr.className = "hover:bg-[#f7f5f0] dark:hover:bg-[#12171e] transition-all";

    let actionHTML = "";

    if (currentUserRole === "ADMIN") {
      actionHTML = `
                <div class="flex items-center justify-center space-x-1.5">

                    <button onclick="toggleFineStatus('${f.id}')"
                        title="Toggle Status"
                        class="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold">

                        <i class="fa-solid fa-rotate"></i>
                    </button>

                    <button onclick="editFine('${f.id}')"
                        title="Edit"
                        class="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold">

                        <i class="fa-solid fa-pen"></i>
                    </button>

                    <button onclick="deleteFine('${f.id}')"
                        title="Delete"
                        class="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-bold">

                        <i class="fa-solid fa-trash"></i>
                    </button>

                    ${f.status === "Paid"
          ? `
                                <button onclick="openReceiptModal('${f.id}')"
                                    title="Print Receipt"
                                    class="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold">

                                    <i class="fa-solid fa-print"></i>
                                </button>
                            `
          : ""
        }

                </div>
            `;
    } else {
      if (f.status === "Paid") {
        actionHTML = `
                    <button onclick="openReceiptModal('${f.id}')"
                        class="bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 font-black text-xs px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800">

                        <i class="fa-solid fa-print mr-1"></i>
                        Receipt
                    </button>
                `;
      } else if (f.appeal) {
        actionHTML = `
                    <div class="flex items-center space-x-1.5 justify-center">

                        <span class="text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800">

                            Appeal: ${sanitizeHTML(f.appeal.status)}

                        </span>

                        ${f.appeal.image
            ? `
                                    <button onclick="openProofViewer('${f.appeal.image}')"
                                        class="p-1.5 bg-slate-100 dark:bg-slate-800 text-amber-500 rounded-lg"
                                        title="View Attached Proof">

                                        <i class="fa-solid fa-image"></i>
                                    </button>
                                `
            : ""
          }

                    </div>
                `;
      } else {
        actionHTML = `
                    <button onclick="openAppealModal('${f.id}')"
                        class="bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 text-rose-600 dark:text-rose-300 font-black text-xs px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 transition-all">

                        Dispute Appeal
                    </button>
                `;
      }
    }

    tr.innerHTML = `
            <td class="py-3 px-4 font-bold text-slate-500 dark:text-slate-400">
                ${sanitizeHTML(f.roll)}
            </td>

            <td class="py-3 px-4 font-black text-[#1e2530] dark:text-white">
                ${sanitizeHTML(f.name)}
            </td>

            <td class="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                ${sanitizeHTML(f.reason)}
            </td>

            <td class="py-3 px-4 font-black">
                PKR ${f.amount}
            </td>

            <td class="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 font-bold">
                ${sanitizeHTML(f.date)}
            </td>

            <td class="py-3 px-4">
                <span class="px-2.5 py-1 rounded-full text-xs font-black ${f.status === "Paid"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
      }">
                    ${sanitizeHTML(f.status)}
                </span>
            </td>

            <td class="py-3 px-4 text-center">
                ${actionHTML}
            </td>
        `;

    tbody.appendChild(tr);
  });
}

// =========================================
// STUDENTS DIRECTORY
// =========================================

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

                ${currentUserRole === "ADMIN"
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

  tbody.innerHTML = "";

  const totalCollected = fines
    .filter((f) => f.status === "Paid")
    .reduce((sum, f) => sum + Number(f.amount || 0), 0);

  const totalSpent = expenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0,
  );

  const remaining = totalCollected - totalSpent;

  const collectedEl = document.getElementById("fundTotalCollected");
  const spentEl = document.getElementById("fundTotalSpent");
  const balanceEl = document.getElementById("fundCurrentBalance");

  if (collectedEl) {
    collectedEl.innerText = `PKR ${totalCollected.toLocaleString()}`;
  }

  if (spentEl) {
    spentEl.innerText = `PKR ${totalSpent.toLocaleString()}`;
  }

  if (balanceEl) {
    balanceEl.innerText = `PKR ${remaining.toLocaleString()}`;
  }

  if (expenses.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="5"
                    class="py-6 text-center text-slate-400 font-semibold">
                    No class expenses logged yet.
                </td>
            </tr>
        `;

    return;
  }

  expenses
    .slice()
    .reverse()
    .forEach((e) => {
      const tr = document.createElement("tr");

      tr.className =
        "hover:bg-[#f7f5f0] dark:hover:bg-[#12171e] transition-all";

      tr.innerHTML = `
            <td class="py-3 px-4 font-bold text-slate-500 dark:text-slate-400">
                ${sanitizeHTML(String(e.date || ""))}
            </td>

            <td class="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                ${sanitizeHTML(String(e.comment || ""))}
            </td>

            <td class="py-3 px-4">
                <span class="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-lg text-xs font-black">
                    ${sanitizeHTML(String(e.category || ""))}
                </span>
            </td>

            <td class="py-3 px-4 font-black text-rose-600 dark:text-rose-400">
                PKR ${Number(e.amount || 0).toLocaleString()}
            </td>

            <td class="py-3 px-4 text-center admin-only">
                ${currentUserRole === "ADMIN"
          ? `
                            <button
                                onclick="confirmRemoveExpense('${sanitizeHTML(String(e.id))}')"
                                title="Delete Expense"
                                class="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-bold">

                                <i class="fa-solid fa-trash"></i>
                            </button>
                        `
          : ""
        }
            </td>
        `;

      tbody.appendChild(tr);
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

                ${f.appeal.image
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

  document.getElementById("expenseDate").value = new Date()
    .toISOString()
    .split("T")[0];

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

  // Keep uploads small because browser localStorage has limited capacity.
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

  if (students.length === 0) {
    showToast("Please register a student before creating a fine.", "error");

    return;
  }

  document.getElementById("fineEditId").value = "";

  document.getElementById("fineModalTitle").innerText = "New Fine Entry";

  document.getElementById("modalReasonSelect").value = "Absent during Test";

  document.getElementById("modalAmountInput").value = "200";

  document.getElementById("modalStatusSelect").value = "Pending";

  populateStudentSelectors();

  document.getElementById("fineModal").classList.remove("hidden");
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
      "This version stores portal information in your browser localStorage.<br>" +
      "It does not provide verified end-to-end encryption or server-side authentication.<br>" +
      "Do not use this browser-only version to store sensitive real student records.";
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

function sendAIMessage() {
  const input = document.getElementById("aiUserInput");

  if (!input) return;

  const text = input.value.trim();

  if (!text) return;

  // Show user message
  addUserChatMessage(text);

  input.value = "";

  // Generate response
  setTimeout(() => {
    const reply = generateAssistantReply(text);

    addAssistantChatMessage(reply);
  }, 400);
}

// =========================================
// APPLICATION INITIALIZATION
// =========================================

document.addEventListener("DOMContentLoaded", function () {
  console.log("KIPS CSB-37 Portal Initialized");

  // Load saved theme
  applyThemeOnLoad();

  // Populate student selectors
  populateStudentSelectors();

  // Initialize fine calculator
  calculateFineEstimate();

  // Initialize appeal notification badge
  updateAppealsBadge();

  // Initialize dashboard
  refreshAllViews();

  // Restore saved announcement, if available
  const savedAnnouncement = localStorage.getItem("kips_announcement");

  if (savedAnnouncement) {
    const announcementElement = document.getElementById("announcementText");

    if (announcementElement) {
      announcementElement.textContent = savedAnnouncement;
    }
  }

  console.log("KIPS CSB-37 Portal Ready");
});
