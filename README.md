# Racehorse Training & Management System

Hệ thống Quản lý Huấn luyện Ngựa đua — monorepo React (Vite + Ant Design + Tailwind) và
Node.js/Express + MongoDB, hỗ trợ 5 vai trò: Head Trainer, Veterinarian, Groom/Stable Hand,
Horse Owner, Club Manager.

## Cấu trúc

```
WDP301/
├── client/   # React + Vite + Ant Design + Tailwind
└── server/   # Node + Express + MongoDB (Mongoose) + Socket.io
```

Xem chi tiết kiến trúc, data model và phạm vi triển khai từng giai đoạn tại kế hoạch đã lưu
trong quá trình phát triển (data model, API structure, realtime alerts, core flow theo role).

**Muốn cả team dùng chung 1 database/backend thay vì mỗi người chạy Mongo/server local riêng?**
Xem [DEPLOYMENT.md](DEPLOYMENT.md) (MongoDB Atlas + Render, có `render.yaml` deploy sẵn).

## Yêu cầu môi trường

- Node.js 18+ (đã test với Node 22)
- MongoDB đang chạy tại `mongodb://127.0.0.1:27017` (Windows service `MongoDB` hoặc Docker)

## Cài đặt & chạy

```bash
npm install                # cài dependencies cho cả root, client, server (npm workspaces)
cp server/.env.example server/.env
cp client/.env.example client/.env

npm run seed                # tạo 5 tài khoản demo + dữ liệu mẫu
npm run dev                 # chạy song song server (:5000) và client (:5173)
```

Mở http://localhost:5173

## Tài liệu API (Swagger)

- Local: http://localhost:5000/api-docs
- Bản deploy dùng chung: https://racehorse-tms-server.onrender.com/api-docs

Toàn bộ endpoint (auth, horses, training, health, stable, feeding, inventory, races, finance,
notifications, audit-logs) đều liệt kê ở đây kèm request/response mẫu — dùng nút **Authorize**
trên Swagger UI (dán JWT lấy từ `POST /auth/login`) để gọi thử trực tiếp các API cần đăng nhập.

## Tài khoản demo (mật khẩu chung: `123456`)

| Vai trò | Email |
|---|---|
| Club Manager | manager@demo.com |
| Head Trainer | trainer@demo.com |
| Veterinarian | vet@demo.com |
| Groom / Stable Hand | groom@demo.com |
| Horse Owner | owner@demo.com |

## Trạng thái triển khai

Đây là bản **full scaffold**: kiến trúc, xác thực JWT + RBAC, toàn bộ data model và API cho cả
5 vai trò đã sẵn sàng. Mỗi role có **1 luồng nghiệp vụ cốt lõi chạy đầy đủ end-to-end**:

| Role | Core flow đã hoàn thiện |
|---|---|
| Club Manager | Quản lý tài khoản & phân quyền (RBAC) — `/admin/users` |
| Head Trainer | Giáo án + Buổi tập + đánh giá phong độ — `/training/plans`, `/training/sessions` |
| Veterinarian | Hồ sơ khám bệnh + Điều trị + **Khóa huấn luyện khẩn cấp** — `/health/records`, `/health/treatments` |
| Groom | Công việc hàng ngày + báo cáo sự cố kèm ảnh — `/stable/my-tasks` |
| Horse Owner | Hồ sơ/pedigree/thành tích ngựa — `/horses` |

Các module còn lại (khẩu phần ăn, vật tư, đăng ký giải đua, báo cáo tài chính, sơ đồ chấn thương
3D...) đã có API/data model đầy đủ, giao diện chi tiết sẽ hoàn thiện ở giai đoạn kế tiếp.

### Realtime alert demo

`ENABLE_SENSOR_SIMULATOR=true` (mặc định trong `.env.example`) sẽ mô phỏng dữ liệu nhịp
tim/vận tốc mỗi 5 giây cho các buổi tập ở trạng thái `in_progress`. Khi vượt ngưỡng, hệ thống
tạo Notification và đẩy realtime qua Socket.io tới Head Trainer / chủ sở hữu ngựa đó — thử tạo
một buổi tập với trạng thái "Đang diễn ra" ở `/training/sessions` để xem cảnh báo xuất hiện.

## Kiểm thử đã xác minh

- `npm run build` (client) build thành công, không lỗi biên dịch.
- Server khởi động, kết nối MongoDB, seed dữ liệu mẫu thành công.
- Đăng nhập + RBAC: gọi API sai vai trò trả về 403 chính xác.
- Luồng khóa huấn luyện: Veterinarian khóa ngựa → Head Trainer tạo buổi tập cho ngựa đó bị chặn
  với lỗi 409 rõ ràng.

Việc kiểm thử giao diện trực quan (mở trình duyệt, click qua từng màn hình) chưa được tự động
hoá trong môi trường này — khuyến nghị chạy `npm run dev` và kiểm tra thủ công theo từng tài
khoản demo ở trên.
