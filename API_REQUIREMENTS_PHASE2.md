# DANH SÁCH YÊU CẦU API BỔ SUNG (PHASE 2)
Dự án: Racehorse Training Management System

> **Lưu ý:** Đây là danh sách đề xuất ban đầu. Hệ thống không còn bám theo danh sách này: một số mục đã được làm theo cách khác, ví dụ đăng ký và kết quả giải nằm ở `/races`, quyết định dự giải ở `POST /races/{id}/decision`, nhận hàng ở `POST /inventory/{id}/receive`. Ô đánh dấu bên dưới cũng không được cập nhật. Muốn biết API hiện có, xem Swagger (`/api-docs`, nguồn: `server/src/docs/openapi.js`).

Dưới đây là danh sách tổng hợp toàn bộ các API cần phát triển thêm cho Phase 2 để hoàn thiện 100% các luồng nghiệp vụ thực tế.

## 1. Nhóm Xác thực & Hồ sơ người dùng (Auth & Profile)
- [ ] `POST /auth/forgot-password`: Yêu cầu cấp lại mật khẩu (Gửi email chứa token).
- [ ] `POST /auth/reset-password`: Đổi mật khẩu dựa trên token khôi phục.
- [ ] `PUT /auth/change-password`: Đổi mật khẩu cho tài khoản đang đăng nhập.
- [ ] `PUT /auth/profile`: Cập nhật thông tin cá nhân (Số điện thoại, địa chỉ, ảnh đại diện).
- [ ] `POST /auth/logout`: Đăng xuất (xóa/đưa token vào blacklist).
- [ ] `PATCH /users/{id}/notification-preferences`: Bật/tắt tùy chọn nhận thông báo của từng người dùng.

## 2. Nhóm Quản lý File & Tài liệu (Media Upload)
- [ ] `POST /upload/image`: API dùng chung để upload file ảnh lên hệ thống (S3/Cloudinary) và trả về đường link ảnh (URL).
- [ ] `POST /horses/{id}/documents`: Tải lên tài liệu pháp lý của ngựa (Giấy khai sinh, Hộ chiếu, Giấy chứng nhận giống).
- [ ] `POST /health/records/{id}/attachments`: Tải lên tài liệu y tế đính kèm (Ảnh X-Quang, kết quả xét nghiệm, đơn thuốc scan).

## 3. Nhóm Giải đua & Nài ngựa (Races & Jockeys)
- [ ] `POST /races/{id}/register`: HLV / Chủ ngựa đăng ký một con ngựa cụ thể tham gia giải đua.
- [ ] `PATCH /races/{id}/results`: Cập nhật kết quả chung cuộc của giải đua (Thứ hạng ngựa, thời gian chạy, tiền thưởng).
- [ ] `GET /jockeys`: Lấy danh sách Nài ngựa (Jockeys) trong hệ thống.
- [ ] `GET /jockeys/{id}/performance`: Xem lịch sử và thống kê thành tích của một nài ngựa.

## 4. Nhóm Quản lý Ngựa chuyên sâu (Advanced Horse Data)
- [ ] `GET /horses/{id}/lineage`: Lấy dữ liệu cây gia phả của ngựa (Ngựa cha - Sire, Ngựa mẹ - Dam, các thế hệ trước).
- [ ] `POST /horses/{id}/transfer-ownership`: Chuyển nhượng quyền sở hữu ngựa cho một Owner khác.
- [ ] `PATCH /horses/{id}/retire`: Chuyển trạng thái ngựa sang "Nghỉ hưu" (Không thi đấu, không tập luyện).

## 5. Nhóm Thống kê Biểu đồ (Analytics Dashboards)
- [ ] `GET /reports/owner/training-chart`: API trả về mảng dữ liệu (time-series) tiến độ tập luyện của ngựa theo từng tháng (Dùng để vẽ Bar Chart ở Dashboard Chủ ngựa).
- [ ] `GET /reports/finance-chart`: API trả về dữ liệu tổng hợp dòng tiền Thu/Chi theo từng tháng/quý (Dùng để vẽ biểu đồ tài chính).
- [ ] `GET /search?q={keyword}`: Tìm kiếm toàn cầu (Global Search) quét qua toàn bộ dữ liệu Ngựa, User, Giải đua để trả về kết quả nhanh.

## 6. Nhóm Xuất dữ liệu & Hóa đơn (Export & Invoicing)
- [ ] `POST /finance/invoices/generate`: Chốt sổ và tự động tạo Hóa đơn (Invoice) tổng hợp chi phí cuối tháng cho các Chủ ngựa.
- [ ] `GET /export/finance`: Xuất sổ sách báo cáo tài chính ra file Excel (`.csv`) hoặc PDF.
- [ ] `GET /export/horses`: Xuất danh sách tổng hợp tất cả các ngựa ra file Excel.

## 7. Nhóm Hệ thống & Thông báo đẩy (System & Notifications)
- [ ] `GET /settings` & `PUT /settings`: Quản lý các cấu hình lõi của hệ thống (Loại tiền tệ, Sức chứa tối đa của chuồng trại).
- [ ] `POST /users/device-tokens`: Lưu lại token thiết bị (FCM Token) để server có thể bắn Push Notification ra màn hình điện thoại/trình duyệt.

## 8. Nhóm Tự động hóa ngầm (Backend Cronjobs / Triggers)
*(Phần này FE không cần gọi API nhưng BE phải tự viết logic ngầm)*
- [ ] **Auto-Deduct Inventory:** Tự động trừ số lượng thức ăn/thuốc trong bảng `Inventory` khi Groom hoàn thành một `DailyTask` (Cho ăn/Tiêm thuốc).
- [ ] **Readiness Calculator:** Cronjob chạy mỗi rạng sáng để tự động tính toán và cập nhật trạng thái "Sẵn sàng tập luyện" cho từng chú ngựa (Dựa vào chỉ số y tế, nhịp tim hôm trước, dinh dưỡng).
