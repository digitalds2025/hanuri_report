import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { localDbDevPlugin } from "./local-db-dev-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), localDbDevPlugin()],
});
