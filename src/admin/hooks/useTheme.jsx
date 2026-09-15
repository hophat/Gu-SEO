// Theme + auth hooks for the admin app.

import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { apiGet, apiPost } from '../api.js';

// ── Theme ──────────────────────────────────────────────────────────
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('ps_admin_theme') || 'light'; }
    catch { return 'light'; }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('ps_admin_theme', theme); } catch {}
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}

// ── Auth ────────────────────────────────────────────────────────────
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    const { status, body } = await apiGet('/api/admin/whoami');
    if (status === 200 && body?.email) {
      setUser(body);
      setNeedsSetup(false);
    } else if (status === 503 && body?.needs_setup) {
      // Fresh deploy — no admin user yet. Show setup wizard.
      setUser(null);
      setNeedsSetup(true);
    } else {
      setUser(null);
      setNeedsSetup(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => { check(); }, [check]);

  const login = useCallback(async (email, password) => {
    const { status, body } = await apiPost('/api/admin/login', { email, password });
    if (status === 200) { await check(); return { ok: true }; }
    return { ok: false, error: body?.error || 'login_failed' };
  }, [check]);

  const logout = useCallback(async () => {
    await apiPost('/api/admin/logout');
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, needsSetup, login, logout, check }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() { return useContext(AuthCtx); }

// ── Projects ────────────────────────────────────────────────────────
// Projects come from whoami (already role-filtered server-side:
// super_admin sees all, project_admin sees only their own). We do NOT
// call /api/admin/projects here — that endpoint is super_admin-only and
// would 403 for project_admin users, leaving activeProject null and
// every project-scoped URL wrong.
const ProjectsCtx = createContext(null);

export function ProjectsProvider({ children }) {
  const { user } = useAuth();
  const [activeProject, setActiveProject] = useState(null);

  const projects = useMemo(() => user?.projects || [], [user]);

  // Keep activeProject in sync with the loaded project list.
  useEffect(() => {
    if (!projects.length) { setActiveProject(null); return; }
    const saved = sessionStorage.getItem('ps_active_project');
    const match = projects.find((p) => p.id === saved);
    setActiveProject((prev) => {
      // Preserve the user's current pick if it's still valid.
      if (prev && projects.some((p) => p.id === prev.id)) {
        return projects.find((p) => p.id === prev.id);
      }
      return match || projects[0] || null;
    });
  }, [projects]);

  const switchProject = useCallback((id) => {
    const p = projects.find((x) => x.id === id);
    if (p) {
      setActiveProject(p);
      try { sessionStorage.setItem('ps_active_project', id); } catch {}
    }
  }, [projects]);

  // No-op reload: whoami is the source of truth; AuthProvider.check()
  // refreshes it.
  const load = useCallback(() => {}, []);

  return (
    <ProjectsCtx.Provider value={{ projects, activeProject, switchProject, load, loaded: projects.length > 0 }}>
      {children}
    </ProjectsCtx.Provider>
  );
}

export function useProjects() { return useContext(ProjectsCtx) || { projects: [], activeProject: null, switchProject: () => {}, load: () => {}, loaded: false }; }
