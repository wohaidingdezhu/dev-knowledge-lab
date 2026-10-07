import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { makeSeedCards } from '../src/lib/seeds'
import { loadCard } from './helpers/load-card'

const code = 'const text = "<b>原文</b>";\n  console.log(text);\n'
const body = `## 阅读代码\n\n行内代码 \`inline()\`。\n\n\`\`\`js\n${code}\`\`\`\n\n\`\`\`\n未标注语言\n\`\`\``
async function loadNote(page: Page, isMobile: boolean, text = body) {
  await loadCard(page, isMobile, {
    ...makeSeedCards()[0],
    id: 'reading-note',
    title: '阅读代码测试',
    body: text,
  })
}

test('code blocks copy exact text with keyboard feedback and accessible reading layout', async ({
  page,
  isMobile,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ;(window as any).copiedText = text
        },
      },
    })
  })
  await loadNote(page, isMobile)
  const blocks = page.getByRole('group', { name: '代码片段', exact: true })
  await expect(blocks).toHaveCount(2)
  await expect(blocks.first().locator('pre')).toHaveText(code)
  await expect(blocks.first().locator('b')).toHaveCount(0)
  await expect(blocks.first().locator('.markdown-code-toolbar')).toContainText(
    'js',
  )
  const copy = blocks.first().getByRole('button', { name: '复制代码' })
  await copy.focus()
  await copy.press('Enter')
  await expect(blocks.first().getByRole('status')).toHaveText('已复制')
  expect(await page.evaluate(() => (window as any).copiedText)).toBe(code)
  await expect(copy).toBeFocused()
  await blocks.last().getByRole('button', { name: '复制代码' }).click()
  expect(await page.evaluate(() => (window as any).copiedText)).toBe(
    '未标注语言\n',
  )
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    results.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})

for (const mode of ['denied', 'unavailable']) {
  test(`clipboard ${mode} offers manual selection, scrolling and retry`, async ({
    page,
    isMobile,
  }) => {
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value:
          mode === 'unavailable'
            ? undefined
            : {
                writeText: async () => {
                  throw new Error('Permission denied')
                },
              },
      })
    }, mode)
    const longCode =
      Array.from({ length: 80 }, (_, i) => `line ${i} ${'x'.repeat(180)}`).join(
        '\n',
      ) + '\n'
    await loadNote(page, isMobile, `\`\`\`js\n${longCode}\`\`\``)
    const block = page.getByRole('group', { name: '代码片段', exact: true })
    await block.getByRole('button', { name: '复制代码' }).click()
    await expect(block.getByRole('alert')).toContainText('复制失败')
    await block.getByRole('button', { name: '选中代码' }).click()
    const pre = block.locator('pre')
    await expect(pre).toBeFocused()
    // Chromium omits the final rendered line break from a DOM selection;
    // clipboard API assertions below still require the original final newline.
    const selection = await page.evaluate(() =>
      window.getSelection()?.toString(),
    )
    expect([longCode, longCode.slice(0, -1)]).toContain(selection)
    await pre.press('PageDown')
    await expect
      .poll(() => pre.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations.map((v) => v.id)).toEqual([])
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            ;(window as any).copiedText = text
          },
        },
      })
    })
    await block.getByRole('button', { name: '复制代码' }).click()
    await expect(block.getByRole('status')).toHaveText('已复制')
    await expect(block.getByRole('alert')).toHaveCount(0)
    expect(await page.evaluate(() => (window as any).copiedText)).toBe(longCode)
  })
}

test('pending copy completion cannot mark a changed note as copied', async ({
  page,
  isMobile,
}) => {
  await page.addInitScript(() => {
    ;(window as any).copyResolvers = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () =>
          new Promise<void>((resolve) =>
            (window as any).copyResolvers.push(resolve),
          ),
      },
    })
  })
  await loadNote(page, isMobile)
  await page.getByRole('button', { name: '复制代码' }).first().click()
  await expect(page.getByRole('button', { name: '正在复制…' })).toBeDisabled()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Markdown 正文' })
  await editor.press('ControlOrMeta+a')
  await editor.evaluate((element) => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => '```js\n新的代码\n```' },
    })
    element.dispatchEvent(event)
  })
  await page.getByRole('button', { name: '阅读', exact: true }).click()
  await expect(page.locator('.markdown pre')).toHaveText('新的代码\n')
  await page.evaluate(() => (window as any).copyResolvers.shift()())
  await expect(
    page
      .getByRole('group', { name: '代码片段', exact: true })
      .getByRole('status'),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '复制代码' }).click()
  await page.evaluate(() => (window as any).copyResolvers.shift()())
  await expect(
    page
      .getByRole('group', { name: '代码片段', exact: true })
      .getByRole('status'),
  ).toHaveText('已复制')
})
