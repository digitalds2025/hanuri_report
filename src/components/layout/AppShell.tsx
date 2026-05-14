import { useMemo, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { isSupabaseConfigured } from "../../lib/supabaseClient";
import { studentsSectionTitle } from "../../lib/studentsSectionTitle";

export function AppShell() {
  const [open, setOpen] = useState(false);
  const configured = isSupabaseConfigured();
  const { user, requiresAuth, logout } = useAuth();
  const navigate = useNavigate();

  const nav = useMemo(
    () => [
      { to: "/students", label: studentsSectionTitle(user?.login_id) },
      { to: "/books", label: "도서" },
    ],
    [user?.login_id],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/students" className="text-lg font-bold tracking-tight text-indigo-700">
            Hanuri Report
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {requiresAuth && user ? (
              <>
                <span className="hidden text-sm text-slate-600 md:inline">{user.login_id}</span>
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  onClick={() => {
                    logout();
                    navigate("/login", { replace: true });
                  }}
                >
                  로그아웃
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden"
              aria-label="메뉴"
              onClick={() => setOpen((v) => !v)}
            >
              ☰
            </button>
          </div>
        </div>
        {open ? (
          <div className="border-t border-slate-100 bg-white px-4 py-2 md:hidden">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            {requiresAuth && user ? (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <p className="px-3 py-1 text-xs text-slate-500">{user.login_id}</p>
                <button
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
                  onClick={() => {
                    setOpen(false);
                    logout();
                    navigate("/login", { replace: true });
                  }}
                >
                  로그아웃
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      {!configured ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm text-emerald-900">
          <strong>로컬 파일 DB 모드</strong> — Supabase 없이 동작합니다. 데이터는 프로젝트 루트{" "}
          <code className="rounded bg-emerald-100 px-1">.local-db/local-database.json</code> 및{" "}
          <code className="rounded bg-emerald-100 px-1">local-database.snapshot.ts</code>에 저장됩니다. (
          <code className="rounded bg-emerald-100 px-1">npm run dev</code> 전용)
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        한우리독서토론논술 · 학생 표시는 별명·ID만 사용하세요.
      </footer>
    </div>
  );
}