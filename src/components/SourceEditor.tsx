import { useCallback, useId, useLayoutEffect, useMemo, useRef } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { indentWithTab } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState, Prec, StateEffect, StateField } from '@codemirror/state'
import { EditorView, keymap, showPanel } from '@codemirror/view'
import { tags } from '@lezer/highlight'

type SourceLanguage = 'html' | 'css' | 'js' | 'markdown'

const lengthLimitNotice = StateEffect.define<boolean>()
const hasLengthLimitNotice = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    if (transaction.docChanged) value = false
    for (const effect of transaction.effects) {
      if (effect.is(lengthLimitNotice)) value = effect.value
    }
    return value
  },
})

const readableHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#623c88' },
  { tag: [tags.string, tags.special(tags.string)], color: '#815019' },
  { tag: tags.comment, color: '#526955' },
  { tag: tags.number, color: '#315c83' },
  { tag: [tags.propertyName, tags.attributeName], color: '#4b548b' },
  { tag: tags.tagName, color: '#793e62' },
  { tag: tags.variableName, color: '#35446e' },
])

export function SourceEditor({
  language,
  label,
  value,
  maxLength,
  onChange,
  onRun,
  disabled = false,
  active = true,
  className,
}: {
  language: SourceLanguage
  label: string
  value: string
  maxLength: number
  onChange: (value: string) => void
  onRun?: () => void
  disabled?: boolean
  active?: boolean
  className?: string
}) {
  const noticeId = useId()
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const callbacks = useRef({ onChange, onRun })
  useLayoutEffect(() => {
    callbacks.current = { onChange, onRun }
  }, [onChange, onRun])
  useLayoutEffect(() => {
    if (active) editorRef.current?.view?.requestMeasure()
  }, [active])
  const handleChange = useCallback((next: string) => {
    callbacks.current.onChange(next)
  }, [])
  const extensions = useMemo(() => {
    const syntax =
      language === 'html'
        ? html()
        : language === 'css'
          ? css()
          : language === 'js'
            ? javascript()
            : markdown()
    return [
      syntax,
      syntaxHighlighting(readableHighlight),
      hasLengthLimitNotice,
      EditorState.transactionFilter.of((transaction) => {
        if (!transaction.docChanged || transaction.newDoc.length <= maxLength)
          return transaction
        // Reject the whole edit, including its selection, without adding an undo step.
        return { effects: lengthLimitNotice.of(true) }
      }),
      EditorView.contentAttributes.of((view) => ({
        'aria-label': label,
        ...(view.state.field(hasLengthLimitNotice)
          ? { 'aria-describedby': noticeId }
          : {}),
      })),
      showPanel.from(hasLengthLimitNotice, (visible) =>
        visible
          ? () => {
              const dom = document.createElement('div')
              dom.id = noticeId
              dom.className = 'source-editor-limit-message'
              dom.setAttribute('role', 'alert')
              dom.textContent = `${label}最多支持 ${maxLength.toLocaleString('zh-CN')} 个字符。本次输入已取消，原内容和选区已保留；请缩短后重试。按 Esc 关闭提示。`
              return { dom }
            }
          : null,
      ),
      EditorView.theme({
        '.source-editor-limit-message': {
          padding: '7px 10px',
          backgroundColor: '#fff5f2',
          color: '#8f2b38',
          fontFamily: 'sans-serif',
          fontSize: '12px',
          lineHeight: '1.5',
        },
      }),
      keymap.of([indentWithTab]),
      Prec.high(
        keymap.of([
          {
            key: 'Escape',
            run: (view) => {
              if (!view.state.field(hasLengthLimitNotice)) return false
              view.dispatch({ effects: lengthLimitNotice.of(false) })
              return true
            },
          },
        ]),
      ),
      Prec.high(
        keymap.of(
          ['Ctrl-Enter', 'Meta-Enter'].map((key) => ({
            key,
            run: () => {
              if (!callbacks.current.onRun) return false
              callbacks.current.onRun()
              return true
            },
          })),
        ),
      ),
      EditorView.lineWrapping,
    ]
  }, [language, label, maxLength, noticeId])

  return (
    <CodeMirror
      ref={editorRef}
      className={className}
      value={value}
      extensions={extensions}
      onChange={handleChange}
      readOnly={disabled}
      basicSetup={{
        foldGutter: false,
        highlightActiveLineGutter: false,
        syntaxHighlighting: false,
      }}
    />
  )
}
