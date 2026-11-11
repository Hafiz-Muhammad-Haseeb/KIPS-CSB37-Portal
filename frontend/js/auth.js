/* Authentication helper. JWT is held in memory only; reload requires sign-in again. */
(() => {
  "use strict";
  let accessToken = null;
  let currentUser = null;
  const Auth = {
    get token() {
      return accessToken;
    },
    get user() {
      return currentUser;
    },
    get authenticated() {
      return Boolean(accessToken && currentUser);
    },
    setSession(data) {
      if (!data || !data.accessToken || !data.user)
        throw new Error("Invalid authentication response.");
      accessToken = data.accessToken;
      currentUser = Object.freeze({ ...data.user });
    },
    clear() {
      accessToken = null;
      currentUser = null;
    },
    requireRole(role) {
      if (!currentUser || currentUser.role !== role)
        throw new Error("You are not authorized to perform this action.");
    },
  };
  window.CSB37Auth = Auth;
})();
