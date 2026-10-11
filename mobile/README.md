# Mobile — App Nhân viên Chăm sóc (Groom)

React Native + Expo, dành riêng cho tài khoản `groom`; bốn role còn lại dùng web.
Gọi chung backend với web. Cập nhật 11/10/2026 theo code `654ae43`.

## Chạy và chọn backend

Mobile không thuộc npm workspaces root, cần cài dependencies riêng:

```powershell
npm --prefix mobile install
npm --prefix mobile start
```

Dùng Expo Go tương thích SDK của dự án hoặc môi trường thiết bị/build tương ứng.
App mặc định gọi `https://racehorse-tms-server.onrender.com/api/v1`.
Muốn dùng server local, tạo `mobile/.env`:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:5000/api/v1
```

Dùng IP LAN của PC, không dùng `localhost` trên điện thoại. Thiết bị phải truy
cập được máy/cổng API. Khởi động lại Expo sau khi đổi env. Đảm bảo web và mobile
trỏ cùng môi trường trước khi test chăm sóc/ngựa.

- `npm --prefix mobile run android`: chạy Android, cần môi trường Android phù hợp.
- `npm --prefix mobile run web`: chạy bản web trên cổng **5173** theo script hiện tại.
  Nếu Vite web đang dùng cổng này, từ thư mục mobile chạy `npx expo start --web --port 5174`.
  Tính năng camera/ảnh và trải nghiệm native cần kiểm tra trên thiết bị.

## Điều hướng hiện tại

Thanh dưới có **4 nút**: Tổng quan, Cho ăn, Việc, Thêm.

| Nơi mở | Nội dung |
|---|---|
| Tổng quan | Lịch hôm nay, tiến độ, việc/bữa ăn, thông báo |
| Cho ăn | Các bữa theo ngày/ngựa; khẩu phần, thực hiện và ghi quan sát |
| Việc | Công việc chăm sóc; giờ, ghi nhận hoặc lý do không làm được |
| Thêm → Thuốc & y lệnh | Liều thuốc/việc theo dõi theo toa bác sĩ |
| Thêm → Sơ đồ chuồng | Chuồng, ngựa và tình trạng; mở chi tiết ngựa |
| Thêm → Vật tư | Tồn kho, đề xuất bổ sung/mặt hàng, lịch sử |
| Thêm → Báo cáo sự cố | Báo và xem sự cố, có thể kèm ảnh |

App thực hiện việc server đã giao; Groom không tự duyệt khẩu phần, kê đơn hay
duyệt/nhận hàng kho. API từ chối tick việc/liều khi thiếu vật tư liên kết.

## Offline và đồng bộ

- Query cache lưu dữ liệu đã tải. Không có mạng không đồng nghĩa có thể mở dữ liệu
  chưa từng tải hoặc thực hiện mọi chức năng app.
- Outbox có handler cho hoàn thành, không làm được, tiếp nhận và báo sự cố.
- Khi không có phản hồi mạng, thao tác chờ trong hàng đợi và lưu lại qua lần mở app.
  Giao diện chờ đồng bộ không phải xác nhận đã thành công trên server.
- Complete/not-done giữ `performedAt` và `clientOpId` khi gửi lại; server xét giờ
  thực hiện, lưu giờ nhận và đánh dấu gửi muộn quá 10 phút.
- Bản ghi quá 24 giờ hoặc sai khung thực hiện có thể bị từ chối. Xem lý do trong
  trạng thái lỗi đồng bộ; báo HLV/Manager thay vì coi việc đã xong.
- Incident/ảnh không có cùng cơ chế chống lặp thao tác như complete/not-done;
  cần test riêng việc gửi ảnh sau khi mất mạng.

## Kiểm chứng

`npm --prefix mobile test` kiểm tra **outbox**, không test toàn bộ UI/thiết bị.
Phiên rà soát 11/10/2026 đạt 19/19 ca outbox; chưa chạy lại app trên thiết bị.

[Flow hiện tại](../docs/CURRENT_FLOW.md) · [Checklist test](../docs/TEST_CHECKLIST.md)
· [Cấu hình môi trường](../DEPLOYMENT.md).
