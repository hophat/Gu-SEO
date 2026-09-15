// Shared helpers for resolving project-scoped URLs.
//
// Projects are served in one of two ways:
//   1. Custom domain  → https://<custom_domain>/<path>
//   2. Shared host    → /<project-slug>/<path>  (resolves against the
//                       current origin, e.g. seo.gulagi.com)
//
// Usage:
//   const { projectUrl, urlForProject } = useProjectUrl();
//   projectUrl('/blog/my-post')            // → active project's URL
//   urlForProject(post.project_id, '/blog/' + post.slug)  // → that project's URL

import { useMemo, useCallback } from 'react';
import { useProjects } from '../hooks/useTheme.jsx';

// Extract the base path from a project's publishing_url.
// e.g. "https://seo.gulagi.com/my-project" → "/my-project"
//      "https://blog.example.com" (custom domain) → ""
export function projectBasePath(project) {
  if (!project) return '';
  if (project.custom_domain) return '';
  try {
    const u = new URL(project.publishing_url || '');
    return u.pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

// Prepend project base path to root-relative URLs.
// Absolute URLs (https://...) are left as-is.
export function withProjectPath(url, basePath) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (!basePath) return url;
  if (url.startsWith(basePath + '/')) return url;
  if (url === basePath) return url;
  return basePath + url;
}

// Build the correct href for a path within a given project.
//   - custom domain → absolute https://<domain><path>
//   - shared host   → root-relative /<slug><path>
//   - no project    → the raw path
export function projectHref(project, url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;      // already absolute
  if (!project) return url;
  if (project.custom_domain) {
    const base = `https://${project.custom_domain}`;
    return url === '/' ? base : base + (url.startsWith('/') ? url : '/' + url);
  }
  return withProjectPath(url, projectBasePath(project));
}

// Hook: returns helpers bound to the active project + the full list.
export function useProjectUrl() {
  const { activeProject, projects } = useProjects();

  const projectUrl = useCallback(
    (url) => projectHref(activeProject, url),
    [activeProject]
  );

  // Resolve a path against a specific project id (falls back to active).
  const urlForProject = useCallback(
    (projectId, url) => {
      const proj = projects.find((p) => p.id === projectId);
      return projectHref(proj || activeProject, url);
    },
    [projects, activeProject]
  );

  return { basePath: projectBasePath(activeProject), projectUrl, urlForProject, activeProject, projects };
}
