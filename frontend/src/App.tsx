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
import PrivacyPage from './pages/legal/PrivacyPage';
import TermsPage from './pages/legal/TermsPage';
import DataDeletionPage from './pages/legal/DataDeletionPage';
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

      {/*
        ⚠ HUQUQIY SAHIFALAR — OCHIQ, LOGINSIZ.
        Meta / amoCRM / Bitrix24 tekshiruvchilari bu manzillarni akkauntsiz
        ochadi. Agar ular login sahifasiga yo'naltirsa — review RAD ETILADI.
        Shuning uchun ular `ProtectedRoute` dan TASHQARIDA turadi va
        `*` yo'nalishidan OLDIN e'lon qilinadi.
      */}
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/data-deletion" element={<DataDeletionPage />} />

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
