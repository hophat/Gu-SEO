// Minimal React runtime for the admin hook tests.
//
// src/admin/lib/*.js is plain logic wrapped in hooks, and the only way to
// exercise the parts that live inside a hook (the polling interval, the
// publish/delete requests) is to run the hook. This is the smallest runtime
// that can: useState / useEffect / useCallback, index-keyed and in fixed
// order like React, plus a driver that flushes effects and re-renders until
// the promises the effects started have landed.
//
// scripts/run-admin-hook-tests.mjs aliases BOTH `react` and `antd` here, so
// this file also exports the one antd surface the hooks touch (`message`),
// recorded in `messageLog` for assertions.
//
// Not a renderer: there is no DOM, no elements and no children. A hook that
// needs more React (useMemo, useRef, …) should get it added here.
export const messageLog = [];

function push(kind, text) { messageLog.push({ kind, text }); }

export const message = {
  error: (text) => push('error', text),
  success: (text) => push('success', text),
  info: (text) => push('info', text),
  warning: (text) => push('warning', text),
  loading: () => () => {},
};

let CUR = null;

function sameDeps(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

export function useState(init) {
  const inst = CUR;
  const i = inst.i++;
  if (!(i in inst.states)) inst.states[i] = typeof init === 'function' ? init() : init;
  return [inst.states[i], (v) => {
    const next = typeof v === 'function' ? v(inst.states[i]) : v;
    if (!Object.is(next, inst.states[i])) inst.states[i] = next;
  }];
}

export function useCallback(fn, deps) {
  const inst = CUR;
  const i = inst.i++;
  const prev = inst.memos.get(i);
  if (prev && sameDeps(prev.deps, deps)) { inst.kept.add(i); return prev.value; }
  inst.memos.set(i, { value: fn, deps });
  inst.kept.add(i);
  return fn;
}

export function useEffect(fn, deps) {
  const inst = CUR;
  const i = inst.i++;
  const prev = inst.memos.get(i);
  if (prev && sameDeps(prev.deps, deps)) { inst.kept.add(i); return; }
  inst.pending.push({ i, fn, deps });
}

// Drives one component instance: pass() renders and flushes effects,
// settle() keeps doing that until async work stops changing state.
export class Harness {
  constructor(render) {
    this.render = render;
    this.states = {};
    this.memos = new Map();
    this.kept = new Set();
    this.pending = [];
    this.i = 0;
    this.out = null;
  }

  pass() {
    this.i = 0; this.pending = []; this.kept = new Set();
    const prev = CUR; CUR = this;
    try { this.out = this.render(); } finally { CUR = prev; }
    for (const e of this.pending) {
      const old = this.memos.get(e.i);
      if (typeof old?.cleanup === 'function') old.cleanup();
      const entry = { deps: e.deps, cleanup: null };
      const c = e.fn();
      if (typeof c === 'function') entry.cleanup = c;
      this.memos.set(e.i, entry);
    }
    return this.out;
  }

  async settle(turns = 10) {
    for (let k = 0; k < turns; k++) {
      this.pass();
      await new Promise((r) => setImmediate(r));
    }
    return this.out;
  }

  unmount() {
    for (const m of this.memos.values()) if (typeof m.cleanup === 'function') m.cleanup();
    this.memos.clear();
  }
}
