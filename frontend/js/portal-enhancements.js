/*
 * KIPS-CSB37 Portal — server-backed enhancement layer.
 * Existing page structure and visual components are retained. Business records
 * are loaded from the Spring Boot API and are never persisted in browser storage.
 */
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  const money = (value) => `PKR ${Number(value || 0).toLocaleString("en-PK")}`;
  const isoToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const api = () => {
    if (!window.CSB37API)
      throw new Error(
        "API client load nahi hua. Page ko local web server se open karein.",
      );
    return window.CSB37API;
  };
  const normalStatus = (value) =>
    ({
      UNPAID: "Pending",
      PENDING: "Pending",
      PARTIAL: "Partial",
      PAID: "Paid",
      WAIVED: "Waived",
      CANCELLED: "Cancelled",
      OVERDUE: "Overdue",
      APPROVED: "Approved",
      REJECTED: "Rejected",
      PREVIEW_READY: "Preview Ready",
      QUEUED: "Queued",
      SENT: "Sent",
      DELIVERED: "Delivered",
      FAILED: "Failed",
    })[String(value || "").toUpperCase()] ||
    value ||
    "Pending";
  const toApiWeek = (value) => {
    const v = String(value || "").toUpperCase();
    return ["TEST", "STUDY", "NORMAL", "SATURDAY", "OTHER"].includes(v)
      ? v
      : null;
  };

  let portalLeaves = [];
  let portalAppeals = [];
  let portalNotices = [];
  let portalNotifications = [];
  let portalAttendance = [];
  let portalSchedule = null;
  let selectedStatement = null;
  let selectedWhatsApp = null;
  let lastPortalLoad = 0;

  function toast(message, type = "success") {
    if (typeof window.showToast === "function") window.showToast(message, type);
    else {
      const node = document.createElement("div");
      node.textContent = message;
      node.className = `portal-fallback-toast ${type}`;
      document.body.appendChild(node);
      setTimeout(() => node.remove(), 3200);
    }
  }
  function ensureAdmin() {
    if (window.CSB37Auth?.user?.role !== "ADMIN")
      throw new Error("Sirf Admin ko is functionality ki ijazat hai.");
  }
  function setBusy(form, busy) {
    if (!form) return;
    form.querySelectorAll('button[type="submit"]').forEach((button) => {
      button.disabled = busy;
      button.classList.toggle("opacity-60", busy);
      button.classList.toggle("cursor-wait", busy);
    });
  }
  function uploadUrl(fileId) {
    return `${window.CSB37_API_BASE || "http://localhost:8080/api"}/files/${encodeURIComponent(fileId)}`;
  }
  function apiFineStatus(f) {
    const assessed = Number(
      f.assessed_amount_pkr ?? f.assessedAmountPkr ?? f.amount ?? 0,
    );
    const paid = Number(f.paid_amount ?? f.paidAmount ?? 0);
    const waived = Number(f.waived_amount ?? f.waivedAmount ?? 0);
    if (String(f.status).toUpperCase() === "CANCELLED") return "Cancelled";
    if (paid + waived >= assessed && waived > 0) return "Waived";
    if (paid >= assessed && assessed > 0) return "Paid";
    if (paid > 0) return "Partial";
    return normalStatus(f.status);
  }

  async function loadPortalData() {
    const client = api();
    const user = window.CSB37Auth?.user;
    if (!user) throw new Error("Pehle login karein.");
    const tasks = [
      client.portal(),
      client.students(),
      client.fines(),
      client.leaves(),
      client.appeals(),
      client.notices(),
      client.attendance(isoToday()),
    ];
    if (user.role === "ADMIN")
      tasks.push(
        client.expenses(),
        client.audit(),
        client.notifications(),
        client.schedule(),
      );
    const results = await Promise.all(tasks);
    const [
      portal,
      studentRows,
      fineRows,
      leaveRows,
      appealRows,
      noticeRows,
      attendanceRows,
    ] = results;
    const expenseRows = user.role === "ADMIN" ? results[7] : [];
    const auditRows = user.role === "ADMIN" ? results[8] : [];
    const notificationRows = user.role === "ADMIN" ? results[9] : [];
    portalSchedule =
      user.role === "ADMIN"
        ? results[10]
        : await client.schedule().catch(() => null);

    students = (studentRows || portal.students || []).map((s) => ({
      id: String(s.id),
      roll: s.roll ?? s.rollNumber ?? s.roll_number,
      name: s.name ?? s.fullName ?? s.full_name,
      status: s.status || "ACTIVE",
      className: s.className ?? s.class_name ?? "CSB-37",
      academicYear: s.academicYear ?? s.academic_year ?? "",
      whatsappLast4: s.whatsappLast4 ?? s.whatsapp_number_last4 ?? "",
      whatsappNumber: s.whatsappNumber ?? s.whatsapp_number ?? "",
    }));
    const studentById = new Map(students.map((s) => [s.id, s]));
    fines = (fineRows || portal.fines || []).map((f) => {
      const sid = String(f.student_id ?? f.studentId ?? "");
      const s = studentById.get(sid) || {};
      const assessed = Number(
        f.assessed_amount_pkr ?? f.assessedAmountPkr ?? f.amount ?? 0,
      );
      const paid = Number(f.paid_amount ?? f.paidAmount ?? 0);
      const waived = Number(f.waived_amount ?? f.waivedAmount ?? 0);
      return {
        id: String(f.id),
        studentId: sid,
        roll: f.roll ?? f.roll_number ?? s.roll,
        name: f.full_name ?? f.fullName ?? f.name ?? s.name,
        reason: f.category ?? f.reason ?? "Fine",
        note: f.reason ?? f.note ?? "",
        amount: assessed,
        paidAmount: paid,
        waivedAmount: waived,
        date: String(
          f.occurrence_date ?? f.occurrenceDate ?? f.date ?? "",
        ).slice(0, 10),
        entryDate: String(f.entry_date ?? f.entryDate ?? "").slice(0, 10),
        weekType: f.week_type ?? f.weekType ?? "",
        status: apiFineStatus({
          ...f,
          paid_amount: paid,
          waived_amount: waived,
          assessed_amount_pkr: assessed,
        }),
        appeal: null,
      };
    });
    portalAppeals = (appealRows || []).map((a) => ({
      id: String(a.id),
      fineId: String(a.fine_id ?? a.fineId),
      studentId: String(a.student_id ?? a.studentId),
      reason: a.reason,
      status: normalStatus(a.status),
      decisionNote: a.decision_note ?? a.decisionNote,
      proofFileId: a.proof_file_id ?? a.proofFileId,
      text: a.reason,
      image:
        (a.proof_file_id ?? a.proofFileId)
          ? String(a.proof_file_id ?? a.proofFileId)
          : "",
      createdAt: a.created_at ?? a.createdAt,
    }));
    const appealByFine = new Map(portalAppeals.map((a) => [a.fineId, a]));
    fines.forEach((f) => {
      f.appeal = appealByFine.get(f.id) || null;
    });
    portalLeaves = (leaveRows || []).map((l) => ({
      id: String(l.id),
      studentId: String(l.student_id ?? l.studentId),
      roll: l.roll_number ?? l.roll,
      name: l.full_name ?? l.fullName ?? l.name,
      type: l.leave_type ?? l.leaveType,
      startDate: String(l.start_date ?? l.startDate ?? "").slice(0, 10),
      endDate: String(l.end_date ?? l.endDate ?? "").slice(0, 10),
      description: l.description,
      status: String(l.status || "PENDING").toUpperCase(),
      decisionNote: l.decision_note ?? l.decisionNote,
      submittedAt: l.submitted_at ?? l.submittedAt,
      proofFileId: l.proof_file_id ?? l.proofFileId,
    }));
    portalNotices = (noticeRows || []).map((n) => ({
      id: String(n.id),
      title: n.title,
      category: n.category,
      shortDescription: n.short_description ?? n.shortDescription,
      body: n.body,
      eventDate: n.event_date ?? n.eventDate,
      startTime: n.start_time ?? n.startTime,
      endTime: n.end_time ?? n.endTime,
      instructions: n.instructions,
      publishAt: n.publish_at ?? n.publishAt,
      expiresAt: n.expires_at ?? n.expiresAt,
      status: n.status || "PUBLISHED",
      isRead: Boolean(n.isRead ?? n.is_read),
      attachmentFileId: n.attachment_file_id ?? n.attachmentFileId,
    }));
    portalAttendance = attendanceRows || [];
    expenses = (expenseRows || []).map((e) => ({
      id: String(e.id),
      category: e.category,
      comment: e.description ?? e.comment,
      amount: Number(e.amount_pkr ?? e.amount ?? 0),
      date: String(e.expense_date ?? e.date ?? "").slice(0, 10),
    }));
    accessLogs = (auditRows || []).map((a) => ({
      id: String(a.id),
      user: a.actor_username ?? a.actor_user_id ?? "System",
      timestamp: a.created_at ?? a.createdAt,
      action: a.action,
      record: `${a.entity_type || ""} ${a.entity_id || ""}`,
      device: "Server audit",
      agent: "",
    }));
    portalNotifications = notificationRows || [];
    const ownStudent = students.find((s) => s.id === user.studentId);
    if (user.role === "STUDENT")
      currentStudentFilter = ownStudent?.roll || user.rollNumber || "SELF";
    else if (
      currentStudentFilter !== "ALL" &&
      !students.some((s) => s.roll === currentStudentFilter)
    )
      currentStudentFilter = "ALL";
    if (typeof window.populateStudentSelectors === "function")
      populateStudentSelectors();
    if (typeof window.refreshAllViews === "function") refreshAllViews();
    renderLeaves();
    renderAnnouncements();
    renderWhatsAppManagement();
    renderAdminMetrics();
    renderSchedule();
    updateUpdateBadge();
    lastPortalLoad = Date.now();
  }
  async function reloadAfterMutation(message) {
    await loadPortalData();
    if (message) toast(message, "success");
  }

  // Browser storage is reserved for the user's theme preference. No portal records are cached there.
  window.saveData = function noBrowserRecordPersistence() { };
  window.applyThemeOnLoad = function applyThemeOnLoad() {
    const saved = localStorage.getItem("kips_theme") || "dark";
    document.documentElement.classList.toggle("dark", saved === "dark");
    updateThemeIcon();
  };
  function updateThemeIcon() {
    const icon = $("#themeToggleIcon");
    if (icon)
      icon.className = document.documentElement.classList.contains("dark")
        ? "fa-solid fa-sun text-sm text-amber-400"
        : "fa-solid fa-moon text-sm text-slate-700";
  }
  window.toggleTheme = function toggleTheme() {
    const html = document.documentElement;
    const dark = html.classList.toggle("dark");
    localStorage.setItem("kips_theme", dark ? "dark" : "light");
    updateThemeIcon();
    if (
      currentView === "analytics" &&
      typeof window.renderCharts === "function"
    )
      renderCharts();
  };

  window.handlePortalLogin = async function handlePortalLogin(event) {
    event.preventDefault();
    const username = $("#loginUsername")?.value.trim();
    const password = $("#loginIdentifier")?.value;
    const form = event.currentTarget;
    if (!username || !password) {
      toast("Username aur password dono required hain.", "error");
      return;
    }
    setBusy(form, true);
    try {
      await api().login({ username, password });
      currentUserRole = window.CSB37Auth.user.role;
      sessionStartTime = Date.now();
      await loadPortalData();
      $("#view-login")?.classList.add("hidden");
      $("#appContainer")?.classList.remove("hidden");
      applyRoleUI();
      switchView("dashboard");
      toast(`Welcome ${window.CSB37Auth.user.name || username}.`, "success");
    } catch (error) {
      toast(error.message || "Login unsuccessful.", "error");
    } finally {
      setBusy(form, false);
    }
  };
  window.handleLogout = function handleLogout() {
    window.CSB37Auth?.clear();
    currentUserRole = "STUDENT";
    currentStudentFilter = "ALL";
    students = [];
    fines = [];
    expenses = [];
    accessLogs = [];
    portalLeaves = [];
    portalAppeals = [];
    portalNotices = [];
    portalAttendance = [];
    $("#appContainer")?.classList.add("hidden");
    $("#view-login")?.classList.remove("hidden");
    $("#loginIdentifier").value = "";
    $("#loginUsername").value = "";
    toast("Signed out. Please sign in again.", "success");
  };
  window.applyRoleUI = function applyRoleUI() {
    const admin = window.CSB37Auth?.user?.role === "ADMIN";
    $$(".admin-only").forEach((el) => el.classList.toggle("hidden", !admin));
    $$(".student-only").forEach((el) => el.classList.toggle("hidden", admin));
    const leaveLabel = $("#nav-leaves span");
    if (leaveLabel)
      leaveLabel.textContent = admin ? "Leave Applications" : "Apply for Leave";
    $("#studentSelectorHeader")?.classList.toggle("hidden", !admin);
  };
  window.switchView = function switchView(viewId) {
    const admin = window.CSB37Auth?.user?.role === "ADMIN";
    const student = window.CSB37Auth?.user?.role === "STUDENT";
    if (
      !admin &&
      ["whatsapp", "attendance", "accesslogs", "settings"].includes(viewId)
    ) {
      toast("Admin permission required.", "error");
      return;
    }
    if (viewId === "leaves" && !(admin || student)) return;
    currentView = viewId;
    $$(".content-view").forEach((v) => v.classList.add("hidden"));
    const target = $(`#view-${viewId}`);
    if (target) target.classList.remove("hidden");
    $$(".nav-btn").forEach((b) =>
      b.classList.remove(
        "bg-slate-800/80",
        "text-white",
        "border-amber-500/30",
      ),
    );
    $(`#nav-${viewId}`)?.classList.add(
      "bg-slate-800/80",
      "text-white",
      "border-amber-500/30",
    );
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
      leaves: admin ? "Leave Applications Management" : "Apply for Leave",
      attendance: "Attendance Register",
      whatsapp: "WhatsApp Management",
      updates: "New Updates & Announcements",
    };
    if ($("#pageTitle"))
      $("#pageTitle").textContent = titles[viewId] || "Portal";
    $("#sidebar")?.classList.remove("-translate-x-full");
    $("#sidebarOverlay")?.classList.add("hidden");
    if (viewId === "leaves") renderLeaves();
    if (viewId === "attendance") loadAttendanceRegister();
    if (viewId === "whatsapp") renderWhatsAppManagement();
    if (viewId === "updates") renderAnnouncements();
    if (viewId === "analytics" && window.renderCharts) renderCharts();
  };
  window.toggleSidebar = function toggleSidebar() {
    $("#sidebar")?.classList.toggle("-translate-x-full");
    $("#sidebarOverlay")?.classList.toggle("hidden");
  };
  window.changeStudentProfile = function changeStudentProfile() {
    currentStudentFilter = $("#studentSelector")?.value || "ALL";
    refreshAllViews();
    renderAdminMetrics();
  };
  window.populateStudentSelectors = function populateStudentSelectors() {
    const options = students
      .map(
        (s) =>
          `<option value="${esc(s.roll)}">${esc(s.roll)} — ${esc(s.name)}</option>`,
      )
      .join("");
    if ($("#studentSelector"))
      $("#studentSelector").innerHTML =
        `<option value="ALL">ALL (Class Overview)</option>${options}`;
    if ($("#modalStudentSelect")) $("#modalStudentSelect").innerHTML = options;
    if ($("#studentSelector"))
      $("#studentSelector").value = currentStudentFilter;
  };

  // Backend data-aware financial totals; net balance is allowed to be negative.
  window.updateStats = function updateStats() {
    const role = window.CSB37Auth?.user?.role;
    const list =
      role === "ADMIN" && currentStudentFilter === "ALL"
        ? fines
        : fines.filter((f) =>
          role === "ADMIN"
            ? f.roll === currentStudentFilter
            : f.roll === currentStudentFilter,
        );
    const sum = (fn, rows = list) => rows.reduce((n, row) => n + fn(row), 0);
    const activeFines = list.filter((f) => f.status !== "Cancelled");
    const assessed = sum((f) => Number(f.amount), activeFines);
    const collected = sum((f) => Number(f.paidAmount || 0), activeFines);
    const waived = sum((f) => Number(f.waivedAmount || 0), activeFines);
    const due = Math.max(0, assessed - collected - waived);
    const spending =
      role === "ADMIN"
        ? expenses.reduce((n, e) => n + Number(e.amount || 0), 0)
        : 0;
    const net = collected - spending;
    const pairs = {
      statTotalCollected: money(collected),
      statTotalSpent: money(spending),
      statRemainingFund: money(net),
      statTotalPending: money(due),
      adminMetricTotalStudents: String(
        students.filter((s) => s.status === "ACTIVE").length,
      ),
      adminMetricFineRecords: String(activeFines.length),
      adminMetricAssessed: money(assessed),
      adminMetricCollectionRate: `${assessed - waived > 0 ? ((collected / (assessed - waived)) * 100).toFixed(1) : "0.0"}%`,
      adminMetricPendingLeaves: String(
        portalLeaves.filter((l) => l.status === "PENDING").length,
      ),
      adminMetricNetFund: money(net),
    };
    Object.entries(pairs).forEach(([id, value]) => {
      const el = $(`#${id}`);
      if (el) el.textContent = value;
    });
    const scheduleText = $("#announcementText");
    if (scheduleText && portalNotices.length)
      scheduleText.textContent =
        portalNotices.find((n) => n.status === "PUBLISHED")?.shortDescription ||
        portalNotices.find((n) => n.status === "PUBLISHED")?.body ||
        scheduleText.textContent;
  };
  window.renderHonorRoll = function renderHonorRoll() {
    const container = $("#honorRollContainer");
    if (!container) return;
    const eligible = students.filter((s) =>
      fines
        .filter((f) => f.studentId === s.id && f.status !== "Cancelled")
        .every((f) => f.amount - f.paidAmount - f.waivedAmount <= 0),
    );
    container.innerHTML =
      eligible
        .map(
          (s) =>
            `<div class="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-black"><i class="fa-solid fa-circle-check mr-1"></i>${esc(s.name)} (${esc(s.roll)})</div>`,
        )
        .join("") ||
      '<span class="text-xs text-slate-400 font-bold">No students currently on honor roll.</span>';
  };

  function renderAdminMetrics() {
    const isAdmin = window.CSB37Auth?.user?.role === "ADMIN";
    $$(".admin-metric-card").forEach((el) =>
      el.classList.toggle("hidden", !isAdmin),
    );
    const statWrap = $("#adminDashboardActions");
    if (statWrap) statWrap.classList.toggle("hidden", !isAdmin);
  }

  // Fine entry: selected occurrence date is authoritative. The backend resolves the effective policy for that date.
  const originalOpenFineModal = window.openAddFineModal;
  window.openAddFineModal = function openAddFineModal() {
    if (window.CSB37Auth?.user?.role !== "ADMIN") {
      toast("Admin permission required.", "error");
      return;
    }
    if (!students.length) {
      toast("Pehle student register karein.", "error");
      return;
    }
    originalOpenFineModal?.();
    if ($("#modalFineDate")) $("#modalFineDate").value = isoToday();
    if ($("#attendanceDateInput")) $("#attendanceDateInput").value = isoToday();
    if ($("#modalWeekType")) $("#modalWeekType").value = "";
  };
  window.saveFine = async function saveFine(event) {
    event.preventDefault();
    try {
      ensureAdmin();
      const editingId = $("#fineEditId").value;
      const student = students.find(
        (s) => s.roll === $("#modalStudentSelect").value,
      );
      const category = $("#modalReasonSelect").value;
      const occurrenceDate = $("#modalFineDate")?.value || isoToday();
      const amount = Number($("#modalAmountInput").value);
      const status = $("#modalStatusSelect").value;
      let weekType = toApiWeek($("#modalWeekType")?.value);
      if (category.includes("Saturday")) weekType = "SATURDAY";
      if (
        !student ||
        !occurrenceDate ||
        !Number.isSafeInteger(amount) ||
        amount <= 0
      )
        throw new Error("Student, date aur valid amount zaroor select karein.");
      const payload = {
        category,
        reason: category,
        occurrenceDate,
        amountPkr: amount,
        weekType,
      };
      if (editingId) {
        await api().updateFine(editingId, payload);
        if (status === "Paid") {
          const current = fines.find((f) => f.id === editingId);
          const remaining = current
            ? current.amount - current.paidAmount - current.waivedAmount
            : 0;
          if (remaining > 0)
            await api().payment({
              fineId: editingId,
              amountPkr: remaining,
              paymentMethod: "CASH",
            });
        }
      } else {
        const created = await api().createFine({
          ...payload,
          studentId: student.id,
        });
        if (status === "Paid" && Number(created.amountPkr || amount) > 0) {
          await api().payment({
            fineId: created.id,
            amountPkr: Number(created.amountPkr || amount),
            paymentMethod: "CASH",
          });
        }
      }
      $("#fineModal")?.classList.add("hidden");
      await reloadAfterMutation(
        editingId ? "Fine record updated." : "Fine record saved to PostgreSQL.",
      );
    } catch (error) {
      toast(error.message || "Fine save failed.", "error");
    }
  };
  window.editFine = function editFine(id) {
    ensureAdmin();
    const fine = fines.find((f) => f.id === id);
    if (!fine) return toast("Fine not found.", "error");
    $("#fineEditId").value = fine.id;
    $("#fineModalTitle").textContent = "Edit Fine Record";
    populateStudentSelectors();
    $("#modalStudentSelect").value = fine.roll;
    $("#modalStudentSelect").disabled = true;
    $("#modalReasonSelect").value = fine.reason;
    $("#modalAmountInput").value = fine.amount;
    $("#modalStatusSelect").value = fine.status === "Paid" ? "Paid" : "Pending";
    if ($("#modalFineDate")) $("#modalFineDate").value = fine.date;
    if ($("#modalWeekType"))
      $("#modalWeekType").value = fine.weekType || "OTHER";
    $("#fineModal").classList.remove("hidden");
  };
  const oldCloseFine = window.closeFineModal;
  window.closeFineModal = function closeFineModal() {
    if ($("#modalStudentSelect")) $("#modalStudentSelect").disabled = false;
    oldCloseFine?.();
  };
  window.toggleFineStatus = async function toggleFineStatus(id) {
    try {
      ensureAdmin();
      const fine = fines.find((f) => f.id === id);
      if (!fine) throw new Error("Fine not found.");
      const remaining =
        Number(fine.amount) -
        Number(fine.paidAmount || 0) -
        Number(fine.waivedAmount || 0);
      if (remaining <= 0)
        throw new Error("Is fine ki remaining balance zero hai.");
      const entered = window.prompt(
        `Payment amount (remaining balance: PKR ${remaining.toLocaleString("en-PK")}):`,
        String(remaining),
      );
      if (entered === null) return;
      const amount = Number(entered.trim());
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining)
        throw new Error(
          "Payment amount remaining balance se zyada ya invalid nahi ho sakti.",
        );
      const method =
        window.prompt("Payment method (CASH / BANK / ONLINE):", "CASH") ||
        "CASH";
      await api().payment({
        fineId: fine.id,
        amountPkr: amount,
        paymentMethod: method.toUpperCase(),
      });
      await reloadAfterMutation(
        amount < remaining
          ? "Partial payment recorded; remaining balance retained."
          : "Payment received and recorded.",
      );
    } catch (error) {
      toast(error.message || "Payment failed.", "error");
    }
  };
  window.waiveFineBalance = async function waiveFineBalance(id) {
    try {
      ensureAdmin();
      const fine = fines.find((f) => f.id === id);
      if (!fine) throw new Error("Fine not found.");
      if (fine.status === "Cancelled")
        throw new Error("Cancelled fine par waiver apply nahi ho sakta.");
      const remaining =
        Number(fine.amount) -
        Number(fine.paidAmount || 0) -
        Number(fine.waivedAmount || 0);
      if (remaining <= 0)
        throw new Error("Is fine ki remaining balance zero hai.");
      const reason = window.prompt(
        "Waiver ki reason (audit record ke liye required):",
        "Approved emergency exception",
      );
      if (reason === null) return;
      if (!reason.trim()) throw new Error("Waiver reason required hai.");
      const entered = window.prompt(
        `Waiver amount (remaining: PKR ${remaining.toLocaleString("en-PK")}):`,
        String(remaining),
      );
      if (entered === null) return;
      const amount = Number(entered.trim());
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining)
        throw new Error(
          "Waiver amount remaining balance se zyada ya invalid nahi ho sakti.",
        );
      await api().waiveFine(id, { amountPkr: amount, reason: reason.trim() });
      await reloadAfterMutation(
        "Fine waiver separately recorded with audit history.",
      );
    } catch (error) {
      toast(error.message || "Fine waiver failed.", "error");
    }
  };
  window.deleteFine = async function deleteFine(id) {
    try {
      ensureAdmin();
      const fine = fines.find((f) => f.id === id);
      if (!fine) return;
      if (
        !confirm(
          `Fine ${fine.id} ko cancel karna hai? Financial record delete nahi hoga; audit history preserve hogi.`,
        )
      )
        return;
      await api().cancelFine(id, "Cancelled by administrator");
      await reloadAfterMutation("Fine cancelled; audit history retained.");
    } catch (error) {
      toast(error.message || "Fine cancel failed.", "error");
    }
  };

  // Student directory now stores and edits the registered WhatsApp number on the server.
  window.renderStudentsDirectory = function renderStudentsDirectory() {
    const grid = $("#studentsDirectoryGrid");
    if (!grid) return;
    grid.innerHTML =
      students
        .map((s) => {
          const own = fines.filter(
            (f) => f.roll === s.roll && f.status !== "Cancelled",
          );
          const due = own.reduce(
            (sum, f) =>
              sum + Math.max(0, f.amount - f.paidAmount - f.waivedAmount),
            0,
          );
          const paid = own.reduce(
            (sum, f) => sum + Number(f.paidAmount || 0),
            0,
          );
          return `<article class="card-premium p-5 rounded-2xl shadow-sm space-y-3">
        <div class="flex justify-between items-start"><div><span class="text-xs font-black text-amber-600 bg-amber-50 dark:bg-amber-900/40 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800">${esc(s.roll)}</span><h4 class="font-black text-base mt-2">${esc(s.name)}</h4><p class="text-xs text-slate-500">${esc(s.className)} · ${esc(s.academicYear || "Academic year not set")}</p></div><div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"><i class="fa-solid fa-user-graduate"></i></div></div>
        <div class="grid grid-cols-2 gap-2 pt-2 text-xs font-bold"><div class="bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300">Outstanding<div class="text-sm font-black mt-1">${money(due)}</div></div><div class="bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300">Paid<div class="text-sm font-black mt-1">${money(paid)}</div></div></div>
        <div class="text-xs text-slate-500">WhatsApp: ${s.whatsappNumber ? esc(s.whatsappNumber) : s.whatsappLast4 ? `•••• ${esc(s.whatsappLast4)}` : "Not registered"}</div>
        <div class="pt-2 flex flex-wrap justify-between gap-2 text-xs"><button onclick="viewStudentProfileFines('${esc(s.roll)}')" class="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">View Fines →</button>${window.CSB37Auth?.user?.role === "ADMIN" ? `<button onclick="editStudentWhatsApp('${esc(s.id)}')" class="text-amber-600 font-bold hover:underline"><i class="fa-brands fa-whatsapp"></i> Edit Number</button><button onclick="openFullStatement('${esc(s.id)}')" class="text-emerald-600 font-bold hover:underline">Full Statement</button><button onclick="confirmRemoveStudent('${esc(s.roll)}','${esc(s.name)}')" class="text-rose-500 font-bold"><i class="fa-solid fa-user-slash"></i> Deactivate</button>` : ""}</div>
      </article>`;
        })
        .join("") ||
      '<div class="empty-state">No registered students found.</div>';
  };
  window.editStudentWhatsApp = async function editStudentWhatsApp(studentId) {
    ensureAdmin();
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    const phone = prompt(
      `WhatsApp number for ${student.name} (international format, e.g. +923001234567):`,
    );
    if (phone === null) return;
    try {
      await api().updateStudent(studentId, { whatsappNumber: phone });
      await reloadAfterMutation("WhatsApp number updated securely.");
    } catch (error) {
      toast(error.message || "WhatsApp number update failed.", "error");
    }
  };
  window.saveStudent = async function saveStudent(event) {
    event.preventDefault();
    try {
      ensureAdmin();
      const roll = $("#newRollNo").value.trim();
      const name = $("#newName").value.trim();
      const phone = $("#newWhatsAppNumber")?.value.trim() || "";
      const username = $("#newStudentUsername")?.value.trim() || roll;
      const initialPassword = $("#newStudentPassword")?.value || "";
      if (!roll || !name)
        throw new Error("Roll number aur student name required hain.");
      if (!initialPassword || initialPassword.length < 12)
        throw new Error(
          "Student initial password kam az kam 12 characters ka hona chahiye.",
        );
      await api().createStudent({
        rollNumber: roll,
        fullName: name,
        className: "CSB-37",
        academicYear: "2026-2027",
        whatsappNumber: phone || null,
        username,
        initialPassword,
      });
      $("#studentModal")?.classList.add("hidden");
      await reloadAfterMutation(
        "Student account and directory record created.",
      );
    } catch (error) {
      toast(error.message || "Student save failed.", "error");
    }
  };
  window.executeItemRemoval = async function executeItemRemoval() {
    try {
      ensureAdmin();
      if (typeof studentRollToDelete !== "undefined" && studentRollToDelete) {
        const student = students.find((s) => s.roll === studentRollToDelete);
        if (student) await api().deactivateStudent(student.id);
      } else if (
        typeof expenseIdToDelete !== "undefined" &&
        expenseIdToDelete
      ) {
        throw new Error(
          "Expense deletion is disabled to preserve financial audit history. Add a correcting expense record instead.",
        );
      }
      if (typeof studentRollToDelete !== "undefined")
        studentRollToDelete = null;
      if (typeof expenseIdToDelete !== "undefined") expenseIdToDelete = null;
      $("#customDeleteModal")?.classList.add("hidden");
      await reloadAfterMutation(
        "Record deactivated. Financial history is retained.",
      );
    } catch (error) {
      toast(error.message, "error");
    }
  };

  // Existing appeal UI now uses private server uploads and the authenticated appeal endpoints.
  window.submitAppeal = async function submitAppeal(event) {
    event.preventDefault();
    try {
      if (window.CSB37Auth?.user?.role !== "STUDENT")
        throw new Error("Only the signed-in student can submit an appeal.");
      const fineId = $("#appealFineId").value;
      const reason = $("#appealReasonText").value.trim();
      const file = $("#appealImageInput").files?.[0];
      const fine = fines.find((f) => f.id === fineId);
      if (!fine || fine.roll !== currentStudentFilter)
        throw new Error("Fine record access denied.");
      if (!reason || !file)
        throw new Error("Reason aur proof dono required hain.");
      if (
        !["application/pdf", "image/jpeg", "image/png"].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw new Error("Proof PDF/JPG/PNG aur 5 MB se kam hona chahiye.");
      const uploaded = await api().upload(file, "APPEAL_PROOF");
      await api().createAppeal({ fineId, reason, proofFileId: uploaded.id });
      $("#appealModal")?.classList.add("hidden");
      await reloadAfterMutation("Appeal with proof submitted.");
    } catch (error) {
      toast(error.message || "Appeal submit failed.", "error");
    }
  };
  window.resolveAppeal = async function resolveAppeal(id, status) {
    try {
      ensureAdmin();
      const fine = fines.find((f) => f.id === id);
      if (!fine?.appeal) throw new Error("Appeal record not found.");
      const payload = {
        status: String(status).toUpperCase(),
        decisionNote: "",
      };
      if (payload.status === "APPROVED") {
        const remaining = fine.amount - fine.paidAmount - fine.waivedAmount;
        const amount = Number(
          prompt(
            `Approved appeal ke liye kitna amount waive karna hai? Remaining: PKR ${remaining}`,
            String(remaining),
          ),
        );
        if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining)
          throw new Error("Valid waiver amount enter karein.");
        payload.waiverAmountPkr = amount;
        payload.waiverReason = prompt("Waiver reason:") || "Approved appeal";
        payload.decisionNote = payload.waiverReason;
      } else {
        payload.decisionNote =
          prompt("Rejection reason (student ko dikhaya jayega):") || "";
        if (!payload.decisionNote.trim())
          throw new Error("Rejection reason required hai.");
      }
      await api().decideAppeal(fine.appeal.id, payload);
      await reloadAfterMutation(`Appeal ${payload.status.toLowerCase()}.`);
    } catch (error) {
      toast(error.message || "Appeal decision failed.", "error");
    }
  };
  window.openPrivateFile = async function openPrivateFile(fileId) {
    try {
      const token = window.CSB37Auth?.token;
      const response = await fetch(uploadUrl(fileId), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("File access denied.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const tab = window.open(url, "_blank", "noopener,noreferrer");
      if (!tab)
        toast(
          "Browser ne new tab block kar di; popup permission allow karein.",
          "error",
        );
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      toast(error.message || "Unable to open file.", "error");
    }
  };
  window.openProofViewer = async function openProofViewer(fileId) {
    try {
      const token = window.CSB37Auth?.token;
      const response = await fetch(uploadUrl(fileId), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Proof file access denied.");
      const blob = await response.blob();
      const localUrl = URL.createObjectURL(blob);
      const type = blob.type || "";
      if (type === "application/pdf") {
        const tab = window.open(localUrl, "_blank", "noopener,noreferrer");
        if (!tab)
          toast(
            "Browser ne new tab block kar di; popup permission allow karein.",
            "error",
          );
      } else {
        $("#proofModalImg").src = localUrl;
        $("#proofViewerModal")?.classList.remove("hidden");
      }
    } catch (error) {
      toast(error.message || "Unable to open proof.", "error");
    }
  };

  // Expenses are created by the API; no browser-side persistence.
  window.saveExpense = async function saveExpense(event) {
    event.preventDefault();
    try {
      ensureAdmin();
      const category = $("#expenseCategory").value,
        description = $("#expenseComment").value.trim();
      const amountPkr = Number($("#expenseAmount").value),
        expenseDate = $("#expenseDate").value;
      if (
        !category ||
        !description ||
        !Number.isSafeInteger(amountPkr) ||
        amountPkr <= 0 ||
        !expenseDate
      )
        throw new Error("Expense details check karein.");
      await api().createExpense({
        category,
        description,
        amountPkr,
        expenseDate,
      });
      $("#expenseModal")?.classList.add("hidden");
      await reloadAfterMutation("Class expense saved.");
    } catch (error) {
      toast(error.message || "Expense save failed.", "error");
    }
  };

  // Fine receipt and complete student statement.
  window.openReceiptModal = async function openReceiptModal(fineId) {
    const fine = fines.find((f) => f.id === fineId);
    if (!fine) return;
    const student = students.find((s) => s.id === fine.studentId);
    if (!student) return;
    await window.openFullStatement(student.id);
  };
  window.openFullStatement = async function openFullStatement(studentId) {
    try {
      const data = await api().statement(studentId);
      selectedStatement = data;
      renderStatement(data);
      $("#fullStatementModal")?.classList.remove("hidden");
    } catch (error) {
      toast(error.message || "Statement load failed.", "error");
    }
  };
  function renderStatement(data) {
    const root = $("#fullStatementContent");
    if (!root) return;
    const student = data.student || {};
    const summary = data.summary || {};
    const entries = data.entries || [];
    const attendance = data.attendanceSummary || {};
    const apps = data.applicationSummary || {};
    const statusForEntry = (row) => {
      if (String(row.status || "").toUpperCase() === "CANCELLED")
        return "Cancelled";
      const paid = Number(row.paid_amount || 0),
        waived = Number(row.waived_amount || 0),
        assessed = Number(row.assessed_amount_pkr || 0);
      return paid + waived >= assessed && waived > 0
        ? "Waived"
        : paid >= assessed
          ? "Paid"
          : paid > 0
            ? "Partial"
            : "Unpaid";
    };
    root.innerHTML = `
      <div class="text-center border-b border-slate-200 pb-3"><h2 class="font-black text-xl">KIPS COLLEGE</h2><p class="text-xs font-extrabold uppercase text-amber-600 tracking-wider">Complete Fine & Attendance Statement · CSB-37</p></div>
      <div class="grid grid-cols-2 gap-2 text-xs"><div><b>Student:</b> ${esc(student.full_name)}</div><div><b>Roll:</b> ${esc(student.roll_number)}</div><div><b>Class:</b> ${esc(student.class_name || "CSB-37")}</div><div><b>Academic Year:</b> ${esc(student.academic_year || "—")}</div><div><b>WhatsApp:</b> ${student.whatsapp_number ? esc(student.whatsapp_number) : student.whatsapp_number_last4 ? `•••• ${esc(student.whatsapp_number_last4)}` : "Not registered"}</div></div>
      <h3 class="font-black text-sm border-b pb-2 mt-4">Attendance & Leave Summary</h3>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">${[
        ["Total leaves", attendance.total_leaves ?? attendance.totalLeaves],
        [
          "Total absences",
          attendance.total_absences ?? attendance.totalAbsences,
        ],
        [
          "Emergency leaves",
          attendance.emergency_leaves ?? attendance.emergencyLeaves,
        ],
        ["Approved leave apps", apps.approved],
        ["Rejected leave apps", apps.rejected],
        [
          "Test-week absences",
          attendance.test_absences ?? attendance.testAbsences,
        ],
        [
          "Study-week absences",
          attendance.study_absences ?? attendance.studyAbsences,
        ],
        ["Test-week leaves", attendance.test_leaves ?? attendance.testLeaves],
        [
          "Study-week leaves",
          attendance.study_leaves ?? attendance.studyLeaves,
        ],
      ]
        .map(
          ([k, v]) =>
            `<div class="bg-slate-50 p-2 rounded-lg"><span class="text-slate-500">${esc(k)}</span><b class="block mt-1">${Number(v || 0)}</b></div>`,
        )
        .join("")}</div>
      <h3 class="font-black text-sm border-b pb-2 mt-4">Every Fine Entry</h3>
      <div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-left border-b"><th class="py-2 pr-2">Date / Reason</th><th class="py-2 pr-2">Assessed</th><th class="py-2 pr-2">Paid</th><th class="py-2 pr-2">Waived</th><th class="py-2 pr-2">Due</th><th class="py-2">Status</th></tr></thead><tbody>${entries
        .map((row) => {
          const due =
            String(row.status || "").toUpperCase() === "CANCELLED"
              ? 0
              : Number(row.assessed_amount_pkr) -
              Number(row.paid_amount || 0) -
              Number(row.waived_amount || 0);
          return `<tr class="border-b"><td class="py-2 pr-2"><b>${esc(String(row.occurrence_date).slice(0, 10))}</b><br>${esc(row.category)}<br><span class="text-slate-500">${esc(row.week_type || "—")} · ${esc(row.reason || "")}</span></td><td class="py-2 pr-2">${money(row.assessed_amount_pkr)}</td><td class="py-2 pr-2">${money(row.paid_amount)}</td><td class="py-2 pr-2">${money(row.waived_amount)}</td><td class="py-2 pr-2">${money(due)}</td><td class="py-2"><b>${statusForEntry(row)}</b></td></tr><tr><td colspan="6" class="pb-2 text-slate-500">${(row.payments || []).map((p) => `${esc(String(p.paid_at || p.paidAt || "").slice(0, 10))} · ${money(p.amount_pkr ?? p.amountPkr)} · ${esc(p.method || p.payment_method || "")} · ${esc(p.receipt_number || p.receiptNumber || "")}`).join("<br>") || "No payments recorded"}</td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="6" class="py-4 text-center text-slate-500">No fine entries.</td></tr>'
      }</tbody></table></div>
      <h3 class="font-black text-sm border-b pb-2 mt-4">Financial Summary</h3>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">${[
        ["Total assessed", summary.assessedPkr],
        ["Total paid", summary.paidPkr],
        ["Total waived", summary.waivedPkr],
        ["Outstanding", summary.outstandingPkr],
      ]
        .map(
          ([k, v]) =>
            `<div class="bg-slate-50 p-3 rounded-lg"><span class="text-slate-500">${esc(k)}</span><b class="block mt-1">${money(v)}</b></div>`,
        )
        .join("")}</div>`;
  }
  window.closeFullStatement = () =>
    $("#fullStatementModal")?.classList.add("hidden");
  window.printFullStatement = () => window.print();

  // WhatsApp management is admin-only and opens an editable preview before handoff to WhatsApp Web.
  window.renderWhatsAppManagement = function renderWhatsAppManagement() {
    const tbody = $("#whatsappManagementBody");
    if (!tbody) return;
    if (window.CSB37Auth?.user?.role !== "ADMIN") {
      tbody.innerHTML = '<tr><td colspan="8">Admin access only.</td></tr>';
      return;
    }
    const rows = students
      .map((s) => {
        const entries = fines.filter(
          (f) => f.studentId === s.id && f.status !== "Cancelled",
        );
        const total = entries.reduce((n, f) => n + Number(f.amount), 0);
        const paid = entries.reduce((n, f) => n + Number(f.paidAmount || 0), 0);
        const waived = entries.reduce(
          (n, f) => n + Number(f.waivedAmount || 0),
          0,
        );
        const due = total - paid - waived;
        return { s, total, paid, due };
      })
      .filter((x) => x.due > 0);
    tbody.innerHTML =
      rows
        .map(
          ({ s, total, paid, due }) =>
            `<tr class="border-b border-slate-200 dark:border-slate-700"><td class="p-3"><b>${esc(s.name)}</b><small class="block text-slate-500">${esc(s.roll)}</small></td><td class="p-3">${esc(s.className || "CSB-37")}</td><td class="p-3">${s.whatsappNumber ? esc(s.whatsappNumber) : "Not set"}</td><td class="p-3">${money(total)}</td><td class="p-3">${money(paid)}</td><td class="p-3 font-black text-rose-600">${money(due)}</td><td class="p-3">${paid <= 0 ? "Unpaid" : "Partially paid"}</td><td class="p-3"><button onclick="prepareWhatsAppStatement('${esc(s.id)}')" class="text-emerald-600 font-black" title="Preview and open WhatsApp"><i class="fa-brands fa-whatsapp"></i> Statement</button></td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="8" class="p-5 text-center text-slate-500">No outstanding student balances found.</td></tr>';
  };
  window.prepareWhatsAppStatement = async function prepareWhatsAppStatement(
    studentId,
  ) {
    try {
      ensureAdmin();
      const result = await api().whatsappStatement(studentId);
      selectedWhatsApp = result;
      const statement = result.statement || {};
      $("#whatsappPreviewContent").innerHTML =
        `<p><b>Student:</b> ${esc(statement.student?.name || "")} (${esc(statement.student?.rollNumber || "")})</p><p><b>Class / Year:</b> ${esc(statement.student?.className || "CSB-37")} / ${esc(statement.student?.academicYear || "—")}</p><p><b>Registered number:</b> •••• ${esc(result.phoneLast4 || "")}</p><p><b>Assessed:</b> ${money(statement.assessedPkr)}</p><p><b>Paid:</b> ${money(statement.paidPkr)}</p><p><b>Waived:</b> ${money(statement.waivedPkr)}</p><p><b>Outstanding:</b> ${money(statement.outstandingPkr)}</p><pre class="whitespace-pre-wrap text-xs mt-3">${esc(result.messageText || "")}</pre>`;
      $("#whatsappPreviewModal")?.classList.remove("hidden");
    } catch (error) {
      toast(error.message || "WhatsApp statement preview failed.", "error");
    }
  };
  window.openPreparedWhatsApp = function openPreparedWhatsApp() {
    if (!selectedWhatsApp?.whatsappUrl)
      return toast("WhatsApp URL available nahi.", "error");
    window.open(selectedWhatsApp.whatsappUrl, "_blank", "noopener,noreferrer");
  };
  window.closeWhatsAppPreview = () =>
    $("#whatsappPreviewModal")?.classList.add("hidden");

  // Student leave workflow and admin review workflow.
  window.submitLeaveApplication = async function submitLeaveApplication(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(form, true);
    try {
      if (window.CSB37Auth?.user?.role !== "STUDENT")
        throw new Error(
          "Leave application student account se submit hoti hai.",
        );
      const leaveType = $("#leaveType").value;
      const startDate = $("#leaveStartDate").value;
      const endDate = $("#leaveEndDate").value;
      const description = $("#leaveDescription").value.trim();
      const file = $("#leaveProof").files?.[0];
      if (
        !startDate ||
        !endDate ||
        endDate < startDate ||
        !description ||
        !file
      )
        throw new Error(
          "Date range, description aur supporting proof required hain.",
        );
      if (
        leaveType === "MARRIAGE" &&
        Math.floor(
          (new Date(`${endDate}T00:00:00`) -
            new Date(`${startDate}T00:00:00`)) /
          86400000,
        ) +
        1 >
        3
      )
        throw new Error("Marriage leave maximum 3 days ho sakti hai.");
      const tomorrow = new Date();
      tomorrow.setHours(0, 0, 0, 0);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const selected = new Date(`${startDate}T00:00:00`);
      if (leaveType !== "EMERGENCY" && selected < tomorrow)
        throw new Error(
          "Normal leave application kam az kam ek din pehle submit karein. Unpredictable emergency ke liye Emergency type select karein.",
        );
      if (
        !["application/pdf", "image/jpeg", "image/png"].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw new Error("Proof PDF/JPG/PNG aur 5 MB se kam hona chahiye.");
      const uploaded = await api().upload(file, "LEAVE_PROOF");
      await api().createLeave({
        leaveType,
        startDate,
        endDate,
        description,
        proofFileId: uploaded.id,
      });
      form.reset();
      await reloadAfterMutation(
        "Leave application submitted for admin review.",
      );
    } catch (error) {
      toast(error.message || "Leave application submit failed.", "error");
    } finally {
      setBusy(form, false);
    }
  };
  window.decideLeaveApplication = async function decideLeaveApplication(
    id,
    status,
  ) {
    try {
      ensureAdmin();
      const decisionNote =
        status === "REJECTED"
          ? prompt("Rejection reason (student ko show hoga):")
          : prompt("Admin note (optional):") || "";
      if (status === "REJECTED" && !decisionNote?.trim())
        throw new Error("Rejection reason required hai.");
      const result = await api().decideLeave(id, { status, decisionNote });
      const detail =
        status === "APPROVED"
          ? ` Approved attendance dates; ${result.finesCreated || 0} policy fine(s) created where applicable. No automatic waiver was applied.`
          : "";
      await reloadAfterMutation(
        `Leave application ${status.toLowerCase()}.${detail}`,
      );
    } catch (error) {
      toast(error.message || "Decision could not be saved.", "error");
    }
  };
  function renderLeaves() {
    const studentPanel = $("#studentLeavePanel");
    const adminPanel = $("#adminLeavePanel");
    const admin = window.CSB37Auth?.user?.role === "ADMIN";
    if (studentPanel) studentPanel.classList.toggle("hidden", admin);
    if (adminPanel) adminPanel.classList.toggle("hidden", !admin);
    const tbody = $("#leaveApplicationsBody");
    if (!tbody) return;
    tbody.innerHTML =
      portalLeaves
        .map(
          (l) =>
            `<tr class="border-b border-slate-200 dark:border-slate-700"><td class="p-3"><b>${esc(l.name || "You")}</b><small class="block text-slate-500">${esc(l.roll || "")}</small></td><td class="p-3">${esc(l.type)}</td><td class="p-3">${esc(l.startDate)} → ${esc(l.endDate)}</td><td class="p-3">${esc(l.description)}</td><td class="p-3"><b>${esc(l.status)}</b>${l.decisionNote ? `<small class="block text-rose-600">${esc(l.decisionNote)}</small>` : ""}</td><td class="p-3"><button type="button" onclick="openPrivateFile('${esc(l.proofFileId)}')" class="text-amber-600 font-bold">View proof</button></td><td class="p-3">${admin && l.status === "PENDING" ? `<button onclick="decideLeaveApplication('${esc(l.id)}','APPROVED')" class="text-emerald-600 font-bold mr-2">Approve</button><button onclick="decideLeaveApplication('${esc(l.id)}','REJECTED')" class="text-rose-600 font-bold">Reject</button>` : ""}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="7" class="p-5 text-center text-slate-500">No leave applications recorded.</td></tr>';
  }

  // Announcements / New Updates management, read-state and secure attachments.
  function formatLocalDateTime(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  window.createAnnouncement = async function createAnnouncement(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(form, true);
    try {
      ensureAdmin();
      const data = {
        title: $("#noticeTitle").value.trim(),
        category: $("#noticeCategory").value,
        shortDescription: $("#noticeShortDescription").value.trim(),
        body: $("#noticeBody").value.trim(),
        eventDate: $("#noticeEventDate").value || null,
        startTime: $("#noticeStartTime").value || null,
        endTime: $("#noticeEndTime").value || null,
        instructions: $("#noticeInstructions").value.trim(),
        publishAt: $("#noticePublishAt").value || null,
        expiresAt: $("#noticeExpiresAt").value || null,
        clearEventDate: !$("#noticeEventDate").value,
        clearStartTime: !$("#noticeStartTime").value,
        clearEndTime: !$("#noticeEndTime").value,
        clearPublishAt: !$("#noticePublishAt").value,
        clearExpiresAt: !$("#noticeExpiresAt").value,
        status: $("#noticeStatus").value,
      };
      if (!data.title || !data.body)
        throw new Error("Title aur full description required hain.");
      if (data.startTime && data.endTime && data.endTime < data.startTime)
        throw new Error("End time start time se pehle nahi ho sakta.");
      if (data.publishAt && data.expiresAt && data.expiresAt <= data.publishAt)
        throw new Error("Expiry time publish time ke baad honi chahiye.");
      const editingId = form.dataset.editId || "";
      let saved;
      if (editingId) {
        saved = await api().updateNotice(editingId, data);
      } else {
        saved = await api().createNotice(data);
      }
      const id = editingId || saved.id;
      const file = $("#noticeAttachment").files?.[0];
      if (file) {
        if (
          !["application/pdf", "image/jpeg", "image/png"].includes(file.type) ||
          file.size > 5 * 1024 * 1024
        )
          throw new Error(
            "Attachment PDF/JPG/PNG aur 5 MB se kam hona chahiye.",
          );
        const uploaded = await api().upload(file, "ANNOUNCEMENT_ATTACHMENT");
        await api().updateNotice(id, { attachmentFileId: uploaded.id });
      }
      if (!editingId && data.status !== "DRAFT")
        await api().updateNotice(id, { status: data.status });
      form.reset();
      delete form.dataset.editId;
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.textContent = "Save Update";
      const cancel = $("#cancelNoticeEdit");
      if (cancel) cancel.classList.add("hidden");
      await reloadAfterMutation(
        editingId ? "Announcement updated." : "Announcement saved.",
      );
    } catch (error) {
      toast(error.message || "Announcement save failed.", "error");
    } finally {
      setBusy(form, false);
    }
  };
  window.changeAnnouncementStatus = async function changeAnnouncementStatus(
    id,
    status,
  ) {
    try {
      ensureAdmin();
      await api().updateNotice(id, { status });
      await reloadAfterMutation(`Announcement ${status.toLowerCase()}.`);
    } catch (error) {
      toast(error.message || "Update failed.", "error");
    }
  };
  window.editAnnouncement = async function editAnnouncement(id) {
    try {
      ensureAdmin();
      const n = portalNotices.find((x) => x.id === id);
      if (!n) throw new Error("Announcement not found.");
      const form = $("#noticeForm");
      if (!form) throw new Error("Announcement form not found.");
      form.dataset.editId = id;
      $("#noticeTitle").value = n.title || "";
      $("#noticeCategory").value = n.category || "GENERAL";
      $("#noticeShortDescription").value = n.shortDescription || "";
      $("#noticeBody").value = n.body || "";
      $("#noticeEventDate").value = String(n.eventDate || "").slice(0, 10);
      $("#noticeStartTime").value = String(n.startTime || "").slice(0, 5);
      $("#noticeEndTime").value = String(n.endTime || "").slice(0, 5);
      $("#noticeInstructions").value = n.instructions || "";
      $("#noticePublishAt").value = String(n.publishAt || "").slice(0, 16);
      $("#noticeExpiresAt").value = String(n.expiresAt || "").slice(0, 16);
      $("#noticeStatus").value = ["DRAFT", "PUBLISHED", "UNPUBLISHED"].includes(
        n.status,
      )
        ? n.status
        : "DRAFT";
      $("#noticeAttachment").value = "";
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.textContent = "Update Update";
      $("#cancelNoticeEdit")?.classList.remove("hidden");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      toast(error.message || "Announcement edit failed.", "error");
    }
  };
  window.cancelAnnouncementEdit = function cancelAnnouncementEdit() {
    const form = $("#noticeForm");
    if (!form) return;
    form.reset();
    delete form.dataset.editId;
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.textContent = "Save Update";
    $("#cancelNoticeEdit")?.classList.add("hidden");
  };
  window.markAnnouncementRead = async function markAnnouncementRead(id) {
    try {
      await api().markNoticeRead(id);
      await loadPortalData();
    } catch (error) {
      toast(error.message || "Read status update failed.", "error");
    }
  };
  function renderAnnouncements() {
    const admin = window.CSB37Auth?.user?.role === "ADMIN";
    $("#adminNoticePanel")?.classList.toggle("hidden", !admin);
    const list = $("#announcementsList");
    if (!list) return;
    const records = admin
      ? portalNotices
      : portalNotices.filter((n) => n.status === "PUBLISHED");
    list.innerHTML =
      records
        .map(
          (n) =>
            `<article class="card-premium rounded-2xl p-5 space-y-2"><div class="flex flex-wrap items-center justify-between gap-2"><span class="text-xs font-black text-amber-600 uppercase">${esc(n.category)}</span><span class="text-xs font-bold ${n.isRead ? "text-slate-400" : "text-emerald-600"}">${admin ? esc(n.status) : n.isRead ? "Read" : "New"}</span></div><h3 class="font-black text-base">${esc(n.title)}</h3><p class="text-xs text-slate-500">${esc(n.eventDate || "")} ${esc(n.startTime || "")}</p><p class="text-sm">${esc(n.shortDescription || n.body)}</p><details class="text-xs"><summary class="font-bold text-amber-600 cursor-pointer">Read full update</summary><div class="pt-3 whitespace-pre-wrap">${esc(n.body)}${n.instructions ? `\n\nInstructions: ${esc(n.instructions)}` : ""}</div></details>${n.attachmentFileId ? `<button type="button" class="text-xs font-bold text-indigo-600" onclick="openPrivateFile('${esc(n.attachmentFileId)}')">Open attachment</button>` : ""}<div class="flex flex-wrap gap-3 pt-2">${!admin && !n.isRead ? `<button onclick="markAnnouncementRead('${esc(n.id)}')" class="text-xs font-bold text-emerald-600">Mark as read</button>` : ""}${admin ? `<button onclick="editAnnouncement('${esc(n.id)}')" class="text-xs font-bold text-indigo-600">Edit</button><button onclick="changeAnnouncementStatus('${esc(n.id)}','PUBLISHED')" class="text-xs font-bold text-emerald-600">Publish</button><button onclick="changeAnnouncementStatus('${esc(n.id)}','UNPUBLISHED')" class="text-xs font-bold text-rose-600">Unpublish / Delete</button>` : ""}</div></article>`,
        )
        .join("") ||
      '<div class="empty-state">No active updates at the moment.</div>';
  }
  function updateUpdateBadge() {
    const unread = portalNotices.filter(
      (n) => n.status === "PUBLISHED" && !n.isRead,
    ).length;
    const badge = $("#updatesUnreadBadge");
    if (badge) {
      badge.textContent = unread;
      badge.classList.toggle("hidden", unread === 0);
    }
  }

  // Admin attendance register. Unmarked rows are intentionally excluded from bulk updates.
  window.loadAttendanceRegister = async function loadAttendanceRegister() {
    try {
      ensureAdmin();
      const date = $("#attendanceDateInput")?.value || isoToday();
      const rows = await api().attendance(date);
      const byStudent = new Map(
        (rows || []).map((r) => [String(r.student_id ?? r.studentId), r]),
      );
      const body = $("#attendanceRegisterBody");
      if (!body) return;
      body.innerHTML =
        students
          .filter((s) => s.status === "ACTIVE")
          .map((s) => {
            const row = byStudent.get(s.id);
            const existing = row ? String(row.status || "").toUpperCase() : "";
            const options = `<option value="">Unmarked — ignore</option><option value="PRESENT" ${existing === "PRESENT" ? "selected" : ""}>Present</option><option value="ABSENT" ${existing === "ABSENT" ? "selected" : ""}>Absent</option><option value="LEAVE" ${existing === "LEAVE" ? "selected" : ""}>Leave</option><option value="EMERGENCY_LEAVE" ${existing === "EMERGENCY_LEAVE" ? "selected" : ""}>Emergency Leave</option>`;
            return `<tr class="border-b border-slate-200 dark:border-slate-700" data-student-id="${esc(s.id)}"><td class="p-3 font-bold">${esc(s.name)}</td><td class="p-3">${esc(s.roll)}</td><td class="p-3"><select class="attendance-status input-premium rounded-lg px-2 py-2 w-full">${options}</select></td><td class="p-3"><input class="attendance-note input-premium rounded-lg px-2 py-2 w-full" maxlength="500" value="${esc(row?.note || "")}" placeholder="Optional note"></td><td class="p-3">${existing ? esc(normalStatus(existing)) : "Not marked"}</td></tr>`;
          })
          .join("") ||
        '<tr><td colspan="5" class="p-5 text-center text-slate-500">No active students registered.</td></tr>';
    } catch (error) {
      toast(error.message || "Attendance register load failed.", "error");
    }
  };
  window.saveAttendanceRegister = async function saveAttendanceRegister() {
    try {
      ensureAdmin();
      const date = $("#attendanceDateInput")?.value;
      if (!date) throw new Error("Attendance date select karein.");
      const rows = $$("#attendanceRegisterBody tr[data-student-id]")
        .map((tr) => ({
          studentId: tr.dataset.studentId,
          date,
          status: tr.querySelector(".attendance-status")?.value || "",
          note: tr.querySelector(".attendance-note")?.value.trim() || "",
        }))
        .filter((row) => row.status);
      if (!rows.length)
        throw new Error(
          "Kam az kam ek student ka attendance status select karein.",
        );
      const result = await api().saveAttendance(rows);
      await reloadAfterMutation(
        `Attendance saved for ${result.saved || rows.length} students. ${result.finesCreated || 0} policy fine(s) created where a configured rule applies.`,
      );
      await loadAttendanceRegister();
    } catch (error) {
      toast(error.message || "Attendance save failed.", "error");
    }
  };

  // Class schedule is admin-configured. No week is guessed from today's date.
  function renderSchedule() {
    const el = $("#currentScheduleInfo");
    if (!el) return;
    const s = portalSchedule;
    if (!s || !s.week_type) {
      el.textContent =
        "Current schedule has not been configured by an administrator.";
      return;
    }
    el.textContent = `${s.label || s.week_type + " Week"} · ${s.week_number ? `Week ${s.week_number} · ` : ""}${String(s.starts_on || s.startDate || "").slice(0, 10)} to ${String(s.ends_on || s.endDate || "").slice(0, 10)} · ${s.description || ""}`;
    if ($("#scheduleWeekType")) $("#scheduleWeekType").value = s.week_type;
    if ($("#scheduleWeekNumber"))
      $("#scheduleWeekNumber").value = s.week_number || "";
    if ($("#scheduleStartDate"))
      $("#scheduleStartDate").value = String(
        s.starts_on || s.startDate || "",
      ).slice(0, 10);
    if ($("#scheduleEndDate"))
      $("#scheduleEndDate").value = String(s.ends_on || s.endDate || "").slice(
        0,
        10,
      );
    if ($("#scheduleDescription"))
      $("#scheduleDescription").value = s.description || "";
  }
  window.saveClassSchedule = async function saveClassSchedule(event) {
    event.preventDefault();
    try {
      ensureAdmin();
      const data = {
        weekType: $("#scheduleWeekType").value,
        weekNumber: $("#scheduleWeekNumber").value
          ? Number($("#scheduleWeekNumber").value)
          : null,
        startDate: $("#scheduleStartDate").value,
        endDate: $("#scheduleEndDate").value,
        description: $("#scheduleDescription").value.trim(),
      };
      if (!data.startDate || !data.endDate || data.endDate < data.startDate)
        throw new Error("Valid schedule date range select karein.");
      portalSchedule = await api().saveSchedule(data);
      renderSchedule();
      toast("Class schedule updated.", "success");
    } catch (error) {
      toast(error.message || "Schedule save failed.", "error");
    }
  };

  // Legacy quick-actions now create audited server records instead of changing only the visible page.
  window.updateAnnouncement = async function updateAnnouncement() {
    try {
      ensureAdmin();
      const input = $("#newAnnouncementInput");
      const text = input?.value.trim();
      if (!text) throw new Error("Announcement text enter karein.");
      const created = await api().createNotice({
        title: "Class Dashboard Announcement",
        category: "GENERAL",
        shortDescription: text,
        body: text,
        eventDate: null,
        startTime: null,
        endTime: null,
        instructions: "",
        publishAt: null,
        expiresAt: null,
      });
      await api().updateNotice(created.id, { status: "PUBLISHED" });
      input.value = "";
      await reloadAfterMutation(
        "Dashboard announcement published to all student accounts.",
      );
    } catch (error) {
      toast(error.message || "Announcement publish failed.", "error");
    }
  };
  window.bulkClearFines = async function bulkClearFines() {
    try {
      ensureAdmin();
      const rows = getFilteredFines().filter(
        (f) =>
          !["Cancelled", "Paid", "Waived"].includes(f.status) &&
          f.amount - f.paidAmount - f.waivedAmount > 0,
      );
      if (!rows.length) {
        toast("Selected scope mein koi outstanding fine nahi.", "success");
        return;
      }
      const reason = prompt(
        `Yeh action payment record nahi karega; har selected fine ke remaining balance par audited WAIVER add karega. ${rows.length} fine(s) ke liye waiver reason enter karein:`,
      );
      if (!reason?.trim()) return;
      if (
        !confirm(
          `${rows.length} fine(s) ka remaining balance waive karna hai? Ye financial audit history mein record hoga.`,
        )
      )
        return;
      let completed = 0;
      for (const fine of rows) {
        const amountPkr = Math.max(
          0,
          Number(fine.amount) -
          Number(fine.paidAmount || 0) -
          Number(fine.waivedAmount || 0),
        );
        if (amountPkr > 0) {
          await api().waiveFine(fine.id, { amountPkr, reason: reason.trim() });
          completed++;
        }
      }
      await reloadAfterMutation(
        `${completed} fine record(s) par audited waiver record ho gaya. Isay payment ke taur par count nahi kiya gaya.`,
      );
    } catch (error) {
      toast(error.message || "Bulk waiver failed.", "error");
    }
  };
  window.clearAccessLogs = function clearAccessLogs() {
    ensureAdmin();
    toast(
      "Audit history immutable hai; records ko delete nahi kiya ja sakta.",
      "error",
    );
  };
  window.exportDataJSON = async function exportDataJSON() {
    try {
      ensureAdmin();
      const data = await api().exportBackup();
      const content = JSON.stringify(data, null, 2);
      const blob = new Blob([content], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `KIPS_CSB37_Backup_${isoToday()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast(
        "Server-generated database backup downloaded. Private upload binaries must be backed up separately.",
        "success",
      );
    } catch (error) {
      toast(error.message || "Backup export failed.", "error");
    }
  };
  window.openProofViewerForFine = function openProofViewerForFine(fineId) {
    const fine = fines.find((item) => item.id === fineId);
    const proofId = fine?.appeal?.proofFileId || fine?.appeal?.image;
    if (!proofId) return toast("Appeal proof file not found.", "error");
    openProofViewer(proofId);
  };

  // Statement view can be opened from the WhatsApp list or Student Directory.
  window.openTermsModal = function openTermsModal() {
    $("#termsModal")?.classList.remove("hidden");
  };
  window.closeTermsModal = function closeTermsModal() {
    $("#termsModal")?.classList.add("hidden");
  };

  // Theme setup is called by original DOMContentLoaded handler; attach enhancements after markup exists.
  function initEnhancements() {
    applyThemeOnLoad();
    const loginId = $("#loginIdentifier");
    if (loginId) loginId.type = "password";
    if ($("#modalFineDate")) $("#modalFineDate").value = isoToday();
    if ($("#attendanceDateInput")) $("#attendanceDateInput").value = isoToday();
    if ($("#expenseDate") && !$("#expenseDate").value)
      $("#expenseDate").value = isoToday();
    applyRoleUI();
    renderSchedule();
    renderAdminMetrics();
    updateUpdateBadge();
    console.info("KIPS-CSB37 server-backed enhancement layer ready.");
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initEnhancements, {
      once: true,
    });
  else initEnhancements();

  // Expose selected helpers for regression checks and support.
  window.CSB37Portal = Object.freeze({
    reload: loadPortalData,
    money,
    get lastLoadedAt() {
      return lastPortalLoad;
    },
  });
})();
