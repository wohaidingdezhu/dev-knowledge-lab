import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'

async function openCard(page: Page) {
  await page.goto('/')
  const cards = page
    .getByRole('listbox', { name: '知识卡片搜索结果' })
    .getByRole('option')
  await expect(cards).toHaveCount(3)
  await cards.first().click()
}

async function replaceSource(editor: Locator, text: string) {
  await editor.press('ControlOrMeta+a')
  if (!text) {
    await editor.press('Backspace')
    return
  }
  // Use CodeMirror's paste handler; Firefox does not reliably read DOM-only multiline fill.
  await editor.evaluate((element, content) => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (type: string) => (type === 'text/plain' ? content : ''),
      },
    })
    element.dispatchEvent(event)
  }, text)
}

test('single-card downloads keep the current unsaved note and source without claiming a full backup', async ({
  page,
  isMobile,
}) => {
  await openCard(page)
  await page.getByRole('textbox', { name: '卡片标题' }).fill('导出/原始:笔记')
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const body = '## 未保存正文\n\n```js\nconsole.log("保留代码块")\n```'
  await replaceSource(
    page.getByRole('textbox', { name: 'Markdown 正文' }),
    body,
  )
  // An invalid source makes this a persistent unsaved draft, rather than a timing assumption.
  await page.getByRole('textbox', { name: '来源链接' }).fill('尚未完成的来源')
  await expect(page.getByRole('alert')).toContainText('来源链接仅支持')
  await page.getByRole('textbox', { name: '添加标签' }).fill('导出标签')
  await page.getByRole('button', { name: '导出此卡片', exact: true }).click()
  const noteDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click()
  const markdown = await noteDownload
  expect(markdown.suggestedFilename()).toBe('导出_原始_笔记.md')
  const note = await readFile((await markdown.path())!, 'utf8')
  expect(note).toContain(body)
  expect(note).toContain('导出标签')
  expect(note).toContain('来源：尚未完成的来源')
  await expect(page.locator('.save-status')).toHaveText('!未保存')

  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  const source = {
    html: '<p>原文</p>\n<!-- </script> -->',
    css: '',
    js: 'console.log("导出但不执行")\n',
  }
  await replaceSource(
    page.getByRole('textbox', { name: 'HTML 代码', exact: true }),
    source.html,
  )
  await page.getByRole('tab', { name: 'CSS', exact: true }).click()
  await replaceSource(
    page.getByRole('textbox', { name: 'CSS 代码', exact: true }),
    source.css,
  )
  await page.getByRole('tab', { name: 'JavaScript', exact: true }).click()
  await replaceSource(
    page.getByRole('textbox', { name: 'JavaScript 代码', exact: true }),
    source.js,
  )
  await page.getByRole('button', { name: '导出此卡片', exact: true }).click()
  const sourceDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出源码 ZIP', exact: true }).click()
  const archive = await sourceDownload
  expect(archive.suggestedFilename()).toBe('导出_原始_笔记-source.zip')
  const files = unzipSync(await readFile((await archive.path())!))
  expect(Object.keys(files).sort()).toEqual([
    'README.md',
    'index.html',
    'script.js',
    'style.css',
  ])
  expect(strFromU8(files['index.html'])).toBe(source.html)
  expect(strFromU8(files['style.css'])).toBe(source.css)
  expect(strFromU8(files['script.js'])).toBe(source.js)
  expect(strFromU8(files['README.md'])).toContain(body)
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.locator('.save-status')).toHaveText('!未保存')
  await expect(page.locator('.toast')).toContainText('完整归档')
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '导入与备份' }).click()
  await expect(page.getByRole('dialog')).toContainText('尚无记录')
})

test('invalid pending tags stop single-card export until corrected', async ({
  page,
}) => {
  await openCard(page)
  const tags = page.getByRole('textbox', { name: '添加标签' })
  await tags.fill('x'.repeat(49))
  await page.getByRole('button', { name: '导出此卡片', exact: true }).click()
  const downloads: string[] = []
  page.on('download', (download) =>
    downloads.push(download.suggestedFilename()),
  )
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(tags).toHaveValue('x'.repeat(49))
  await expect(tags).toBeFocused()
  expect(downloads).toEqual([])
  await tags.fill('修正后的标签')
  await page.getByRole('button', { name: '导出此卡片', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 Markdown', exact: true }).click()
  const file = await readFile((await (await downloadPromise).path())!, 'utf8')
  expect(file).toContain('修正后的标签')
})

test('export dialog is accessible, fits the viewport and returns keyboard focus', async ({
  page,
}) => {
  await openCard(page)
  const trigger = page.getByRole('button', { name: '导出此卡片', exact: true })
  await trigger.focus()
  await trigger.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ target }) => target),
    })),
  ).toEqual([])
  const widths = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }))
  expect(widths.content).toBe(widths.viewport)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
