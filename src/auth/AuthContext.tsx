import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

const STORAGE_KEY = "hreport_auth_session";

export type AuthUser = {
  user_id: string;
  login_id: string;
};

function readStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "user_id" in parsed &&
      "login_id" in parsed &&
      typeof (parsed as AuthUser).user_id === "string" &&
      typeof (parsed as AuthUser).login_id === "string"
    ) {
      return { user_id: (parsed as AuthUser).user_id, login_id: (parsed as AuthUser).login_id };
    }
    return null;
  } catch {
    return null;
  }
}

type AuthContextValue = {
  user: AuthUser | null;
  /** Supabase URL/키가 있을 때만 로그인 필요 */
  requiresAuth: boolean;
  /** 로컬 모드면 항상 true, 클라우드 모드면 세션 있을 때만 true */
  isAuthenticated: boolean;
  login: (loginId: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const configured = isSupabaseConfigured();

  const requiresAuth = configured;
  const isAuthenticated = !configured || user !== null;

  const login = useCallback(async (loginId: string, password: string) => {
    if (!supabase) {
      throw new Error("Supabase가 설정되지 않았습니다.");
    }
    const { data, error } = await supabase.rpc("verify_app_user", {
      p_login_id: loginId.trim(),
      p_password: password,
    });
    if (error) {
      throw new Error(error.message);
    }
    const userId = data as string | null;
    if (!userId) {
      throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
    const next: AuthUser = { user_id: userId, login_id: loginId.trim() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setUser(next);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      requiresAuth,
      isAuthenticated,
      login,
      logout,
    }),
    [user, requiresAuth, isAuthenticated, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth는 AuthProvider 안에서만 사용할 수 있습니다.");
  }
  return ctx;
}
