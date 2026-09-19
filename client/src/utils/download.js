import { api } from "../api.js";

export async function downloadAttendanceExport({ review = false, params = {} }) {
  const response = await api.get(
    review ? "/attendance/export/review" : "/attendance/export",
    { params, responseType: "blob" },
  );
  const disposition = response.headers["content-disposition"] || "";
  const serverName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const filename = (serverName || `attendance_${new Date().toISOString().slice(0, 10)}.xlsx`)
    .replace(/[\\/:*?"<>|]/g, "_");
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return filename;
}
