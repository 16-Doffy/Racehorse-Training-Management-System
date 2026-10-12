# Web — Racehorse TMS

React + Vite + Ant Design + Tailwind, dùng cho Manager, Head Trainer, Vet và Owner.
Groom dùng app `mobile/` (điện thoại, hoặc trình duyệt qua `npm --prefix mobile run web`); tài khoản Groom
đăng nhập web này chỉ thấy hướng dẫn mở app.

## Chạy

Từ thư mục gốc, dùng Node.js 22.12+:

```powershell
npm install
Copy-Item client/.env.example client/.env
npm run dev -w client
```

`.env.example` trỏ backend local. Nếu dùng Render, cấu hình `VITE_API_BASE_URL`
và `VITE_SOCKET_URL` theo [DEPLOYMENT.md](../DEPLOYMENT.md). Khởi động lại Vite
sau khi đổi env. Mặc định web ở `http://localhost:5173`.

## Màn hình theo vai trò

| Vai trò | Route chính |
|---|---|
| Manager | `/horses`, `/admin/users`, `/admin/stables`, `/inventory`, `/finance`, `/admin/reports`, `/admin/audit-logs` |
| HLV | `/horses`, `/training/plans`, `/training/sessions`, `/stable/tasks`, `/races` |
| Vet | `/veterinarian`, `/veterinarian/horses`, `/veterinarian/injuries`, `/veterinarian/treatments`, `/veterinarian/prescriptions`, `/veterinarian/inventory`, `/veterinarian/schedules` |
| Owner | `/horses`, `/owner/health`, `/owner/training`, `/owner/stable`, `/owner/races`, `/owner/evaluations`, `/finance` |
| Groom | Không có màn hình web: `/` hiện hướng dẫn mở app `mobile/` |

`/` hiển thị Tổng quan theo role; `/profile` là hồ sơ chung.
Route và menu hiện tại nằm ở `src/router/AppRouter.jsx`, `src/layouts/menuConfig/index.jsx`.
Quyền route không thay thế quyền API và phạm vi ngựa ở server.

## Flow và kiểm tra

- [Flow hiện tại](../docs/CURRENT_FLOW.md): thứ tự thao tác và điều kiện chuyển bước.
- [Checklist test](../docs/TEST_CHECKLIST.md): test xuyên vai trò, chưa đánh dấu E2E đạt.
- `npm run lint -w client`: oxlint.
- `npm run build -w client`: build vào `client/dist`.

Dashboard Owner còn biểu đồ/KPI và định giá giả; thẻ tóm tắt từng ngựa đọc API thật.
Không dùng số dashboard cũ để xác nhận kết quả test.
