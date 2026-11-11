/* KIPS-CSB37 API client. No database credentials or signing secrets belong in this file. */
(() => {
  "use strict";
  const API_BASE = (
    window.CSB37_API_BASE || "http://localhost:8080/api"
  ).replace(/\/$/, "");
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = window.CSB37Auth?.token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const isForm = options.body instanceof FormData;
    if (options.body && !isForm && !headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (response.status === 204) return null;
    const type = response.headers.get("content-type") || "";
    const body = type.includes("application/json")
      ? await response.json()
      : await response.text();
    if (!response.ok)
      throw new Error(
        typeof body === "string"
          ? body
          : body.detail ||
              body.message ||
              `Request failed (${response.status})`,
      );
    return body;
  }
  const json = (method, payload) => ({ method, body: JSON.stringify(payload) });
  window.CSB37API = Object.freeze({
    request,
    health: () => request("/health"),
    login: async (credentials) => {
      const data = await request("/auth/login", json("POST", credentials));
      window.CSB37Auth?.setSession(data);
      return data;
    },
    logout: () => window.CSB37Auth?.clear(),
    loadPortal: () => request("/portal"),
    portal: () => request("/portal"),
    students: () => request("/students"),
    createStudent: (data) => request("/students", json("POST", data)),
    updateStudent: (id, data) =>
      request(`/students/${encodeURIComponent(id)}`, json("PATCH", data)),
    deactivateStudent: (id) =>
      request(`/students/${encodeURIComponent(id)}`, { method: "DELETE" }),
    fines: () => request("/fines"),
    createFine: (data) => request("/fines", json("POST", data)),
    updateFine: (id, data) =>
      request(`/fines/${encodeURIComponent(id)}`, json("PATCH", data)),
    cancelFine: (id, reason) =>
      request(
        `/fines/${encodeURIComponent(id)}/cancel`,
        json("POST", { reason }),
      ),
    waiveFine: (id, data) =>
      request(`/fines/${encodeURIComponent(id)}/waive`, json("POST", data)),
    payment: (data) => request("/payments", json("POST", data)),
    statement: (id) => request(`/students/${encodeURIComponent(id)}/statement`),
    attendance: (date) =>
      request(`/attendance?date=${encodeURIComponent(date)}`),
    saveAttendance: (rows) => request("/attendance/bulk", json("POST", rows)),
    leaves: () => request("/leaves"),
    upload: async (file, purpose) => {
      const form = new FormData();
      form.append("file", file);
      form.append("purpose", purpose);
      return request("/files/upload", { method: "POST", body: form });
    },
    createLeave: (data) => request("/leaves", json("POST", data)),
    decideLeave: (id, data) =>
      request(`/leaves/${encodeURIComponent(id)}/decision`, json("POST", data)),
    appeals: () => request("/appeals"),
    createAppeal: (data) => request("/appeals", json("POST", data)),
    decideAppeal: (id, data) =>
      request(
        `/appeals/${encodeURIComponent(id)}/decision`,
        json("POST", data),
      ),
    notices: () => request("/notices"),
    createNotice: (data) => request("/notices", json("POST", data)),
    updateNotice: (id, data) =>
      request(`/notices/${encodeURIComponent(id)}`, json("PATCH", data)),
    deactivateNotice: (id) =>
      request(
        `/notices/${encodeURIComponent(id)}`,
        json("PATCH", { status: "UNPUBLISHED" }),
      ),
    markNoticeRead: (id) =>
      request(`/notices/${encodeURIComponent(id)}/read`, { method: "POST" }),
    expenses: () => request("/expenses"),
    createExpense: (data) => request("/expenses", json("POST", data)),
    whatsappStatement: (studentId) =>
      request(
        "/notifications/whatsapp/statement",
        json("POST", { studentId, eventType: "FULL_STATEMENT" }),
      ),
    notifications: () => request("/notifications"),
    audit: () => request("/audit"),
    exportBackup: () => request("/admin/backup"),
    classAnalytics: () => request("/analytics/class"),
    schedule: () => request("/schedule"),
    saveSchedule: (data) => request("/schedule", json("PUT", data)),
  });
})();
