# Hiện trạng API và phần chưa triển khai

Cập nhật 11/10/2026, đối chiếu code `654ae43` cùng thay đổi local. Giữ tên file để liên kết cũ vẫn
mở được; danh sách đề xuất Phase 2 đã được thay bằng hiện trạng.
**Có endpoint trong code chưa có nghĩa đã test E2E.**

- Quy trình: [Flow hiện tại](docs/CURRENT_FLOW.md).
- Kiểm chứng giao diện: [Checklist kiểm thử](docs/TEST_CHECKLIST.md).
- Request/response: Swagger `/api-docs`, nguồn `server/src/docs/openapi.js`.
- Mọi đường dẫn dưới đây có tiền tố `/api/v1`.

## API hiện có phục vụ flow

| Nhóm | Endpoint chính | Người thao tác / hành vi |
|---|---|---|
| Tài khoản | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Đăng ký chờ Manager duyệt; đăng nhập trả JWT |
| Hồ sơ | `PUT /auth/profile`, `PUT /auth/change-password` | Người đang đăng nhập cập nhật hồ sơ/đổi mật khẩu |
| Nhân sự | `/users`, `PATCH /users/:id/approval` | Manager quản lý và duyệt tài khoản; quyền đọc tùy role |
| Ngựa | `/horses`, `GET /horses/:id/lineage`, `GET /horses/:id/timeline` | Manager quản lý; role khác đọc theo phạm vi |
| Tiếp nhận | `GET /horses/checklist`, `GET /horses/:id/checklist` | Tính checklist và bước tiếp theo từ hồ sơ thật |
| Chủ ngựa | `GET /horses/owner-summary` | Owner xem tóm tắt ngựa thuộc mình |
| Ngừng quản lý | `PATCH /horses/:id/archive`, `PATCH /horses/:id/unarchive` | Manager lưu lịch sử, đưa ngựa ra/vào quản lý |
| Chuồng | `/stable/assignments` | Manager/Trainer phân chuồng và Groom |
| Khẩu phần | `/feeding` | Trainer/Manager lập khẩu phần, liên kết kho, đồng bộ việc cho ăn |
| Khám | `/health/records`, `/health/exam-requests`, `GET /health/clearances` | Trainer/Manager yêu cầu khám; Vet lập hồ sơ và mức vận động |
| Điều trị | `/health/treatments`, `POST /health/treatments/:id/lock-training`, `GET /health/care-orders` | Vet kê điều trị/y lệnh, hạn chế tập; xem tiến độ |
| Chấn thương | `/health/injury-markers` | Vet lưu vị trí và thông tin chấn thương |
| Kế hoạch | `/training/plans`, `GET /training/plans/suggest`, `POST /training/plans/:id/generate-week` | Trainer lập chu kỳ, sinh buổi theo tuần |
| Buổi tập | `/training/sessions`, `GET /training/sessions/readiness` | Lịch tập và điều kiện sẵn sàng |
| Chạy buổi tập | `POST /training/sessions/:id/pre-check`, `/start`, `/end`, `/abort` | Endpoint riêng cho kiểm tra, bắt đầu, kết thúc, dừng giữa chừng |
| Đánh giá/xếp lại | `PATCH /training/sessions/:id/evaluation`, `POST /training/sessions/:id/reschedule` | Đánh giá buổi đã chạy; xếp lại `missed` bằng buổi mới |
| Chăm sóc | `/stable/tasks`, `GET /stable/my-care-plan` | Trainer/Manager giao việc; Groom xem phần được giao |
| Groom thực hiện | `PATCH /stable/tasks/:id/complete`, `/acknowledge`, `/not-done` | Ghi nhận việc/tiếp nhận/không làm được; metadata offline |
| Sự cố | `POST /stable/tasks/:id/incident`, `GET /stable/incidents`, `PATCH /stable/incidents/:id` | Groom báo; Vet tiếp nhận và xử lý |
| Kho | `/inventory`, `GET /inventory/forecast` | Manager quản lý; dự báo mức sử dụng |
| Đề xuất kho | `POST /inventory/proposals`, `POST /inventory/:id/restock-request`, `PATCH /inventory/:id/restock-requests/:reqId` | Groom/Trainer/Vet đề xuất; Manager duyệt/từ chối |
| Nhận hàng | `POST /inventory/:id/receive` | Manager nhập hàng; có `requestId` thì chống nhận lại đề xuất |
| Giải | `/races`, `GET /races/:id/trials`, `POST /races/:id/decision`, `PATCH /races/:id/results` | Trainer đăng ký/quyết định; Trainer hoặc Manager ghi kết quả qua API |
| Tài chính | `/finance`, `GET /finance/mine`, `GET /finance/mine/summary` | Manager ghi thu/chi; Owner đọc sổ và tổng hợp tháng/quý |
| Báo cáo | `GET /reports/overview`, `/reports/training-chart`, `/reports/finance-chart` | Báo cáo Manager; biểu đồ tập theo phạm vi người dùng |
| Xuất dữ liệu | `GET /export/finance`, `GET /export/horses` | Manager tải CSV; chưa phải PDF hoặc `.xlsx` |
| File | `POST /uploads`, `GET /files/:id`, `POST /health/records/:id/attachments` | Ảnh/PDF lưu GridFS; đọc file qua URL có chữ ký |
| Thông báo/nhật ký | `/notifications`, `/audit-logs` | Thông báo trong app và nhật ký thao tác |
| Chính sách | `GET /settings/policy` | Đọc policy từ cấu hình server; chưa có màn chỉnh policy |

Trong bảng, `/start`, `/end`, `/abort` là hậu tố của `/training/sessions/:id`;
`/acknowledge`, `/not-done` là hậu tố của `/stable/tasks/:id`; các đường dẫn biểu
đồ đều thuộc `/reports`. `/nhóm` biểu thị nhóm route, không cam kết mọi role có CRUD.

## Đề xuất cũ đã có cách thực hiện khác

| Đề xuất cũ | Cách hiện tại |
|---|---|
| `/races/:id/register` | `POST /races` tạo lượt đăng ký của một ngựa; chưa có thực thể giải chung tách riêng |
| `/horses/:id/transfer-ownership` | Manager đổi `owner` qua `PUT /horses/:id`, backend ghi nhận chuyển chủ |
| `/horses/:id/retire` | Archive với lý do; chưa có vòng đời nghỉ hưu riêng |
| `/reports/owner/training-chart` | `GET /reports/training-chart` có phạm vi theo người dùng |
| Upload Cloudinary/S3 | Hiện lưu MongoDB GridFS, không phụ thuộc đĩa Render |
| Readiness tính mỗi rạng sáng | Tính theo ngữ cảnh khi kiểm tra/xếp/bắt đầu buổi, không phải cờ tính một lần/ngày |
| Trừ kho lúc kê đơn | Trừ vật tư liên kết khi Groom hoàn thành việc/liều thuốc |

## Chưa triển khai, không thuộc flow đang hướng dẫn

- Quên mật khẩu và đặt lại bằng email/token khôi phục.
- Logout thu hồi JWT phía server; client hiện xóa phiên/token ở phía mình.
- Tùy chọn nhận thông báo, device token và push notification khi app đóng.
- Module nài ngựa (`jockeys`), tìm kiếm toàn hệ thống.
- Hóa đơn tự động cuối tháng, xuất PDF/`.xlsx`.
- API quản lý giấy tờ pháp lý riêng của ngựa.
- `PUT /settings` để sửa cấu hình trong ứng dụng.
- Upload video riêng: hiện nhận `videoUrl` là liên kết; uploader nhận ảnh/PDF.

## Giới hạn cần kiểm chứng

- Dashboard Owner còn biểu đồ/KPI/định giá giả; thẻ tóm tắt từng ngựa dùng API thật.
- Ghi kết quả/tiền thưởng/thành tích và hoàn thành việc/trừ kho đã dùng transaction,
  có regression test concurrent/retry/lỗi giữa chừng trong repo. Cần MongoDB replica set.
- API integration, Chromium và CI đã được bổ sung; xem [TEST_REPORT.md](docs/TEST_REPORT.md)
  và [AUTOMATED_TESTS.md](docs/AUTOMATED_TESTS.md). Chưa test mọi form/điện thoại/deploy.

Đây là hiện trạng và điểm cần test, không phải cam kết phát triển mọi đề xuất.
