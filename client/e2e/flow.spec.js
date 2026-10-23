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
test('manager gives a feed its kind, and the stock list shows it', async ({ page }) => {
  await login(page, 'manager');
  await page.goto('/inventory');
  await expect(page.getByRole('row', { name: /TEST Browser Feed/ }).getByText('Thức ăn tinh', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Thêm vào kho/ }).first().click();
  const dialog = page.getByRole('dialog');
  // The form opens on feed; the kind of item is chosen from three cards.
  await expect(dialog.locator('.inv-kind.is-on')).toContainText('Dùng trong khẩu phần');
  await dialog.getByLabel('Tên vật tư').fill('TEST Dầu hạt lanh UI');
  await dialog.getByRole('button', { name: 'lít', exact: true }).click();
  await dialog.getByText('Bổ sung', { exact: true }).click();
  await expect(dialog.getByText('Không tính là một bữa ăn.', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Thêm thức ăn', exact: true }).click();
  await expect(page.getByRole('row', { name: /TEST Dầu hạt lanh UI/ }).getByText('Bổ sung', { exact: true })).toBeVisible();
});
test('trainer sees scheduled training and recorded race result', async ({ page }) => {
  await login(page, 'trainer');
  await page.goto('/training/sessions');
  await expect(page.getByText('TEST Browser Horse', { exact: true }).first()).toBeVisible();
  await page.goto('/races');
  await expect(page.getByText('TEST Browser Cup', { exact: true })).toBeVisible();
});
test('a horse added with its papers shows them on its profile', async ({ page }) => {
  // The profile draws the horse in 3D, slow on a busy machine.
  test.setTimeout(120000);
  await login(page, 'manager');
  await page.goto('/horses');
  await page.getByRole('button', { name: /Thêm ngựa mới/ }).first().click();
  const dialog = page.getByRole('dialog');
  // A new horse is added only with all three steps done: its record, its people, its stall.
  await dialog.getByLabel('Tên ngựa').fill('TEST Papers Horse');
  await expect(dialog.getByRole('button', { name: /Thêm ngựa/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: /Tiếp: Phụ trách/ }).click();
  // The step refuses to go on without a breed: the field says so (its placeholder reads the same).
  await expect(dialog.locator('.ant-form-item-explain-error', { hasText: 'Chọn giống ngựa' })).toBeVisible();
  // The breed picker's search box (the label also names its list and its help line).
  await dialog.locator('input[id$="breed"]').click();
  await page.keyboard.type('Thoroughbred');
  await page.keyboard.press('Enter');
  await dialog.getByLabel('Giới tính').click();
  await page.getByTitle('Ngựa đực giống', { exact: true }).click();
  await dialog.getByLabel('Ngày sinh').fill('01/01/2020');
  await page.keyboard.press('Enter');
  await dialog.getByLabel('Số vi mạch').fill('985141000123456');
  await dialog.getByLabel('Số đăng ký').fill('VN-2026-777');
  await dialog.getByLabel('Định giá (₫)').fill('500000000');
  await dialog.getByRole('button', { name: /Tiếp: Phụ trách/ }).click();
  for (const [label, name] of [['Chủ sở hữu', 'TEST owner'], ['Huấn luyện viên phụ trách', 'TEST trainer'], ['Bác sĩ thú y phụ trách', 'TEST vet']]) {
    await dialog.getByLabel(label).click();
    // Only the list that is open: an earlier picker's list stays in the page, hidden.
    await page.locator('.ant-select-dropdown:visible').getByTitle(name, { exact: true }).click();
  }
  await dialog.getByRole('button', { name: /Tiếp: Chuồng/ }).click();
  await dialog.getByRole('radio', { name: /^A-04/ }).click();
  await dialog.getByLabel('Nhân viên chăm sóc').click();
  await page.locator('.ant-select-item-option', { hasText: 'TEST groom' }).first().click();
  await dialog.getByRole('button', { name: 'Thêm ngựa vào A-04', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.locator('.ant-table-row', { hasText: 'TEST Papers Horse' }).first().click();
  await expect(page).toHaveURL(/\/horses\/[0-9a-f]{24}$/);
  const papers = page.locator('.ant-descriptions').first();
  await expect(papers.getByText('Ngựa đực giống', { exact: true })).toBeVisible();
  await expect(papers.getByText('985141000123456', { exact: true })).toBeVisible();
  await expect(papers.getByText('VN-2026-777', { exact: true })).toBeVisible();
  await expect(papers.getByText(/500\.000\.000/)).toBeVisible();
});
test('the ration form names the groom who feeds and suggests a meal from the training plan', async ({ page }) => {
  await login(page, 'trainer');
  await page.goto('/stable/tasks');
  await page.getByRole('tab', { name: 'Khẩu phần ăn' }).click();
  await expect(page.getByRole('columnheader', { name: 'Người cho ăn' })).toBeVisible();
  await page.getByRole('button', { name: /Thêm khẩu phần/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Ngựa').click();
  await page.getByTitle('TEST Browser Horse', { exact: true }).click();
  await expect(dialog.getByText('Nhân viên cho ăn:')).toBeVisible();
  await expect(dialog.getByText('TEST groom', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Gợi ý bữa sáng theo kế hoạch tập')).toBeVisible();
  await dialog.getByRole('button', { name: 'Dùng gợi ý cho bữa này' }).click();
  await expect(dialog.getByText(/TEST Browser Feed/).first()).toBeVisible();
  await dialog.getByRole('button', { name: /Hủy|Huỷ|Cancel/ }).click();
});
test('a notification puts a red count on its menu entry and opens the page it is about', async ({ page }) => {
  await login(page, 'manager');
  // The fixture's trainer went past amber gates: the Manager is told, about that horse.
  await expect(page.locator('.ant-menu-item', { hasText: 'Danh mục Ngựa' }).locator('.ant-badge-count')).toBeVisible();
  await page.locator('.anticon-bell').click();
  await page.locator('.ant-list-item', { hasText: 'Ghi đè cảnh báo sẵn sàng' }).first().click();
  await expect(page).toHaveURL(/\/horses\/[0-9a-f]{24}$/);
});
test('the care page opens on the tab and horse a notification names', async ({ page }) => {
  await login(page, 'trainer');
  await page.goto('/stable/tasks?tab=rations');
  await expect(page.getByRole('tab', { name: 'Khẩu phần ăn', selected: true })).toBeVisible();
  await page.goto(`/stable/tasks?tab=tasks&horse=${fixture.horseId}`);
  await expect(page.getByRole('tab', { name: 'Công việc chăm sóc', selected: true })).toBeVisible();
  await expect(page.getByText('Đang xem riêng:')).toBeVisible();
  await expect(page.getByText('TEST Browser Horse', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Xem tất cả ngựa/ })).toBeVisible();
});
test('the care tab lists the horses; one opens its feeding timetable and its jobs', async ({ page }) => {
  await login(page, 'trainer');
  await page.goto('/stable/tasks');
  await expect(page.getByRole('columnheader', { name: 'Bữa hôm nay' })).toBeVisible();
  await page.locator('.ant-table-row', { hasText: 'TEST Browser Horse' }).first().click();
  await expect(page).toHaveURL(/horse=[0-9a-f]{24}/);
  const timetable = page.getByRole('region', { name: 'Thời khóa biểu cho ăn' });
  await expect(timetable.getByTitle('Nhân viên chăm sóc')).toHaveText('TEST groom');
  await expect(timetable.getByRole('cell', { name: 'Bữa sáng', exact: true })).toBeVisible();
  await expect(page.getByText('Các việc của ngựa này')).toBeVisible();
});
test('trainer opens one horse’s schedule from the sessions page, not its profile', async ({ page }) => {
  await login(page, 'trainer');
  await page.goto('/training/sessions');
  await page.getByRole('link', { name: 'TEST Browser Horse', exact: true }).first().click();
  await expect(page).toHaveURL(/\/training\/sessions\?horse=/);
  await expect(page.getByText('Đang xem lịch của ngựa: TEST Browser Horse')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mở hồ sơ ngựa' })).toBeVisible();
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
  // The count tiles (which double as filters) read the real health status and checklist.
  const tile = (label) => page.getByRole('button').filter({ has: page.getByText(label, { exact: true }) });
  await expect(tile('Đủ điều kiện tập')).toContainText(/1\s*ngựa/);
  await expect(tile('Theo dõi y tế')).toContainText(/0\s*ngựa/);
  // It has a plan, so it is not among the horses without one (the horse the papers test added is).
  await expect(page.locator('.ant-table-row', { hasText: 'TEST Browser Horse' })).toBeVisible();
  await tile('Chưa có kế hoạch').click();
  await expect(tile('Chưa có kế hoạch')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.ant-table-row', { hasText: 'TEST Browser Horse' })).toHaveCount(0);
});
for (const role of ['manager', 'trainer', 'vet', 'owner', 'groom']) {
  test(`${role} gets the light/dark switch and opens dark when a dark canvas is saved in the browser`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('wdp301_canvas_theme', 'peak_equestrian_dark'));
    await login(page, role);
    await expect(page.locator('.ant-segmented', { hasText: 'Tối' })).toHaveCount(1);
    await expect(page.locator('.is-dark-canvas.canvas-sider, .is-dark-canvas .canvas-sider')).toHaveCount(1);
    // Every role's pages go fully dark (the Owner's through its own dark tokens).
    await expect(page.locator('.staff-dark')).toHaveCount(1);
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
// Is this element's own background dark? (Read the same way; a transparent background is not dark.)
const backgroundIsDark = (locator) =>
  locator.evaluate((el) => {
    const cv = document.createElement('canvas').getContext('2d');
    cv.fillStyle = '#000';
    cv.fillStyle = getComputedStyle(el).backgroundColor;
    cv.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = cv.getImageData(0, 0, 1, 1).data;
    return a > 0 && (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45;
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
  const result = page.locator('.own-row', { hasText: 'TEST Browser Cup' });
  await expect(result).toBeVisible();
  await expect(result.getByText('1.000.000 ₫', { exact: true })).toBeVisible();
  await expect(page.getByText(/\$1,000,000/)).toHaveCount(0);
});
test('owner opening the old reviews page lands on the trainer reviews of the training page', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/owner/evaluations');
  await expect(page).toHaveURL(/\/owner\/training\?view=reviews$/);
  await expect(page.getByText('TEST đi bộ đều, hồi sức tốt')).toBeVisible();
});
test('owner horse list counts the examined horse as ready, like the trainer sees it', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/horses');
  const bannerStat = (label) => page.locator('span').filter({ hasText: new RegExp(`^${label}:$`, 'i') }).locator('xpath=following-sibling::span[1]');
  await expect(bannerStat('đủ điều kiện tập')).toHaveText('1 con');
  await expect(bannerStat('cần theo dõi')).toHaveText('0 con');
});
test('owner horse page shows the papers and the valuation', async ({ page }) => {
  await login(page, 'owner');
  await page.goto(`/horses/${fixture.horseId}`);
  const record = page.locator('.own-card', { hasText: 'Số vi mạch' });
  await expect(record.getByText('985112345678901')).toBeVisible();
  await expect(record.getByText('TEST-REG-001')).toBeVisible();
  await expect(page.locator('.own-hero').getByText('750.000.000 ₫')).toBeVisible();
  // The horse form has no sire or dam, so there is no pedigree to show.
  await expect(page.getByText(/Gia phả|Pedigree/)).toHaveCount(0);
});
test('owner health tab shows routine care on the same 3D horse as the injuries, one layer at a time', async ({ page }) => {
  await login(page, 'owner');
  await page.goto(`/horses/${fixture.horseId}?tab=health`);
  const body = page.locator('.vet-ui', { has: page.locator('.ant-segmented') });
  // No injury is open, so the care layer opens first: the cracked hoof in red, the shot on the left of the neck.
  await expect(body.getByText('Chăm sóc định kỳ', { exact: true })).toBeVisible();
  // The pins are found by their labels, not their role: <model-viewer> hides them while the model is still loading.
  const hoof = body.locator('button.vet-hs[aria-label^="Móng trước phải:"][aria-label*="Đóng móng mới"]');
  await expect(hoof).toHaveCount(1);
  await expect(hoof).toHaveAttribute('style', /#ef4444/);
  await expect(body.locator('button.vet-hs[aria-label^="Tiêm phòng · Cổ trái:"][aria-label*="Cúm ngựa"]')).toHaveCount(1);
  // One horse on the tab: the injury layer takes the care pins away.
  await body.getByText('Chấn thương', { exact: true }).click();
  await expect(body.locator('button.vet-hs[aria-label^="Móng trước phải"]')).toHaveCount(0);
  await expect(body.getByRole('radio', { name: /Ngoài da/ })).toBeVisible();
});
test('owner horse page shows the horse moving as its health allows', async ({ page }) => {
  await login(page, 'owner');
  await page.goto(`/horses/${fixture.horseId}`);
  // The fixture horse was examined and cleared for full work, and no session is running: it grazes, in the pasture.
  await expect(page.locator('.own-hero canvas')).toHaveAttribute('aria-label', /Khỏe · thư giãn gặm cỏ, trên đồng cỏ/);
  await expect(page.locator('.own-hero').getByText(/Mô hình 3D chuyển động/)).toBeVisible();
  // The pasture's tree and house are CC BY: their authors are named under the stage.
  await expect(page.locator('.own-hero').getByText('Cây: atrodler · Nhà: BoredPain666 (Sketchfab, CC BY 4.0)')).toBeVisible();
});
test('owner horse page shows the horse in its stall, with no way to move it', async ({ page }) => {
  await login(page, 'owner');
  await page.goto(`/horses/${fixture.horseId}?tab=stall`);
  // The fixture puts the horse in the first stall of zone A.
  const stall = page.locator('.ant-card', { hasText: 'Chuồng A-01' });
  await expect(stall).toBeVisible();
  await expect(stall.getByText('Khu A · TEST ngựa đua', { exact: true })).toBeVisible();
  // Placing and moving horses is the Manager's: the owner gets no link to the stable map.
  await expect(page.getByText('Đổi chuồng trên sơ đồ')).toHaveCount(0);
});
test('owner stable page reads the stall from the stable map, not from the old free-text code', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/owner/stable');
  // The page goes zone, then stall: the fixture horse's tile on the stable map, and the stall's facts beside the barn.
  await expect(page.getByRole('button', { name: /^A-01/ })).toContainText('TEST Browser Horse');
  await expect(page.locator('.own-stall-card')).toContainText('A-01');
  // The stall code A-01 used to be split at the dash and shown as "A – 01".
  await expect(page.getByText('A – 01')).toHaveCount(0);
});
test('owner dashboard says where each horse stands', async ({ page }) => {
  await login(page, 'owner');
  // The fixture horse is in stall A-01 of Khu A (stable map).
  await expect(page.getByText('Chuồng A-01 · Khu A', { exact: true })).toBeVisible();
});
test('owner stable page keeps the stall card title readable on the dark canvas', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wdp301_canvas_theme', 'peak_equestrian_dark'));
  await login(page, 'owner');
  await page.goto('/owner/stable');
  const card = page.locator('.own-card', { hasText: 'Chuồng của ngựa bạn' });
  const title = card.locator('.own-card-title');
  await expect(title).toBeVisible();
  // The Owner's pages go dark with the canvas: the card is dark, so its title and the horse in the stall read light.
  expect(await backgroundIsDark(card)).toBe(true);
  expect(await textIsDark(title)).toBe(false);
  expect(await textIsDark(card.locator('.own-stall-card .own-horse-name'))).toBe(false);
});
test('owner horse list says it did not load, instead of "you have no horses", and comes back on retry', async ({ page }) => {
  const summary = (url) => url.pathname === '/api/v1/horses/owner-summary';
  await page.route(summary, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'TEST server error' }) }));
  await login(page, 'owner');
  await page.goto('/horses');
  await expect(page.getByText(/Chưa tải được danh sách chiến mã/)).toBeVisible();
  await expect(page.getByText(/Bạn chưa có chiến mã nào/)).toHaveCount(0);
  await page.unroute(summary);
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByText('TEST Browser Horse', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Chưa tải được danh sách chiến mã/)).toHaveCount(0);
});
test('owner cannot open the stable map of the Manager', async ({ page }) => {
  await login(page, 'owner');
  await page.goto('/admin/stables');
  await expect(page).toHaveURL(/\/403$/);
});
test('the trainer sees the horse papers but not the valuation', async ({ page }) => {
  await login(page, 'trainer');
  await page.goto(`/horses/${fixture.horseId}`);
  // The valuation is sent only to the Manager and the owner.
  await expect(page.getByText('985112345678901').first()).toBeVisible();
  await expect(page.getByText('750.000.000')).toHaveCount(0);
});
test('owner horse page keeps its header and cards readable on the dark canvas', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wdp301_canvas_theme', 'peak_equestrian_dark'));
  await login(page, 'owner');
  await page.goto(`/horses/${fixture.horseId}`);
  const hero = page.locator('.own-hero');
  await expect(hero.getByRole('heading', { name: 'TEST Browser Horse' })).toBeVisible();
  // Dark cards, light text: the name, a figure's label and a fact in the record card.
  expect(await textIsDark(hero.getByRole('heading', { name: 'TEST Browser Horse' }))).toBe(false);
  expect(await textIsDark(hero.getByText('Thành tích', { exact: true }))).toBe(false);
  expect(await textIsDark(page.locator('.own-card', { hasText: 'Số vi mạch' }).getByText('985112345678901'))).toBe(false);
});
test('the staff horse page names who looks after the horse instead of an empty pedigree', async ({ page }) => {
  await login(page, 'trainer');
  await page.goto(`/horses/${fixture.horseId}`);
  const people = page.locator('.ant-card', { hasText: 'Người phụ trách' });
  await expect(people.getByText('HLV phụ trách')).toBeVisible();
  await expect(people.getByText('Nhân viên chăm sóc')).toBeVisible();
  await expect(page.getByText(/Dòng dõi|Pedigree/)).toHaveCount(0);
});
test('the Manager works the stable map: an empty stall offers a horse, a taken one the change, the 3D barn beside it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page, 'manager');
  await page.goto('/admin/stables');
  await expect(page.getByRole('tab', { name: 'Sơ đồ chuồng' })).toHaveAttribute('aria-selected', 'true');
  const taken = page.getByRole('button', { name: /^A-01/ });
  await expect(taken).toContainText('TEST Browser Horse');
  await page.getByRole('button', { name: /^A-02/ }).click();
  await expect(page.getByRole('button', { name: 'Xếp ngựa vào chuồng này' })).toBeVisible();
  await taken.click();
  await expect(page.getByRole('button', { name: 'Đổi chuồng / người chăm sóc' })).toBeVisible();
  await expect(page.locator('canvas[aria-label="Khu chuồng ngựa 3D"]').first()).toBeVisible();
  // The colour on a stall is the horse's health, not a go-ahead for a session (GPT-72.6).
  await expect(page.getByText('Sức khỏe đủ điều kiện').first()).toBeVisible();
  await expect(page.getByText('Sẵn sàng tập', { exact: true })).toHaveCount(0);
  await page.goto(`/horses/${fixture.horseId}`);
  await expect(page.getByText('Chuồng A-01')).toBeVisible();
  await expect(page.getByText('Đổi chuồng trên sơ đồ')).toBeVisible();
  expect(errors).toEqual([]);
});
test('an empty stall takes any horse: one already in a stall moves, keeping its groom', async ({ page }) => {
  await login(page, 'manager');
  await page.goto('/admin/stables');
  await page.getByRole('button', { name: /^A-02/ }).click();
  await page.getByRole('button', { name: 'Xếp ngựa vào chuồng này' }).click();
  const modal = page.locator('.ant-modal', { hasText: 'Xếp chuồng cho ngựa' });
  await modal.locator('.ant-form-item', { hasText: 'Ngựa' }).first().locator('.ant-select').click();
  // Every horse already has a stall (on the map or written by hand): none may be greyed out.
  const option = page.locator('.ant-select-item-option', { hasText: 'TEST Browser Horse (đang ở A-01)' });
  await expect(option).not.toHaveClass(/ant-select-item-option-disabled/);
  await option.click();
  await expect(modal.getByText('Ngựa sẽ chuyển khỏi chuồng A-01.')).toBeVisible();
  await expect(modal.locator('.ant-form-item', { hasText: 'Nhân viên chăm sóc' }).getByText('TEST groom')).toBeVisible();
  await modal.getByRole('button', { name: 'Hủy' }).click();
});

test("the Manager's horse list opens the horse's stall form on the stable page", async ({ page }) => {
  await login(page, 'manager');
  await page.goto('/horses');
  await page.getByRole('button', { name: 'A-01', exact: true }).click();
  await expect(page.locator('.ant-modal-title', { hasText: 'Sửa phân công — TEST Browser Horse' })).toBeVisible();
  // Read once: a reload does not open it again.
  await expect(page).toHaveURL(/\/admin\/stables$/);
});

// A list the page could not load is "not checked", never 0 or "all resolved" (GPT-72.4).
const failWith500 = (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'TEST server error' }) });
// A new matcher per call: keep it to unroute (Playwright matches the function itself).
const apiPath = (path) => (url) => url.pathname === `/api/v1${path}`;
const queueCard = (page) => page.locator('.ant-card', { hasText: 'Việc đang chờ bạn' });

test('the Manager queue: a list that fails is shown as not checked, and comes back on retry', async ({ page }) => {
  const inventoryList = apiPath('/inventory');
  await page.route(inventoryList, failWith500);
  await login(page, 'manager');
  const card = queueCard(page);
  await expect(card.getByText(/^Chưa kiểm tra được 2 mục/)).toBeVisible();
  await expect(card.getByText('Tất cả đã được giải quyết')).toHaveCount(0);
  await expect(card.getByText('chưa tải được', { exact: true })).toHaveCount(2);
  // The lists that did load still count.
  await expect(card.getByRole('link', { name: /Tài khoản đăng ký chờ duyệt/ })).toBeVisible();

  await page.unroute(inventoryList);
  await card.locator('.ant-card-head').getByRole('button', { name: 'Thử lại' }).click();
  await expect(card.getByText('chưa tải được', { exact: true })).toHaveCount(0);
  await expect(card.getByText(/^Chưa kiểm tra được/)).toHaveCount(0);
  await expect(card.getByRole('link', { name: /Hàng đã duyệt, chờ nhận/ })).toBeVisible();
});

test('the Manager queue with every list failing claims nothing is waiting', async ({ page }) => {
  for (const path of ['/users', '/inventory', '/horses/checklist']) await page.route(apiPath(path), failWith500);
  await login(page, 'manager');
  const card = queueCard(page);
  await expect(card.getByText('Chưa kiểm tra được 4 mục')).toBeVisible();
  await expect(card.getByText('Tất cả đã được giải quyết')).toHaveCount(0);
  await expect(card.getByText('chưa tải được', { exact: true })).toHaveCount(4);
});

test('the Manager queue keeps the last counts, marked as old, when a refresh fails', async ({ page }) => {
  await page.clock.install();
  await login(page, 'manager');
  const card = queueCard(page);
  await expect(card.getByText(/Tất cả đã được giải quyết|việc chưa xử lý/)).toBeVisible();
  // The lists go stale (30 s) and a reconnect refetches them; the accounts list now fails.
  const usersList = apiPath('/users');
  await page.route(usersList, failWith500);
  await page.clock.fastForward('00:31');
  await page.context().setOffline(true);
  await page.context().setOffline(false);
  await expect(card.getByText(/^số lúc \d\d:\d\d$/)).toBeVisible();
  await expect(card.getByText(/theo số liệu cũ/)).toBeVisible();
  await expect(card.getByText('Tất cả đã được giải quyết')).toHaveCount(0);

  await page.unroute(usersList);
  await card.locator('.ant-card-head').getByRole('button', { name: 'Thử lại' }).click();
  await expect(card.getByText(/theo số liệu cũ/)).toHaveCount(0);
  await expect(card.getByText(/^số lúc/)).toHaveCount(0);
});

test('the readiness board says it could not check, instead of going blank, and comes back on retry', async ({ page }) => {
  const readiness = apiPath('/training/sessions/readiness');
  await page.route(readiness, failWith500);
  await login(page, 'trainer');
  await page.goto('/training/sessions?new=1');
  const modal = page.locator('.ant-modal', { hasText: 'Tạo buổi tập mới' });
  await modal.locator('.ant-form-item', { hasText: 'Ngựa' }).first().locator('.ant-select').click();
  await page.locator('.ant-select-item-option', { hasText: 'TEST Browser Horse' }).first().click();
  const board = modal.locator('.ant-card', { hasText: 'Kiểm tra sẵn sàng' });
  await expect(board.getByText('Chưa kiểm tra được tình trạng sẵn sàng')).toBeVisible();
  await expect(board.getByText('Sẵn sàng tập')).toHaveCount(0);

  await page.unroute(readiness);
  await board.getByRole('button', { name: 'Thử lại' }).click();
  await expect(board.getByText('Người chăm sóc', { exact: true })).toBeVisible();
  await expect(board.getByText('Chưa kiểm tra được tình trạng sẵn sàng')).toHaveCount(0);
});

test('locking a groom who still has a stall asks for a replacement first', async ({ page }) => {
  await login(page, 'manager');
  await page.goto('/admin/users');
  await page.getByRole('row', { name: /TEST groom/ }).getByRole('button', { name: /Sửa/ }).click();
  const edit = page.getByRole('dialog', { name: /Cập nhật tài khoản/ });
  await edit.getByRole('switch').click();
  await edit.getByRole('button', { name: 'Đồng ý' }).click();
  const pick = page.getByRole('dialog', { name: /Chọn người thay/ });
  await expect(pick).toBeVisible();
  await expect(pick.getByText('Chuồng A-01')).toBeVisible();
  await expect(pick.getByText('Ngựa TEST Browser Horse')).toBeVisible();
  // The fixture has no other groom: nobody to hand over to, so the lock cannot be saved.
  await expect(pick.getByText('Chưa có nhân viên chăm sóc nào khác đang hoạt động')).toBeVisible();
  await expect(pick.getByRole('button', { name: 'Chuyển việc và lưu' })).toBeDisabled();
  await pick.getByRole('button', { name: 'Hủy' }).click();
  await edit.getByRole('button', { name: 'Hủy' }).click();
  await expect(page.getByRole('row', { name: /TEST groom/ }).getByText('Hoạt động')).toBeVisible();
});

test('approving two sign-ups in a row keeps both busy until each answer comes back', async ({ page }) => {
  const pending = (id, name) => ({ _id: id, name, email: `${id}@pending.test`, phone: '', role: 'groom', approvalStatus: 'pending', isActive: false, createdAt: new Date().toISOString() });
  await login(page, 'manager');
  // Two sign-ups waiting (a mocked list) and slow answers to each approval; nothing is saved.
  await page.route(
    (url) => url.pathname === '/api/v1/users',
    (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [pending('p-a', 'TEST Pending A'), pending('p-b', 'TEST Pending B')], message: 'ok' }) })
        : route.continue(),
  );
  await page.route(
    (url) => url.pathname.endsWith('/approval'),
    async (route) => {
      await new Promise((resolve) => { setTimeout(resolve, 1500); });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {}, message: 'ok' }) });
    },
  );
  await page.goto('/admin/users');
  const approveA = page.getByRole('row', { name: /TEST Pending A/ }).getByRole('button', { name: /Duyệt/ });
  const approveB = page.getByRole('row', { name: /TEST Pending B/ }).getByRole('button', { name: /Duyệt/ });
  await approveA.click();
  await approveB.click();
  // A is still waiting for its own answer: it must not come back to life when B starts (GPT-72.5).
  await expect(approveA).toBeDisabled();
  await expect(approveB).toBeDisabled();
});

test('a trial much shorter than its race gets a warning, and can still be saved', async ({ page }) => {
  // A race still to come for the fixture horse (a mocked list; nothing is saved).
  const raceDate = new Date(Date.now() + 10 * 86400000).toISOString();
  await page.route(
    (url) => url.pathname === '/api/v1/races',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [{ _id: 'race-e2e-1', horse: { _id: fixture.horseId, name: 'TEST Browser Horse' }, raceName: 'TEST Long Cup', raceDate, distance: 2400, status: 'registered' }], message: 'ok' }),
      }),
  );
  await login(page, 'trainer');
  await page.goto('/training/sessions?new=1');
  const modal = page.locator('.ant-modal', { hasText: 'Tạo buổi tập mới' });
  const pickOption = async (item, option) => {
    await modal.locator('.ant-form-item', { hasText: item }).first().locator('.ant-select').click();
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: option }).first().click();
  };
  await pickOption('Ngựa', 'TEST Browser Horse');
  await pickOption('Loại buổi tập', 'Chạy thử');
  await pickOption('Chạy thử cho giải', 'TEST Long Cup');
  const distance = modal.locator('.ant-form-item', { hasText: 'Cự ly (m)' });
  // Filled in with the race's distance, which shows beside the field.
  await expect(distance.getByText('Cự ly giải: 2400 m')).toBeVisible();
  await distance.locator('input').fill('800');
  await expect(distance.getByText(/Chỉ bằng 33% cự ly giải \(2400 m\)/)).toBeVisible();
});

test('the trainer sees the horse stall and the stall column, without the Manager actions', async ({ page }) => {
  await login(page, 'trainer');
  await page.goto('/horses');
  await expect(page.getByRole('columnheader', { name: 'Chuồng' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'A-01' })).toBeVisible();
  await page.goto(`/horses/${fixture.horseId}`);
  await expect(page.getByText('Chuồng A-01')).toBeVisible();
  await expect(page.getByText('Đổi chuồng trên sơ đồ')).toHaveCount(0);
});
