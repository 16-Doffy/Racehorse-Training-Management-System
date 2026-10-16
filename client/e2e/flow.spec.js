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
for (const role of ['manager', 'trainer', 'vet', 'owner', 'groom']) {
  test(`${role} gets the light/dark switch and opens dark when a dark canvas is saved in the browser`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('wdp301_canvas_theme', 'peak_equestrian_dark'));
    await login(page, role);
    await expect(page.locator('.ant-segmented', { hasText: 'Tối' })).toHaveCount(1);
    await expect(page.locator('.is-dark-canvas.canvas-sider, .is-dark-canvas .canvas-sider')).toHaveCount(1);
    // The staff's pages go fully dark; the Owner keeps its light panels.
    await expect(page.locator('.staff-dark')).toHaveCount(role === 'owner' ? 0 : 1);
    // The vet's Bootstrap pages follow through Bootstrap's dark mode.
    await expect(page.locator('body[data-bs-theme="dark"]')).toHaveCount(role === 'vet' ? 1 : 0);
    expect(errors).toEqual([]);
  });
}
test('the light/dark switch changes the canvas, stays after a reload and takes the popups along', async ({ page }) => {
  await login(page, 'trainer');
  await expect(page.locator('.is-dark-canvas')).toHaveCount(0);
  await page.locator('.ant-segmented').getByText('Tối', { exact: true }).click();
  await expect(page.locator('.is-dark-canvas.staff-dark')).toHaveCount(1);
  await expect(page.locator('body.wdp-dark-portals')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.is-dark-canvas')).toHaveCount(1);
  await page.locator('.ant-segmented').getByText('Sáng', { exact: true }).click();
  await expect(page.locator('.is-dark-canvas')).toHaveCount(0);
  await expect(page.locator('body.wdp-dark-portals')).toHaveCount(0);
});
test('trainer dashboard fitness panel shows the chosen run against its targets', async ({ page }) => {
  await login(page, 'trainer');
  const panel = page.locator('.ant-card', { hasText: 'Biểu đồ thể lực tổng quan' }).first();
  // The fixture's walk ran today: today's horses are listed and that run is open.
  await expect(panel.locator('.ant-select', { hasText: 'TEST Browser Horse' })).toBeVisible();
  const result = panel.locator('.ant-card', { hasText: 'Kết quả buổi tập · TEST Browser Horse' });
  await expect(result.getByText('Đạt mục tiêu', { exact: true })).toBeVisible();
  await expect(result.getByText('4000 / 4000 m')).toBeVisible();
  await expect(result.getByText('112 / trần 120 bpm')).toBeVisible();
  await expect(result.getByText('8/10')).toBeVisible();
  await expect(panel.getByText(/Xu hướng \d+ buổi gần nhất của ngựa/)).toBeVisible();
  await expect(panel.getByText(/So sánh các ngựa ngày/)).toBeVisible();
});

// ---- Horse Owner pages ----
// Is the text of this element dark? (Any CSS colour, oklch included, is read back through a canvas.)
const textIsDark = (locator) =>
  locator.evaluate((el) => {
    const cv = document.createElement('canvas').getContext('2d');
    cv.fillStyle = '#000';
    cv.fillStyle = getComputedStyle(el).color;
    cv.fillRect(0, 0, 1, 1);
    const [r, g, b] = cv.getImageData(0, 0, 1, 1).data;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45;
  });
for (const [name, canvas] of [['light', 'sand_bone'], ['dark', 'peak_equestrian_dark']]) {
  test(`owner opens every menu page on the ${name} canvas without errors or a sideways scroll`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((c) => localStorage.setItem('wdp301_canvas_theme', c), canvas);
    await login(page, 'owner');
    const items = page.locator('.custom-sidebar-menu .ant-menu-item');
    await expect(items.first()).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(7);
    for (let i = 0; i < count; i++) {
      await items.nth(i).click();
      await expect(page.locator('h1').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `menu item ${i} scrolls sideways`).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });
}
test('owner dashboard shows the real race record and prize money', async ({ page }) => {
  await login(page, 'owner');
  // The fixture horse has one finished race, won, with a 1,000,000 prize (owner-overview).
  await expect(page.getByText('Tỷ lệ chiến thắng', { exact: true })).toBeVisible();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  await expect(page.getByText(/tiền thưởng 1\.000\.000 ₫/)).toBeVisible();
});
test('owner race page shows the prize in dong, not dollars', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/owner/races');
  await expect(page.getByText('TEST Browser Cup', { exact: true })).toBeVisible();
  await expect(page.getByText('1.000.000 ₫', { exact: true })).toBeVisible();
  await expect(page.getByText(/\$1,000,000/)).toHaveCount(0);
});
test('owner horse list counts the examined horse as ready, like the trainer sees it', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/horses');
  const bannerStat = (label) => page.locator('span').filter({ hasText: new RegExp(`^${label}:$`, 'i') }).locator('xpath=following-sibling::span[1]');
  await expect(bannerStat('đủ điều kiện tập')).toHaveText('1 con');
  await expect(bannerStat('cần theo dõi')).toHaveText('0 con');
});
test('owner horse page keeps its header and pedigree readable on the dark canvas', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wdp301_canvas_theme', 'peak_equestrian_dark'));
  await login(page, 'owner');
  await page.goto(`/horses/${fixture.horseId}`);
  const hero = page.locator('.premium-card').first();
  await expect(hero.getByText('Thành tích', { exact: true })).toBeVisible();
  // The header is a light panel: its text must stay dark, not turn cream like the page's own text.
  expect(await textIsDark(hero.getByText('Thành tích', { exact: true }))).toBe(true);
  expect(await textIsDark(page.getByText('Bản thân', { exact: true }))).toBe(true);
});
