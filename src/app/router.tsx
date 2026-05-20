import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { AppShell } from "../components/layout/AppShell";
import { BooksPage } from "../pages/BooksPage";
import { BriefingMaterialPage } from "../pages/BriefingMaterialPage";
import { LoginPage } from "../pages/LoginPage";
import { MonthlyReportNewPage } from "../pages/MonthlyReportNewPage";
import { PeriodReportNewPage } from "../pages/PeriodReportNewPage";
import { StudentDetailPage } from "../pages/StudentDetailPage";
import { StudentsPage } from "../pages/StudentsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/students" replace />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="students/:id" element={<StudentDetailPage />} />
          <Route path="students/:id/monthly/new" element={<MonthlyReportNewPage />} />
          <Route path="students/:id/period/new" element={<PeriodReportNewPage />} />
          <Route path="books" element={<BooksPage />} />
          <Route path="briefing-material" element={<BriefingMaterialPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/students" replace />} />
    </Routes>
  );
}
