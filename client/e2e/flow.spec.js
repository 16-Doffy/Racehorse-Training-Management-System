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
test('groom completes a meal with observations and stock changes once', async ({ page, request }) => {
  await login(page, 'groom');
  const meal = page.getByRole('row').filter({ hasText: 'Cho ăn' });
  await meal.getByRole('button', { name: 'Tiếp nhận', exact: true }).click();
  await expect(meal.getByText('Đã tiếp nhận', { exact: true })).toBeVisible();
  await expect(meal.getByRole('button', { name: /Tiếp nhận/ })).toBeDisabled();
  await meal.getByRole('button', { name: 'Hoàn thành', exact: true }).click();
  await page.locator('#behaviourNote').fill('TEST web meal observation');
  await page.getByRole('button', { name: 'Gửi xác nhận' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(meal.getByText('Hoàn thành', { exact: true })).toBeVisible();
  await page.reload();
  await expect(meal.getByText('Quan sát: TEST web meal observation')).toBeVisible();
  const loginResponse = await request.post(`${fixture.apiUrl}/api/v1/auth/login`, { data: { email: 'manager@integration.test', password: fixture.password } });
  const token = (await loginResponse.json()).data.token;
  const stockResponse = await request.get(`${fixture.apiUrl}/api/v1/inventory`, { headers: { Authorization: `Bearer ${token}` } });
  const feed = (await stockResponse.json()).data.find((i) => i.name === 'TEST Browser Feed');
  expect(feed.quantity).toBe(98);
});
test('groom records why work cannot be done and reads care instructions', async ({ page }) => {
  await login(page, 'groom');
  const row = page.getByRole('row').filter({ hasText: 'TEST not done task' });
  await row.getByRole('button', { name: 'Không làm được' }).click();
  await page.locator('#reason').fill('TEST horse needs vet assessment');
  await page.getByRole('button', { name: 'Gửi xác nhận' }).click();
  await expect(row.getByText('Không thực hiện', { exact: true })).toBeVisible();
  await expect(row.getByText('TEST horse needs vet assessment')).toBeVisible();
  await page.getByRole('tab', { name: 'Chuồng & Y lệnh' }).click();
  await expect(page.getByText('TEST Browser Feed: 2 kg')).toBeVisible();
});
test('groom reports an incident with a photo and sees vet response', async ({ page, request }) => {
  await login(page, 'groom');
  await page.getByRole('row').filter({ hasText: 'TEST incident task' }).getByRole('button', { name: 'Báo sự cố' }).click();
  await page.locator('#description').fill('TEST web incident with evidence');
  await page.locator('input[type="file"]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  await page.getByRole('button', { name: 'Gửi xác nhận' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Sự cố', exact: true }).click();
  const incident = page.getByRole('row').filter({ hasText: 'TEST web incident with evidence' });
  await expect(incident).toBeVisible();
  const photo = await incident.getByRole('link', { name: 'Ảnh 1' }).getAttribute('href');
  const fileResponse = await request.get(photo);
  expect(fileResponse.status()).toBe(200);
  expect(fileResponse.headers()['content-type']).toContain('image/png');
  const loginResponse = await request.post(`${fixture.apiUrl}/api/v1/auth/login`, { data: { email: 'vet@integration.test', password: fixture.password } });
  const token = (await loginResponse.json()).data.token;
  const headers = { Authorization: `Bearer ${token}` };
  const reports = await request.get(`${fixture.apiUrl}/api/v1/stable/incidents`, { headers });
  const reported = (await reports.json()).data.find((t) => t.incidentReport.description === 'TEST web incident with evidence');
  const handled = await request.patch(`${fixture.apiUrl}/api/v1/stable/incidents/${reported._id}`, { headers, data: { status: 'acknowledged', response: 'TEST vet reviewing horse' } });
  expect(handled.status()).toBe(200);
  await page.getByRole('button', { name: 'Làm mới' }).click();
  await expect(incident.getByText('TEST vet reviewing horse')).toBeVisible();
});
test('groom requests stock without manager permissions', async ({ page }) => {
  await login(page, 'groom');
  await page.getByRole('tab', { name: 'Vật tư', exact: true }).click();
  const item = page.getByRole('row').filter({ hasText: 'TEST Browser Feed' });
  await item.getByRole('button', { name: 'Đề xuất bổ sung' }).click();
  await page.locator('#quantity').fill('5');
  await page.locator('#note').fill('TEST web restock');
  await page.getByRole('button', { name: 'Gửi xác nhận' }).click();
  await expect(item.getByText('5 kg · Chờ duyệt')).toBeVisible();
  await page.getByRole('button', { name: 'Đề xuất vật tư mới' }).click();
  await page.locator('#name').fill('TEST web proposed item');
  await page.locator('#unit').fill('kg');
  await page.locator('#quantity').fill('3');
  await page.getByRole('button', { name: 'Gửi xác nhận' }).click();
  const proposed = page.getByRole('row').filter({ hasText: 'TEST web proposed item' });
  await expect(proposed.getByText('3 kg · Chờ duyệt')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nhập kho', exact: true })).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/403$/);
});
test('Groom web disabled restores the mobile notice and hides temporary routes', async ({ page }) => {
  await login(page, 'groom');
  await expect(page.getByRole('heading', { name: 'Vai trò Nhân viên Chăm sóc dùng trên điện thoại' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Công việc', exact: true })).toHaveCount(0);
  await page.goto('/groom/tasks');
  await expect(page.getByRole('button', { name: 'Hoàn thành', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nhân viên chăm sóc', exact: true })).toHaveCount(0);
});
