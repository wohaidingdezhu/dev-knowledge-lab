import { expect, test, type Locator, type Page } from '@playwright/test'

async function paste(editor: Locator, text: string) {
  await editor.evaluate((element, content) => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    // Firefox does not expose data supplied to a synthetic ClipboardEvent.
    // Supply the same readable text contract without touching the system clipboard.
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (type: string) => (type === 'text/plain' ? content : ''),
      },
    })
    element.dispatchEvent(event)
  }, text)
}

async function checkLengthLimit(
  page: Page,
  label: string,
  limit: number,
  codePanel?: Locator,
) {
  const editor = page.getByRole('textbox', { name: label, exact: true })
  const original = 'keep-original'
  await editor.fill(original)
  await editor.press('End')
  await editor.press('Tab')
  const edited = await editor.textContent()
  expect(edited!.length).toBeGreaterThan(original.length)
  for (let index = 0; index < 3; index++) await editor.press('Shift+ArrowLeft')
  const selection = await page.evaluate(() => window.getSelection()?.toString())
  expect(selection).toHaveLength(3)
  const panelBefore = await codePanel?.boundingBox()

  await paste(editor, 'x'.repeat(limit + 1))
  const notice = page.getByRole('alert').filter({ hasText: `${label}最多支持` })
  await expect(notice).toBeVisible()
  await expect(notice).toContainText(limit.toLocaleString('zh-CN'))
  await expect(editor).toHaveAttribute(
    'aria-describedby',
    (await notice.getAttribute('id'))!,
  )
  await expect(editor).toHaveText(edited!)
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe(selection)
  if (codePanel) {
    const panelAfter = await codePanel.boundingBox()
    expect(panelAfter!.height).toBe(panelBefore!.height)
  }

  // A rejected replacement must not add an undo step or erase earlier history.
  await editor.press('ControlOrMeta+z')
  await expect.poll(() => editor.textContent()).toBe(original)
  await expect(notice).toHaveCount(0)
  await expect(editor).not.toHaveAttribute('aria-describedby')

  await paste(editor, 'x'.repeat(limit + 1))
  await expect(notice).toBeVisible()
  await editor.press('Escape')
  await expect(notice).toHaveCount(0)
  await expect(editor).toHaveText(original)

  await paste(editor, 'x'.repeat(limit + 1))
  await expect(notice).toBeVisible()
  await editor.fill('shorter-retry')
  await expect(notice).toHaveCount(0)
  await expect(editor).toHaveText('shorter-retry')
}

test('oversized Markdown input gives feedback and preserves text, selection and undo', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await checkLengthLimit(page, 'Markdown 正文', 500000)
  await expect(page.locator('.save-status')).toContainText('已保存')
})

test('HTML, CSS and JavaScript reject oversized input within the existing editor height', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新建知识卡片' }).click()
  await page.getByRole('button', { name: '代码实验室', exact: true }).click()
  for (const language of ['HTML', 'CSS', 'JavaScript']) {
    await page.getByRole('tab', { name: language, exact: true }).click()
    await checkLengthLimit(
      page,
      `${language} 代码`,
      250000,
      page.getByRole('tabpanel'),
    )
  }
  await expect(page.locator('.save-status')).toContainText('已保存')
})
