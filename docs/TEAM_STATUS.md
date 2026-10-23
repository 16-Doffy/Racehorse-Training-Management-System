# Tình hình dự án: 23/10/2026

Duy cập nhật (Claude soạn). Mục 0b: lịch ăn cả kỳ kế hoạch, 23/10, đã lên `main`. Mục 0a: kiểm tra bữa ăn trước buổi tập, tối 22/10. Mục 0: thay đổi API chiều 22/10. Mục 1: `main` đã xanh trở lại.

## 0b. Lịch ăn, lịch tập và chăm sóc theo ngựa (23/10, đã lên `main`)

Đã triển khai lên `main` để Render cập nhật backend và client. Khung lịch ăn và thời khóa biểu theo ngựa hoạt động bình thường sau khi deploy hoàn tất.

- HLV xem lịch ăn cho toàn kỳ kế hoạch, gồm ngày nghỉ và khẩu phần theo vai trò từng bữa. Xác nhận lịch một lần qua `GET /feeding/calendar/:planId` và `POST /feeding/calendar/:planId/confirm`; lịch đã xác nhận có thể sửa từng bữa tương lai. `GET /feeding/suggest` gợi ý món hiện có trong kho; `GET /feeding/timetable` trả thời khóa biểu ăn theo tuần và trạng thái thực hiện.
- Tab Công việc chăm sóc của HLV nhóm theo ngựa, vẫn xem được người làm, giờ và trạng thái từng việc.
- Lịch tập hiện buổi dự kiến ở các tuần chưa xếp; khi bác sĩ cho tập lại, lịch tự xếp bù các buổi bị hủy do khóa sức khỏe. Buổi HLV tự hủy vẫn giữ quyết định đó.
- Kế hoạch tập trả đánh giá phong độ cho giải đua dựa trên số buổi đến hạn, mức đạt chỉ tiêu, chạy thử và tình trạng sức khỏe. Trang Giải đua nêu lý do khi lượt đã xác nhận cần xem lại sau khi ngựa bị khóa tập.
- Nhân viên chỉ ghi nhận bữa ăn từ giờ hẹn; quy tắc này có hiệu lực khi server mới được triển khai từ `main`.

## 0a. Bữa ăn trước buổi tập (tối 22/10, đã lên `main`)

- **Loại thức ăn** (`feedType` của vật tư nhóm Thức ăn): `concentrate` (cám, ngũ cốc, viên), `forage` (cỏ, rơm), `supplement` (dầu, khoáng, vitamin). Manager chọn trong form kho; để trống thì server đoán theo tên. Gửi `feedType` cho vật tư không phải thức ăn, hoặc giá trị khác 3 loại trên: 400.
- Kiểm tra Dinh dưỡng của buổi tập xét theo loại đó:
  - Bữa có thức ăn tinh: bài vừa/nặng bị chặn 60 phút. Ăn thêm cỏ sau đó không rút ngắn thời gian chờ.
  - Bữa chỉ có cỏ: chỉ cảnh báo.
  - Bữa chỉ có thức ăn bổ sung: không tính là một bữa ăn.
- Giờ ăn tính theo lúc nhân viên thực sự cho ăn. Ví dụ bữa hẹn 20:30 mà cho ăn sớm lúc 20:11 thì tính từ 20:11.
- Trong ngày có bữa bị lỡ mà chưa ăn bù: cảnh báo vàng kèm nút "Báo nhân viên cho ăn bù", kể cả khi sau đó ngựa đã ăn bữa khác. Đã báo cho ăn bù thì bảng ghi "đang chờ nhân viên".
- **Lịch tập tự xếp như thời khóa biểu:** kế hoạch đang áp dụng luôn có sẵn buổi tập tuần này và tuần sau (xếp ngay khi áp dụng, rồi kiểm lại mỗi giờ). Buổi HLV đã hủy không bị xếp lại. Nút "Sinh lịch tuần" đổi thành "Xếp lại tuần" (xếp các buổi còn trống, kể cả buổi đã hủy). Trên server, đặt `AUTO_SCHEDULE_PLANS=false` thì tắt (test harness đã tắt sẵn).
- `GET /stable/tasks` trả thêm `completedBy` và `skippedBy` là `{ _id, name }`. Bảng Công việc chăm sóc của HLV hiện "Nguyễn Văn Sóc cho ăn lúc 20:11".
- Trang Buổi tập: bấm tên ngựa thì lọc lịch của riêng ngựa đó (link "Mở hồ sơ ngựa" ở bên cạnh). Bảng Giải đua: kết quả nằm dưới cột "Quyết định · kết quả", cột nút không còn đè lên.
- **Khẩu phần (HLV):** cột "Người cho ăn" (nhân viên của chuồng + tình trạng bữa hôm nay); form hiện nhân viên cho ăn và gợi ý bữa theo cân nặng + giai đoạn kế hoạch (`client/src/features/stable/rationSuggestion.js`).
- **Lập kế hoạch:** khoảng km/tuần tham khảo theo nhóm cự ly giải, bảng tham khảo và nút điền (`client/src/features/training/planGuide.js`).
- **Cảm biến mô phỏng:** `POST /training/sessions/:id/simulate { scenario: 'tired' | 'injury' }` (HLV, buổi đang chạy, chỉ khi `ENABLE_SENSOR_SIMULATOR=true`). `injury` thì hệ thống tự dừng buổi (`abortCategory: 'injury'`), gửi bác sĩ yêu cầu khám ưu tiên cao, giao nhân viên việc chườm lạnh, báo HLV và chủ ngựa; socket `session:completed` có `aborted: true`. Session có thêm `simScenario`.
- **Theo dõi trực tiếp:** từ 3 ngựa chạy cùng lúc thì hiện bảng gọn, mỗi ngựa một dòng.

## 0. Cập nhật chiều 22/10 (đã lên `main`, server đã deploy)

Sửa 8 lỗi từ review 79 (commit `d705f1b` server, `cf6a83f` web). Ảnh hưởng tới màn của các bạn:
- Body hoặc query có khóa bắt đầu bằng `$` (toán tử MongoDB) bị từ chối 400.
- `PUT /horses/:id` chỉ ghi các trường của form hồ sơ; trạng thái sức khỏe, lịch chăm sóc (của bác sĩ) và ngừng quản lý (`PATCH /archive`) không đổi qua đây.
- `PUT /races/:id`: lượt đã có kết quả không đổi ngựa, tên giải, ngày đua, cự ly nữa (409); sửa kết quả ở "Cập nhật kết quả".
- `DELETE /horses/:id`: ngựa đã có thu chi, chăm sóc định kỳ, yêu cầu khám hoặc việc đã làm thì không xóa được (409, `canArchive`), dùng "Ngừng quản lý".
- Gỡ người chăm sóc của chuồng rồi gán người mới: việc dở chuyển sang người mới.
- Chủ ngựa, HLV, bác sĩ bị khóa tài khoản: checklist báo "cần người thay", hàng đợi Quản lý đếm con ngựa đó.
- Trang chủ ngựa (Quân): API lỗi thì báo "Chưa tải được danh sách chiến mã" kèm Thử lại, không còn hiện "chưa có chiến mã".
- Khóa (hoặc đổi vai trò) nhân viên chăm sóc còn giữ chuồng, ngựa hay việc: `PUT`/`DELETE /users/:id` trả 409 (`needsReplacement`) cho tới khi gửi `replacementCaretaker`; chuồng, ngựa và việc chưa làm chuyển sang người thay cùng lúc (commit `3ed268f`). Màn Nhân sự có hộp thoại "Chọn người thay".
- Form chạy thử hiện cự ly giải và cảnh báo khi ngắn hơn 75% cự ly giải (vẫn lưu được).

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

- Kết quả giải có bắt buộc phải qua bước xác nhận tham gia không (dự kiến: có, làm sau 23/10).
- Dọn các bản ghi chuồng cũ của ngựa đã ngừng quản lý trên web thật.
