/**
 * Vendored HTM (Hyperscript Tagged Markup) Compiler & Pre-Bound `html` Tag
 * Compiles JSX-like template strings once per callsite (cached via WeakMap) into VNodes.
 */

import { h, Fragment } from './preact.mjs';

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': '\u00a0',
};

function decodeEntities(str) {
  if (!str || !str.includes('&')) return str;
  return str.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITY_MAP[m] || m);
}

const SLOT_EXACT_RE = /^\x00(\d+)\x01$/;
const SLOT_GLOBAL_RE = /\x00(\d+)\x01/g;

function parseAttrValue(rawVal) {
  const exact = SLOT_EXACT_RE.exec(rawVal);
  if (exact) {
    return { kind: 'slot', index: Number(exact[1]) };
  }
  if (!rawVal.includes('\x00')) {
    return { kind: 'static', value: decodeEntities(rawVal) };
  }
  const parts = [];
  let last = 0;
  SLOT_GLOBAL_RE.lastIndex = 0;
  let m;
  while ((m = SLOT_GLOBAL_RE.exec(rawVal)) !== null) {
    if (m.index > last) {
      parts.push({ kind: 'static', value: decodeEntities(rawVal.slice(last, m.index)) });
    }
    parts.push({ kind: 'slot', index: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < rawVal.length) {
    parts.push({ kind: 'static', value: decodeEntities(rawVal.slice(last)) });
  }
  return { kind: 'interp', parts };
}

function appendTextSegment(rawSeg, targetChildren) {
  if (!rawSeg) return;
  // Drop indentation-only whitespace blocks spanning newlines between elements
  if (!rawSeg.includes('\x00') && /^[\s]*\n[\s]*$/.test(rawSeg)) {
    return;
  }
  let cleaned = rawSeg;
  if (/^\n\s+/.test(cleaned)) cleaned = cleaned.replace(/^\n\s+/, ' ');
  if (/\n\s+$/.test(cleaned)) cleaned = cleaned.replace(/\n\s+$/, ' ');

  let last = 0;
  SLOT_GLOBAL_RE.lastIndex = 0;
  let m;
  while ((m = SLOT_GLOBAL_RE.exec(cleaned)) !== null) {
    if (m.index > last) {
      const txt = decodeEntities(cleaned.slice(last, m.index));
      if (txt && !/^[\s]*\n[\s]*$/.test(txt)) {
        targetChildren.push({ kind: 'text', value: txt });
      }
    }
    targetChildren.push({ kind: 'slot', index: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < cleaned.length) {
    const tail = decodeEntities(cleaned.slice(last));
    if (tail && !/^[\s]*\n[\s]*$/.test(tail)) {
      targetChildren.push({ kind: 'text', value: tail });
    }
  }
}

function compileTemplate(strings) {
  let joined = strings[0];
  for (let i = 1; i < strings.length; i++) {
    joined += `\x00${i - 1}\x01` + strings[i];
  }
  // Remove HTML comments
  joined = joined.replace(/<!--[\s\S]*?-->/g, '');

  const root = { kind: 'element', tag: { kind: 'fragment' }, attrs: [], children: [] };
  const stack = [root];
  const len = joined.length;
  let pos = 0;
  let textStart = 0;

  const isTagStartChar = (ch) =>
    ch === '/' || ch === '>' || ch === '\x00' || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');

  while (pos < len) {
    const lt = joined.indexOf('<', pos);
    if (lt === -1) {
      appendTextSegment(joined.slice(textStart), stack[stack.length - 1].children);
      break;
    }

    const nextCh = joined[lt + 1] || '';
    if (!isTagStartChar(nextCh)) {
      pos = lt + 1;
      continue;
    }

    if (lt > textStart) {
      appendTextSegment(joined.slice(textStart, lt), stack[stack.length - 1].children);
    }

    // Closing tag: </...> or </>
    if (nextCh === '/') {
      const closeGt = joined.indexOf('>', lt + 2);
      if (closeGt === -1) break;
      if (stack.length > 1) stack.pop();
      pos = closeGt + 1;
      textStart = pos;
      continue;
    }

    // Fragment shorthand: <>
    if (nextCh === '>') {
      const fragNode = { kind: 'element', tag: { kind: 'fragment' }, attrs: [], children: [] };
      stack[stack.length - 1].children.push(fragNode);
      stack.push(fragNode);
      pos = lt + 2;
      textStart = pos;
      continue;
    }

    // Opening tag: <tag ...> or <${Comp} ...>
    let cur = lt + 1;
    let tagSpec;
    if (joined[cur] === '\x00') {
      const endSlot = joined.indexOf('\x01', cur + 1);
      const slotIdx = Number(joined.slice(cur + 1, endSlot));
      tagSpec = { kind: 'slot', index: slotIdx };
      cur = endSlot + 1;
    } else {
      const nameStart = cur;
      while (cur < len && !/[\s/>]/.test(joined[cur])) cur++;
      tagSpec = { kind: 'static', value: joined.slice(nameStart, cur) };
    }

    const attrs = [];
    let selfClosing = false;

    while (cur < len) {
      while (cur < len && /\s/.test(joined[cur])) cur++;
      if (cur >= len) break;
      if (joined[cur] === '>') {
        cur++;
        break;
      }
      if (joined[cur] === '/' && joined[cur + 1] === '>') {
        selfClosing = true;
        cur += 2;
        break;
      }

      // Spread props: ...${obj}
      if (joined.startsWith('...\x00', cur)) {
        const endSlot = joined.indexOf('\x01', cur + 4);
        const slotIdx = Number(joined.slice(cur + 4, endSlot));
        attrs.push({ kind: 'spread', index: slotIdx });
        cur = endSlot + 1;
        continue;
      }

      const attrStart = cur;
      while (cur < len && !/[\s=/>]/.test(joined[cur])) cur++;
      const attrName = joined.slice(attrStart, cur);
      if (!attrName) {
        cur++;
        continue;
      }

      while (cur < len && /\s/.test(joined[cur])) cur++;
      if (joined[cur] === '=') {
        cur++;
        while (cur < len && /\s/.test(joined[cur])) cur++;
        const q = joined[cur];
        if (q === '"' || q === "'") {
          cur++;
          const valStart = cur;
          const closeQ = joined.indexOf(q, cur);
          const rawVal = closeQ === -1 ? joined.slice(valStart) : joined.slice(valStart, closeQ);
          cur = closeQ === -1 ? len : closeQ + 1;
          attrs.push({ kind: 'attr', name: attrName, value: parseAttrValue(rawVal) });
        } else {
          const valStart = cur;
          while (cur < len && !/[\s/>]/.test(joined[cur])) cur++;
          const rawVal = joined.slice(valStart, cur);
          attrs.push({ kind: 'attr', name: attrName, value: parseAttrValue(rawVal) });
        }
      } else {
        attrs.push({ kind: 'attr', name: attrName, value: { kind: 'static', value: true } });
      }
    }

    const elemNode = { kind: 'element', tag: tagSpec, attrs, children: [] };
    stack[stack.length - 1].children.push(elemNode);

    const isVoid = tagSpec.kind === 'static' && VOID_TAGS.has(tagSpec.value.toLowerCase());
    if (!selfClosing && !isVoid) {
      stack.push(elemNode);
    }

    pos = cur;
    textStart = pos;
  }

  return root.children;
}

function evalAttrValue(spec, values) {
  if (spec.kind === 'static') return spec.value;
  if (spec.kind === 'slot') return values[spec.index];
  let out = '';
  for (const p of spec.parts) {
    if (p.kind === 'static') out += p.value;
    else {
      const v = values[p.index];
      if (v !== null && v !== undefined && v !== false) out += String(v);
    }
  }
  return out;
}

function evalNode(node, values, hFn) {
  if (node.kind === 'text') return node.value;
  if (node.kind === 'slot') return values[node.index];

  let tag;
  if (node.tag.kind === 'fragment') tag = Fragment;
  else if (node.tag.kind === 'slot') tag = values[node.tag.index];
  else tag = node.tag.value;

  let props = null;
  if (node.attrs.length > 0) {
    props = {};
    for (const a of node.attrs) {
      if (a.kind === 'spread') {
        const sp = values[a.index];
        if (sp && typeof sp === 'object') Object.assign(props, sp);
      } else {
        props[a.name] = evalAttrValue(a.value, values);
      }
    }
  }

  const evalChildren = node.children.map((c) => evalNode(c, values, hFn));
  return hFn(tag, props, ...evalChildren);
}

const TEMPLATE_CACHE = new WeakMap();

export function htm(strings, ...values) {
  let ast = TEMPLATE_CACHE.get(strings);
  if (!ast) {
    ast = compileTemplate(strings);
    TEMPLATE_CACHE.set(strings, ast);
  }
  if (ast.length === 0) return null;
  if (ast.length === 1) return evalNode(ast[0], values, this);
  return this(Fragment, null, ...ast.map((n) => evalNode(n, values, this)));
}

export const html = htm.bind(h);
export default htm;
