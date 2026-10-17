import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Sayfalar
import Dashboard     from './pages/Dashboard';
import LoginPage     from './pages/LoginPage';
import RegisterPage  from './pages/RegisterPage';
import Projects      from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import TestCases     from './pages/TestCases';
import TestRuns      from './pages/TestRuns';
import TestRunDetail from './pages/TestRunDetail';
import UsersPage     from './pages/Users';
import TestPlans     from './pages/TestPlans';
import Defects       from './pages/Defects';
import DefectDetail  from './pages/DefectDetail';
import Reports       from './pages/Reports';
import AutomationRun from './pages/AutomationRun';
import Environments  from './pages/Environments';
import Integrations  from './pages/Integrations';
// FIX: Dosya adı RoleManagement.jsx (büyük M) — Linux büyük/küçük harf duyarlı.
// 'Rolemanagement' import'u production build'de "Module not found" hatasına neden olur.
import RoleManagement from './pages/RoleManagement';
import Profile        from './pages/Profile';

// Bileşenler
import Sidebar from './components/Sidebar';
import Topbar  from './components/Topbar';

// Hooklar
import useAutoLogout from './hooks/useAutoLogout';
import { getToken } from './auth';
import { usePermission } from './hooks/usePermission';
import NoAccess from './components/NoAccess';

// perm: sayfayı görmek için gereken izin (yoksa "yetkiniz yok" ekranı gösterilir)
const AppLayout = ({ children, perm }) => {
  // FIX: Timeout 30 dakikaya çıkarıldı — 5 dk aktif kullanıcıları da çıkarıyordu.
  useAutoLogout(30);
  const { can } = usePermission();

  // Token'ı olmayan (eski oturum) kullanıcılar da yeniden giriş yapmalı
  const user = localStorage.getItem('user');
  if (!user || !getToken()) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col min-w-0">
        <Topbar />
        <main className="p-8 flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {!perm || can(perm) ? children : <NoAccess permission={perm} />}
          </div>
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        {/* Kimlik Doğrulama (Layout Dışı) */}
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Korumalı Sayfalar */}
        <Route path="/"                element={<AppLayout><Dashboard /></AppLayout>} />
        <Route path="/projects"        element={<AppLayout perm="projects.view"><Projects /></AppLayout>} />
        <Route path="/projects/:id"    element={<AppLayout perm="projects.view"><ProjectDetail /></AppLayout>} />
        <Route path="/test-cases"      element={<AppLayout perm="test_cases.view"><TestCases /></AppLayout>} />
        <Route path="/test-plans"      element={<AppLayout perm="test_plans.view"><TestPlans /></AppLayout>} />
        <Route path="/test-runs"       element={<AppLayout perm="test_runs.view"><TestRuns /></AppLayout>} />
        <Route path="/test-runs/:id"   element={<AppLayout perm="test_runs.view"><TestRunDetail /></AppLayout>} />
        <Route path="/users"           element={<AppLayout perm="users.view"><UsersPage /></AppLayout>} />
        <Route path="/defects"         element={<AppLayout perm="defects.view"><Defects /></AppLayout>} />
        <Route path="/defects/:id"     element={<AppLayout perm="defects.view"><DefectDetail /></AppLayout>} />
        <Route path="/reports"         element={<AppLayout perm="reports.view"><Reports /></AppLayout>} />
        <Route path="/automation"      element={<AppLayout perm="automation.view"><AutomationRun /></AppLayout>} />
        <Route path="/environments"    element={<AppLayout perm="environments.view"><Environments /></AppLayout>} />
        <Route path="/integrations"    element={<AppLayout perm="integrations.view"><Integrations /></AppLayout>} />
        <Route path="/profile"         element={<AppLayout><Profile /></AppLayout>} />
        <Route path="/roles"           element={<AppLayout perm="roles.view"><RoleManagement /></AppLayout>} />

        {/* Tanımsız URL */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
