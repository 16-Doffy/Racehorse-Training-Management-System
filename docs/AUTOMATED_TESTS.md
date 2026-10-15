# Chạy test tự động

Chạy từ thư mục gốc với Node.js 22+, sau `npm ci`. Các test API/UI dùng tài khoản giả
và database mới có tên `wdp301_test_*`, tự xóa database đó khi kết thúc. Không gọi seed,
không dùng `MONGO_URI` của môi trường thật. Harness chỉ nhận `TEST_MONGO_URI` trên
`127.0.0.1` hoặc `localhost`.

## MongoDB test riêng

MongoDB cần replica set để test transaction. Ví dụ bằng Docker, cổng 27018:

```sh
docker run -d --name wdp301-test-mongo -p 27018:27018 mongo:8.0 mongod --port 27018 --replSet wdp301Test --bind_ip_all
docker exec wdp301-test-mongo mongosh --port 27018 --eval 'rs.initiate({_id:"wdp301Test",members:[{_id:0,host:"127.0.0.1:27018"}]})'
```

Đợi replica set có primary. PowerShell:

```powershell
$env:TEST_MONGO_URI='mongodb://127.0.0.1:27018/?replicaSet=wdp301Test'
```

Bash:

```sh
export TEST_MONGO_URI='mongodb://127.0.0.1:27018/?replicaSet=wdp301Test'
export TZ=Asia/Ho_Chi_Minh
```

Nếu dùng `mongod` cài sẵn, khởi chạy process riêng với `--port 27018 --replSet
wdp301Test --dbpath <thư-mục-test-riêng> --bind_ip 127.0.0.1`, rồi initiate tương tự.
Không đổi service hoặc database đang dùng cho app. Replica set một node phù hợp cho
local/test; triển khai thật dùng Atlas hoặc replica set được vận hành riêng.

## Các lệnh

```sh
npm run test:server
npm run test:mobile
npm run test:integration
npx playwright install chromium
npm run test:ui
npm run lint -w client
npm run build
```

`test:server` dùng Node test runner; khi có `TEST_MONGO_URI`, nó cũng phát hiện test
integration. Bỏ biến này nếu chỉ muốn unit test. `test:integration` và `test:ui` từ
chối chạy khi thiếu URI, tránh báo đạt do bỏ qua test.

`test:ui` tạo API fixture thật, chạy Vite riêng trên `127.0.0.1:5180`, truyền địa chỉ
API/Socket qua env rồi chạy Chromium headless. Đóng process Vite và xóa DB test sau
khi xong. Cổng 5180 phải trống; không cần sửa `.env`. Screenshot/trace khi lỗi nằm
ở `scratch/playwright-results` (gitignored). Có thể đặt `PLAYWRIGHT_BROWSERS_PATH`
nếu cần lưu browser vào thư mục có quyền ghi.

## Phạm vi và CI

- API integration: flow tiếp nhận → chăm sóc/khám → kế hoạch/lịch → chạy/đánh giá →
  dự giải/kết quả/tiền thưởng; nhận hàng, sync muộn, khóa tập/return/archive và phân quyền.
- Consistency regression: gửi đồng thời, rollback khi DB lỗi, cạnh tranh tồn kho,
  giải trùng tên và chỉnh/xóa/tạo lại tiền thưởng.
- Chromium: đăng nhập các role, danh sách ngựa/kho/lịch/giải và chặn route sai role;
  Groom đăng nhập web chỉ thấy hướng dẫn dùng app mobile. Thao tác Groom (việc, kho, sự cố)
  được kiểm ở test API/consistency.
- Mobile: logic outbox và API Groom. Chưa thay thế kiểm tra Expo trên điện thoại,
  ảnh/camera, mạng chập chờn thực tế hoặc mọi form web trong checklist.

[Workflow CI](../.github/workflows/test.yml) chạy các bước trên cho push/PR, MongoDB
test riêng và lưu trace khi UI lỗi. Chỉ xác nhận CI trên GitHub sau khi workflow
đã thực sự chạy. Kết quả local được ghi ở [TEST_REPORT.md](TEST_REPORT.md).

## Chạy theo lịch và kiểm tra web thật

- Cùng workflow chạy thêm mỗi sáng 06:45 giờ Việt Nam trên `main` (GitHub có thể trễ vài phút),
  và chạy tay được bằng nút **Run workflow** ở tab Actions. Chỉ test code đã push lên `main`.
- Job `live-smoke` ([server/scripts/liveSmoke.js](../server/scripts/liveSmoke.js)) chỉ chạy theo lịch
  hoặc khi bấm tay: đánh thức Render, kiểm tra `/health-check`, rồi đăng nhập Manager và đọc một
  số danh sách. Chỉ gửi GET và đăng nhập, không tạo hay sửa dữ liệu thật.
- Đăng nhập cần hai secret của repo (Settings → Secrets and variables → Actions):
  `LIVE_MANAGER_EMAIL`, `LIVE_MANAGER_PASSWORD`. Không có secret thì job chỉ kiểm tra health.
  Không ghi mật khẩu vào code hay file trong repo.
- Lượt chạy theo lịch thất bại thì GitHub gửi email; bảng kết quả nằm ở trang tóm tắt của lượt chạy.
  GitHub tự tắt lịch nếu repo không có hoạt động trong 60 ngày.

## Các lượt demo trên web thật (ghi dữ liệu)

[`server/scripts/demoFlows.js`](../server/scripts/demoFlows.js), chạy bằng workflow
[Demo flows (live)](../.github/workflows/demo-flows.yml) (lịch một lần sáng ngày demo, hoặc nút
**Run workflow**). Khác `liveSmoke.js`, script này **ghi vào DB thật**: mỗi lượt tạo hai ngựa
"Test Demo …" và lấy 2,5 kg ngũ cốc khỏi kho cho mỗi bữa. Không có `DEMO_CONFIRM=write` thì chỉ chạy
bước kiểm tra trước.

- Ngựa "Đạt": Manager thêm ngựa, xếp chuồng → bác sĩ khám → HLV lập khẩu phần, kế hoạch → nhân viên
  cho ăn → HLV lên lịch buổi phi chậm 2400 m sau thời gian chờ tiêu hóa (90 phút) → kiểm tra sẵn sàng →
  bắt đầu → cảm biến chạy hết cự ly → "Đạt mục tiêu" → HLV đánh giá → chủ ngựa thấy ngựa.
- Ngựa "Không đạt": giờ bữa sáng qua mà chưa cho ăn → ô Dinh dưỡng đỏ, lên lịch bị từ chối (kể cả có lý
  do) → nhân viên cho ăn muộn → buổi phi chậm sau 90 phút → HLV kết thúc sớm → "Chưa đạt
  mục tiêu" → đánh giá thấp → yêu cầu khám → bác sĩ nhận và hẹn giờ. Ở lượt 1 ngựa này được giữ ở trạng
  thái bị chặn để demo trực tiếp.
- Chỉ tiêu tốc độ để trống vì bộ giả lập chạy 90–105% tốc độ mục tiêu (đặt tốc độ thì kết quả thành
  ngẫu nhiên); nhịp tim và cự ly luôn đạt.
- Lượt đầu chạy ngay; cứ `DEMO_ROUND_EVERY_MIN` (45) phút thêm một lượt tới `DEMO_LAST_START` (08:00).
  Chỉ chạy được từ 01:00 đến 10:00 giờ Việt Nam. Cần secret `DEMO_ACCOUNTS` (JSON: `password`,
  `manager`, `trainer`, `vet`, `groom`, `owner`).
- Sau demo: Manager "Ngừng quản lý" các ngựa Test Demo (ngựa còn trong chuồng thì ngày nào cũng sinh
  việc cho ăn), và xóa lịch trong workflow.
