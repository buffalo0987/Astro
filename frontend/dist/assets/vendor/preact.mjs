/**
 * Vendored Preact-Compatible Virtual DOM Runtime (Offline Zero-Build ES6 Module)
 * Supports keyed reconciliation, SVG namespaces, persistent refs (<canvas>), controlled
 * form inputs (<select>/<input>), Fragment/Empty comment anchors, and microtask batching.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const EMPTY_OBJ = Object.freeze({});
export const Fragment = Symbol.for('astropi.Fragment');
const TEXT_TYPE = Symbol.for('astropi.Text');
const EMPTY_TYPE = Symbol.for('astropi.Empty');

let currentInstance = null;
let currentHookIndex = 0;
const pendingEffectInstances = [];
const dirtyInstances = new Set();
let flushScheduled = false;

export function _getHookSlot() {
  if (!currentInstance) {
    throw new Error('Hooks can only be called inside a component render.');
  }
  const idx = currentHookIndex++;
  const hooks = currentInstance.hooks;
  if (idx >= hooks.length) {
    hooks.push({});
  }
  return { hook: hooks[idx], instance: currentInstance };
}

export function _scheduleInstanceUpdate(instance) {
  if (!instance || instance.unmounted) return;
  instance.dirty = true;
  dirtyInstances.add(instance);
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flushDirtyInstances);
  }
}

export function _queueEffectFlush(instance) {
  if (!pendingEffectInstances.includes(instance)) {
    pendingEffectInstances.push(instance);
  }
}

function flushEffects() {
  while (pendingEffectInstances.length > 0) {
    const inst = pendingEffectInstances.shift();
    if (!inst || inst.unmounted) continue;
    const queue = inst.pendingEffects.splice(0);
    for (const hSlot of queue) {
      if (typeof hSlot.cleanup === 'function') {
        try {
          hSlot.cleanup();
        } catch (_) {}
      }
      hSlot.cleanup = undefined;
      const cleanup = hSlot.effect();
      if (typeof cleanup === 'function') {
        hSlot.cleanup = cleanup;
      }
    }
  }
}

function flushDirtyInstances() {
  flushScheduled = false;
  if (dirtyInstances.size === 0) return;
  const list = Array.from(dirtyInstances).sort((a, b) => a.depth - b.depth);
  dirtyInstances.clear();
  for (const inst of list) {
    if (!inst.dirty || inst.unmounted) continue;
    updateComponentInstance(inst);
  }
  flushEffects();
}

function createEmptyVNode() {
  return { type: EMPTY_TYPE, props: EMPTY_OBJ, key: null, ref: null, _dom: null };
}

function createTextVNode(text) {
  return { type: TEXT_TYPE, props: EMPTY_OBJ, text: String(text), key: null, ref: null, _dom: null };
}

function normalizeSlotChild(child) {
  if (child === null || child === undefined || typeof child === 'boolean') {
    return createEmptyVNode();
  }
  if (Array.isArray(child)) {
    return { type: Fragment, props: { children: child }, key: null, ref: null, _endDom: null, _children: null };
  }
  if (typeof child === 'string' || typeof child === 'number') {
    return createTextVNode(child);
  }
  return child;
}

function normalizeFragmentChildren(raw) {
  const out = [];
  const pushFlat = (item) => {
    if (item === null || item === undefined || typeof item === 'boolean') {
      return;
    }
    if (Array.isArray(item)) {
      for (let i = 0; i < item.length; i++) pushFlat(item[i]);
      return;
    }
    if (typeof item === 'string' || typeof item === 'number') {
      out.push(createTextVNode(item));
      return;
    }
    out.push(item);
  };
  pushFlat(raw);
  return out;
}

function normalizeHostChildren(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return [normalizeSlotChild(raw)];
  return raw.map(normalizeSlotChild);
}

export function h(type, rawProps, ...restChildren) {
  let key = null;
  let ref = null;
  const props = {};
  if (rawProps) {
    for (const k of Object.keys(rawProps)) {
      if (k === 'key') key = rawProps[k];
      else if (k === 'ref') ref = rawProps[k];
      else props[k] = rawProps[k];
    }
  }
  if (restChildren.length > 0) {
    props.children = restChildren.length === 1 ? restChildren[0] : restChildren;
  }
  return {
    type,
    props,
    key,
    ref,
    _dom: null,
    _endDom: null,
    _children: null,
    _instance: null,
  };
}

export const createElement = h;

function setRef(ref, value) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else if (typeof ref === 'object') ref.current = value;
}

function firstDom(vnode) {
  if (!vnode) return null;
  if (vnode.type === Fragment) {
    const ch = vnode._children;
    if (ch && ch.length > 0) return firstDom(ch[0]);
    return vnode._endDom;
  }
  if (typeof vnode.type === 'function') {
    return firstDom(vnode._instance?.rendered);
  }
  return vnode._dom;
}

function lastDom(vnode) {
  if (!vnode) return null;
  if (vnode.type === Fragment) {
    return vnode._endDom;
  }
  if (typeof vnode.type === 'function') {
    return lastDom(vnode._instance?.rendered);
  }
  return vnode._dom;
}

function collectDomNodes(vnode, out = []) {
  if (!vnode) return out;
  if (vnode.type === Fragment) {
    for (const c of vnode._children || []) collectDomNodes(c, out);
    if (vnode._endDom) out.push(vnode._endDom);
    return out;
  }
  if (typeof vnode.type === 'function') {
    return collectDomNodes(vnode._instance?.rendered, out);
  }
  if (vnode._dom) out.push(vnode._dom);
  return out;
}

function eventProxy(e) {
  const fn = this._listeners?.[e.type];
  if (typeof fn === 'function') return fn(e);
}

const BOOL_PROPS = new Set(['disabled', 'checked', 'selected', 'readOnly', 'multiple', 'autoplay', 'controls', 'loop', 'muted']);

function setSingleProp(dom, name, prevVal, nextVal, isSvg, isSelectTag) {
  if (name === 'children' || name === 'key' || name === 'ref') return;

  if (name === 'class' || name === 'className') {
    const cls = nextVal || '';
    if (isSvg) {
      if (cls) dom.setAttribute('class', cls);
      else dom.removeAttribute('class');
    } else if (dom.className !== cls) {
      dom.className = cls;
    }
    return;
  }

  if (name === 'style') {
    if (!nextVal) {
      dom.style.cssText = '';
    } else if (typeof nextVal === 'string') {
      if (prevVal !== nextVal) dom.style.cssText = nextVal;
    } else if (typeof nextVal === 'object') {
      if (typeof prevVal === 'string') dom.style.cssText = '';
      if (prevVal && typeof prevVal === 'object') {
        for (const k of Object.keys(prevVal)) {
          if (!(k in nextVal)) dom.style[k] = '';
        }
      }
      for (const [k, v] of Object.entries(nextVal)) {
        dom.style[k] = v ?? '';
      }
    }
    return;
  }

  if (name.startsWith('on') && name.length > 2) {
    const evName = name.slice(2).toLowerCase();
    if (!dom._listeners) dom._listeners = {};
    const hadListener = Boolean(dom._listeners[evName]);
    const opts = (evName === 'touchstart' || evName === 'touchmove') ? { passive: false } : false;
    dom._listeners[evName] = nextVal;
    if (nextVal && !hadListener) {
      dom.addEventListener(evName, eventProxy, opts);
    } else if (!nextVal && hadListener) {
      dom.removeEventListener?.(evName, eventProxy, opts);
    }
    return;
  }

  if (name === 'value') {
    if (isSelectTag) return; // Handled after <option> children are patched
    const strVal = nextVal === null || nextVal === undefined ? '' : String(nextVal);
    if (
      typeof document !== 'undefined' &&
      document.activeElement === dom &&
      dom.type === 'number' &&
      dom.value !== '' &&
      Number(dom.value) === Number(nextVal)
    ) {
      return;
    }
    if (dom.value !== strVal) {
      dom.value = strVal;
    }
    return;
  }

  if (!isSvg && BOOL_PROPS.has(name)) {
    const bVal = Boolean(nextVal);
    if (dom[name] !== bVal) dom[name] = bVal;
    return;
  }

  if (nextVal === null || nextVal === undefined || nextVal === false) {
    dom.removeAttribute(name);
  } else {
    const attrVal = nextVal === true ? '' : String(nextVal);
    if (prevVal !== nextVal) {
      dom.setAttribute(name, attrVal);
    }
  }
}

function applyProps(dom, oldProps, newProps, isSvg, isSelectTag) {
  for (const k of Object.keys(oldProps)) {
    if (k !== 'children' && k !== 'key' && k !== 'ref' && !(k in newProps)) {
      setSingleProp(dom, k, oldProps[k], null, isSvg, isSelectTag);
    }
  }
  for (const k of Object.keys(newProps)) {
    if (k !== 'children' && k !== 'key' && k !== 'ref') {
      const forceSync = k === 'value' || k === 'checked' || k === 'selected';
      if (forceSync || oldProps[k] !== newProps[k]) {
        setSingleProp(dom, k, oldProps[k], newProps[k], isSvg, isSelectTag);
      }
    }
  }
}

function syncSelectValue(selectDom, props) {
  if ('value' in props && props.value !== undefined && props.value !== null) {
    const strVal = String(props.value);
    if (selectDom.value !== strVal) {
      selectDom.value = strVal;
    }
  }
}

function renderWithHooks(inst) {
  const prevInst = currentInstance;
  const prevIdx = currentHookIndex;
  currentInstance = inst;
  currentHookIndex = 0;
  inst.dirty = false;
  let rawOut;
  try {
    rawOut = inst.vnode.type(inst.vnode.props);
  } finally {
    currentInstance = prevInst;
    currentHookIndex = prevIdx;
  }
  return normalizeSlotChild(rawOut);
}

function updateComponentInstance(inst) {
  if (inst.unmounted) return;
  const nextRendered = renderWithHooks(inst);
  const prevRendered = inst.rendered;
  inst.rendered = nextRendered;
  patch(inst.parentDom, prevRendered, nextRendered, null, inst.isSvg, inst.depth + 1);
}

function unmount(vnode) {
  if (!vnode) return;
  if (vnode.ref) setRef(vnode.ref, null);

  if (vnode.type === Fragment) {
    for (const c of vnode._children || []) unmount(c);
    vnode._endDom?.remove();
    return;
  }

  if (typeof vnode.type === 'function') {
    const inst = vnode._instance;
    if (inst) {
      inst.unmounted = true;
      dirtyInstances.delete(inst);
      for (const hSlot of inst.hooks) {
        if (typeof hSlot.cleanup === 'function') {
          try {
            hSlot.cleanup();
          } catch (_) {}
          hSlot.cleanup = undefined;
        }
      }
      unmount(inst.rendered);
    }
    return;
  }

  if (vnode._children) {
    for (const c of vnode._children) unmount(c);
  }
  vnode._dom?.remove();
}

function diffChildren(parentDom, oldChildren, newChildren, endAnchor, isSvg, depth) {
  const hasKeys =
    newChildren.some((c) => c && c.key !== null && c.key !== undefined) ||
    oldChildren.some((c) => c && c.key !== null && c.key !== undefined);

  if (!hasKeys) {
    const common = Math.min(oldChildren.length, newChildren.length);
    for (let i = 0; i < common; i++) {
      patch(parentDom, oldChildren[i], newChildren[i], endAnchor, isSvg, depth);
    }
    if (newChildren.length > oldChildren.length) {
      for (let i = common; i < newChildren.length; i++) {
        patch(parentDom, null, newChildren[i], endAnchor, isSvg, depth);
      }
    } else if (oldChildren.length > newChildren.length) {
      for (let i = common; i < oldChildren.length; i++) {
        unmount(oldChildren[i]);
      }
    }
    return;
  }

  const keyedOld = new Map();
  const unkeyedOld = [];
  for (const oc of oldChildren) {
    if (oc.key !== null && oc.key !== undefined) {
      keyedOld.set(oc.key, oc);
    } else {
      unkeyedOld.push(oc);
    }
  }

  let nextAnchor = endAnchor;
  for (let i = newChildren.length - 1; i >= 0; i--) {
    const nc = newChildren[i];
    let matched = null;
    if (nc.key !== null && nc.key !== undefined) {
      const cand = keyedOld.get(nc.key);
      if (cand && cand.type === nc.type) {
        matched = cand;
        keyedOld.delete(nc.key);
      }
    } else if (unkeyedOld.length > 0) {
      const cand = unkeyedOld[unkeyedOld.length - 1];
      if (cand && cand.type === nc.type) {
        matched = unkeyedOld.pop();
      }
    }

    if (matched) {
      patch(parentDom, matched, nc, nextAnchor, isSvg, depth);
      const lDom = lastDom(nc);
      if (lDom && lDom.nextSibling !== nextAnchor) {
        const nodes = collectDomNodes(nc);
        for (const nd of nodes) {
          parentDom.insertBefore(nd, nextAnchor);
        }
      }
    } else {
      patch(parentDom, null, nc, nextAnchor, isSvg, depth);
    }
    nextAnchor = firstDom(nc) || nextAnchor;
  }

  for (const rem of keyedOld.values()) unmount(rem);
  for (const rem of unkeyedOld) unmount(rem);
}

function patch(parentDom, oldVNode, newVNode, beforeDom, isSvg, depth = 0) {
  if (oldVNode === newVNode) return;

  if (oldVNode && (oldVNode.type !== newVNode.type || oldVNode.key !== newVNode.key)) {
    const anchor = firstDom(oldVNode);
    patch(parentDom, null, newVNode, anchor, isSvg, depth);
    unmount(oldVNode);
    return;
  }

  // 1. Empty placeholder VNode (Comment anchor preserves sibling slot positions)
  if (newVNode.type === EMPTY_TYPE) {
    if (!oldVNode) {
      const c = document.createComment('');
      parentDom.insertBefore(c, beforeDom);
      newVNode._dom = c;
    } else {
      newVNode._dom = oldVNode._dom;
    }
    return;
  }

  // 2. Text VNode
  if (newVNode.type === TEXT_TYPE) {
    if (!oldVNode) {
      const t = document.createTextNode(newVNode.text);
      parentDom.insertBefore(t, beforeDom);
      newVNode._dom = t;
    } else {
      const t = (newVNode._dom = oldVNode._dom);
      if (oldVNode.text !== newVNode.text) {
        t.nodeValue = newVNode.text;
      }
    }
    return;
  }

  // 3. Fragment VNode (including dynamic array slots)
  if (newVNode.type === Fragment) {
    const nextChildren = normalizeFragmentChildren(newVNode.props.children);
    newVNode._children = nextChildren;
    if (!oldVNode) {
      const endDom = document.createComment('');
      parentDom.insertBefore(endDom, beforeDom);
      newVNode._endDom = endDom;
      for (const ch of nextChildren) {
        patch(parentDom, null, ch, endDom, isSvg, depth + 1);
      }
    } else {
      newVNode._endDom = oldVNode._endDom;
      diffChildren(parentDom, oldVNode._children || [], nextChildren, newVNode._endDom, isSvg, depth + 1);
    }
    return;
  }

  // 4. Function Component VNode
  if (typeof newVNode.type === 'function') {
    if (!oldVNode) {
      const inst = {
        vnode: newVNode,
        parentDom,
        isSvg,
        depth,
        hooks: [],
        pendingEffects: [],
        rendered: null,
        dirty: false,
        unmounted: false,
      };
      newVNode._instance = inst;
      const rendered = renderWithHooks(inst);
      inst.rendered = rendered;
      patch(parentDom, null, rendered, beforeDom, isSvg, depth + 1);
    } else {
      const inst = (newVNode._instance = oldVNode._instance);
      inst.vnode = newVNode;
      inst.parentDom = parentDom;
      inst.isSvg = isSvg;
      inst.depth = depth;
      const nextRendered = renderWithHooks(inst);
      const prevRendered = inst.rendered;
      inst.rendered = nextRendered;
      patch(parentDom, prevRendered, nextRendered, null, isSvg, depth + 1);
    }
    return;
  }

  // 5. Host HTML / SVG Element VNode
  const tag = newVNode.type;
  const nextSvg = isSvg || tag === 'svg';
  const childSvg = nextSvg && tag !== 'foreignObject';
  const isSelect = !nextSvg && tag === 'select';
  const nextChildren = normalizeHostChildren(newVNode.props.children);
  newVNode._children = nextChildren;

  if (!oldVNode) {
    const dom = nextSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    newVNode._dom = dom;
    applyProps(dom, EMPTY_OBJ, newVNode.props, nextSvg, isSelect);
    for (const ch of nextChildren) {
      patch(dom, null, ch, null, childSvg, depth + 1);
    }
    if (isSelect) syncSelectValue(dom, newVNode.props);
    parentDom.insertBefore(dom, beforeDom);
    if (newVNode.ref) setRef(newVNode.ref, dom);
  } else {
    const dom = (newVNode._dom = oldVNode._dom);
    applyProps(dom, oldVNode.props, newVNode.props, nextSvg, isSelect);
    diffChildren(dom, oldVNode._children || [], nextChildren, null, childSvg, depth + 1);
    if (isSelect) syncSelectValue(dom, newVNode.props);
    if (oldVNode.ref !== newVNode.ref) {
      if (oldVNode.ref) setRef(oldVNode.ref, null);
      if (newVNode.ref) setRef(newVNode.ref, dom);
    }
  }
}

export function render(vnode, containerDom) {
  const normalized = normalizeSlotChild(vnode);
  const prevVNode = containerDom._rootVNode || null;
  if (!prevVNode) {
    containerDom.textContent = '';
  }
  patch(containerDom, prevVNode, normalized, null, false, 0);
  containerDom._rootVNode = normalized;
  flushEffects();
}
