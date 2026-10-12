# Checklist test flow hiện tại

Cập nhật 11/10/2026 theo code `654ae43`. **Mọi ca test tay dưới đây chưa xác nhận.**
Kết quả mong đợi được đọc từ code, không phải kết quả đã chạy. Đọc
[CURRENT_FLOW.md](CURRENT_FLOW.md) trước, rồi chạy A → B → C → D.

Kết quả tự động nằm ở [TEST_REPORT.md](TEST_REPORT.md), cách chạy lại ở
[AUTOMATED_TESTS.md](AUTOMATED_TESTS.md). Không đánh dấu test tay đạt chỉ vì API
hoặc test Chromium đã đạt.

## 1. Chuẩn bị và ghi kết quả

- Dùng database test riêng nếu cần thử seed, lỗi hoặc đổi policy. Không đặt lại
  dữ liệu chung để chuẩn bị demo.
- Chuẩn bị 5 tài khoản hoạt động đúng role, một ngựa test (ví dụ `TEST Sao Mai`),
  một mặt hàng thức ăn và thuốc có tồn. Dùng thêm ngựa riêng cho nhánh khóa/archive.
- Web và mobile phải cùng backend. Mở nhiều browser profile hoặc đăng xuất/chuyển
  tài khoản để đi xuyên role, không nhầm quyền giữa bước.
- Chọn giờ tập trong tương lai gần và nằm trong cửa pre-check. Ví dụ còn 10 phút
  thì tạo/sinh lịch được và pre-check mặc định đã mở.
- Ghi policy thật ở `/settings/policy`; nếu demo chiều cần trial, xem cấu hình
  `AFTERNOON_LIGHT_ONLY` trong [DEPLOYMENT.md](../DEPLOYMENT.md).
- Ngựa mới chưa có lịch sử ăn có thể hiện cảnh báo dinh dưỡng. Cho Groom ghi bữa
  thật trong khung giờ hoặc ghi lý do chấp nhận cảnh báo nếu backend cho phép;
  không sửa clock để bỏ qua điều kiện.

Biên bản cho mỗi lần test:

| Thông tin | Điền khi chạy |
|---|---|
| Ngày/giờ test | Chưa ghi |
| Commit backend / frontend / mobile | Chưa ghi |
| URL API và môi trường DB | Chưa ghi; không ghi credentials |
| Policy khác mặc định | Chưa ghi |
| Ngựa / giải / buổi tập test | Chưa ghi |
| Người test và thiết bị mobile | Chưa ghi |

Đổi “Chưa test” thành “Đạt” hoặc “Lỗi”; ghi trạng thái/ảnh/log và ID bản ghi khi
cần. Ca API/thiết bị chuyên biệt có thể ghi “Chưa chạy”, không gộp với test UI đạt.

## 2. A — Tiếp nhận → khẩu phần → khám → kế hoạch → lịch

| ID | Role / thao tác | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| A1 | Manager tạo ngựa, gán Owner/HLV/Vet | Đúng người phụ trách; checklist còn thiếu chuồng/khẩu phần/khám/kế hoạch/lịch | Chưa test |
| A2 | Manager xếp chuồng và Groom | Checklist có chuồng/Groom; Groom thấy phần được giao | Chưa test |
| A3 | HLV mở `/stable/tasks`, tab khẩu phần; tạo bữa có mặt hàng kho và giờ phù hợp hôm nay | Có khẩu phần và việc cho ăn cho Groom; tạo bữa trùng bị từ chối | Chưa test |
| A4 | Groom ghi nhận bữa trong khung giờ | Lưu giờ hoàn thành; mặt hàng trừ đúng lượng; refresh vẫn thấy kết quả | Chưa test |
| A5 | HLV gửi yêu cầu khám; Vet mở yêu cầu và lập hồ sơ, chọn kết luận/mức vận động phù hợp | Có hồ sơ khám, yêu cầu được xử lý theo flow; checklist nhận lần khám | Chưa test |
| A6 | HLV đăng ký giải tương lai, cự ly 1600 m, trường đua/mặt sân | Lượt `registered`, chưa `confirmed`; sai ngày/cự ly bị từ chối | Chưa test |
| A7 | HLV bấm Lập kế hoạch trên dòng giải, hoàn thành wizard | Ngựa/giải được điền sẵn, kế hoạch active; chưa sinh buổi cụ thể | Chưa test |
| A8 | HLV bấm Sinh lịch tuần đầu tiên | Có các buổi scheduled theo tuần; không xếp giờ đã qua/ngày đua/slot trùng | Chưa test |
| A9 | HLV sinh lại cùng tuần, thử tạo kế hoạch active thứ hai cho cùng ngựa | Không sinh trùng slot; không cho hai kế hoạch active | Chưa test |
| A10 | Owner mở ngựa test và Trainer/Vet mở danh sách | Owner/HLV/Vet thấy theo phạm vi; tài khoản ngoài phạm vi không đọc được ngựa | Chưa test |

A6 là tùy chọn cho flow chỉ huấn luyện; giữ bước này nếu tiếp tục phần C.

## 3. B — Pre-check → chạy → đánh giá → chăm sóc sau tập

Dùng một buổi có giờ trong cửa pre-check, hồ sơ khám và clearance phù hợp.
Để kiểm tra chăm sóc tự sinh, cần buổi cường độ cao/mô phỏng thi đấu và Groom được gán.

| ID | Role / thao tác | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| B1 | HLV chọn buổi mới xếp, chưa bấm Bắt đầu | Scheduled, chưa có giờ bắt đầu thật; chưa chạy cảm biến | Chưa test |
| B2 | HLV Kiểm tra sẵn sàng, xác nhận đã kiểm tra; xử lý cảnh báo/lý do nếu có | Đủ điều kiện → ready; lưu kết quả kiểm tra | Chưa test |
| B3 | HLV Bắt đầu | In progress; giờ bắt đầu do server ghi; board realtime có số khi simulator bật | Chưa test |
| B4 | HLV Kết thúc trước simulator tự xong | Completed; giữ số đo, giờ kết thúc thật, kết quả đối chiếu mục tiêu | Chưa test |
| B5 | HLV Đánh giá ngay / Đánh giá, nhập điểm/nhận xét/link video | Evaluated; Owner thấy nhận xét và link nếu có | Chưa test |
| B6 | HLV sửa đánh giá | Nội dung mới hiển thị; audit ghi thay đổi | Chưa test |
| B7 | Groom mở Việc sau buổi nặng | Có ngâm/chườm chân + tắm, giờ theo policy sau kết thúc; làm trong khung được phép | Chưa test |
| B8 | Lặp lại end bằng API hoặc yêu cầu đồng thời trên DB test | Chỉ một lần hoàn thành và sinh chăm sóc; lần còn lại bị từ chối | Chưa test |
| B9 | Chạy buổi khác, để simulator tự hoàn thành | Completed tự động; giờ thật tách thời gian vận động mô phỏng | Chưa test |

Nếu simulator kết thúc trước thao tác B4, dùng B9 cho buổi đó và tạo buổi khác
để kiểm tra nút kết thúc thủ công; không đánh dấu B4 đạt chỉ vì thấy completed.

## 4. C — Chạy thử → quyết định → kết quả → Owner/tài chính

Không thể đợi giải tương lai rồi nhập kết quả ngay trong cùng lượt demo. Chia hai
fixture: giải tương lai để test trial/quyết định; giải có ngày hôm nay và ngựa phù
hợp để test kết quả. Muốn xác nhận toàn bộ cùng một lượt đăng ký phải test theo
ngày thực tế; không sửa ngày DB/đồng hồ để giả ca đã chạy đầy đủ.

| ID | Role / thao tác | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| C1 | HLV tạo trial tay, chọn giải tương lai của ngựa; hoặc sinh tuần có ngày đua −8 | Trial gắn đúng raceEntry; trước ngày đua; cự ly theo giải | Chưa test |
| C2 | HLV pre-check, start, end, đánh giá trial | Có số đo/outcome; dòng giải hiển thị trial gắn đúng lượt | Chưa test |
| C3 | HLV Quyết định dự giải: tham gia, chọn bằng chứng và lý do nếu cần | Confirmed, lưu người/thời điểm/trial/lý do; Owner nhận thông báo | Chưa test |
| C4 | Trên lượt khác chưa có trial, xác nhận không lý do rồi có lý do ngoại lệ | Thiếu lý do bị từ chối; ngoại lệ có lý do chỉ được chấp nhận khi y tế cho phép | Chưa test |
| C5 | Vet/Groom ghi thay đổi sức khỏe/sự cố sau confirmed | ReviewNeeded hiển thị; HLV được báo, không tự coi là quyết định rút | Chưa test |
| C6 | HLV rút lượt cần xem lại và ghi lý do | Withdrawn, lưu quyết định; không nhập kết quả cho lượt đã rút | Chưa test |
| C7 | HLV nhập kết quả cho fixture ngày hôm nay, có thưởng | Completed; thành tích ngựa cập nhật; có khoản race_prize liên kết | Chưa test |
| C8 | Owner mở Lịch Cuộc Đua, Đánh giá HLV, tài chính và thẻ tóm tắt ngựa | Bản ghi chi tiết đúng; tiền thưởng vào thu; chỉ thấy ngựa mình | Chưa test |
| C9 | HLV sửa tiền thưởng qua kết quả, Manager thử sửa/xóa khoản liên kết ở Finance | Sửa kết quả cập nhật khoản liên kết; sửa/xóa trực tiếp bị 409 | Chưa test |
| C10 | Manager xem báo cáo, nhật ký và tải CSV | Có dữ liệu tương ứng; CSV mở tiếng Việt; không coi định giá/KPI giả Owner là kết quả test | Chưa test |

## 5. D — Kho và đồng bộ offline

| ID | Role / thao tác | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| D1 | Groom đề xuất bổ sung vật tư, Manager duyệt | Đề xuất approved/chờ hàng; tồn kho chưa tăng | Chưa test |
| D2 | Manager Nhận hàng trên đề xuất | Tăng đúng lượng; đề xuất received, lưu người/giờ/lượng nhận | Chưa test |
| D3 | Gửi lại receive cùng requestId, kể cả hai yêu cầu đồng thời | Chỉ nhận một lần; lần lặp bị từ chối | Chưa test |
| D4 | Groom mở việc đã tải, tắt mạng, hoàn thành trong khung giờ | Hiện chờ đồng bộ; outbox giữ thao tác và giờ bấm | Chưa test |
| D5 | Đóng/mở app khi còn offline rồi bật mạng | Hàng đợi còn; đồng bộ, server giữ giờ thực hiện, trừ kho một lần | Chưa test |
| D6 | Gửi lại complete cùng clientOpId; thử record muộn trên DB test | Không áp dụng lại; receivedAt tách performedAt; quá 10 phút ghi recordedLate | Chưa test |
| D7 | Offline not-done kèm lý do, rồi đồng bộ | Server ghi không làm được và lý do; không coi đã thực hiện | Chưa test |
| D8 | Offline báo sự cố có ảnh rồi bật mạng, kiểm tra trên thiết bị | Ảnh gửi/đọc được hoặc lỗi rõ ràng; ca này chưa được unit outbox chứng minh | Chưa test |

## 6. Nhánh bị chặn và hồi phục

Chạy trên ngựa/fixture riêng để không làm hỏng chuỗi A–D đang test.

| ID | Thao tác | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| E1 | Pre-check ngoài cửa hoặc chưa xác nhận trực tiếp kiểm tra ngựa | Từ chối, không chuyển ready | Chưa test |
| E2 | Nhập thân nhiệt từ ngưỡng sốt trong pre-check | Blocked, lưu thân nhiệt, gửi yêu cầu khám ưu tiên cao | Chưa test |
| E3 | Bài không nhẹ sát bữa thức ăn tinh dưới mốc cứng | Blocked; ghi lý do không bỏ qua được chặn cứng | Chưa test |
| E4 | Pre-check có cảnh báo vàng; thử không lý do rồi có lý do | Thiếu lý do bị từ chối; có lý do xử lý theo điều kiện thật | Chưa test |
| E5 | Ready rồi đổi giờ | Scheduled, pre-check cũ mất hiệu lực; phải kiểm tra lại | Chưa test |
| E6 | Không pre-check/start kịp, đợi watcher; bấm Xếp lại | Missed; tạo buổi scheduled mới, giữ bản ghi cũ | Chưa test |
| E7 | Đang chạy, Dừng giữa chừng nhóm health/injury | Aborted, giữ metrics/lý do; yêu cầu khám; không đánh giá như completed | Chưa test |
| E8 | Vet khóa tập khi có booking và run đang chạy | Booking thuộc diện bị hủy → cancelled; run → aborted, giữ số đo | Chưa test |
| E9 | Kết thúc điều trị đang hạn chế, chưa khám trở lại | Clearance vẫn hạn chế/chờ đánh giá; không tự cho tập lại | Chưa test |
| E10 | Vet khám trở lại, nâng clearedLevel; HLV xem/sinh lịch phù hợp | Clearance mới áp dụng cùng hạn chế khác; booking đã hủy không tự phục hồi | Chưa test |
| E11 | Policy chiều bật, thử trial chiều và walk/canter chiều | Trial bị từ chối, bài cho phép được xét tiếp các điều kiện khác | Chưa test |
| E12 | Thiếu kho khi Groom tick liều/bữa; thử liều đã quá khung giờ | Từ chối, có lý do; không hoàn thành giả hoặc âm kho | Chưa test |
| E13 | Manager ngừng quản lý ngựa có việc/run/giải mở | Đóng phần đang mở, giữ lịch sử; Trainer/Vet không còn danh sách làm việc | Chưa test |
| E14 | Gửi performedAt quá 24 giờ hoặc tương lai quá 2 phút | Từ chối metadata thời gian; hiện lỗi đồng bộ để xử lý | Chưa test |

## 7. Kiểm tra kỹ thuật tiếp theo, tách khỏi test UI

| ID | Ca cần test trên DB test | Trạng thái |
|---|---|---|
| T1 | Hai request ghi kết quả/tiền thưởng lần đầu đồng thời: số FinancialRecord và liên kết cuối | Đã tái hiện và sửa; regression tự động đạt, chỉ một khoản liên kết |
| T2 | Lỗi sau claim completed, khi trừ kho hoặc gửi cảnh báo: task và kho còn nhất quán không | Đã tái hiện và sửa; rollback DB, retry và lỗi thông báo sau commit được test |
| T3 | Hai giải cùng tên: sửa kết quả có mất/trùng thành tích không | Regression tự động đạt; thành tích liên kết theo raceEntry |
| T4 | Mất phản hồi khi gửi incident: gửi lại có tạo thông báo/ảnh lặp không | Chưa test |

Test tự động đã chạy trên `654ae43` ngày 11/10/2026: backend 77/77, mobile outbox
19/19, client build thành công; lint còn cảnh báo. Những kết quả đó không thay
thế các bảng test tay và ca lỗi/concurrency ở trên.
