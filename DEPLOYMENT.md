# Deploy Backend (dùng chung dữ liệu cho cả team)

Mục tiêu: 1 MongoDB dùng chung (MongoDB Atlas, miễn phí) + 1 backend Node/Express chạy trên
cloud (Render, miễn phí) — mọi teammate chạy client ở máy mình nhưng cùng trỏ vào 1 backend/API,
nên cùng thấy 1 nguồn dữ liệu.

## Bước 1 — Tạo MongoDB Atlas (database dùng chung)

1. Vào https://www.mongodb.com/cloud/atlas/register, tạo tài khoản (có thể đăng nhập bằng Google).
2. Tạo project mới → "Build a Database" → chọn gói **M0 Free**.
3. Tạo database user: **Database Access** → "Add New Database User" → đặt username/password
   (nhớ lại, sẽ dùng trong connection string; **không dùng ký tự `@ : /` trong password** để khỏi
   phải encode URL).
4. Cho phép truy cập: **Network Access** → "Add IP Address" → chọn **Allow Access from Anywhere**
   (`0.0.0.0/0`). Bắt buộc vì Render (gói free) không có IP tĩnh.
5. Lấy connection string: **Database** → "Connect" → "Drivers" → copy chuỗi dạng:
   ```
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   ```
   Thêm tên database vào cuối (trước dấu `?`), ví dụ:
   ```
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/wdp301_racehorse?retryWrites=true&w=majority
   ```
   → đây chính là giá trị `MONGO_URI` sẽ dùng ở bước 2. **Giữ kín chuỗi này** (có password) —
   không paste vào chat công khai hay commit vào git.

## Bước 2 — Deploy backend lên Render

Repo đã có sẵn `render.yaml` ở gốc để deploy theo kiểu Blueprint (đỡ phải tự điền form):

1. Vào https://render.com, đăng ký/đăng nhập bằng GitHub (chọn đúng tài khoản chứa repo
   `16-Doffy/Racehorse-Training-Management-System`).
2. **New +** → **Blueprint** → chọn repo này → Render tự đọc `render.yaml` và đề xuất tạo service
   `racehorse-tms-server` (root dir `server`, build `npm install`, start `npm start`).
3. Bấm **Apply** để tạo service — lần đầu sẽ deploy fail vì chưa có `MONGO_URI`, không sao.
4. Vào service vừa tạo → **Environment** → thêm 2 biến (2 biến này để `sync: false` trong
   `render.yaml` nên phải điền tay, không tự sinh):
   - `MONGO_URI` = chuỗi connection string đã copy ở Bước 1.
   - `CLIENT_URL` = `http://localhost:5173` (origin mà teammate chạy client cục bộ — nếu sau
     này deploy thêm frontend, thêm origin đó vào, cách nhau bởi dấu phẩy, ví dụ
     `http://localhost:5173,https://ten-frontend.vercel.app`).
5. Bấm **Manual Deploy** → **Deploy latest commit** (hoặc Render tự redeploy khi lưu env var).
6. Sau khi deploy xong, Render cho một URL dạng `https://racehorse-tms-server.onrender.com`.
   Kiểm tra: mở `https://racehorse-tms-server.onrender.com/api/v1/health-check` phải trả về
   `{"success":true,"message":"API is running."}`.
7. Chạy seed dữ liệu mẫu 1 lần trên DB Atlas (chạy từ máy bạn, trỏ tạm `MONGO_URI` sang Atlas):
   ```powershell
   $env:MONGO_URI = "mongodb+srv://...(chuỗi ở Bước 1)..."
   D:\npm-global\npm.cmd run seed
   ```
   (Xoá biến `$env:MONGO_URI` sau đó hoặc mở terminal mới để không ảnh hưởng lần chạy local sau.)

## Bước 3 — Teammate trỏ client vào backend chung

Mỗi teammate chỉ cần sửa `client/.env` (không phải sửa code):
```
VITE_API_BASE_URL=https://racehorse-tms-server.onrender.com/api/v1
VITE_SOCKET_URL=https://racehorse-tms-server.onrender.com
```
Rồi chạy client như bình thường (`npm run dev -w client`). Không cần chạy server cục bộ, không
cần cài MongoDB cục bộ nữa — mọi người cùng thấy chung dữ liệu (cùng 5 tài khoản demo, cùng danh
sách ngựa...).

## Lưu ý quan trọng (giới hạn của gói free)

- **Render free tier "ngủ" sau ~15 phút không có traffic** — lần gọi API đầu tiên sau đó sẽ chậm
  (10-30s để "đánh thức"), là bình thường, không phải lỗi.
- **Ảnh báo cáo sự cố (Groom upload) sẽ MẤT khi Render deploy lại/khởi động lại** — ổ đĩa free
  tier là ephemeral (không lưu trữ vĩnh viễn). Với đồ án nộp bài thì chấp nhận được; nếu cần lưu
  ảnh vĩnh viễn, việc cần làm ở giai đoạn sau là đổi `multer` sang lưu lên Cloudinary/S3 thay vì
  đĩa cục bộ (`server/src/middlewares/uploadMiddleware.js`).
- MongoDB Atlas M0 free giới hạn 512MB — thoải mái cho dữ liệu demo/đồ án.
