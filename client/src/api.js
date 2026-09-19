import axios from "axios";

let accessToken = null;
let refreshPromise = null;

export const api = axios.create({ baseURL: "/api", withCredentials: true });

export function setAccessToken(token) {
  accessToken = token || null;
}

export async function resumeSession() {
  const { data } = await api.post("/auth/session", null, {
    skipAuthRefresh: true,
  });
  setAccessToken(data.accessToken);
  return data;
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
  return request;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config || {};
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
