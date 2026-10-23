import { test, expect } from '@playwright/test';
import fs from 'node:fs';

if (!process.env.UI_TEST_FIXTURE) throw new Error('Run through server/scripts/testUi.js.');
const fixture = JSON.parse(fs.readFileSync(process.env.UI_TEST_FIXTURE, 'utf8'));

test('trainer sees the full feeding timetable and confirms it once', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.locator('#email').fill('trainer@integration.test');
  await page.locator('#password').fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await page.goto('/stable/tasks?tab=rations');
  await expect(page.getByRole('heading', { name: 'Lịch cho ăn theo kế hoạch tập' })).toBeVisible();
  await expect(page.getByText('28 ngày', { exact: false })).toBeVisible();
  const section = page.getByRole('region', { name: 'Lịch cho ăn theo kế hoạch huấn luyện' });
  await expect(section.getByText('TEST Browser Hay').first()).toBeVisible();
  await section.getByRole('button', { name: 'Xác nhận lịch ăn toàn kỳ' }).click();
  await expect(section.getByText('28/28 ngày tới đã xác nhận')).toBeVisible();
  await expect(section.getByRole('button', { name: 'Xác nhận lịch ăn toàn kỳ' })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(section.getByRole('heading', { name: 'Lịch cho ăn theo kế hoạch tập' })).toBeVisible();
  await expect(section.getByRole('button', { name: '7 ngày sau' })).toBeVisible();
  expect(errors).toEqual([]);
});
