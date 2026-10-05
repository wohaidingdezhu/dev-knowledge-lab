import { useMemo, useState } from 'react'
import type { Card } from '../lib/types'
import {
  cardContents,
  compareCardContent,
  comparisonPreview,
} from '../lib/cardComparison'

type Excerpt = ReturnType<typeof comparisonPreview>['before']

function ContentExcerpt({
  excerpt,
  side,
}: {
  excerpt: Excerpt
  side: 'before' | 'after'
}) {
  const empty = !excerpt.leading && !excerpt.changed && !excerpt.trailing
  return (
    <>
      {excerpt.truncatedBefore && (
        <small>前文已省略，从第 {excerpt.line} 行附近显示</small>
      )}
      <pre tabIndex={0}>
        {empty ? (
          '（空）'
        ) : (
          <>
            {excerpt.leading}
            <mark className={`comparison-${side}`}>{excerpt.changed}</mark>
            {excerpt.trailing}
          </>
        )}
      </pre>
      {excerpt.truncatedAfter && <small>后文已省略</small>}
    </>
  )
}

export function CardComparison({
  before,
  after,
}: {
  before: Card
  after: Card
}) {
  const [showFull, setShowFull] = useState(false)
  const comparison = useMemo(() => {
    const result = compareCardContent(before, after)
    return {
      ...result,
      changes: result.changes.map((change) => ({
        ...change,
        preview: comparisonPreview(change.before, change.after),
      })),
    }
  }, [before, after])
  return (
    <section className="card-comparison" aria-label="历史版本与当前内容对比">
      <h3>
        {comparison.changes.length
          ? `${comparison.changes.length} 个字段与当前内容不同`
          : '与当前内容相同'}
      </h3>
      <p className="comparison-hint">
        历史版本为恢复目标。高亮表示变化所在的片段；较长内容只显示差异附近，完整历史内容可在下方展开。
      </p>
      {comparison.changes.map((change) => (
        <section
          className="comparison-field"
          key={change.field}
          aria-label={`${change.label}差异`}
        >
          <h4>{change.label}</h4>
          {change.field === 'tags' && (
            <div className="comparison-tags">
              {comparison.addedTags.length > 0 && (
                <p>当前新增：{comparison.addedTags.join('、')}</p>
              )}
              {comparison.removedTags.length > 0 && (
                <p>当前移除：{comparison.removedTags.join('、')}</p>
              )}
            </div>
          )}
          <div className="restore-comparison">
            <div>
              <strong>历史版本（恢复目标）</strong>
              <ContentExcerpt excerpt={change.preview.before} side="before" />
            </div>
            <div>
              <strong>当前内容</strong>
              <ContentExcerpt excerpt={change.preview.after} side="after" />
            </div>
          </div>
        </section>
      ))}
      <details
        className="comparison-full"
        onToggle={(event) => setShowFull(event.currentTarget.open)}
      >
        <summary>查看完整历史内容</summary>
        {showFull && (
          <pre className="recovery-preview" tabIndex={0}>
            {cardContents(before)}
          </pre>
        )}
      </details>
    </section>
  )
}
