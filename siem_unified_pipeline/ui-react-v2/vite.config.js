import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
export default defineConfig({
    base: "/ui/v2/",
    plugins: [react()],
    server: {
        port: 5174,
        strictPort: true,
        proxy: {
            "/api": { target: "http://127.0.0.1:9999", changeOrigin: true },
            "/metrics": { target: "http://127.0.0.1:9999", changeOrigin: true },
            "/health": { target: "http://127.0.0.1:9999", changeOrigin: true }
        }
    },
    resolve: { alias: { "@": path.resolve(__dirname, "src") } }
});
