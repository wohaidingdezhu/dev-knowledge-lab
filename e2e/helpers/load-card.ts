import { expect, type Page } from '@playwright/test'
import type { Card } from '../../src/lib/types'
import { createWorkspaceBackupFile } from '../../src/lib/workspaceBackup'

export async function loadCard(page: Page, isMobile: boolean, card: Card) {
  const file = await createWorkspaceBackupFile({
    cards: [card],
    history: [],
    trash: [],
  })
  await page.goto('/')
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3)
  if (isMobile) await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: '导入与备份' }).click()
  await page.getByLabel('选择 JSON 或 ZIP 备份文件').setInputFiles({
    name: 'lesson.json',
    mimeType: 'application/json',
    buffer: Buffer.from(await file.data.arrayBuffer()),
  })
  await page
    .getByRole('button', { name: '恢复完整工作区', exact: true })
    .click()
  await page
    .getByRole('button', { name: '确认替换并完整恢复', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  if (isMobile) await page.getByRole('button', { name: '关闭导航' }).click()
  await page.getByRole('listbox').getByRole('option').click()
  await expect(page.getByRole('textbox', { name: '卡片标题' })).toHaveValue(
    card.title,
  )
}
