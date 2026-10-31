import { test, expect } from '@playwright/test';
import fs from 'node:fs';

if (!process.env.UI_TEST_FIXTURE) throw new Error('Run through server/scripts/testUi.js.');
const fixture = JSON.parse(fs.readFileSync(process.env.UI_TEST_FIXTURE, 'utf8'));

test('trainer reviews every meal to the end of the plan, changes one and confirms it once', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.locator('#email').fill('trainer@integration.test');
  await page.locator('#password').fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await page.goto('/stable/tasks?tab=rations');
  // First, outside view: list of horses with their ration overview
  await expect(page.getByRole('region', { name: 'Khẩu phần theo ngựa' })).toBeVisible();
  // Click on TEST Browser Horse to view its feeding week and its days to the end of the plan
  await page.locator('.ant-table-row', { hasText: 'TEST Browser Horse' }).first().click();
  await expect(page).toHaveURL(/horse=[0-9a-f]{24}/);
  const section = page.getByRole('region', { name: 'Lịch ăn theo kế hoạch huấn luyện' });
  await expect(section.getByRole('heading', { name: 'Lịch ăn từ hôm nay đến hết kế hoạch tập' })).toBeVisible();
  await expect(section.getByText('TEST Browser Hay').first()).toBeVisible();
  await expect(section.getByText(/khẩu phần gợi ý, chưa xác nhận/)).toBeVisible();

  // The planner: the plan's days folded into a few rows; one meal changed for its whole row, then confirmed once.
  await page.getByRole('button', { name: 'Tạo khẩu phần ăn' }).click();
  const planner = page.getByRole('dialog', { name: /Tạo khẩu phần ăn/ });
  await expect(planner.getByText('28 ngày', { exact: true })).toBeVisible();
  await expect(planner.getByText('Nhóm ngày', { exact: true })).toBeVisible();
  await planner.getByRole('button', { name: 'Sửa bữa này' }).nth(1).click();
  const meal = page.getByRole('dialog', { name: /^Bữa / });
  await meal.getByLabel('Lượng').first().fill('4');
  await meal.getByRole('button', { name: /^Áp dụng/ }).click();
  await expect(meal).toBeHidden();
  await expect(planner.getByText(/Có thay đổi chưa lưu/)).toBeVisible();
  // Every day, one a row, is still there to read.
  await planner.getByText('Từng ngày', { exact: true }).click();
  await expect(planner.getByText('Ngày · lịch tập', { exact: true })).toBeVisible();
  await planner.getByRole('button', { name: 'Xác nhận lịch ăn 28 ngày' }).click();
  await expect(planner).toBeHidden();
  await expect(page.getByText(/Lịch ăn đã xác nhận đến/)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(section.getByRole('heading', { name: 'Lịch ăn từ hôm nay đến hết kế hoạch tập' })).toBeVisible();
  await expect(section.getByText('Gọn theo nhóm ngày', { exact: true })).toBeVisible();

  // The feeding timetable is also visible for this selected horse
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(page.getByRole('region', { name: 'Thời khóa biểu cho ăn' })).toBeVisible();
  expect(errors).toEqual([]);
});
