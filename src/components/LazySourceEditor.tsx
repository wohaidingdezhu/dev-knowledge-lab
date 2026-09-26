import { lazy, Suspense, type ComponentProps } from 'react'
import type { SourceEditor as SourceEditorType } from './SourceEditor'

const Editor = lazy(() =>
  import('./SourceEditor').then((module) => ({ default: module.SourceEditor })),
)

export function SourceEditor(props: ComponentProps<typeof SourceEditorType>) {
  return (
    <Suspense fallback={<div className="editor-loading">正在加载编辑器…</div>}>
      <Editor {...props} />
    </Suspense>
  )
}
