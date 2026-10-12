# Racehorse Training & Management System

Hệ thống quản lý huấn luyện ngựa đua cho 5 vai trò: Club Manager, Head Trainer,
Veterinarian, Groom/Stable Hand và Horse Owner.

**Đối chiếu code `654ae43` và thay đổi local, cập nhật 11/10/2026.** Mô tả flow hiện có không đồng
nghĩa với việc mọi bước đã được người dùng test trên bản deploy.

## Đọc tài liệu theo thứ tự

1. [Flow hiện tại](docs/CURRENT_FLOW.md): ai làm, ở màn hình nào, thao tác gì,
   hệ thống thay đổi gì và vì sao bước tiếp theo có thể bị chặn.
2. [Checklist kiểm thử](docs/TEST_CHECKLIST.md): đi xuyên vai trò và đối chiếu kết
   quả mong đợi. Các ca test tay đang để chưa xác nhận.
3. [Hiện trạng API và phần chưa triển khai](API_REQUIREMENTS_PHASE2.md): thay thế
   danh sách đề xuất Phase 2 cũ.
4. [Cấu hình và deploy](DEPLOYMENT.md): backend chung, frontend, mobile, lưu file
   và chính sách CLB.

## Cấu trúc

```text
client/   React + Vite + Ant Design + Tailwind: Manager, Trainer, Vet, Owner
mobile/   React Native + Expo: Groom
server/   Node.js + Express + MongoDB/Mongoose + Socket.io: API dùng chung
docs/     Flow hiện tại và checklist kiểm thử
```

## Chạy web và backend local

Groom chỉ dùng app `mobile/`; tài khoản Groom đăng nhập web chỉ thấy hướng dẫn mở app.
Không cần Android Studio: `npm --prefix mobile run web` mở chính app Groom trên trình duyệt (cổng 5173, trùng cổng web quản lý nên chạy lần lượt). Camera và chế độ ngoại tuyến vẫn nên thử trên điện thoại.

Dùng Node.js **22.12+** và npm; Vite hiện tại yêu cầu Node `^20.19.0 || >=22.12.0`.
Cần MongoDB local nếu chạy backend local. Nếu chỉ chạy web với backend chung,
làm theo [DEPLOYMENT.md](DEPLOYMENT.md).

Từ thư mục gốc, trên PowerShell:

```powershell
npm install
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
npm run dev
```

- Web: `http://localhost:5173`.
- API: `http://localhost:5000/api/v1`.
- Swagger: `http://localhost:5000/api-docs`.
- Kiểm tra kết nối: `http://localhost:5000/api/v1/health-check`.

Nếu máy không nhận `npm`, trên máy Duy có thể dùng
`& 'D:\npm-global\npm.cmd' install` và các lệnh tương ứng.

### Dữ liệu demo local

`npm run seed` tạo lại dữ liệu demo và **xóa dữ liệu ở nhiều collection** trong
database mà `MONGO_URI` đang trỏ tới. Chỉ chạy khi chủ động muốn đặt lại database
test riêng; không đưa seed vào quy trình deploy hoặc chạy trên database chung.

Sau seed local, mật khẩu các tài khoản dưới đây là `123456`:

| Vai trò | Email |
|---|---|
| Club Manager | manager@demo.com |
| Head Trainer | trainer@demo.com |
| Veterinarian | vet@demo.com |
| Groom | groom@demo.com |
| Horse Owner | owner@demo.com |

Tài khoản trên backend chung do Manager quản lý; không suy ra trạng thái tài khoản
đang hoạt động từ bảng demo này. Đăng ký mới tạo tài khoản chờ duyệt, chưa đăng nhập được.

## Luồng chính

Manager tiếp nhận và phân công → Trainer lập khẩu phần → Vet khám → Trainer lập
kế hoạch và sinh lịch → Groom thực hiện chăm sóc → Trainer pre-check, bắt đầu,
kết thúc và đánh giá → Groom chăm sóc sau tập.

Nếu hướng tới thi đấu: đăng ký giải → lập kế hoạch hướng tới giải → chạy thử gắn
với giải → HLV quyết định tham gia/rút → nhập kết quả và tiền thưởng → theo dõi hồi phục.
Đăng ký giải là tùy chọn; ngựa có thể huấn luyện mà không có giải mục tiêu.

Lập kế hoạch chưa tạo buổi tập; sinh lịch chưa chạy cảm biến.
Xem trạng thái và điều kiện ở [CURRENT_FLOW.md](docs/CURRENT_FLOW.md).

## API

Backend chung được cấu hình trong dự án: `https://racehorse-tms-server.onrender.com`.
Swagger: `https://racehorse-tms-server.onrender.com/api-docs`.
Phiên cập nhật tài liệu này chưa xác minh phiên bản đang chạy trên Render.

Mọi endpoint trong hướng dẫn dùng tiền tố `/api/v1`. Swagger được viết tay ở
`server/src/docs/openapi.js`; khi đổi nghiệp vụ, đối chiếu route/controller và
cập nhật cả Swagger lẫn flow. Đăng nhập qua `POST /auth/login`, lấy token rồi
dùng **Authorize** trong Swagger.

## Kiểm tra tự động

Trang hướng dẫn test chính/phụ riêng: chạy `npm run test:guide`, mở
**http://localhost:5190**. [Hướng dẫn](tools/test-flow-guide/README.md); không tích hợp
vào web project. Có checklist, ghi chú và xuất biên bản.

Hướng dẫn môi trường DB test, lệnh API/UI và CI: [AUTOMATED_TESTS.md](docs/AUTOMATED_TESTS.md).
Kết quả đã chạy: [TEST_REPORT.md](docs/TEST_REPORT.md).
MongoDB cần replica set cho transaction của công việc/kho và kết quả/tiền thưởng.

```powershell
npm test -w server
npm --prefix mobile test
npm run lint -w client
npm run build -w client
```

Test API và Chromium đã có trong repo; dùng DB riêng, không seed dữ liệu chung.
Kết quả tự động không thay thế việc test Expo trên điện thoại và toàn bộ các form
trong checklist. Trạng thái bản deploy chưa được xác minh trong phiên này.
