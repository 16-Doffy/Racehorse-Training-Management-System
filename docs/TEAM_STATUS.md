# Tình hình dự án: 21/10/2026

Duy cập nhật (Claude soạn). Đọc mục 1 trước: có một việc cần người làm sáng nay.

## 1. Việc cần làm sáng 21/10: đưa code mới lên `main`

Code mới đã nằm trên nhánh `NDuy` (2 commit: `a5bcbbd` server, `6507e13` web), chưa lên `main`. Lên `main` thì Render tự deploy lại server. Không deploy lúc máy đang tự chạy demo trên web thật, nên phải chờ.

**Khi nào:** sau 10:00 ngày 21/10, và chỉ khi trên GitHub → tab **Actions** → **Demo flows (live)** không còn lượt nào đang chạy (biểu tượng vàng). Nếu còn thì chờ nó xong.

**Ai:** bạn nào có quyền đẩy lên `main` và đang thức.

**Cách 1, trên web GitHub:**
1. Mở https://github.com/16-Doffy/Racehorse-Training-Management-System/compare/main...NDuy
2. Bấm **Create pull request**, chờ kiểm tra **Test** xanh.
3. Bấm **Merge pull request**, chọn kiểu **Create a merge commit**. Không chọn Squash hay Rebase: hai kiểu đó tạo commit mới, và nhánh nào đã kéo NDuy về sẽ bị báo xung đột giả khi merge sau.

**Cách 2, bằng git** (chỉ dùng được khi `main` chưa có commit nào mới hơn; nếu bị từ chối thì dùng cách 1):
```
git fetch origin
git push origin origin/NDuy:main
```

**Kiểm tra sau khi lên** (chờ Render deploy xong, khoảng 5 phút): đăng nhập Quản lý → **Chuồng trại & NV chăm sóc** → bấm một chuồng trống → **Xếp ngựa vào chuồng này**. Danh sách ngựa phải chọn được, không còn xám hết.

Có lỗi thì báo Duy, đừng sửa thẳng trên `main`.

**Không** merge gì có sửa `server/` vào `main` trong khung **06:00–09:30 ngày 22/10**: máy nhập kết quả giải lúc đó.

### Kéo NDuy về nhánh mình để code tiếp (ví dụ nhánh Tien)

Làm được, không cần chờ:
```
git checkout Tien
git pull origin NDuy
```
- Nhánh `Tien` trên GitHub đang trùng với `main` cũ (`b37b521`), nên lệnh trên chỉ tua nhánh tới, không có xung đột. Đã ghép thử nhánh Quân (`feature-horse-owner`) với NDuy lúc 01:00 ngày 21/10: cũng sạch.
- Thứ tự sau đó: NDuy lên `main` trước (mục trên), nhánh của bạn merge vào `main` sau. Git nhận ra các commit của NDuy đã có sẵn ở cả hai bên, nên chỉ báo xung đột nếu bạn sửa trùng đúng những dòng Duy vừa sửa.
- Các file Duy vừa sửa (để ý nếu bạn cũng đụng vào):
  - `client/e2e/flow.spec.js`;
  - `features/horses/HorseListPage.jsx`, `features/dashboard/DashboardPage.jsx`, `ManagerQueueCard.jsx`;
  - `features/stable/StableAssignmentPage.jsx`, `HorseStallCard.jsx`, `stall3d/stallStatus.js`;
  - `features/training/ReadinessPanel.jsx`;
  - `server/src/modules/stable/*`, `horses/horses.controller.js`, `horses/checklist.service.js`, `training/readiness.service.js`.
- **Đừng merge nhánh đã kéo NDuy vào `main` trước khi NDuy lên `main`** (trước 10:00 ngày 21/10). Nhánh đó giờ có sửa `server/`, merge sớm sẽ làm Render deploy lại giữa lúc máy đang chạy demo.

## 2. Thay đổi mới

### Backend (mọi màn đều chịu ảnh hưởng)
- **Chuồng trên sơ đồ:** đọc [STALL_API.md](STALL_API.md).
  - `GET /stable/stalls`: mọi vai trò gọi được. Server tự ẩn ngựa bạn không được xem: chuồng đó trả `occupant: { hidden: true }`.
  - `stableBlock` giờ là mã chuồng (A-03…). Màn nào đang hiện `stableBlock` không phải sửa.
  - Chỉ Quản lý xếp hoặc đổi chuồng. Vai trò khác gọi `POST /stable/assignments` nhận 403.
- **Xếp chuồng chặt hơn:**
  - Ngựa không tồn tại trả 404; ngựa đã ngừng quản lý trả 409.
  - Hai thao tác cùng lúc trên một chuồng (xếp ngựa, bảo trì, ngừng dùng chuồng, ngừng quản lý ngựa): một bên thành công, bên kia nhận 409 kèm lý do.
- **Nhân viên chăm sóc bị khóa tài khoản hoặc đổi vai trò:** không còn được tính là đã phân công.
  - Bảng sẵn sàng của HLV báo vàng.
  - Danh sách việc của ngựa ghi thiếu người chăm sóc.
  - Hàng đợi của Quản lý đếm con ngựa đó.
- **Chạy server ở máy mình:** xếp chuồng giờ dùng transaction, nên MongoDB phải chạy replica set (việc chăm sóc, kho và kết quả giải vốn đã cần). Atlas trên Render đã là replica set.

### Màn Quản lý và HLV (Duy)
- Form xếp chuồng chọn được mọi ngựa, mỗi con kèm vị trí hiện tại. Chọn ngựa đã có chuồng là chuyển chuồng và giữ nguyên người chăm sóc.
- Danh sách ngựa của Quản lý:
  - bấm ô **Chuồng** để xếp hoặc đổi chuồng;
  - form **Sửa hồ sơ** có thêm dòng Chuồng kèm nút đổi.
- Hàng đợi việc của Quản lý và bảng kiểm tra sẵn sàng: API lỗi thì báo "chưa tải được" và có nút **Thử lại**, không còn báo "đã xong".
- Màu trên sơ đồ chuồng là **sức khỏe** ngựa ("Sức khỏe đủ điều kiện"), không phải "Sẵn sàng tập".

## 3. Việc của từng bạn (không gấp, làm sau demo cũng được)

| Người | Màn | Việc | Dùng gì |
|---|---|---|---|
| trunghieu | Bác sĩ | Ngựa chấn thương nổi đỏ trên sơ đồ chuồng; cần chuyển ngựa sang khu cách ly thì báo Quản lý | `GET /stable/stalls`; component `HorseStallCard` gắn vào chi tiết ngựa |
| Quân | Chủ ngựa | Đã làm trên nhánh `feature-horse-owner` (`a2792dc`, `a9fb352`: ngựa trong chuồng ở trang ngựa và trang chuồng, mã chuồng trên dashboard). Còn lại: merge vào `main` sau khi NDuy lên | `HorseStallCard`, `GET /stable/stalls/by-horse/:id` |
| Tien | App NV chăm sóc | Danh sách "chuồng của tôi"; mã chuồng đã có sẵn trong `stableBlock` của từng việc | lọc `GET /stable/stalls` theo `occupant.caretaker._id` |

Component dùng chung nằm ở `client/src/features/stable/` (`HorseStallCard`, `Stall3D`, `StableMapBoard`, `stallApi`). Cách gắn: xem [STALL_API.md](STALL_API.md), mục "Gắn vào màn web của bạn".

## 4. Máy đang tự chạy trên web thật (đừng sửa hay xóa dữ liệu này)

- **21/10, 05:00 đến khoảng 10:00:** workflow **Demo flows (live)** chạy 4 lượt. Mỗi lượt tạo ngựa "Test Demo 21/10 …" và cho chúng đi qua đủ các vai trò: cho ăn, tập, đánh giá, chạy thử, xác nhận dự giải, có ca lỡ bữa, ca chưa đạt, ca chấn thương.
- **22/10, 06:00** (dự phòng 09:00): nhập kết quả giải "TEST Cúp Demo 22/10".
- **Xem tiến độ:** GitHub → Actions → Demo flows (live). Trên web, bạn chỉ thấy những ngựa demo được gán cho tài khoản của mình.
- Sau buổi demo với mentor ngày 23/10, Duy sẽ dọn số dữ liệu này.

## 5. Đang chờ Duy chốt (chưa làm)

- Khi khóa hoặc gỡ nhân viên chăm sóc, việc chưa làm và việc mới tự tạo sẽ giao cho ai.
- Kết quả giải có bắt buộc phải qua bước xác nhận tham gia không (dự kiến: có, làm sau 23/10).
- Dọn các bản ghi chuồng cũ của ngựa đã ngừng quản lý trên web thật.
