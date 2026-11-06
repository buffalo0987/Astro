/**
 * Vendored Preact Hooks API (useState, useEffect, useRef, useMemo, useCallback)
 */

import { _getHookSlot, _scheduleInstanceUpdate, _queueEffectFlush } from './preact.mjs';

function depsChanged(prevDeps, nextDeps) {
  if (!prevDeps || !nextDeps || prevDeps.length !== nextDeps.length) return true;
  for (let i = 0; i < nextDeps.length; i++) {
    if (!Object.is(prevDeps[i], nextDeps[i])) return true;
  }
  return false;
}

export function useState(initialValue) {
  const { hook, instance } = _getHookSlot();
  if (!('initialized' in hook)) {
    hook.initialized = true;
    hook.value = typeof initialValue === 'function' ? initialValue() : initialValue;
    hook.setState = (updater) => {
      const nextVal = typeof updater === 'function' ? updater(hook.value) : updater;
      if (!Object.is(nextVal, hook.value)) {
        hook.value = nextVal;
        _scheduleInstanceUpdate(instance);
      }
    };
  }
  return [hook.value, hook.setState];
}

export function useRef(initialValue = null) {
  const { hook } = _getHookSlot();
  if (!('ref' in hook)) {
    hook.ref = { current: initialValue };
  }
  return hook.ref;
}

export function useEffect(effectFn, deps) {
  const { hook, instance } = _getHookSlot();
  if (depsChanged(hook.deps, deps)) {
    hook.deps = deps;
    hook.effect = effectFn;
    instance.pendingEffects.push(hook);
    _queueEffectFlush(instance);
  }
}

export function useMemo(factory, deps) {
  const { hook } = _getHookSlot();
  if (!('initialized' in hook) || depsChanged(hook.deps, deps)) {
    hook.initialized = true;
    hook.deps = deps;
    hook.value = factory();
  }
  return hook.value;
}

export function useCallback(fn, deps) {
  return useMemo(() => fn, deps);
}
