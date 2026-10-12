const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const md = fs.readFileSync(path.join(root, 'docs/TEST_CHECKLIST.md'), 'utf8');
const groups = [
  { id: 'A', title: 'A · Chuẩn bị ngựa', description: 'Flow chính · Manager → HLV → Groom → Vet → HLV', note: 'Dùng cùng một ngựa test xuyên các bước. Khám và khẩu phần có thể chuẩn bị song song. Giải mục tiêu là tùy chọn nếu chỉ test huấn luyện.' },
  { id: 'B', title: 'B · Tập & đánh giá', description: 'Flow chính · HLV → Groom → Owner', note: 'Có khám và mức tập phù hợp trước khi chạy. Để test chăm sóc sau tập, chọn bài nặng và có Groom phụ trách. Nếu simulator tự kết thúc, đó là B9; B4 phải bấm kết thúc thủ công trên buổi khác.' },
  { id: 'C', title: 'C · Thi đấu & tiền thưởng', description: 'Flow chính · HLV → Vet/Groom → Owner → Manager', note: 'Tách hai giải test: giải tương lai cho trial/quyết định, giải ngày hôm nay cho kết quả/tiền thưởng. Không nhập kết quả giải tương lai hoặc đã rút; không đổi đồng hồ để giả một lượt thi đấu hoàn chỉnh.' },
  { id: 'D', title: 'D · Kho & offline', description: 'Flow phụ · Groom (app mobile) → Manager', note: 'Duyệt đề xuất chưa tăng tồn kho: chỉ Nhận hàng mới cộng kho. App Groom chạy được trên trình duyệt (npm --prefix mobile run web); các ca tắt mạng, outbox và camera nên thử trên điện thoại.' },
  { id: 'E', title: 'E · Chặn & hồi phục', description: 'Flow phụ · HLV / Vet / Groom / Manager', note: 'Dùng ngựa test riêng cho nhánh sốt, khóa tập và archive. Hệ thống từ chối đúng điều kiện là kết quả Đạt của ca chặn, không phải lỗi project.' },
  { id: 'F', title: 'F · Tài khoản & quyền', description: 'Flow phụ · Đăng nhập / quyền / thông báo', note: 'Đổi tài khoản đúng role ở mỗi bước. Kiểm tra cả màn hình và dữ liệu lưu sau refresh; cùng một ID không được giúp role ngoài phạm vi truy cập.' },
  { id: 'T', title: 'T · Retry & lỗi DB', description: 'Ca kỹ thuật · API / database test riêng', note: 'T1–T3 đã có regression test tự động đạt trong repo. Nếu thử lại thủ công, dùng DB riêng và công cụ API; không tạo lỗi DB trên môi trường demo chung. T4 vẫn cần kiểm tra retry sự cố.' },
];
const route = (label, routePath) => ({ label, path: routePath });
const trainer = route('HLV · Buổi tập', '/training/sessions');
const races = route('HLV · Giải đua', '/races');
const vet = route('Vet · Sức khỏe ngựa', '/veterinarian/horses');
const owner = route('Owner · Ngựa của tôi', '/horses');
const inventory = route('Manager · Vật tư', '/inventory');
const plans = route('HLV · Kế hoạch', '/training/plans');
const routes = {
  A1: [route('Manager · Ngựa', '/horses')], A2: [route('Manager · Chuồng & Groom', '/admin/stables')],
  A3: [route('HLV · Khẩu phần', '/stable/tasks')], A4: [], A5: [route('HLV · Ngựa', '/horses'), vet],
  A6: [races], A7: [races, plans], A8: [plans], A9: [plans], A10: [owner],
  B1: [trainer], B2: [trainer], B3: [trainer], B4: [trainer], B5: [trainer, route('Owner · Đánh giá HLV', '/owner/evaluations')], B6: [trainer], B7: [], B9: [trainer],
  C1: [trainer, races], C2: [trainer, races], C3: [races], C4: [races], C5: [vet, races], C6: [races], C7: [races],
  C8: [route('Owner · Giải', '/owner/races'), route('Owner · Tài chính', '/finance')], C9: [races, route('Manager · Tài chính', '/finance')], C10: [route('Manager · Báo cáo', '/admin/reports'), route('Manager · Nhật ký', '/admin/audit-logs')],
  D1: [inventory], D2: [inventory], D3: [inventory], D4: [inventory],
  E1: [trainer], E2: [trainer, vet], E3: [trainer], E4: [trainer], E5: [trainer], E6: [trainer], E7: [trainer, vet], E8: [route('Vet · Phác đồ', '/veterinarian/treatments'), trainer], E9: [vet], E10: [vet, plans], E11: [trainer], E12: [], E13: [route('Manager · Ngựa', '/horses')],
};
const technicalExpected = {
  T1: 'Chỉ một khoản thưởng liên kết raceEntry, một thành tích và một thông báo cho cùng kết quả; không nhân tiền thưởng.',
  T2: 'Lỗi DB rollback cả công việc và kho; retry không trừ hai lần. Lỗi thông báo sau commit vẫn trả thành công cho thao tác đã lưu.',
  T3: 'Thành tích liên kết theo raceEntry; hai lượt cùng tên giữ riêng. Sửa một lượt không làm mất thành tích lượt kia.',
  T4: 'Ghi nhận ảnh/thông báo có lặp hoặc không; API incident hiện không cam kết idempotency tương đương complete/not-done.',
};
const cases = md.split(/\r?\n/).filter(line => /^\| [ABCDE T]\d+ \|/.test(line)).map(line => {
  const cells = line.split('|').slice(1, -1).map(s => s.trim());
  const id = cells[0];
  return { id, action: cells[1].replace(/`/g, ''), expected: technicalExpected[id] || cells[2].replace(/`/g, ''), routes: routes[id] || [] };
});
cases.push(
  { id: 'F1', action: 'Đăng ký tài khoản mới → Manager duyệt → đăng nhập', expected: 'Trước duyệt chưa đăng nhập được; sau duyệt đúng role/trạng thái hoạt động.', routes: [route('Đăng ký', '/register'), route('Manager · Tài khoản', '/admin/users')] },
  { id: 'F2', action: 'Đăng nhập sai mật khẩu, rồi đăng nhập đúng; đăng xuất và đổi role', expected: 'Sai thông tin có lỗi rõ ràng; đăng nhập đúng về dashboard đúng role; đăng xuất không giữ quyền tài khoản cũ.', routes: [route('Đăng nhập', '/login')] },
  { id: 'F3', action: 'Owner / Groom thử mở trang quản lý nhân sự hoặc tài chính Manager', expected: 'Trang ngoài quyền bị chặn. Groom không có quyền giao việc, duyệt/nhập kho hoặc sửa y lệnh.', routes: [route('Thử trang Manager', '/admin/users')] },
  { id: 'F4', action: 'Tài khoản HLV / Vet / Owner / Groom khác thử đọc ngựa hoặc việc không được giao', expected: 'Không thấy trong danh sách hoặc bị từ chối truy cập; không lộ lịch sử ngoài phạm vi.', routes: [owner] },
  { id: 'F5', action: 'Groom báo sự cố kèm ảnh → Vet tiếp nhận/xử lý → Groom xem phản hồi', expected: 'Ảnh mở được; Vet/HLV nhận thông báo; trạng thái sự cố và phản hồi cập nhật, refresh vẫn còn.', routes: [vet] },
  { id: 'F6', action: 'Groom báo không làm được kèm lý do trên app; HLV xem lại ở web', expected: 'Lưu đúng skipped/lý do hoặc completed/quan sát; app và web cùng backend thấy cùng bản ghi sau tải lại.', routes: [route('HLV · Việc chăm sóc', '/stable/tasks')] },
  { id: 'F7', action: 'Mở chuông thông báo → đọc một mục → đánh dấu đã đọc → refresh', expected: 'Đếm chưa đọc thay đổi theo trạng thái thật; thông báo đúng người/role; mở chuông không tự đọc hết.' },
  { id: 'F8', action: 'Tài khoản Groom đăng nhập web quản lý', expected: 'Chỉ thấy hướng dẫn mở app mobile (điện thoại hoặc npm --prefix mobile run web); không có màn hình Groom trên web.', routes: [route('Groom · Trang chủ', '/')] },
);
if (cases.filter(c => c.id.startsWith('A')).length !== 10 || cases.filter(c => c.id.startsWith('T')).length !== 4) throw new Error('Checklist extraction failed.');
const file = path.join(__dirname, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const data = JSON.stringify({ groups, cases }).replace(/</g, '\\u003c');
fs.writeFileSync(file, html.replace(/(<script id="flow-data" type="application\/json">)[\s\S]*?(<\/script>)/, '$1' + data + '$2'));
console.log(`Standalone guide: ${cases.length} cases, ${groups.length} groups.`);
