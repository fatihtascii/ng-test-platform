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
import RoleManagement from './pages/Rolemanagement';

// Bileşenler
import Sidebar from './components/Sidebar';
import Topbar  from './components/Topbar';

// Hooklar
import useAutoLogout from './hooks/useAutoLogout';

const AppLayout = ({ children }) => {
  useAutoLogout(5);

  const user = localStorage.getItem('user');
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col min-w-0">
        <Topbar />
        <main className="p-8 flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {children}
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
        <Route path="/projects"        element={<AppLayout><Projects /></AppLayout>} />
        <Route path="/projects/:id"    element={<AppLayout><ProjectDetail /></AppLayout>} />
        <Route path="/test-cases"      element={<AppLayout><TestCases /></AppLayout>} />
        <Route path="/test-plans"      element={<AppLayout><TestPlans /></AppLayout>} />
        <Route path="/test-runs"       element={<AppLayout><TestRuns /></AppLayout>} />
        <Route path="/test-runs/:id"   element={<AppLayout><TestRunDetail /></AppLayout>} />
        <Route path="/users"           element={<AppLayout><UsersPage /></AppLayout>} />
        <Route path="/defects"         element={<AppLayout><Defects /></AppLayout>} />
        <Route path="/defects/:id"     element={<AppLayout><DefectDetail /></AppLayout>} />
        <Route path="/reports"         element={<AppLayout><Reports /></AppLayout>} />
        <Route path="/automation"      element={<AppLayout><AutomationRun /></AppLayout>} />
        <Route path="/environments"    element={<AppLayout><Environments /></AppLayout>} />
        <Route path="/integrations"    element={<AppLayout><Integrations /></AppLayout>} />
        <Route path="/roles"           element={<AppLayout><RoleManagement /></AppLayout>} />

        {/* Tanımsız URL */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;