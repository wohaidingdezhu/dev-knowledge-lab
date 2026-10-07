import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { makeSeedCards } from '../src/lib/seeds'
import { loadCard } from './helpers/load-card'

async function loadNote(page: Page, isMobile: boolean, body: string) {
  await loadCard(page, isMobile, {
    ...makeSeedCards()[0],
    id: 'outline-note',
    title: '目录测试',
    body,
  })
}

async function replaceBody(page: Page, body: string) {
  const editor = page.getByRole('textbox', { name: 'Markdown 正文' })
  await editor.press('ControlOrMeta+a')
  await editor.evaluate((element, text) => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => text },
    })
    element.dispatchEvent(event)
  }, body)
  await expect(page.locator('.save-status')).toHaveText('已保存')
}

test('outline follows rendered headings, preserves duplicate targets and supports keyboard jumps', async ({
  page,
  isMobile,
}) => {
  const body =
    '# 总览\n\n## 重复小节\n\n~~~md\n# 代码里的伪标题\n~~~\n\n<section><h2>原始 HTML 标题</h2></section>\n\n' +
    '一段阅读内容。\n\n'.repeat(35) +
    '重复小节\n---\n\n###### 末尾 **重点** `code` [参考](https://example.com)\n\n结束。\n\n## ' +
    '题'.repeat(159) +
    '🧠结尾'
  await loadNote(page, isMobile, body)
  const summary = page.locator('.markdown-outline > summary')
  await expect(summary).toHaveText('笔记目录 · 5 个小节')
  const directory = page.getByRole('navigation', { name: '笔记目录' })
  await expect(directory).not.toBeVisible()
  await summary.focus()
  await summary.press('Enter')
  await expect(directory).toBeVisible()
  await expect(directory.locator('li button')).toHaveText([
    '总览',
    '重复小节',
    '重复小节',
    '末尾 重点 code 参考',
    '题'.repeat(159) + '…',
  ])
  const headings = page.locator('.markdown :is(h1,h2,h3,h4,h5,h6)')
  const ids = await headings.evaluateAll((elements) =>
    elements.map((element) => element.id),
  )
  expect(new Set(ids).size).toBe(5)
  expect(ids.every(Boolean)).toBe(true)
  await directory
    .getByRole('button', { name: '重复小节', exact: true })
    .nth(1)
    .focus()
  await page.keyboard.press('Enter')
  const target = headings.nth(2)
  await expect(target).toBeFocused()
  await expect(directory).not.toBeVisible()
  const targetBox = await target.boundingBox()
  const summaryBox = await summary.boundingBox()
  expect(targetBox!.y).toBeGreaterThanOrEqual(
    summaryBox!.y + summaryBox!.height,
  )
  expect(targetBox!.y).toBeLessThan(page.viewportSize()!.height)
  await summary.focus()
  await summary.press('Enter')
  await expect(
    directory.getByRole('button', { name: '重复小节', exact: true }).nth(1),
  ).toHaveAttribute('aria-current', 'location')
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await directory
    .getByRole('button', { name: '末尾 重点 code 参考', exact: true })
    .click()
  await expect(headings.nth(3)).toBeFocused()
})

test('long outlines load in batches and keyboard focus enters the newly shown headings', async ({
  page,
  isMobile,
}) => {
  const body = Array.from(
    { length: 225 },
    (_, i) => `## 标题 ${i}\n\n这一节的笔记。`,
  ).join('\n\n')
  await loadNote(page, isMobile, body)
  const summary = page.locator('.markdown-outline > summary')
  await summary.click()
  const directory = page.getByRole('navigation', { name: '笔记目录' })
  await expect(directory.locator('li')).toHaveCount(100)
  await expect(directory.getByRole('status')).toHaveText('已显示 100 / 225 项')
  const more = directory.getByRole('button', { name: '显示更多目录项' })
  await more.focus()
  await more.press('Enter')
  await expect(directory.locator('li')).toHaveCount(200)
  await expect(
    directory.getByRole('button', { name: '标题 100', exact: true }),
  ).toBeFocused()
  await expect
    .poll(() =>
      directory.locator('ul').evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(0)
  await more.click()
  await expect(directory.locator('li')).toHaveCount(225)
  await expect(
    directory.getByRole('button', { name: '标题 200', exact: true }),
  ).toBeFocused()
  await expect(more).toHaveCount(0)
  await directory.getByRole('button', { name: '标题 224', exact: true }).click()
  await expect(page.locator('.markdown h2').last()).toBeFocused()
  await expect(directory).not.toBeVisible()
  await expect(summary).toBeVisible()
})

test('outline updates after another page edits the note and disappears when headings are removed', async ({
  page,
  context,
  isMobile,
}) => {
  await loadNote(page, isMobile, '## 旧标题一\n\n内容\n\n## 旧标题二\n\n内容')
  await page.locator('.markdown-outline > summary').click()
  const other = await context.newPage()
  await other.goto('/')
  await other.getByRole('listbox').getByRole('option').click()
  await other.getByRole('button', { name: '编辑', exact: true }).click()
  await replaceBody(
    other,
    '### 更新后的标题\n\n新内容\n\n## 另一个标题\n\n记录',
  )
  const directory = page.getByRole('navigation', { name: '笔记目录' })
  await expect(directory.locator('li button')).toHaveText([
    '更新后的标题',
    '另一个标题',
  ])
  await directory.getByRole('button', { name: '另一个标题' }).click()
  await expect(page.locator('.markdown h2')).toBeFocused()
  await replaceBody(other, '现在是一段没有标题的笔记。')
  await expect(page.locator('.markdown-outline')).toHaveCount(0)
  await expect(page.locator('.markdown')).toHaveText(
    '现在是一段没有标题的笔记。',
  )
  await replaceBody(other, '## 只有一个标题\n\n不用生成目录。')
  await expect(page.locator('.markdown h2')).toHaveText('只有一个标题')
  await expect(page.locator('.markdown-outline')).toHaveCount(0)
  await other.close()
})
