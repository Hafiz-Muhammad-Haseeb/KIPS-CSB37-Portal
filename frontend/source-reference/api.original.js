/* API adapter: configure this URL for the Spring Boot backend.
   Never put database passwords, JWT signing keys or WhatsApp tokens in this file. */
window.CSB37_API_BASE = window.CSB37_API_BASE || "http://localhost:8080/api";
window.CSB37_API_ENABLED = window.CSB37_API_ENABLED ?? false;

const PortalAPI = (() => {
  let token = null;
  async function request(path, options = {}) {
    if (!window.CSB37_API_ENABLED) throw new Error("API mode is disabled");
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${window.CSB37_API_BASE}${path}`, {
      ...options,
      headers,
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || `API request failed (${response.status})`);
    }
    if (response.status === 204) return null;
    return response.json();
  }
  return {
    get enabled() {
      return !!window.CSB37_API_ENABLED;
    },
    setToken(value) {
      token = value;
    },
    request,
    async health() {
      return request("/health");
    },
    async login(credentials) {
      const data = await request("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      token = data.accessToken;
      return data;
    },
    async loadPortal() {
      return request("/portal");
    },
    async createFine(payload) {
      return request("/fines", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async updateFine(id, payload) {
      return request(`/fines/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    async markPayment(payload) {
      return request("/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async createStudent(payload) {
      return request("/students", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async updateStudent(id, payload) {
      return request(`/students/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    async deleteStudent(id) {
      return request(`/students/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    async createLeave(payload) {
      return request("/leaves", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async decideLeave(id, payload) {
      return request(`/leaves/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async createAppeal(payload) {
      return request("/appeals", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async decideAppeal(id, payload) {
      return request(`/appeals/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async saveAttendance(payload) {
      return request("/attendance/bulk", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async createExpense(payload) {
      return request("/expenses", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async createNotice(payload) {
      return request("/notices", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async sendStatement(studentId, eventType) {
      return request(`/notifications/whatsapp/statement`, {
        method: "POST",
        body: JSON.stringify({ studentId, eventType }),
      });
    },
    async retryNotification(id) {
      return request(`/notifications/${encodeURIComponent(id)}/retry`, {
        method: "POST",
      });
    },
    async exportBackup() {
      return request("/admin/backup");
    },
  };
})();
