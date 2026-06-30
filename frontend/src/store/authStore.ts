import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Workspace, AuthResponse } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  workspace: Workspace | null;
  isAuthenticated: boolean;
  login: (data: AuthResponse) => void;
  logout: () => void;
  setWorkspace: (workspace: Workspace) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      workspace: null,
      isAuthenticated: false,
      login: (data) =>
        set({
          user: data.user,
          token: data.token,
          workspace: data.workspace,
          isAuthenticated: true,
        }),
      logout: () =>
        set({ user: null, token: null, workspace: null, isAuthenticated: false }),
      setWorkspace: (workspace) => set({ workspace }),
    }),
    { name: 'attribution-auth' }
  )
);
