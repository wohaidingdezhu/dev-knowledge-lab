import { describe, expect, it } from 'vitest'
import {
  buildSandboxDocument,
  MAX_PREVIEW_TEXT,
  readSandboxMessage,
  SANDBOX_CHANNEL,
  serializeForScript,
} from '../src/lib/sandbox'

const runId = 'test-run-1234567890'
const nonce = 'test-nonce-1234567890'
const currentWindow = {} as Window
const base = { channel: SANDBOX_CHANNEL, runId }

describe('sandbox document construction', () => {
  it('keeps hostile markup and closing script tags inside the serialized payload', () => {
    const hostile =
      '</script><script>parent.document.body.innerHTML="escaped"</script><!--\u2028\u2029'
    const document = buildSandboxDocument(
      { html: hostile, css: hostile, js: hostile },
      runId,
      nonce,
    )
    expect(document.match(/<script\b/g)).toHaveLength(1)
    expect(document.match(/<\/script>/g)).toHaveLength(1)
    expect(document).not.toContain(hostile)
    expect(JSON.parse(serializeForScript({ value: hostile }))).toEqual({
      value: hostile,
    })
  })

  it('limits executable scripts to a nonce and blocks ordinary external requests', () => {
    const document = buildSandboxDocument(
      { html: '', css: '', js: '' },
      runId,
      nonce,
    )
    expect(document).toContain(`script-src 'nonce-${nonce}'`)
    expect(document).toContain("script-src-attr 'none'")
    expect(document).toContain("connect-src 'none'")
    expect(document).toContain("default-src 'none'")
    expect(document).toContain("form-action 'none'")
    expect(document).not.toContain('unsafe-eval')
    expect(document).not.toContain('allow-same-origin')
  })

  it('rejects tokens which could inject markup or CSP directives', () => {
    expect(() =>
      buildSandboxDocument(
        { html: '', css: '', js: '' },
        runId,
        '" onload="alert(1)',
      ),
    ).toThrow()
    expect(() =>
      buildSandboxDocument(
        { html: '', css: '', js: '' },
        '</script><script>',
        nonce,
      ),
    ).toThrow()
  })
})

describe('sandbox message validation', () => {
  it('accepts well-formed messages only from the current frame and run', () => {
    const data = { ...base, kind: 'console', level: 'log', text: 'hello' }
    expect(
      readSandboxMessage({ source: currentWindow, data }, currentWindow, runId),
    ).toEqual(data)
    expect(
      readSandboxMessage({ source: {} as Window, data }, currentWindow, runId),
    ).toBeNull()
    expect(
      readSandboxMessage(
        { source: currentWindow, data },
        currentWindow,
        'an-older-run-id-123',
      ),
    ).toBeNull()
    expect(readSandboxMessage({ source: null, data }, null, runId)).toBeNull()
  })

  it('accepts ready, limit, and bounded error coordinates', () => {
    for (const data of [
      { ...base, kind: 'ready' },
      { ...base, kind: 'limit' },
      { ...base, kind: 'error', text: 'SyntaxError', line: 4, column: null },
    ]) {
      expect(
        readSandboxMessage(
          { source: currentWindow, data },
          currentWindow,
          runId,
        ),
      ).toEqual(data)
    }
  })

  it.each([
    null,
    [],
    { ...base, kind: 'ready', unexpected: 'field' },
    { ...base, channel: 'another-application', kind: 'ready' },
    { ...base, kind: 'console', level: 'html', text: '<img onerror=alert(1)>' },
    { ...base, kind: 'console', level: 'log', text: { nested: 'object' } },
    {
      ...base,
      kind: 'console',
      level: 'log',
      text: 'a'.repeat(MAX_PREVIEW_TEXT + 1),
    },
    { ...base, kind: 'error', text: 'bad', line: -1, column: 1 },
    { ...base, kind: 'error', text: 'bad', line: Infinity, column: 1 },
    { ...base, kind: 'error', text: 'bad', line: 1.5, column: 1 },
    { ...base, kind: 'error', text: 'missing column', line: 1 },
  ])('rejects malformed messages (%j)', (data) => {
    expect(
      readSandboxMessage({ source: currentWindow, data }, currentWindow, runId),
    ).toBeNull()
  })
})
