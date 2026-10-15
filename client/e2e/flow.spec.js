import { test, expect } from '@playwright/test';
import fs from 'node:fs';
if (!process.env.UI_TEST_FIXTURE) throw new Error('Run npm run test:ui from the repository root.');
const fixture = JSON.parse(fs.readFileSync(process.env.UI_TEST_FIXTURE, 'utf8'));
async function login(page, role) {
  await page.goto('/login');
  await page.locator('#email').fill(`${role}@integration.test`);
  await page.locator('#password').fill(fixture.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL('http://127.0.0.1:5180/');
}
for (const role of ['manager', 'trainer', 'vet', 'owner']) {
  test(`${role} logs in and sees the assigned horse through the real API`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await login(page, role);
    await page.goto('/horses');
    await expect(page.getByText('TEST Browser Horse', { exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}
test('manager inventory displays real stock', async ({ page }) => {
  await login(page, 'manager');
  await page.goto('/inventory');
  await expect(page.getByText('TEST Browser Feed', { exact: true })).toBeVisible();
});
test('trainer sees scheduled training and recorded race result', async ({ page }) => {
  await login(page, 'trainer');
  await page.goto('/training/sessions');
  await expect(page.getByText('TEST Browser Horse', { exact: true }).first()).toBeVisible();
  await page.goto('/races');
  await expect(page.getByText('TEST Browser Cup', { exact: true })).toBeVisible();
});
test('owner sees race history and cannot open manager routes', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/owner/races');
  await expect(page.getByText('TEST Browser Cup', { exact: true })).toBeVisible();
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/403$/);
});
test('groom signing in on the web is pointed to the mobile app', async ({ page }) => {
  await login(page, 'groom');
  await expect(page.getByRole('heading', { name: 'Vai trò Nhân viên Chăm sóc dùng trên điện thoại' })).toBeVisible();
  await page.goto('/groom/tasks');
  await expect(page.getByRole('button', { name: 'Hoàn thành', exact: true })).toHaveCount(0);
});
test('trainer dashboard "Lập buổi tập mới" opens the create form on the sessions page', async ({ page }) => {
  await login(page, 'trainer');
  await page.getByRole('button', { name: /Lập buổi tập mới/ }).click();
  await expect(page.locator('.ant-modal-title', { hasText: 'Tạo buổi tập mới' })).toBeVisible();
  // The ?new=1 that opened it is dropped, so a reload does not open the form again.
  await expect(page).toHaveURL(/\/training\/sessions$/);
});
test('trainer horse list counts from the real health status and checklist', async ({ page }) => {
  await login(page, 'trainer');
  await page.goto('/horses');
  // The fixture horse is examined as eligible with no restriction and has an active plan.
  const bannerStat = (label) => page.locator('span').filter({ hasText: new RegExp(`^${label}:$`, 'i') }).locator('xpath=following-sibling::span[1]');
  await expect(bannerStat('đủ điều kiện tập')).toHaveText('1 con');
  await expect(bannerStat('cần theo dõi')).toHaveText('0 con');
  const kpi = (label) => page.locator('div').filter({ hasText: new RegExp(`^${label}$`, 'i') }).locator('xpath=following-sibling::div[1]');
  await expect(kpi('chưa có kế hoạch')).toHaveText(/^0\s*ngựa/);
});
for (const [role, picker] of [['manager', true], ['trainer', true], ['vet', false], ['owner', false]]) {
  test(`${role} ${picker ? 'chooses' : 'does not get'} the canvas, even with a dark canvas saved in the browser`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('wdp301_canvas_theme', 'peak_equestrian_dark'));
    await login(page, role);
    await expect(page.getByRole('button', { name: /Nền Canvas/ })).toHaveCount(picker ? 1 : 0);
    await expect(page.locator('.is-dark-canvas')).toHaveCount(picker ? 1 : 0);
    if (role === 'owner') {
      // The Owner's sidebar stays light: no forest layout, no gradient painted over it.
      await expect(page.locator('.forest-layout')).toHaveCount(0);
      expect(await page.locator('.ant-layout-sider').evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
    }
    expect(errors).toEqual([]);
  });
}
