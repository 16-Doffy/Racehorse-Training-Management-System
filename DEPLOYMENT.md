# Cấu hình, chạy chung backend và deploy

Cập nhật 11/10/2026 theo cấu hình trong repo `654ae43`.
URL được ghi ở đây là cấu hình dự án, chưa xác minh trạng thái deploy trong phiên này.
Flow và test: [CURRENT_FLOW.md](docs/CURRENT_FLOW.md), [TEST_CHECKLIST.md](docs/TEST_CHECKLIST.md).

Groom có [giao diện web test tạm](docs/GROOM_WEB_TESTING.md). Production mặc định
tắt; không đặt `VITE_ENABLE_GROOM_WEB=true` cho bản demo mentor nếu chỉ muốn dùng mobile.

## 1. Chọn môi trường trước khi chạy

| Cách chạy | Database/backend | Web/mobile |
|---|---|---|
| Test riêng local | MongoDB test riêng + server local | Cùng trỏ về server local |
| Dùng dữ liệu chung | Backend Render + MongoDB Atlas | Web local hoặc frontend deploy; mobile trỏ cùng backend |

Nếu web và mobile trỏ hai backend khác nhau, thao tác Groom sẽ không xuất hiện ở
web đang test. Không dùng seed để chuẩn bị test trên dữ liệu chung: script xóa
dữ liệu ở nhiều collection. Tạo ngựa/tài khoản test qua UI hoặc dùng DB test riêng.

## 2. Backend

MongoDB phải hỗ trợ transaction: dùng Atlas hoặc replica set (local có thể một node).
Ghi hoàn thành công việc/trừ kho và ghi kết quả/thành tích/tiền thưởng chạy trong
cùng transaction; MongoDB standalone trả 503 cho hai thao tác này để tránh dữ liệu
dở dang. Cách tạo replica set test riêng ở [AUTOMATED_TESTS.md](docs/AUTOMATED_TESTS.md).
Không đổi service/database hiện có để chuẩn bị test.

`server/.env.example` có cấu hình cơ bản. Không commit file `.env`/connection string.

| Biến | Vai trò |
|---|---|
| `PORT` | Cổng API, mặc định 5000 |
| `MONGO_URI` | MongoDB local hoặc Atlas với tên database rõ ràng |
| `JWT_SECRET` | Khóa ký JWT và chữ ký URL file; đặt giá trị riêng cho môi trường deploy |
| `JWT_EXPIRES_IN` | Thời hạn JWT, mặc định `7d` |
| `CLIENT_URL` | Origin web cho CORS/Socket.io, nhiều origin cách nhau dấu phẩy |
| `CLIENT_URL_PATTERN` | Regex origin bổ sung; mặc định nhận tên miền Vercel bắt đầu bằng tên dự án trong `env.js` |
| `APP_TIMEZONE` | Mặc định `Asia/Ho_Chi_Minh`, dùng để tính ngày/giờ nghiệp vụ |
| `ENABLE_SENSOR_SIMULATOR` | Chỉ bật khi giá trị là `true`; số đo dùng cho demo |

`render.yaml` đề xuất service `racehorse-tms-server`, root `server`, build
`npm install`, start `npm start`, Node 22, health check `/api/v1/health-check`.
`JWT_SECRET` được sinh; `MONGO_URI` và `CLIENT_URL` cần cấu hình trong môi trường
hosting. File khai báo `plan: free`; điều kiện/gói thực tế xem trên tài khoản Render.

Để tạo môi trường mới:

1. Tạo database/user trên Atlas và cấp kết nối cho môi trường backend. Dùng chuỗi
   kết nối do Atlas cung cấp, chỉ rõ database test hoặc database dùng chung.
2. Kết nối repo với Render, dùng Blueprint `render.yaml` hoặc cấu hình tương ứng.
3. Đặt các biến còn thiếu, deploy commit mong muốn.
4. Kiểm tra `/api/v1/health-check`, `/api-docs.json`, đăng nhập và quyền theo role.
   Health check trả OK chỉ xác nhận process HTTP trả lời, chưa xác nhận toàn bộ DB/flow.
5. Tạo tài khoản/dữ liệu phù hợp môi trường; không tự chạy seed trên DB chung.

Backend chung cấu hình trong dự án: `https://racehorse-tms-server.onrender.com`.
Không ghi một commit là “đang deploy” nếu chưa kiểm tra dashboard/log hosting.

## 3. Web

Cấu hình `client/.env` nếu dùng backend chung:

```dotenv
VITE_API_BASE_URL=https://racehorse-tms-server.onrender.com/api/v1
VITE_SOCKET_URL=https://racehorse-tms-server.onrender.com
```

Chạy `npm run dev -w client`. Nếu dùng local, lấy hai URL từ `client/.env.example`.
Sau khi đổi env, khởi động lại Vite; nếu là frontend build/deploy thì build/deploy lại.

Khi deploy frontend từ thư mục `client`: build `npm run build`, output `dist`, đặt
hai biến trên trong môi trường build. `client/vercel.json` có rewrite về
`/index.html` để URL sâu hoạt động khi tải lại. Cho phép origin frontend trong cấu
hình backend và kiểm tra cả API lẫn Socket.io sau deploy.

## 4. Mobile Groom

Mobile cài dependencies riêng, không thuộc npm workspaces root:

```powershell
npm --prefix mobile install
npm --prefix mobile start
```

App mặc định dùng Render. Muốn test local, tạo `mobile/.env`:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:5000/api/v1
```

Thay bằng IP LAN của máy chạy server; điện thoại không dùng `localhost` của PC.
Khởi động lại Expo sau khi đổi env. Với backend LAN, thiết bị phải truy cập được
máy qua mạng và cổng API. Xem [mobile/README.md](mobile/README.md).

## 5. Chính sách CLB

Giá trị thực tế xem qua `GET /api/v1/settings/policy` bằng tài khoản đã đăng nhập.
Màn web đọc policy này; chỉnh qua env server rồi restart/redeploy, chưa có UI sửa.

| Biến | Mặc định | Hành vi |
|---|---|---|
| `POLICY_DIGEST_HARD_MIN` / `POLICY_DIGEST_MIN` | 60 / 90 phút | Bữa thức ăn tinh: chặn bài không nhẹ dưới mốc cứng, cảnh báo dưới mốc mềm |
| `POLICY_FORAGE_DIGEST_MIN` | 60 phút | Cảnh báo sau bữa chỉ có cỏ khô |
| `POLICY_MAX_FAST_HOURS` | 6 giờ | Cảnh báo nhịn ăn lâu |
| `POLICY_PRECHECK_BEFORE_MIN` | 60 phút | Mở pre-check trước giờ tập |
| `POLICY_PRECHECK_AFTER_MIN` | 30 phút | Đóng pre-check sau giờ tập |
| `POLICY_PRECHECK_VALID_HOURS` | 2 giờ | Thời hạn kiểm tra đạt |
| `POLICY_FEVER_C` | 38.6 °C | Thân nhiệt từ mức này chặn tập |
| `POLICY_CLEARANCE_DAYS` | 14 ngày | Hạn khám dùng cho bài nặng/chạy thử |
| `POLICY_MORNING_TIME` / `POLICY_AFTERNOON_TIME` | 07:30 / 16:00 | Giờ mặc định trong kế hoạch mới |
| `AFTERNOON_LIGHT_ONLY` | `true` | Từ 12:00 chỉ cho `walk`/`canter` |
| `POLICY_ICING_AFTER_MIN` / `POLICY_BATHING_AFTER_MIN` | 15 / 45 phút | Việc chăm sóc sau buổi nặng hoàn thành |

Khi demo trial buổi chiều, chọn môi trường test riêng và đặt
`AFTERNOON_LIGHT_ONLY=false` nếu cần. Ghi cấu hình vào biên bản test và trả lại
giá trị ban đầu sau test; không đổi policy chung mà bỏ qua ảnh hưởng người khác.

## 6. Lưu file và xác minh sau deploy

Ảnh sự cố, file khám và upload ảnh/PDF mới lưu bằng **MongoDB GridFS**, không ghi
vào đĩa hosting. URL dạng `/api/v1/files/:id?s=...`; chữ ký sử dụng `JWT_SECRET`.
Đổi khóa có thể làm URL đã lưu không hợp lệ. Đường `/uploads` cũ còn phục vụ file
legacy nếu có; việc chuyển uploader không tự khôi phục file cũ đã mất.

Sau deploy, kiểm tra: API/đăng nhập, phạm vi role, policy/timezone, tải file đã lưu,
Socket.io và một flow có Groom. Nếu hosting tạm ngừng hoặc khởi động chậm, chờ API
sẵn sàng trước khi test. Không dùng giới hạn gói hoặc thời gian cold-start cũ làm
cam kết cho môi trường hiện tại.
