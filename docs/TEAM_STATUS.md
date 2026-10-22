# Tình hình dự án: 22/10/2026

Duy cập nhật (Claude soạn). Đọc mục 1 trước: `main` đang đỏ, cần sửa trước buổi demo với mentor ngày 23/10.

## 1. Việc cần làm ngay: 2 test chủ ngựa làm `main` đỏ

Kiểm tra **Test** trên `main` đỏ từ 17:43 ngày 21/10 (commit `a04b163`). Chỉ hỏng 2 test trong `client/e2e/flow.spec.js`; các phần khác qua hết:
- `owner stable page reads the stall from the stable map, not from the old free-text code`
- `owner stable page keeps the stall card title readable on the dark canvas`

**Nguyên nhân:** `a04b163` làm lại trang `/owner/stable` theo kiểu chọn khu, rồi chọn chuồng, rồi xem ngựa trong chuồng. Trang mới chạy đúng: hiện nhãn "A-01 · Khu A", ngựa trong chuồng 3D, ô A-01 trên sơ đồ có tên ngựa. Nhưng 2 test vẫn tìm thẻ có tiêu đề **"Chuồng A-01"**, thứ trang mới không còn (thẻ giờ tên "Chuồng của ngựa bạn").

**Cần:** sửa 2 test theo trang mới, giữ đúng ý cũ:
1. Trang đọc chuồng từ sơ đồ: ô A-01 có "TEST Browser Horse", và không có chữ "A – 01".
2. Tiêu đề thẻ đọc được trên nền tối: kiểm tra trên tiêu đề "Chuồng của ngựa bạn".

**Ai:** Tien sửa (trang đổi ở commit của Tien), Quân xem lại vì đây là test và màn của Quân. Chạy `npm run test:ui` cho xanh rồi mới merge vào `main`.

## 2. Nhánh và cách làm tiếp

- `main` và `NDuy` giờ giống nhau: đã có đủ code của Duy, Quân (PR #9) và Tien (tới 21/10).
- Code tiếp trên nhánh của mình: `git pull origin main` trước (commit hoặc stash việc đang dở trước khi pull).
- Làm xong:
  1. `git pull origin main` lần nữa, sửa xung đột ngay trên nhánh mình;
  2. chạy test (`npm run test:mobile`; sửa web thì thêm `npm run test:ui`);
  3. merge vào `main`. Merge trên GitHub thì chọn **Create a merge commit**, không chọn Squash hay Rebase.
- Ai sửa file của người khác thì nhắn người đó biết. Chủ từng phần:
  - backend và màn Quản lý/HLV: Duy;
  - màn bác sĩ: trunghieu;
  - màn chủ ngựa: Quân;
  - app nhân viên chăm sóc: Tien.

## 3. Thay đổi mới (đã có trên `main`)

### Chuồng (backend). Chi tiết: [STALL_API.md](STALL_API.md)
- `GET /stable/stalls`: mọi vai trò gọi được, server tự ẩn ngựa bạn không được xem (`occupant: { hidden: true }`). `stableBlock` là mã chuồng (A-03…).
- Chỉ Quản lý xếp hoặc đổi chuồng; vai trò khác gọi `POST /stable/assignments` nhận 403.
- Ngựa không tồn tại trả 404, ngựa đã ngừng quản lý trả 409. Hai thao tác cùng lúc trên một chuồng: một bên thành công, bên kia nhận 409 kèm lý do.
- Tien thêm:
  - mỗi chuồng có người chăm sóc riêng (`PUT /stable/stalls/:id/caretaker`), ngựa đặt vào chuồng nào thì nhận người chăm sóc của chuồng đó;
  - sửa hoặc ngừng dùng cả khu (`PUT` / `DELETE /stable/zones/:zone`).
- Nhân viên chăm sóc bị khóa tài khoản hoặc đổi vai trò không còn được tính là đã phân công: bảng sẵn sàng của HLV báo vàng, hàng đợi của Quản lý đếm con ngựa đó.
- Chạy server ở máy mình: MongoDB phải chạy replica set (xếp chuồng dùng transaction). Atlas trên Render đã là replica set.

### Màn Quản lý và HLV
- Xếp chuồng chọn được mọi ngựa (chọn ngựa đã có chuồng là chuyển chuồng). Từ danh sách ngựa, bấm ô **Chuồng** hoặc dùng dòng Chuồng trong form **Sửa hồ sơ**.
- Hàng đợi việc và bảng kiểm tra sẵn sàng: API lỗi thì báo "chưa tải được" kèm nút **Thử lại**, không còn báo "đã xong".
- Màu trên sơ đồ chuồng là **sức khỏe** ngựa, không phải "sẵn sàng tập".

## 4. Việc của từng bạn

| Người | Việc |
|---|---|
| Tien | Sửa 2 test ở mục 1. App: tab chuồng đọc sơ đồ của Quản lý đã xong (`261f64d`) |
| Quân | Xem lại 2 test ở mục 1. Thẻ chuồng cho chủ ngựa đã xong (PR #9) |
| trunghieu | Ngựa chấn thương nổi đỏ trên sơ đồ chuồng (`GET /stable/stalls`); có thể gắn `HorseStallCard` vào chi tiết ngựa phía bác sĩ |

## 5. Demo tự động trên web thật: đã chạy xong

- **21/10:** GitHub chạy trễ 2 tiếng (bắt đầu 07:13 thay vì 05:00), nên chỉ kịp **1 lượt**: ngựa "Test Demo 21/10 …" với các ca đạt, lỡ bữa, chưa đạt và chấn thương. Mọi bước đạt.
- **22/10, 08:11:** nhập kết quả giải "TEST Cúp Demo 22/10". Mọi bước đạt.
- Không còn lượt nào nữa. Đừng sửa hay xóa dữ liệu demo trước buổi gặp mentor ngày 23/10; sau đó Duy dọn.

## 6. Đang chờ Duy chốt (chưa làm)

- Khi khóa hoặc gỡ nhân viên chăm sóc, việc chưa làm và việc mới tự tạo sẽ giao cho ai.
- Kết quả giải có bắt buộc phải qua bước xác nhận tham gia không (dự kiến: có, làm sau 23/10).
- Dọn các bản ghi chuồng cũ của ngựa đã ngừng quản lý trên web thật.
