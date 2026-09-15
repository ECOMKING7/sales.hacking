import { useState, useRef, useEffect } from 'react';
import { NavLink, Link, useNavigate, Outlet } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Filter,
  ShoppingCart,
  Users,
  FileBarChart,
  Settings,
  Menu,
  X,
  LogOut,
  Sparkles,
  Plus,
  Check,
  FlaskConical,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api, { workspaceApi } from '../services/api';
import ThemeToggle from './ThemeToggle';
import { Badge, Button, Input, cn } from './ui';
import type { BadgeTone } from './ui';

const PLAN_TONE: Record<string, BadgeTone> = {
  free: 'neutral',
  pro: 'accent',
  agency: 'warn',
};

/**
 * Demo ma'lumot chizig'i.
 *
 * amoCRM ulanmagunicha CRM yarmi simulyatsiya qilinadi. Bu raqamlarni
 * kimgadir ko'rsatganda u ularni real deb o'ylamasligi kerak — shuning
 * uchun belgi butun ilova bo'ylab, har sahifada turadi.
 */
function DemoBanner() {
  const { data } = useQuery({
    queryKey: ['demo-status'],
    queryFn: () =>
      api
        .get<{ demo: boolean; demoLeads: number }>('/api/dashboard/demo-status')
        .then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!data?.demo) return null;

  return (
    <div className="flex items-center gap-2 border-b border-warn/30 bg-warn/10 px-4 py-1.5 text-xs text-ink-2">
      <FlaskConical aria-hidden className="h-3.5 w-3.5 flex-none text-warn" />
      <span>
        <span className="font-semibold text-ink">DEMO</span> — reklama raqamlari Facebook'dan
        real, CRM qismi ({data.demoLeads.toLocaleString()} lid, sotuv, daromad) simulyatsiya.
        amoCRM ulangach real ma'lumot bilan almashadi.
      </span>
    </div>
  );
}

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/funnel', label: 'Voronka', icon: Filter },
  { to: '/purchases', label: 'Purchases', icon: ShoppingCart },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const wsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspace, user, logout, switchWorkspace } = useAuthStore();

  const usage = useQuery({ queryKey: ['usage'], queryFn: workspaceApi.usage });
  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: workspaceApi.list,
    enabled: wsOpen,
  });
  const plan = usage.data?.plan ?? 'free';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) {
        setWsOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setWsOpen(false);
      setCreating(false);
      setOpen(false);
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSwitch = async (id: string) => {
    if (id === workspace?.id) {
      setWsOpen(false);
      return;
    }
    try {
      const data = await workspaceApi.switch(id);
      switchWorkspace(data);
      setWsOpen(false);
      queryClient.clear();
    } catch {
      /* xatoni jimgina yutamiz — switcher bloklanmasin */
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const data = await workspaceApi.create(newName.trim());
      switchWorkspace(data);
      setWsOpen(false);
      setCreating(false);
      setNewName('');
      queryClient.clear();
    } catch {
      /* xatoni jimgina yutamiz */
    }
  };

  const initial = (workspace?.name ?? 'W').charAt(0).toUpperCase();

  return (
    <div className="flex h-screen bg-ground">
      {/* ── Ikon-rail: 62px desktop, mobilda 240px overlay ── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-line bg-surface-2',
          'transition-transform duration-200 md:static md:w-[62px] md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Workspace tanlagich */}
        <div className="relative px-3 pt-4 md:px-3" ref={wsRef}>
          <button
            onClick={() => setWsOpen((o) => !o)}
            aria-expanded={wsOpen}
            aria-label={`Workspace: ${workspace?.name ?? 'Workspace'}`}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm p-1.5 text-sm text-ink',
              'transition-[box-shadow,background-color] duration-200 hover:bg-surface-3',
              wsOpen && 'shadow-glow-xs'
            )}
          >
            <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-sm border-[1.5px] border-edge bg-tint text-xs font-bold text-accent">
              {initial}
            </span>
            <span className="truncate font-semibold md:hidden">
              {workspace?.name ?? 'Workspace'}
            </span>
          </button>

          {wsOpen && (
            <div className="absolute left-3 right-3 z-50 mt-1.5 rounded-md border-[1.5px] border-line-2 bg-surface p-1.5 shadow-glow-sm md:left-2 md:w-64">
              <p className="px-2 pb-1 pt-1.5 font-mono text-label uppercase tracking-[0.1em] text-ink-3">
                Workspaces
              </p>
              <ul className="max-h-56 overflow-y-auto">
                {workspaces.data?.workspaces.map((ws) => (
                  <li key={ws.id}>
                    <button
                      onClick={() => handleSwitch(ws.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="grid h-5 w-5 flex-none place-items-center rounded-[5px] bg-tint text-[10px] font-bold text-accent">
                          {ws.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate">{ws.name}</span>
                      </span>
                      {ws.id === workspace?.id && (
                        <Check aria-hidden className="h-4 w-4 flex-none text-accent" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-1 border-t border-line pt-1.5">
                {creating ? (
                  <div className="flex gap-1.5 px-1 pb-1">
                    <Input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreate();
                        if (e.key === 'Escape') setCreating(false);
                      }}
                      placeholder="Workspace nomi..."
                      aria-label="Yangi workspace nomi"
                      className="h-8 text-xs"
                    />
                    <Button size="sm" onClick={handleCreate}>
                      Yaratish
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCreating(true)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm text-ink-3 hover:bg-surface-2 hover:text-accent"
                  >
                    <Plus aria-hidden className="h-4 w-4" />
                    Yangi workspace
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Navigatsiya */}
        <nav className="mt-3 flex flex-1 flex-col gap-1.5 px-3 md:items-center">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              title={label}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-sm px-2.5 text-sm font-semibold',
                  'h-[38px] w-full transition-[box-shadow,background-color,color] duration-200',
                  'md:w-[38px] md:justify-center md:px-0',
                  isActive
                    ? 'border-[1.5px] border-edge bg-tint text-accent shadow-glow-xs'
                    : 'text-ink-3 hover:bg-surface-3 hover:text-accent'
                )
              }
            >
              <Icon aria-hidden className="h-[18px] w-[18px] flex-none" />
              <span className="md:hidden">{label}</span>
              {/* Desktopda yorliq yo'q — hover'da chiqadi */}
              <span
                role="tooltip"
                className="pointer-events-none absolute left-[52px] z-50 hidden whitespace-nowrap rounded-sm border border-line-2 bg-surface px-2 py-1 text-xs font-medium text-ink opacity-0 shadow-glow-xs transition-opacity duration-150 group-hover:opacity-100 md:block"
              >
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Tarif va chiqish */}
        <div className="flex flex-col gap-1.5 border-t border-line p-3 md:items-center">
          <ThemeToggle />

          <Link
            to="/upgrade"
            onClick={() => setOpen(false)}
            title={`Tarif: ${plan}`}
            className="group relative flex h-[38px] w-full items-center gap-2 rounded-sm px-2.5 text-sm text-ink-3 hover:bg-surface-3 hover:text-accent md:w-[38px] md:justify-center md:px-0"
          >
            <Sparkles aria-hidden className="h-[18px] w-[18px] flex-none" />
            <span className="md:hidden">
              <Badge tone={PLAN_TONE[plan] ?? 'neutral'}>{plan}</Badge>
            </span>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-[52px] z-50 hidden whitespace-nowrap rounded-sm border border-line-2 bg-surface px-2 py-1 text-xs font-medium text-ink opacity-0 shadow-glow-xs transition-opacity duration-150 group-hover:opacity-100 md:block"
            >
              Tarif: {plan} — yangilash
            </span>
          </Link>

          <button
            onClick={handleLogout}
            title="Chiqish"
            className="group relative flex h-[38px] w-full items-center gap-2 rounded-sm px-2.5 text-sm text-ink-3 hover:bg-bad/10 hover:text-bad md:w-[38px] md:justify-center md:px-0"
          >
            <LogOut aria-hidden className="h-[18px] w-[18px] flex-none" />
            <span className="md:hidden">Chiqish</span>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-[52px] z-50 hidden whitespace-nowrap rounded-sm border border-line-2 bg-surface px-2 py-1 text-xs font-medium text-ink opacity-0 shadow-glow-xs transition-opacity duration-150 group-hover:opacity-100 md:block"
            >
              Chiqish
            </span>
          </button>
        </div>
      </aside>

      {/* Mobil overlay */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-ink/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Asosiy qism */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <button
              className="text-ink-2 md:hidden"
              onClick={() => setOpen(true)}
              aria-label="Menyuni ochish"
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <span className="font-semibold text-ink">
              {workspace?.name ?? 'Workspace'}
            </span>
            <Badge tone={PLAN_TONE[plan] ?? 'neutral'} className="hidden sm:inline-flex">
              {plan}
            </Badge>
          </div>
          <span className="hidden text-sm text-ink-3 sm:inline">{user?.email}</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <DemoBanner />
          <div className="p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
