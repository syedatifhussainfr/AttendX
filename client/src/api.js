import axios from "axios";
export const api = axios.create({ baseURL: "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("attendx_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("attendx_token");
      localStorage.removeItem("attendx_user");
      if (!location.pathname.includes("/login")) location.href = "/login";
    }
    return Promise.reject(error);
  },
);
export const messageOf = (error) =>
  error.response?.data?.message || error.message || "Something went wrong.";
