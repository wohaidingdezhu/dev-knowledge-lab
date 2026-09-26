export const SANDBOX_CHANNEL = 'knowledge-lab-preview'
export const MAX_PREVIEW_MESSAGES = 120
export const MAX_PREVIEW_TEXT = 8_000

export interface SandboxSource {
  html: string
  css: string
  js: string
}

type MessageBase = { channel: typeof SANDBOX_CHANNEL; runId: string }
export type SandboxMessage = MessageBase &
  (
    | { kind: 'ready' }
    | { kind: 'limit' }
    | {
        kind: 'console'
        level: 'log' | 'info' | 'warn' | 'error' | 'debug'
        text: string
      }
    | {
        kind: 'error'
        text: string
        line: number | null
        column: number | null
      }
  )

const TOKEN_PATTERN = /^[a-zA-Z0-9_-]{16,100}$/

/** Escaping '<' is essential: HTML parses script end tags before JavaScript strings. */
export function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** Construct a fresh opaque-origin document. Never execute example code in the host. */
export function buildSandboxDocument(
  source: SandboxSource,
  runId: string,
  nonce: string,
): string {
  if (!TOKEN_PATTERN.test(runId) || !TOKEN_PATTERN.test(nonce)) {
    throw new Error('无效的预览运行标识。')
  }
  const payload = serializeForScript({ ...source, runId, nonce })
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "script-src-attr 'none'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    "connect-src 'none'",
    "font-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Knowledge Lab preview</title>
<style>body{margin:20px;font:14px/1.6 system-ui,sans-serif;color:#252b36;overflow-wrap:anywhere}*{box-sizing:border-box}button,input,textarea{font:inherit}</style>
</head><body><div id="lab-root"></div>
<script nonce="${nonce}">
(() => {
  'use strict';
  const input = ${payload};
  const sendToParent = window.parent.postMessage.bind(window.parent);
  const channel = '${SANDBOX_CHANNEL}';
  const maxMessages = ${MAX_PREVIEW_MESSAGES};
  const maxText = ${MAX_PREVIEW_TEXT};
  let messageCount = 0;
  const post = (message) => sendToParent({channel, runId: input.runId, ...message}, '*');
  const report = (message) => {
    if (messageCount >= maxMessages) {
      if (messageCount === maxMessages) post({kind: 'limit'});
      messageCount += 1;
      return;
    }
    messageCount += 1;
    post(message);
  };
  const describe = (value) => {
    try {
      if (typeof value === 'string') return value;
      if (value instanceof Error) return value.name + ': ' + value.message;
      if (typeof value === 'undefined') return 'undefined';
      if (typeof value === 'function') return '[Function ' + (value.name || 'anonymous') + ']';
      if (typeof value === 'bigint') return value.toString() + 'n';
      if (typeof value === 'symbol') return value.toString();
      return JSON.stringify(value) ?? String(value);
    } catch (_) {
      return '[无法序列化的值]';
    }
  };
  const textFor = (values) => values.map(describe).join(' ').slice(0, maxText);
  ['log', 'info', 'warn', 'error', 'debug'].forEach((level) => {
    console[level] = (...values) => report({kind: 'console', level, text: textFor(values)});
  });
  console.assert = (condition, ...values) => {
    if (!condition) report({kind: 'console', level: 'error', text: ('Assertion failed: ' + textFor(values)).slice(0, maxText)});
  };
  window.addEventListener('error', (event) => {
    report({kind: 'error', text: String(event.message || '示例执行失败').slice(0, maxText), line: event.lineno || null, column: event.colno || null});
  });
  // WebKit hides details of uncaught errors from dynamically appended scripts.
  // Catch runtime errors inside the opaque preview so their message reaches the console.
  window.__labReportRuntimeError = (error) => {
    report({kind: 'error', text: describe(error).slice(0, maxText), line: null, column: null});
  };
  window.addEventListener('unhandledrejection', (event) => {
    report({kind: 'error', text: ('Unhandled rejection: ' + describe(event.reason)).slice(0, maxText), line: null, column: null});
  });
  window.addEventListener('securitypolicyviolation', (event) => {
    report({kind: 'console', level: 'warn', text: ('安全策略已阻止：' + event.violatedDirective + (event.blockedURI ? ' (' + event.blockedURI + ')' : '')).slice(0, maxText)});
  });
  const template = document.createElement('template');
  template.innerHTML = input.html;
  // HTML is markup only. The JavaScript tab is the explicit execution entry point.
  template.content.querySelectorAll('script,iframe,frame,object,embed,base,meta,link').forEach((node) => node.remove());
  document.getElementById('lab-root').appendChild(template.content);
  const style = document.createElement('style');
  style.textContent = input.css;
  document.head.appendChild(style);
  const example = document.createElement('script');
  example.nonce = input.nonce;
  example.textContent = 'try {\\n' + input.js + '\\n} catch (error) { window.__labReportRuntimeError(error); }\\n//# sourceURL=knowledge-lab-example.js';
  document.body.appendChild(example);
  post({kind: 'ready'});
})();
</script></body></html>`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actualKeys = Object.keys(value)
  return (
    actualKeys.length === keys.length &&
    actualKeys.every((key) => keys.includes(key))
  )
}

function isLocation(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= 10_000_000)
  )
}

/** Origin is "null" for this iframe, so validate its window identity and current run. */
export function readSandboxMessage(
  event: Pick<MessageEvent, 'source' | 'data'>,
  expectedWindow: MessageEventSource | null,
  runId: string,
): SandboxMessage | null {
  if (
    !expectedWindow ||
    event.source !== expectedWindow ||
    !isRecord(event.data)
  )
    return null
  const data = event.data
  if (data.channel !== SANDBOX_CHANNEL || data.runId !== runId) return null
  const baseKeys = ['channel', 'runId', 'kind']
  if (data.kind === 'ready' || data.kind === 'limit') {
    return hasOnlyKeys(data, baseKeys) ? (data as SandboxMessage) : null
  }
  if (typeof data.text !== 'string' || data.text.length > MAX_PREVIEW_TEXT)
    return null
  if (data.kind === 'console') {
    if (
      !hasOnlyKeys(data, [...baseKeys, 'level', 'text']) ||
      !['log', 'info', 'warn', 'error', 'debug'].includes(data.level as string)
    )
      return null
    return data as SandboxMessage
  }
  if (data.kind === 'error') {
    if (
      !hasOnlyKeys(data, [...baseKeys, 'text', 'line', 'column']) ||
      !isLocation(data.line) ||
      !isLocation(data.column)
    )
      return null
    return data as SandboxMessage
  }
  return null
}
