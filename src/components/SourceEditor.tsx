import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { indentWithTab } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'

type SourceLanguage = 'html' | 'css' | 'js' | 'markdown'

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
  className,
}: {
  language: SourceLanguage
  label: string
  value: string
  maxLength: number
  onChange: (value: string) => void
  onRun?: () => void
  disabled?: boolean
  className?: string
}) {
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
      EditorState.changeFilter.of(
        (change) => change.newDoc.length <= maxLength,
      ),
      EditorView.contentAttributes.of({ 'aria-label': label }),
      keymap.of([indentWithTab]),
      Prec.high(
        keymap.of(
          ['Ctrl-Enter', 'Meta-Enter'].map((key) => ({
            key,
            run: () => {
              if (!onRun) return false
              onRun()
              return true
            },
          })),
        ),
      ),
      EditorView.lineWrapping,
    ]
  }, [language, label, maxLength, onRun])

  return (
    <CodeMirror
      className={className}
      value={value}
      extensions={extensions}
      onChange={onChange}
      readOnly={disabled}
      basicSetup={{
        foldGutter: false,
        highlightActiveLineGutter: false,
        syntaxHighlighting: false,
      }}
    />
  )
}
