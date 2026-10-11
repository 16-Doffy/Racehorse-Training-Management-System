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
node server/scripts/testUi.js --groom-disabled
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
  Groom web ghi việc/quan sát, không làm được, sự cố/ảnh, đề xuất kho và đọc y lệnh.
  Lệnh `--groom-disabled` kiểm tra tắt giao diện tạm và trả lại hướng dẫn mobile.
- Mobile: logic outbox và API Groom. Chưa thay thế kiểm tra Expo trên điện thoại,
  ảnh/camera, mạng chập chờn thực tế hoặc mọi form web trong checklist.

[Workflow CI](../.github/workflows/test.yml) chạy các bước trên cho push/PR, MongoDB
test riêng và lưu trace khi UI lỗi. Chỉ xác nhận CI trên GitHub sau khi workflow
đã thực sự chạy. Kết quả local được ghi ở [TEST_REPORT.md](TEST_REPORT.md).
