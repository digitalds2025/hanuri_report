import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { localDbDevPlugin } from "./local-db-dev-plugin";

/** GitHub Pages 프로젝트 사이트용 서브경로 (`/repo-name/`). 로컬은 기본 `/` */
function appBase(): string {
  const raw = (process.env.VITE_BASE_PATH ?? "").trim();
  if (!raw || raw === "/") return "/";
  const withLead = raw.startsWith("/") ? raw : `/${raw}`;
  return withLead.endsWith("/") ? withLead : `${withLead}/`;
}

export default defineConfig({
  base: appBase(),
  plugins: [react(), tailwindcss(), localDbDevPlugin()],
});
