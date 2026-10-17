import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';

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

// Tüm korumalı sayfaların ortak iskeleti (menü + üst çubuk bir kez kurulur)
const AppLayout = () => {
  // FIX: Timeout 30 dakikaya çıkarıldı — 5 dk aktif kullanıcıları da çıkarıyordu.
  useAutoLogout(30);
  const [navOpen, setNavOpen] = useState(false);

  // Token'ı olmayan (eski oturum) kullanıcılar da yeniden giriş yapmalı
  const user = localStorage.getItem('user');
  if (!user || !getToken()) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-h-screen min-w-0 flex-col lg:pl-56">
        <Topbar onMenu={() => setNavOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1360px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

// perm: sayfayı görmek için gereken izin (yoksa "erişim yok" ekranı)
const Guard = ({ perm, children }) => {
  const { can } = usePermission();
  return !perm || can(perm) ? children : <NoAccess permission={perm} />;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* Kimlik Doğrulama (Layout Dışı) */}
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Korumalı sayfalar */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Guard><Dashboard /></Guard>} />
        <Route path="/projects" element={<Guard perm="projects.view"><Projects /></Guard>} />
        <Route path="/projects/:id" element={<Guard perm="projects.view"><ProjectDetail /></Guard>} />
        <Route path="/test-cases" element={<Guard perm="test_cases.view"><TestCases /></Guard>} />
        <Route path="/test-plans" element={<Guard perm="test_plans.view"><TestPlans /></Guard>} />
        <Route path="/test-runs" element={<Guard perm="test_runs.view"><TestRuns /></Guard>} />
        <Route path="/test-runs/:id" element={<Guard perm="test_runs.view"><TestRunDetail /></Guard>} />
        <Route path="/users" element={<Guard perm="users.view"><UsersPage /></Guard>} />
        <Route path="/defects" element={<Guard perm="defects.view"><Defects /></Guard>} />
        <Route path="/defects/:id" element={<Guard perm="defects.view"><DefectDetail /></Guard>} />
        <Route path="/reports" element={<Guard perm="reports.view"><Reports /></Guard>} />
        <Route path="/automation" element={<Guard perm="automation.view"><AutomationRun /></Guard>} />
        <Route path="/environments" element={<Guard perm="environments.view"><Environments /></Guard>} />
        <Route path="/integrations" element={<Guard perm="integrations.view"><Integrations /></Guard>} />
        <Route path="/profile" element={<Guard><Profile /></Guard>} />
        <Route path="/roles" element={<Guard perm="roles.view"><RoleManagement /></Guard>} />

        </Route>

        {/* Tanımsız URL */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
