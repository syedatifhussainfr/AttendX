import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        configure(proxy) {
          proxy.on("error", (_error, _request, response) => {
            if (!response || response.headersSent || response.writableEnded)
              return;
            response.writeHead(503, {
              "Content-Type": "application/json",
              "Retry-After": "1",
            });
            response.end(
              JSON.stringify({
                code: "API_RESTARTING",
                message:
                  "AttendX API is starting or restarting. Try again in a moment.",
              }),
            );
          });
        },
      },
    },
  },
  build: { outDir: "dist" },
});
