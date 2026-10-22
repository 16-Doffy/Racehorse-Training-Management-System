# Tình hình dự án: 22/10/2026

Duy cập nhật (Claude soạn). Mục 0: thay đổi API chiều 22/10. Mục 1: `main` đã xanh trở lại.

## 0. Cập nhật chiều 22/10 (đã lên `main`, server đã deploy)

Sửa 8 lỗi từ review 79 (commit `d705f1b` server, `cf6a83f` web). Ảnh hưởng tới màn của các bạn:
- Body hoặc query có khóa bắt đầu bằng `# Tình hình dự án: 22/10/2026

Duy cập nhật (Claude soạn). Mục 1: `main` đã xanh trở lại.

 (toán tử MongoDB) bị từ chối 400.
- `PUT /horses/:id` chỉ ghi các trường của form hồ sơ; trạng thái sức khỏe, lịch chăm sóc (của bác sĩ) và ngừng quản lý (`PATCH /archive`) không đổi qua đây.
- `PUT /races/:id`: lượt đã có kết quả không đổi ngựa, tên giải, ngày đua, cự ly nữa (409); sửa kết quả ở "Cập nhật kết quả".
- `DELETE /horses/:id`: ngựa đã có thu chi, chăm sóc định kỳ, yêu cầu khám hoặc việc đã làm thì không xóa được (409, `canArchive`), dùng "Ngừng quản lý".
- Gỡ người chăm sóc của chuồng rồi gán người mới: việc dở chuyển sang người mới.
- Chủ ngựa, HLV, bác sĩ bị khóa tài khoản: checklist báo "cần người thay", hàng đợi Quản lý đếm con ngựa đó.
- Trang chủ ngựa (Quân): API lỗi thì báo "Chưa tải được danh sách chiến mã" kèm Thử lại, không còn hiện "chưa có chiến mã".

## 1. Đã xử lý: 2 test chủ ngựa làm `main` đỏ

Kiểm tra **Test** trên `main` đỏ từ 17:43 ngày 21/10 vì 2 test của trang `/owner/stable` vẫn tìm thẻ cũ "Chuồng A-01", trong khi commit `a04b163` đã làm lại trang (chọn khu, rồi chọn chuồng, rồi xem ngựa trong chuồng). Trang mới chạy đúng; chỉ test bị cũ.

Claude đã sửa 2 test theo trang mới (commit `1d113f2`, Duy nhờ làm ngay vì sáng 23/10 demo), giữ nguyên ý cũ:
- ô A-01 trên sơ đồ có "TEST Browser Horse", thông tin chuồng bên cạnh ghi A-01, không có chữ "A – 01";
- trên nền tối, thẻ "Chuồng của ngựa bạn" có nền tối, tiêu đề và tên ngựa trong chuồng đọc sáng.

Toàn bộ test giao diện: 40/40 qua. **Quân xem lại** 2 test này khi rảnh (đây là test của Quân). Ai làm lại một trang thì sửa test của trang đó trong cùng lượt, chạy `npm run test:ui` trước khi merge.

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
| Tien | App: tab chuồng đọc sơ đồ của Quản lý đã xong (`261f64d`). Lần sau làm lại trang nào thì sửa test của trang đó cùng lúc |
| Quân | Xem lại 2 test Claude đã sửa ở mục 1 (`1d113f2`). Thẻ chuồng cho chủ ngựa đã xong (PR #9) |
| trunghieu | Ngựa chấn thương nổi đỏ trên sơ đồ chuồng (`GET /stable/stalls`); có thể gắn `HorseStallCard` vào chi tiết ngựa phía bác sĩ |

## 5. Demo tự động trên web thật: đã chạy xong

- **21/10:** GitHub chạy trễ 2 tiếng (bắt đầu 07:13 thay vì 05:00), nên chỉ kịp **1 lượt**: ngựa "Test Demo 21/10 …" với các ca đạt, lỡ bữa, chưa đạt và chấn thương. Mọi bước đạt.
- **22/10, 08:11:** nhập kết quả giải "TEST Cúp Demo 22/10". Mọi bước đạt.
- Không còn lượt nào nữa. Đừng sửa hay xóa dữ liệu demo trước buổi gặp mentor ngày 23/10; sau đó Duy dọn.

## 6. Đang chờ Duy chốt (chưa làm)

- Khi khóa hoặc gỡ nhân viên chăm sóc, việc chưa làm và việc mới tự tạo sẽ giao cho ai.
- Kết quả giải có bắt buộc phải qua bước xác nhận tham gia không (dự kiến: có, làm sau 23/10).
- Dọn các bản ghi chuồng cũ của ngựa đã ngừng quản lý trên web thật.
