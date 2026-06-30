import { useState } from 'react';
import { NavLink, Link, useNavigate, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  FileBarChart,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { workspaceApi } from '../services/api';

const PLAN_STYLE: Record<string, string> = {
  free: 'bg-gray-700 text-gray-200',
  pro: 'bg-indigo-600 text-white',
  agency: 'bg-amber-500 text-white',
};

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/purchases', label: 'Purchases', icon: ShoppingCart },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { workspace, user, logout } = useAuthStore();
  const usage = useQuery({ queryKey: ['usage'], queryFn: workspaceApi.usage });
  const plan = usage.data?.plan ?? 'free';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 transform flex-col bg-gray-900 text-gray-100 transition-transform duration-200 md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5">
          <span className="text-lg font-bold text-white">Attribution</span>
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Workspace switcher */}
        <div className="px-3">
          <button className="flex w-full items-center justify-between rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 hover:bg-gray-700">
            <span className="flex items-center gap-2 truncate">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-indigo-600 text-xs font-bold">
                {(workspace?.name ?? 'W').charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{workspace?.name ?? 'Workspace'}</span>
            </span>
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
          </button>
        </div>

        <nav className="mt-3 flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Plan badge footer */}
        <div className="border-t border-gray-800 p-3">
          <Link
            to="/upgrade"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-semibold capitalize ${PLAN_STYLE[plan]}`}
              >
                {plan}
              </span>
            </span>
            <span className="text-xs text-indigo-400">Upgrade</span>
          </Link>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-6 w-6 text-gray-700" />
            </button>
            <span className="font-semibold text-gray-900">
              {workspace?.name ?? 'Workspace'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-gray-500 sm:inline">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
