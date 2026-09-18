import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import SettingsPage from './pages/SettingsPage';
import DashboardPage from './pages/DashboardPage';
import FunnelPage from './pages/FunnelPage';
import PurchasesPage from './pages/PurchasesPage';
import OnboardingPage from './pages/OnboardingPage';
import UpgradePage from './pages/UpgradePage';
import PlaceholderPage from './pages/PlaceholderPage';
import { ToastHost } from './components/ui';

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <>
      <ToastHost />
      <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <RegisterPage />}
      />

      {/* Onboarding is protected but outside the main Layout (full-screen wizard) */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/funnel" element={<FunnelPage />} />
        <Route path="/upgrade" element={<UpgradePage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/leads" element={<PlaceholderPage title="Leads" />} />
        <Route path="/reports" element={<PlaceholderPage title="Reports" />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

export default App;
