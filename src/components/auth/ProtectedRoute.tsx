import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

/** Supabase가 켜진 환경에서만 로그인 세션을 요구합니다. */
export function ProtectedRoute() {
  const { requiresAuth, isAuthenticated } = useAuth();
  const location = useLocation();

  if (requiresAuth && !isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
