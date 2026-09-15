// Mounts the legacy Canva-style cover editor (/cover-editor.js) inside
// the React admin. The editor is a self-contained vanilla-JS widget that
// expects:
//   - window.CoverEditor.init({ root, api, glue })
//   - window.psToast(msg, kind, opts) for notifications (optional)
//   - the CSS custom properties from admin.css (now in styles/tokens.css)
//
// We lazy-inject its stylesheet + script once, then hand it the same
// `api()` helper the React pages use (session cookie + project_id
// injection), so authenticated requests keep working.
import { useEffect, useRef, useState } from 'react';
import { Spin, Alert, message } from 'antd';
import { api } from '../api.js';

let cssPromise = null;
let jsPromise = null;

function loadCss() {
  if (cssPromise) return cssPromise;
  cssPromise = new Promise((resolve) => {
    if (document.querySelector('link[data-cover-editor-css]')) return resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/cover-editor.css';
    link.dataset.coverEditorCss = '1';
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  return cssPromise;
}

function loadJs() {
  if (jsPromise) return jsPromise;
  jsPromise = new Promise((resolve, reject) => {
    if (window.CoverEditor) return resolve(window.CoverEditor);
    const existing = document.querySelector('script[data-cover-editor-js]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.CoverEditor));
      existing.addEventListener('error', () => reject(new Error('cover_editor_load_failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = '/cover-editor.js';
    s.dataset.coverEditorJs = '1';
    s.onload = () => resolve(window.CoverEditor);
    s.onerror = () => reject(new Error('cover_editor_load_failed'));
    document.head.appendChild(s);
  });
  return jsPromise;
}

export default function CoverEditor() {
  const mountRef = useRef(null);
  const bootedRef = useRef(false);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    // Bridge the editor's notify() to antd's message API.
    if (!window.psToast) {
      window.psToast = (msg, kind = 'info') => {
        const fn = kind === 'bad' || kind === 'error' ? message.error
          : kind === 'good' || kind === 'success' ? message.success
          : kind === 'warn' || kind === 'warning' ? message.warning
          : message.info;
        fn(String(msg));
      };
    }

    (async () => {
      try {
        await loadCss();
        await loadJs();
        if (cancelled) return;
        const mount = mountRef.current;
        if (!mount || !window.CoverEditor) throw new Error('cover_editor_unavailable');

        if (!bootedRef.current) {
          bootedRef.current = true;
          window.CoverEditor.init({
            root: mount,
            api,
            glue: { onDirty: () => { /* hook point */ } },
          });
        } else {
          window.CoverEditor.refresh?.();
        }
        setStatus('ready');
      } catch (e) {
        if (!cancelled) { setError(e.message || 'load_failed'); setStatus('error'); }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      {status === 'loading' && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <Spin size="large" tip="Đang tải Cover Editor..."><div style={{ padding: 40 }} /></Spin>
        </div>
      )}
      {status === 'error' && (
        <Alert type="error" showIcon message="Không tải được Cover Editor" description={error} />
      )}
      {/* The editor mounts here. Keep it in the DOM from first render so the
          ref is available when the script finishes loading. */}
      <div id="ce-mount" ref={mountRef} style={{ display: status === 'error' ? 'none' : 'block' }} />
    </div>
  );
}
