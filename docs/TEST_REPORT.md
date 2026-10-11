# Kết quả test local — 11/10/2026

Chạy trên Windows/Node.js với base commit `654ae43` và thay đổi local trong phiên
này. Backend/API dùng MongoDB 8.0 replica set riêng trên cổng 27018; mỗi bộ test
tạo database `wdp301_test_*` mới rồi xóa sau khi chạy. Không test trên Atlas/Render.
Simulator tắt, `APP_TIMEZONE=Asia/Ho_Chi_Minh`, `AFTERNOON_LIGHT_ONLY=false`;
lý do override được ghi rõ trong fixture cho ngựa chưa có lịch sử bữa ăn.

## Kết quả

| Bộ kiểm tra | Kết quả | Bằng chứng/phạm vi |
|---|---|---|
| Backend unit | 77 đạt, 0 lỗi; 2 integration suite bỏ qua khi không có URI | `scratch/server-final.log` |
| Mobile outbox | 19/19 đạt | `scratch/mobile-final.log`; logic hàng đợi, không phải UI điện thoại |
| API + consistency | 17/17 đạt, không bỏ qua | `scratch/integration-final.log`; 15 ca con + 2 suite cha |
| Chromium UI (cập nhật web Groom) | 11/11 đạt | `scratch/groom-ui-final.log`; web thật kết nối API/DB thật |
| Tắt web Groom | 1/1 đạt | `scratch/groom-disabled.log`; trở lại hướng dẫn mobile, không mở route tạm |
| Client lint | Exit 0, còn cảnh báo | `scratch/groom-lint.log` |
| Client build | Thành công | `scratch/groom-build.log`; có cảnh báo bundle lớn |

Log là artifact local gitignored. Test có thể chạy lại từ checkout theo
[AUTOMATED_TESTS.md](AUTOMATED_TESTS.md). Workflow đã thêm vào repo; chưa push và
chưa xác nhận kết quả chạy trên GitHub Actions.

## Flow đã kiểm tra qua HTTP + database thật

1. Tiếp nhận ngựa; phân công Trainer/Vet/Groom; khám xác nhận; checklist; khẩu phần
   tạo bữa; hoàn thành bữa trừ kho; gửi lại không trừ thêm; từ chối role/phạm vi sai.
2. Kế hoạch nhiều giai đoạn; chặn hai kế hoạch active; sinh lịch tuần và sinh lại
   không nhân lịch; pre-check/start/end/evaluation; hai request end chỉ một thành công;
   tạo hai việc chăm sóc sau tập và ghi nhật ký sửa đánh giá.
3. Trial gắn đúng giải; quyết định tham gia/rút; sức khỏe thay đổi gắn cờ xem lại;
   chặn nhập kết quả đã rút; ghi/sửa tiền thưởng, cấm sửa khoản liên kết qua tài chính;
   báo cáo Owner/Manager và CSV.
4. Duyệt bổ sung chưa tăng kho; hai request nhận cùng đề xuất chỉ tăng một lần;
   sync chăm sóc muộn giữ thời điểm thực hiện; gửi lại không trừ thêm; quá 24 giờ bị từ chối.
5. Sốt trước tập; khóa y tế dừng buổi đang chạy; kết thúc phác đồ vẫn chờ khám trở lại;
   khám mới mở clearance; archive giữ lịch sử và áp dụng phạm vi truy cập theo role.

## Lỗi tái hiện và đã sửa

| Trước khi sửa | Sau khi sửa/test regression |
|---|---|
| 6 request kết quả đồng thời tạo 6 khoản tiền thưởng | Transaction ghi kết quả/tiền/thành tích; khóa unique theo `raceEntry`; chỉ một khoản và một thông báo cho kết quả giống nhau |
| Hai lượt giải trùng tên chỉ giữ một thành tích | Thành tích liên kết theo `raceEntry`, giữ riêng hai lượt |
| DB lỗi sau khi trừ kho vẫn để việc completed và kho đã giảm | Transaction rollback việc/kho/opId; retry cùng thao tác thành công |
| Các điểm lỗi/cạnh tranh chưa có kiểm thử bảo vệ | Kiểm tra cạnh tranh tồn kho, xóa/tạo lại thưởng, lỗi sau khi ghi thành tích và lỗi thông báo sau commit |

Thông báo/audit được xử lý sau commit; lỗi thông báo được log và không biến thao tác
đã ghi thành HTTP thất bại. Chưa có outbox server để tự gửi lại thông báo thất bại.
Thay đổi không tự dọn các khoản trùng hoặc mồ côi đã tồn tại trong database thật.

## Chromium đã kiểm tra

Đăng nhập Manager/Trainer/Vet/Owner rồi đọc danh sách ngựa; Manager đọc tồn kho;
Trainer đọc lịch tập và kết quả giải; Owner đọc lịch sử giải và bị chặn trang quản lý
tài khoản. Dữ liệu fixture được tạo qua API. Đây là kiểm tra đọc/đăng nhập/phân quyền;
thao tác ghi xuyên flow ở trên được kiểm tra qua HTTP, chưa bấm mọi form trên web.

Đã bổ sung web Groom tạm: hoàn thành bữa kèm quan sát (tồn kho 100 → 98, reload
không trừ thêm), tiếp nhận, không làm được kèm lý do, đọc khẩu phần/y lệnh, báo sự
cố kèm PNG và đọc lại file GridFS, đọc phản hồi của Vet, đề xuất bổ sung/vật tư mới,
chặn truy cập trang Manager. Kiểm tra cờ tắt đưa Groom về hướng dẫn mobile và ẩn
route test. Mobile source/dependencies không thay đổi trong phần phát triển này.
Xem [GROOM_WEB_TESTING.md](GROOM_WEB_TESTING.md) để bật/tắt và gỡ sau khi test.

## Còn cần test tay

Checklist [TEST_CHECKLIST.md](TEST_CHECKLIST.md) vẫn chưa đánh dấu test tay đạt:
Expo trên điện thoại, camera và các loại file/giới hạn upload còn lại, mạng chập chờn thực tế, reconnect Socket,
toàn bộ form và giao diện thiết bị nhỏ, cùng phiên bản đang deploy. OwnerDashboard
vẫn còn chart/KPI/định giá giả; chưa xử lý vì đó là mục 2, ngoài thứ tự 1 → 3 → 4 đã chọn.

MongoDB standalone không hỗ trợ transaction và trả 503 cho hai nhóm thao tác mới;
cần Atlas/replica set như [DEPLOYMENT.md](../DEPLOYMENT.md). Không đổi MongoDB service
hiện có trên máy trong phiên test này.
