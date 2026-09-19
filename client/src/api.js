import axios from "axios";

let accessToken = null;
let refreshPromise = null;
let resumePromise = null;
let adminElevation = { token: null, expiresAt: 0 };

export const api = axios.create({ baseURL: "/api", withCredentials: true });

export function setAccessToken(token) {
  accessToken = token || null;
  if (!accessToken) clearAdminElevation();
}

export function setAdminElevation(token, expiresInSeconds = 300) {
  adminElevation = {
    token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
}

export function clearAdminElevation() {
  adminElevation = { token: null, expiresAt: 0 };
}

export function hasAdminElevation() {
  return Boolean(
    adminElevation.token && adminElevation.expiresAt > Date.now() + 5_000,
  );
}

const wait = (milliseconds) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function requestSessionResume() {
  const delays = [0, 180, 450];
  let lastError;
  for (const delay of delays) {
    if (delay) await wait(delay);
    try {
      const { data } = await api.post("/auth/session", null, {
        skipAuthRefresh: true,
      });
      setAccessToken(data.accessToken);
      return data;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      if (status && status < 500) throw error;
    }
  }
  throw lastError;
}

export function resumeSession() {
  if (!resumePromise)
    resumePromise = requestSessionResume().finally(() => {
      resumePromise = null;
    });
  return resumePromise;
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = api
      .post("/auth/refresh", null, { skipAuthRefresh: true })
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        window.dispatchEvent(
          new CustomEvent("attendx:session-refreshed", { detail: data.user }),
        );
        return data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.request.use((request) => {
  if (accessToken && !request.skipAuthorization)
    request.headers.Authorization = `Bearer ${accessToken}`;
  if (hasAdminElevation())
    request.headers["X-Admin-Elevation"] = adminElevation.token;
  return request;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config || {};
    if (error.response?.data?.code === "ADMIN_ELEVATION_REQUIRED") {
      clearAdminElevation();
      window.dispatchEvent(new Event("attendx:admin-elevation-ended"));
    }
    if (
      error.response?.status === 401 &&
      !request.skipAuthRefresh &&
      !request._sessionRetry
    ) {
      request._sessionRetry = true;
      try {
        const token = await refreshAccessToken();
        request.headers = request.headers || {};
        request.headers.Authorization = `Bearer ${token}`;
        return api(request);
      } catch {
        setAccessToken(null);
        window.dispatchEvent(new Event("attendx:session-ended"));
      }
    }
    return Promise.reject(error);
  },
);

export const messageOf = (error) =>
  error.response?.data?.message || error.message || "Something went wrong.";
