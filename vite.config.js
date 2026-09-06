import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/*
 * The application is a plain Vite + React build. The only server-side part is
 * the Netlify function under netlify/functions, which keeps the OpenRouter key
 * off the browser. During development `netlify dev` serves both together.
 */
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        open: false
    },
    build: {
        outDir: "dist"
    }
});
