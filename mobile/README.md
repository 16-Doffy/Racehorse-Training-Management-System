# Racehorse TMS — App Nhân viên Chăm sóc (Groom)

Ứng dụng React Native (Expo) dành riêng cho vai trò **Nhân viên Chăm sóc & Chuồng trại**. Bốn vai
trò còn lại vẫn dùng bản web trong `client/`. Cả hai gọi chung một backend ở `server/`.

## Chạy app

```bash
cd mobile
npm install
npm start          # hiện mã QR trong terminal
```

- Cài **Expo Go** trên điện thoại, quét mã QR đó. Điện thoại và máy tính phải chung một mạng Wi‑Fi
  khi backend chạy ở máy bạn; nếu dùng backend trên Render thì không cần.
- Chạy thử nhanh trên trình duyệt: `npm run web` (camera sẽ không dùng được, phần còn lại xem được).
- Máy ảo Android: `npm run android` (cần Android Studio).

## Backend

Mặc định app gọi backend chung trên Render, không cần cấu hình gì thêm. Muốn trỏ về server chạy ở
máy mình thì tạo file `mobile/.env` (xem `.env.example`):

```
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:5000/api/v1
```

Phải dùng **IP LAN của máy tính**, không dùng `localhost` — trên điện thoại `localhost` là chính
chiếc điện thoại đó. Đổi `.env` xong phải khởi động lại `npm start`.

## Màn hình

| Màn hình | Nội dung |
|---|---|
| Tổng quan | Tiến độ ca làm, bữa ăn kế tiếp, việc cần làm, chuồng phụ trách, nhắc lịch thú y, thông báo |
| Việc | Việc theo ngày, gom theo ngựa; hoàn thành kèm ghi nhận ăn uống/phân/nước; báo sự cố |
| Chuồng | Sơ đồ chuồng theo khu, trạng thái sức khỏe, khóa huấn luyện; bấm vào xem chi tiết ngựa |
| Khẩu phần | Khẩu phần từng bữa đã được HLV duyệt, kèm giờ ăn theo từng con |
| Vật tư | Tồn kho khu vực phụ trách, gửi đề xuất bổ sung, lịch sử đề xuất |
| Báo cáo Sự cố | Danh sách sự cố đã gửi và form báo sự cố mới kèm ảnh chụp |

## Ghi chú kỹ thuật

- Điều hướng: React Navigation (tab dưới + stack cho màn hình chi tiết).
- Dữ liệu: TanStack Query, kéo xuống để làm mới.
- Phiên đăng nhập lưu bằng AsyncStorage nên không phải đăng nhập lại mỗi ca.
- Ảnh sự cố: `expo-image-picker` (chụp mới hoặc chọn từ thư viện), gửi kèm `multipart/form-data`.
- App chỉ cho đăng nhập tài khoản có vai trò `groom`; vai trò khác sẽ bị từ chối ngay ở màn hình
  đăng nhập.
