# Nhân viên chăm sóc trên web — giao diện test tạm

Mobile Expo tiếp tục là giao diện dùng khi demo mentor. Phần web này phục vụ test
nhanh trên máy tính, dùng cùng tài khoản Groom và cùng API/backend với mobile.
Thao tác trên web hiện trong mobile khi tải lại dữ liệu và ngược lại.

## Mở và tắt

Chạy `npm run dev` rồi đăng nhập tài khoản Groom đang hoạt động. Khi chạy Vite dev,
giao diện này mặc định bật. Không cần tạo role/tài khoản khác hoặc chạy seed.

| Cấu hình trong `client/.env.local` | Kết quả |
|---|---|
| Không đặt `VITE_ENABLE_GROOM_WEB` | Dev bật, production build tắt |
| `VITE_ENABLE_GROOM_WEB=true` | Bật cả dev/build để test |
| `VITE_ENABLE_GROOM_WEB=false` | Tắt cả dev/build, Groom thấy hướng dẫn dùng mobile |

Restart Vite hoặc build lại sau khi đổi env. Khi demo mentor, giữ mặc định production
hoặc đặt `false`. Mobile không đọc cờ này.

## Các trang và thao tác

- `/groom/tasks`: lọc ngày/trạng thái, tiếp nhận, hoàn thành kèm ăn/phân/nước/quan
  sát, không làm được kèm lý do, báo sự cố kèm tối đa 5 ảnh (5 MB/ảnh).
- `/groom/care`: chuồng/ngựa phụ trách, khẩu phần, y lệnh, hạn chế tập và thiếu vật tư.
- `/groom/incidents`: xem sự cố đã báo, ảnh và phản hồi/trạng thái bác sĩ xử lý.
- `/groom/supplies`: xem tồn kho, đề xuất bổ sung/vật tư mới, theo dõi duyệt/nhận hàng.
- Chuông thông báo dùng chung với các role web hiện có. Dữ liệu trang tự tải lại mỗi
  15 giây; có nút Làm mới.

Server vẫn kiểm tra người được giao việc, quyền Groom, thời gian thực hiện và tồn
kho. Web không cấp quyền duyệt/nhập kho, giao việc, sửa đơn hoặc bỏ qua cửa sổ giờ.
Web chỉ ghi khi có mạng, chưa có outbox/offline như mobile. Complete/not-done giữ
`clientOpId` và thời điểm thực hiện khi thử lại trong cùng hộp thoại.

## Gỡ sau khi test

Tắt bằng cờ là đủ để trở lại giao diện mobile-only. Nếu xóa hẳn:

1. Xóa `client/src/features/groomWeb/`.
2. Gỡ import/nhánh có `GROOM_WEB_ENABLED` trong `AppRouter.jsx`, `RoleDashboard.jsx`
   và `layouts/menuConfig/index.jsx`; giữ `GroomMobileNotice` cho Groom.
3. Gỡ các test Groom web trong `client/e2e/flow.spec.js` và fixture/cờ tương ứng trong
   `server/scripts/testUi.js`, bước test tắt cờ trong workflow.

Không cần xóa role, API, model hay sửa `mobile/src`.

## Kiểm tra tự động

Theo [AUTOMATED_TESTS.md](AUTOMATED_TESTS.md), chạy `npm run test:ui` để kiểm tra
web bật và `node server/scripts/testUi.js --groom-disabled` để kiểm tra web tắt.
Các test dùng DB replica set riêng, không sử dụng dữ liệu demo thật.
