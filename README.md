# Racehorse Training & Management System

Hệ thống Quản lý Huấn luyện Ngựa đua — monorepo React (Vite + Ant Design + Tailwind) và
Node.js/Express + MongoDB, hỗ trợ 5 vai trò: Head Trainer, Veterinarian, Groom/Stable Hand,
Horse Owner, Club Manager.

## Cấu trúc

```
WDP301/
├── client/   # React + Vite + Ant Design + Tailwind (4 vai trò chạy trên web)
├── mobile/   # React Native + Expo — ứng dụng riêng cho Nhân viên Chăm sóc (Groom)
└── server/   # Node + Express + MongoDB (Mongoose) + Socket.io — dùng chung cho cả web và mobile
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

Sau khi chạy `npm run seed` trên máy local:

| Vai trò | Email |
|---|---|
| Club Manager | manager@demo.com |
| Head Trainer | trainer@demo.com |
| Veterinarian | vet@demo.com |
| Groom / Stable Hand | groom@demo.com |
| Horse Owner | owner@demo.com |

Trên bản deploy dùng chung, hệ thống đang chạy bằng tài khoản thật. Các tài khoản demo ở trên đã bị khóa, chỉ còn `manager@demo.com`.

## Luồng nghiệp vụ chính

Tiếp nhận ngựa → phân công → bác sĩ đánh giá → đăng ký giải → kế hoạch → lịch tuần → pre-check → tập → kết thúc/đánh giá/chăm sóc sau tập → chạy thử → quyết định dự giải → kết quả → hồi phục.

Mỗi ngựa có checklist tiếp nhận (`GET /horses/:id/checklist`): chủ, HLV, bác sĩ, chuồng + Groom, khẩu phần, hồ sơ khám, mức vận động được phép, giải, kế hoạch, lịch. Checklist chỉ ra bước tiếp theo, ai làm và vì sao đang bị chặn. Cột "Bước tiếp theo" (danh sách ngựa) và thẻ trên Tổng quan đều lấy từ đây.

### Vòng đời buổi tập

| Trạng thái | Vào bằng | Ghi chú |
|---|---|---|
| `scheduled` | tạo tay / sinh lịch từ kế hoạch | |
| `ready` / `blocked` | pre-check (`POST /training/sessions/:id/pre-check`) | Mở từ 60 phút trước đến 30 phút sau giờ tập, có hiệu lực 2 giờ. Sốt (≥ 38,6 °C) → `blocked` và tự gửi yêu cầu khám. |
| `in_progress` | `POST …/start` | Kiểm tra lại mọi điều kiện tại thời điểm bấm. Cảnh báo vàng phải ghi lý do và được lưu audit. Chặn y tế hoặc vừa ăn thì không bỏ qua được. |
| `completed` | `POST …/end`, hoặc tự kết thúc khi cảm biến mô phỏng chạy hết thời lượng | Lần kết thúc là atomic: bấm 2 lần hay gửi lại thì chỉ 1 lần tạo chăm sóc sau tập và 1 thông báo. |
| `aborted` | `POST …/abort {category, reason}`, bác sĩ khóa tập khi đang chạy, lưu trữ ngựa | Giữ số liệu đã đo. Nhóm `health`/`injury` thì tự yêu cầu khám và đánh dấu giải đã xác nhận cần xem lại. |
| `evaluated` | `PATCH …/evaluation` (chỉ cho buổi đã `completed`) | Chỉ nhận điểm, nhận xét, video. Sửa lại thì audit lưu cả giá trị cũ và mới. |
| `cancelled` | `PUT … {status:'cancelled'}` | Chỉ dùng cho buổi chưa chạy. |
| `missed` | watcher | Quá giờ mà chưa bắt đầu. |

Giờ thực tế và giờ mô phỏng được lưu riêng:

- `actualStartAt`/`actualEndAt`/`actualDurationSec` là thời gian thật trên server.
- `simulatedWorkSec` là thời lượng vận động do bộ mô phỏng cảm biến tính. Bộ này chạy nén thời gian để demo không phải chờ đủ một buổi tập.

### Chạy thử ↔ giải, quyết định dự giải

- Buổi chạy thử gắn với một lượt đăng ký giải (`TrainingSession.raceEntry`):
  - Sinh lịch thì gắn vào giải mục tiêu của kế hoạch.
  - Tạo tay thì HLV chọn giải.
- HLV quyết định dự giải hay rút qua `POST /races/:id/decision`:
  - Hệ thống lưu người quyết định, thời điểm, buổi chạy thử làm căn cứ và lý do.
  - Chưa có buổi chạy thử nào đã chạy thì phải ghi lý do ngoại lệ.
  - Khóa y tế được kiểm tra lại đúng lúc quyết định.
  - Chạy thử đạt không có nghĩa là đủ điều kiện dự giải.
- Sau khi đã xác nhận mà sức khỏe đổi (hồ sơ khám không đạt, khóa/hạ mức tập, sự cố, sốt, dừng buổi vì sức khỏe), lượt đăng ký được đánh dấu `reviewNeeded` và HLV được báo.
- Kết quả giải (`PATCH /races/:id/results`) ghi thành tích và tiền thưởng. Khoản tiền thưởng này có `source: 'race_prize'`, chỉ sửa được qua kết quả giải.

### Trở lại tập

Kết thúc điều trị không có nghĩa là được tập lại. Nếu điều trị kết thúc khi ngựa vẫn đang bị hạn chế, ngựa ở trạng thái "chờ bác sĩ đánh giá cho tập lại". Bác sĩ lập hồ sơ khám, chọn "Mức vận động được phép" (`clearedLevel`: none/light/moderate/high). Mức đang áp dụng là mức chặt nhất giữa các điều trị còn chạy và lần đánh giá gần nhất. Buổi đã xếp vượt mức sẽ bị hủy và HLV được báo.

### Kho

Groom đề xuất bổ sung → Manager duyệt (đặt hàng, kho chưa đổi) → khi hàng về, Manager bấm "Nhận hàng" (`POST /inventory/:id/receive {requestId}`) thì kho mới tăng, đúng một lần.

### Groom (mobile, ngoại tuyến)

- Lúc bấm, app ghi lại `performedAt` (giờ thực hiện) và `clientOpId`.
- Server xét khung giờ của bữa ăn/việc theo `performedAt`, lưu riêng `receivedAt`, và đánh dấu `recordedLate` khi gửi muộn quá 10 phút.
- Gửi lại cùng `clientOpId` thì không bị áp dụng 2 lần, kho chỉ trừ 1 lần.
- Bản ghi cũ hơn 24 giờ bị từ chối, phải ghi tay.

## Chính sách CLB (cấu hình qua biến môi trường của server)

Đây là quy định của CLB, không phải quy định thú y. Màn hình đọc các giá trị này qua `GET /settings/policy`.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `POLICY_DIGEST_HARD_MIN` / `POLICY_DIGEST_MIN` | 60 / 90 | Sau bữa có thức ăn tinh: dưới 60 phút thì chặn tập nặng, dưới 90 phút thì cảnh báo. |
| `POLICY_FORAGE_DIGEST_MIN` | 60 | Bữa chỉ có cỏ khô: chỉ cảnh báo. Tập nhẹ không bao giờ bị chặn vì vừa ăn. |
| `POLICY_MAX_FAST_HOURS` | 6 | Nhịn ăn quá lâu thì cảnh báo. |
| `POLICY_PRECHECK_BEFORE_MIN` / `_AFTER_MIN` / `_VALID_HOURS` | 60 / 30 / 2 | Cửa sổ pre-check và thời gian hiệu lực. |
| `POLICY_FEVER_C` | 38.6 | Ngưỡng sốt. |
| `POLICY_CLEARANCE_DAYS` | 14 | Giấy khám còn hiệu lực cho tập nặng và chạy thử. |
| `POLICY_MORNING_TIME` / `POLICY_AFTERNOON_TIME` | 07:30 / 16:00 | Giờ mặc định của 2 buổi trong kế hoạch mới. |
| `AFTERNOON_LIGHT_ONLY` | `true` | Buổi chiều (từ 12:00) chỉ đi bộ/phi chậm. Kiểm tra khi sinh lịch, tạo tay, đổi giờ và xếp lại. Nếu cần demo chạy thử vào buổi chiều thì đặt `false`. |
| `POLICY_ICING_AFTER_MIN` / `POLICY_BATHING_AFTER_MIN` | 15 / 45 | Chăm sóc sau buổi tập nặng, tính từ lúc buổi thật sự kết thúc. |

Ngoài ra:

- `APP_TIMEZONE` (mặc định `Asia/Ho_Chi_Minh`) quyết định thế nào là "buổi sáng"/"buổi chiều".
- `ENABLE_SENSOR_SIMULATOR=true` bật bộ mô phỏng cảm biến cho buổi đang `in_progress`: mỗi vài giây đẩy nhịp tim/vận tốc qua Socket.io, vượt ngưỡng thì cảnh báo HLV và chủ ngựa.
- Tạo buổi tập không làm cảm biến chạy. Buổi phải được pre-check rồi bấm "Bắt đầu".

## Kiểm thử

```bash
npm test -w server                 # unit test (node --test): vòng đời, chạy thật vs mô phỏng, chính sách, hồi phục...
cd mobile && npm test              # hàng đợi ngoại tuyến của app Groom
cd client && npm run lint && npm run build
```

Các luồng xuyên vai trò (dự giải, trở lại tập, nhận hàng, đồng bộ ngoại tuyến) đã được kiểm tra bằng script gọi API thật trên MongoDB local và Playwright trên giao diện. Các script này không nằm trong repo.

## Tài liệu khác

- Swagger (`/api-docs`, `server/src/docs/openapi.js`) là nguồn chuẩn cho API.
- `API_REQUIREMENTS_PHASE2.md` là danh sách đề xuất ban đầu, một phần đã làm theo cách khác.
- [DEPLOYMENT.md](DEPLOYMENT.md) hướng dẫn deploy.
