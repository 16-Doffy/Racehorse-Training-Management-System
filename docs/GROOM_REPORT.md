# Module Groom (Nhân viên chăm sóc) — báo cáo triển khai

Cập nhật 12/10/2026, nhánh `Tien`: server `b8ff162`, mobile `40c118b` (sau khi merge `main` ở `d9fc7ee`).
Phạm vi: chỉ app mobile Groom, API Groom trong `server/src/modules/stable`, và thay đổi bổ sung tối thiểu
ở model dùng chung. **Không sửa giao diện web hay nghiệp vụ của HLV, Bác sĩ, Chủ ngựa, Quản lý.**
Mọi đường dẫn có tiền tố `/api/v1`.

## Rà soát phụ thuộc API

| Phụ thuộc | Endpoint | Module sở hữu | Trạng thái |
|---|---|---|---|
| Ngựa được giao | `GET /stable/assignments` | Chuồng (Manager/Trainer phân) | Có, dùng được |
| Thông tin ngựa, mức vận động | `GET /horses`, `GET /horses/:id` (`trainingClearance`) | Ngựa / Vet | Có, dùng được |
| Lịch sử ngựa | `GET /horses/:id/timeline` | Ngựa | Có, dùng được |
| Hồ sơ sức khỏe | `GET /health/records?horse=` | Vet | Có, dùng được |
| Toa thuốc đã kê | `GET /health/treatments` | Vet | Có nhưng thiếu: không có **đường dùng** (DEP-01) |
| Cập nhật toa → việc cho thuốc | `treatmentCare.service` (tự sinh việc theo từng giờ) | Vet / hệ thống | Có, dùng được |
| Khẩu phần đã duyệt | `GET /feeding` | HLV | Có nhưng thiếu: dòng khẩu phần cũ không gắn kho (DEP-06) |
| Lịch tập | `GET /training/sessions` (Groom chỉ thấy ngựa mình) | HLV | Có, dùng được |
| Tồn kho, dự báo | `GET /inventory`, `GET /inventory/forecast` | Quản lý | Có, dùng được |
| Tồn theo khu | `InventoryItem.stableBlock` | Quản lý | Có nhưng thiếu: không có chuyển kho/cấp phát về khu (DEP-04) |
| Tạo đề xuất bổ sung | `POST /inventory/:id/restock-request`, `POST /inventory/proposals` | Dùng chung (Groom gửi) | Có, dùng được |
| Duyệt / từ chối đề xuất | `PATCH /inventory/:id/restock-requests/:reqId` | Quản lý | Có nhưng thiếu: không duyệt một phần (DEP-03) |
| Nhận hàng | `POST /inventory/:id/receive` (`requestId`) | Quản lý | Có, dùng được |
| Groom xác nhận nhận hàng | — | Groom | Chưa có: chặn bởi DEP-04 (chưa có bản ghi cấp phát) |
| Việc của Groom, hoàn thành | `GET /stable/tasks`, `PATCH /stable/tasks/:id/complete` | Groom | Có; đã bổ sung kiểm tra (mục A) |
| Ghi nhận cho thuốc | `PATCH /stable/tasks/:id/complete` (việc `medication`) | Groom, theo y lệnh Vet | Có; đã bổ sung kiểm tra (mục A) |
| Không làm được | `PATCH /stable/tasks/:id/not-done` | Groom | Có, dùng được |
| Báo sự cố | `POST /stable/tasks/:id/incident` | Groom | Có; đã bổ sung loại và thời điểm |

## A. Tính năng Groom đã làm

| Tính năng | Đã làm | Server | Mobile | Test |
|---|---|---|---|---|
| Kiểm tra khẩu phần | Chỉ ghi nhận cho ăn khi có khẩu phần **được duyệt, không rỗng** cho đúng bữa. Ngựa chưa có khẩu phần chỉ có việc "Cho ăn trong ngày": không ghi nhận được, có nút "Báo HLV chưa có khẩu phần" (lý do điền sẵn). | `completeTask` → 409 `NO_APPROVED_RATION` | Cho ăn, Chi tiết bữa | API + UI |
| Lượng xuất kho và lượng ăn | Lượng xuất kho = khẩu phần đã trừ (`supplies`); lượng ăn = `amountEatenPercent` (0–100%; bỏ ăn → 0%). Hai số được lưu và hiển thị riêng. | Kiểm tra 0–100, bỏ ăn → 0 | Hộp xác nhận cho ăn, chi tiết, lịch sử | API |
| Quan sát khi cho ăn | Giữ hộp xác nhận cũ (ăn uống, phân, nước, ghi chú), thêm "Ngựa ăn được". Dấu hiệu bất thường vẫn báo Vet như trước. | (có sẵn) | Hộp xác nhận | API |
| Trừ kho an toàn | Giữ transaction và trừ có điều kiện sẵn có; thêm chặn vật tư **hết hạn**. Mobile gửi `clientOpId` để bấm hai lần hay gửi lại không ghi trùng. | 409 `EXPIRED_SUPPLY` | Mọi thao tác hoàn thành / không làm được | API (gửi trùng, kho trừ một lần) |
| Theo dõi từng liều thuốc | Mỗi giờ trong toa (08:00, 16:00) là một dòng riêng có trạng thái riêng. Giờ không có việc thì ghi lý do (ngoài ngày dùng, qua giờ trước khi có y lệnh, không phải ngựa mình). Sửa lỗi cũ: app ghép liều với việc sai nên báo "Chưa có việc cho liều này". | (dùng việc có sẵn) | Thuốc & y lệnh, Chi tiết thuốc | API + UI |
| Xác nhận cho thuốc | Bỏ nút một chạm. Phải tick "đúng ngựa, đúng thuốc, đúng liều, đúng giờ" thì mới ghi nhận. | Đối chiếu với toa hiện tại: 409 `TREATMENT_ENDED` / `PRESCRIPTION_CHANGED`; nếu bác sĩ chỉ đổi lượng mỗi liều thì trừ theo lượng mới | Hộp xác nhận | API + UI |
| Trạng thái việc thống nhất | Hiển thị các trạng thái: Làm được, Chưa tới giờ, Trễ hạn, **Bị chặn** (thiếu kho / chưa có khẩu phần / hết hạn), Quá hạn ghi nhận, Hoàn thành, **Không thực hiện được** (Groom báo), **HLV cho bỏ qua**. Server vẫn lưu `pending/completed/skipped`. | — | Mọi danh sách, nhãn, bộ lọc | Unit |
| Bộ đếm Tổng quan | Tách việc hôm nay với việc tồn từ hôm trước (vẫn làm được). Bữa/liều đã quá hạn ghi nhận và việc HLV cho bỏ qua **không** tính là "còn phải làm". Thêm số việc bị chặn kèm lý do, và vật tư thiếu cho một ngày của ngựa mình (`my-care-plan`). Chuông thông báo tự kiểm tra lại mỗi phút. | — | Tổng quan, badge tab, Sơ đồ | Unit + UI |
| Việc chuồng | Thêm loại "Việc khác" (HLV giao kèm ghi chú). Trước đây loại này không hiện ở đâu trong app. | (có sẵn) | Việc chuồng, chi tiết | Unit |
| Kho của Groom | "Sắp hết" theo mức tối thiểu Quản lý đặt hoặc số ngày còn dùng (cùng quy tắc với cảnh báo của server); thêm Hết hạn / Sắp hết hạn kèm hạn sử dụng. Trước đây dùng ngưỡng cứng ≤10 nên mọi dụng cụ đều bị đánh dấu. | — | Kho, thẻ tồn kho | Unit + UI |
| Theo dõi đề xuất bổ sung | Trạng thái: Chờ duyệt → Đã duyệt · chờ hàng về (**chưa dùng được**) → Đã nhận (số thực nhận) / Từ chối (lý do của Quản lý). Cảnh báo khi đã có đề xuất đang xử lý cho cùng mặt hàng. | (có sẵn) | Đề xuất của tôi, Đề xuất bổ sung | API + UI |
| Báo sự cố | Chọn ngựa trước, rồi việc liên quan. Thêm loại sự cố (Bỏ ăn / Nghi bệnh / Chấn thương móng / Hành vi bất thường / Tai nạn / Khác) và thời điểm phát hiện; giữ ảnh và mức độ. | `category`, `occurredAt` (không bắt buộc; kiểm tra không ở tương lai, không quá 7 ngày) | Báo cáo sự cố | API + UI |
| Khẩu phần có đơn vị | Dòng khẩu phần hiện tên mặt hàng và lượng theo đơn vị kho ("Cỏ khô Timothy · 5 kg"). Tồn kho lấy đúng mặt hàng được gắn, không đoán theo tên. | — | Cho ăn, Chi tiết bữa, Chi tiết ngựa | UI |
| Trạng thái tải / lỗi / đang gửi | Danh sách tải lỗi thì báo kèm nút Thử lại (trước đây trông như "không có việc"). Nút gửi bị khoá khi đang gửi. | — | Cho ăn, Thuốc, Việc chuồng, Kho, Sự cố | UI |
| Nhãn buổi tập | Đủ các trạng thái mới của server (sẵn sàng, bị chặn, dừng giữa chừng, lỡ giờ…). | — | Chi tiết ngựa | — |
| Hôm qua trong một dòng | Cho ăn và Thuốc có dòng "Hôm qua: 5/6 bữa đã ghi nhận · 1 bỏ lỡ", bấm vào mở sổ lịch sử (sổ xếp theo giờ trong ngày). Cố ý **không** có thanh chọn ngày như Việc chuồng: server chỉ tạo việc cho ăn/thuốc của hôm nay nên ngày sau luôn trống, còn ngày trước không ghi bù được. | — | Cho ăn, Thuốc | UI |

## B. API có sẵn đã tích hợp

| Endpoint | Module | Dùng cho | Kết quả |
|---|---|---|---|
| `GET /stable/tasks`, `PATCH .../complete`, `/acknowledge`, `/not-done` | Groom | Mọi việc trong ngày | Chạy được; có test |
| `GET /stable/my-care-plan` | Groom | Vật tư thiếu cho một ngày | Chạy được |
| `GET /health/treatments` | Vet | Toa và từng liều | Chạy được (chỉ đọc) |
| `GET /feeding` | HLV | Khẩu phần, người duyệt, mặt hàng gắn kho | Chạy được (chỉ đọc) |
| `GET /inventory`, `GET /inventory/forecast` | Quản lý | Tồn, mức sắp hết, hạn dùng, đề xuất của tôi | Chạy được |
| `POST /inventory/:id/restock-request`, `POST /inventory/proposals` | Dùng chung | Gửi đề xuất | Chạy được; có test |
| `PATCH /inventory/:id/restock-requests/:reqId`, `POST /inventory/:id/receive` | Quản lý (web đã có) | Groom thấy kết quả duyệt / nhận hàng | Chạy được; có test cả luồng |
| `GET /training/sessions` | HLV | Buổi tập hôm nay của ngựa mình | Chạy được |
| `GET /stable/assignments`, `GET /horses`, `/horses/:id/timeline`, `/health/records` | Ngựa / Vet | Chuồng, hồ sơ, lịch sử | Chạy được |
| `GET /notifications`, `PATCH /notifications/:id/read` | Dùng chung | Chuông thông báo | Chạy được |

## C. API cần đồng đội bổ sung

### DEP-01 — Đường dùng thuốc trong toa
- **Role phụ trách:** Bác sĩ thú y · **Ưu tiên:** P1 · **Trạng thái:** BLOCKED_BY_TEAM
- **API hiện có:** `GET /health/treatments` trả `medications[]` gồm `name, dosage, amount, times, startDate, endDate, instructions`, nhưng **không có đường dùng**.
- **Cần bổ sung:** trường `route` cho mỗi thuốc: `oral | im | iv | sc | topical | eye | other` (uống / tiêm bắp / tiêm tĩnh mạch / tiêm dưới da / bôi ngoài / nhỏ mắt / khác). Nhập ở form kê toa của Vet, lưu trong `Treatment.medications[]`, trả ra trong `GET /health/treatments` và `GET /stable/my-care-plan`.
- **Groom dùng để:** hiện trong Chi tiết thuốc và trong hộp xác nhận "đúng thuốc, đúng liều, **đúng đường dùng**".
- **Groom đã làm:** hiện tên, liều, giờ, ngày dùng, dặn dò; đang chờ trường này.

### DEP-02 — Báo bác sĩ khi một liều bị bỏ lỡ
- **Role phụ trách:** Bác sĩ thú y (hoặc job hệ thống của nhóm) · **Ưu tiên:** P1 · **Trạng thái:** BLOCKED_BY_TEAM
- **Hiện có:** Groom báo "không làm được" thì Vet nhận thông báo. Nhưng liều **hết khung giờ mà không ai ghi nhận** thì không ai được báo.
- **Cần bổ sung:** job định kỳ tìm việc `medication`/`monitoring` của `source: vet` còn `pending` mà `timing.state === 'missed'`, gửi `Notification` loại `care_order` cho Vet phụ trách ngựa (mỗi việc một lần, đánh dấu `missedNotifiedAt`). **Không** tự xếp lại hay gấp đôi liều.
- **Groom đã làm:** liều quá hạn hiện "Quá hạn ghi nhận" và không còn tính là việc phải làm.

### DEP-03 — Duyệt một phần, mức ưu tiên và nơi nhận của đề xuất
- **Role phụ trách:** Quản lý CLB · **Ưu tiên:** P2 · **Trạng thái:** BLOCKED_BY_TEAM
- **API hiện có:** `PATCH /inventory/:id/restock-requests/:reqId` `{ status: approved|rejected, note }` (không có số lượng); `POST /inventory/:id/receive` cho nhận khác số đã xin (`receivedQty`).
- **Cần bổ sung:**
  - `approvedQuantity` (≤ `quantity`) khi duyệt; lưu vào đề xuất và trả trong `GET /inventory`.
  - `priority` (`normal|urgent`) và `destinationBlock` khi tạo đề xuất (`POST /inventory/:id/restock-request`).
- **Groom dùng để:** hiện "Đã duyệt 15/20 kg"; tự đặt khẩn cấp cho đề xuất gửi từ một việc đang bị chặn.
- **Groom đã làm:** hiện số xin, số thực nhận, lý do từ chối.

### DEP-04 — Cấp phát vật tư về khu chuồng và Groom xác nhận đã nhận
- **Role phụ trách:** Quản lý CLB (cấp phát); phần xác nhận là của Groom · **Ưu tiên:** P2 · **Trạng thái:** BLOCKED_BY_TEAM
- **Hiện có:** mỗi mặt hàng có một `stableBlock` (để trống = kho chung). Nhận hàng là cộng thẳng vào mặt hàng đó; không có bước chuyển "kho chung → khu chuồng".
- **Cần bổ sung (Quản lý):** `POST /inventory/:id/issue` `{ quantity, toBlock, requestId? }` → bản ghi cấp phát `{ _id, item, quantity, toBlock, issuedBy, issuedAt, status: issued }`; chỉ Manager được gọi. Hàng đang cấp phát chưa tính vào tồn của khu.
- **Groom sẽ làm khi có:** `PATCH /inventory/issues/:id/confirm` `{ receivedQuantity, note }` (Groom của khu đó) → `received`, cộng tồn khu, ghi audit; kèm màn "Hàng chờ nhận".

### DEP-05 — Loại việc "Chăm sóc móng"
- **Role phụ trách:** HLV (form giao việc) · **Ưu tiên:** P2
- **Hiện có:** loại việc gồm `feeding, cleaning, bathing, icing, medication, monitoring, other`. Chăm sóc móng hiện phải giao qua "Việc khác" kèm ghi chú.
- **Cần bổ sung:** giá trị `hoof_care` trong enum `DailyTask.taskType`, `MANUAL_TASK_TYPES` và form giao việc trên web HLV.
- **Groom đã làm:** "Việc khác" hiện đúng nội dung ghi chú; thêm nhãn "Chăm sóc móng" chỉ mất một dòng sau khi có enum.

### DEP-06 — Khẩu phần phải gắn mặt hàng kho và được duyệt
- **Role phụ trách:** HLV · **Ưu tiên:** P1
- **Hiện có:** `POST/PUT /feeding` đã hỗ trợ gắn `inventoryItem` và tự đóng dấu người duyệt. Nhưng dòng khẩu phần cũ dạng chữ ("Cà rốt 0.5kg") **không trừ kho**, và khẩu phần cũ chưa có người duyệt sẽ làm bữa đó **bị chặn**.
- **Cần làm:** trên web HLV, bắt buộc chọn mặt hàng kho cho mỗi dòng; lưu lại các khẩu phần cũ để gắn kho và đóng dấu duyệt.
- **Groom đã làm:** dòng chưa gắn kho được ghi chú "khẩu phần chưa gắn kho, không tự trừ".

### DEP-07 — Ngựa chưa có khẩu phần
- **Role phụ trách:** HLV / nhóm (job `dailyTaskGenerator`) · **Ưu tiên:** P1 · **Cần quyết định**
- **Thay đổi hành vi:** việc "cho ăn trong ngày" sinh cho ngựa chưa có khẩu phần nay **không ghi nhận được** (theo yêu cầu: chặn khi chưa có khẩu phần được duyệt). Vì vậy kiểm tra dinh dưỡng của HLV sẽ thấy ngựa đó chưa ăn.
- **Đề xuất:** HLV lập khẩu phần cho mọi ngựa đang ở chuồng; hoặc nhóm quyết định job thôi sinh việc chung này và cảnh báo HLV.

### DEP-08 — Hiện loại và thời điểm sự cố cho Bác sĩ
- **Role phụ trách:** Bác sĩ thú y (web) · **Ưu tiên:** P2
- `GET /stable/incidents` đã trả thêm `incidentReport.category` và `incidentReport.occurredAt` (có thể null với báo cáo cũ). Màn sự cố trên web Vet chỉ cần hiển thị hai trường này. Thông báo gửi Vet đã ghi sẵn loại và giờ.

### DEP-09 — Kiểm tra việc gắn kèm đề xuất
- **Role phụ trách:** Quản lý (module kho) · **Ưu tiên:** P2
- `POST /inventory/:id/restock-request` nhận `task` nhưng không kiểm tra việc đó có phải của người gửi. Đề xuất: với Groom, chỉ nhận việc có `assignedTo` là chính họ; ngược lại trả 403.

### DEP-10 — Triển khai server
- **Role phụ trách:** cả nhóm · **Ưu tiên:** P0
- Mobile mặc định gọi server trên Render. Các kiểm tra mới phía server chỉ có hiệu lực sau khi nhánh này vào `main` và được deploy. MongoDB phải là replica set (Atlas đạt), vì việc hoàn thành dùng transaction; MongoDB chạy một node thường sẽ trả 503.

## D. Thay đổi MongoDB

| Collection | Thay đổi | Migration |
|---|---|---|
| `dailytasks` | `incidentReport.category` (enum, mặc định `null`), `incidentReport.occurredAt` (Date, mặc định `null`) | Không cần: báo cáo cũ không có trường này, mọi nơi đọc đều chịu được `null` |

- Không thêm collection hay index.
- Transaction: giữ nguyên yêu cầu sẵn có (replica set).
- Không sửa hay xoá dữ liệu cũ.

## E. File đã sửa

**Server**
- `server/src/modules/stable/dailyTask.controller.js` (Groom): `completionCheck` (khẩu phần, toa hiện tại, hạn dùng), kiểm tra `amountEatenPercent`, sự cố có `category`/`occurredAt`.
- `server/src/models/DailyTask.js` (dùng chung): thêm hai trường sự cố, không bắt buộc.
- `server/src/modules/health/treatmentCare.service.js` (Vet): **chỉ export thêm** `wantedTasks`, `isActiveToday`, `keyOf` để Groom đối chiếu toa; không đổi hành vi.
- `server/src/docs/openapi.js`: tài liệu các endpoint Groom.
- `server/test/integration/groom.test.js` (mới): 11 test luồng Groom.

**Mobile**
- `mobile/src/utils/groom.js`: trạng thái việc, bộ đếm, ghép liều, mức tồn kho, trạng thái đề xuất, nhãn.
- `mobile/src/utils/groom.test.mjs` (mới), `mobile/package.json` (script `test`, nên bước `test:mobile` của CI chạy được).
- `mobile/src/hooks/useGroomData.js`, `mobile/src/api/client.js`, `mobile/src/api/endpoints.js`.
- Các màn: Tổng quan, Chăm sóc, Cho ăn, Thuốc, Việc chuồng, Kho, Sự cố, Chi tiết ngựa, Sơ đồ chuồng, thanh tab.
- Các component: hộp xác nhận hoàn thành, Không làm được, chi tiết bữa/thuốc/việc, đề xuất bổ sung, thẻ tồn kho, lịch sử, báo sự cố, `LoadError` trong `ui.jsx`.

**Không sửa file nào của web client (`client/`)** hay controller/service riêng của HLV, Vet, Chủ ngựa, Quản lý.
Ngoại lệ duy nhất là phần export thêm ở `treatmentCare.service.js` nêu trên.

## F. Kết quả kiểm thử

Chạy local ngày 12/10/2026, TZ Asia/Ho_Chi_Minh. MongoDB là replica set một node tạm thời ở `127.0.0.1:27018`.

| Lệnh | Kết quả |
|---|---|
| `npm test -w server` (unit) | 77 đạt, 0 lỗi; 3 bỏ qua (file tích hợp khi không có `TEST_MONGO_URI`) |
| `npm run test:integration -w server` | 29/29 đạt (18 cũ + 11 mới của Groom) |
| `npm run test:mobile` | 8/8 đạt |
| `npx expo export --platform web` (mobile) | Biên dịch được, 690 module |
| `oxlint` (no-undef, jsx-no-undef) trên `mobile/src` | 0 lỗi; cảnh báo giảm từ 20 xuống 14 |

Đã chạy thử giao diện thật: server cục bộ với dữ liệu `seed`, app mobile bản web, Playwright ở kích thước điện thoại.
- Luồng cho thuốc có xác nhận: kho trừ đúng 2 ml một lần.
- Luồng bữa chưa có khẩu phần được duyệt: chuyển sang "Không thực hiện được".
- Luồng báo sự cố có loại và thời điểm.
- Không có lỗi console.

**Chưa kiểm chứng:**
- Expo Go trên điện thoại thật; chụp ảnh và upload thật.
- Server Render và Atlas sau khi deploy.
- Luồng chéo vai trò ở DEP-01 đến DEP-04, vì API còn thiếu.

## G. Việc Groom còn lại

**Groom tự làm tiếp được**
- Hàng đợi offline: `main` có sẵn một bản cho mobile cũ, có thể chuyển sang mobile hiện tại.
- Báo sự cố không gắn việc (endpoint mới theo ngựa); cần cùng lúc cập nhật danh sách sự cố cho Vet (DEP-08).
- Lọc lịch sử theo ngựa; xuất báo cáo bàn giao ca.

**Chờ API của đồng đội:** DEP-01 (đường dùng), DEP-02 (báo liều bị bỏ lỡ), DEP-03 (duyệt một phần, ưu tiên), DEP-04 (cấp phát và Groom xác nhận nhận hàng), DEP-05 (chăm sóc móng).

**Cải tiến sau:** realtime qua socket thay cho kiểm tra chuông mỗi phút; ảnh sự cố nén trước khi gửi; cảnh báo sắp hết hạn theo từng lô hàng.

## H. Phản hồi của backend (Duy, 12/10/2026)

| Mục | Trạng thái | Cách dùng |
|---|---|---|
| DEP-01 Đường dùng | **Đã có (backend)** | `Treatment.medications[].route`: `oral, im, iv, sc, topical, eye, other` (null với toa cũ). Có trong `GET /health/treatments` và `GET /stable/my-care-plan` (`prescriptions[].medications[].route`). Form kê đơn web của bác sĩ chưa có ô chọn — chờ phần web bác sĩ. |
| DEP-02 Liều bị bỏ lỡ | **Đã có** | Job mỗi 10 phút: việc `medication`/`monitoring` nguồn `vet`, còn `pending`, đã `missed` → báo bác sĩ phụ trách ngựa một lần (`type: care_order`, đánh dấu `missedNotifiedAt`). Chỉ xét hôm nay và hôm qua; không xếp lại, không gấp đôi liều. |
| DEP-03 Duyệt một phần / ưu tiên / nơi nhận | **Đã có** | `POST /inventory/:id/restock-request` và `POST /inventory/proposals` nhận `priority` (`normal`/`urgent`, sai → 400) và `destinationBlock`. Manager duyệt bằng `PATCH …/restock-requests/:reqId { status: 'approved', approvedQuantity }` (≤ `quantity`). Nhận hàng mặc định theo `approvedQuantity`. `GET /inventory` trả `priority`, `destinationBlock`, `approvedQuantity`, `receivedQty`. Web Manager đã hiện "Khẩn", "Cho Block A", "Duyệt 6/10 kg". |
| DEP-04 Cấp phát về khu | **Chưa làm — cần chốt thiết kế** | Câu hỏi chính: khi Groom hoàn thành bữa/liều thì trừ kho chung (như hiện nay) hay kho của khu? Nếu trừ kho khu thì phải đổi cách trừ kho của luồng chăm sóc → để sau demo. |
| DEP-05 Chăm sóc móng | **Đã có** | `taskType: 'hoof_care'` (enum, việc giao tay, form giao việc của HLV). App chỉ cần thêm nhãn "Chăm sóc móng". |
| DEP-06 Khẩu phần gắn kho | **Đã có** | Server từ chối dòng không có `inventoryItem` và khẩu phần rỗng (400). Form HLV bắt buộc chọn món; bảng khẩu phần báo "Chưa duyệt — Groom chưa ghi nhận được" / "Có món chưa gắn kho". Khẩu phần cũ: HLV bấm Sửa → chọn lại món → Lưu (đóng dấu duyệt). |
| DEP-07 Ngựa chưa có khẩu phần | **Giữ như app đang làm** | Việc "Cho ăn trong ngày" vẫn sinh để Groom bấm "Báo HLV chưa có khẩu phần"; HLV thấy ở checklist ("Bước tiếp theo"). |
| DEP-08 Loại/thời điểm sự cố cho bác sĩ | Phần web bác sĩ | Backend đã trả `incidentReport.category`, `occurredAt`. |
| DEP-09 Kiểm tra việc gắn đề xuất | **Đã có** | Groom gắn việc không phải của mình → 403; HLV/bác sĩ chỉ việc của ngựa trong phạm vi. |
| DEP-10 Triển khai | **Đã deploy** | Code trên `main` tự deploy Render (Atlas là replica set). |

Kiểm thử: `server/test/integration/groomRequests.test.js` (6 ca), cùng 30 ca cũ: 36/36 đạt.

### Bữa bị bỏ lỡ — phần backend đã làm và việc của app (12/10/2026)

Backend (Duy, đã có):
- Bữa có khẩu phần hết khung giờ mà chưa ghi nhận → báo HLV phụ trách và nhắc Groom một lần (`type: 'meal_missed'`, đánh dấu `missedNotifiedAt`).
- Kiểm tra trước buổi tập: bữa ngay trước giờ tập bị bỏ lỡ hoặc Groom báo không cho ăn, và quá 6 giờ chưa ăn → chặn bài trung bình/nặng (bài nhẹ chỉ cảnh báo). Công tắc `MISSED_MEAL_BLOCKS_HARD_WORK`.
- HLV/Manager bấm "Báo nhân viên cho ăn bù" (`POST /stable/tasks/:id/make-up`, chỉ bữa của hôm nay): tạo việc cho ăn mới cùng bữa, giờ = lúc bấm, `makeUpOf` = bữa bị bỏ lỡ, `note: "Cho ăn bù — bữa … bị bỏ lỡ"`, vật tư theo khẩu phần hiện tại; Groom nhận thông báo `task_assigned`. App hiện đã thấy việc này ở thẻ bữa (danh sách trả việc mới nhất trước).
- Giờ khẩu phần: sáng trước 11:00, trưa 11:00–15:59, chiều từ 16:00; hai bữa cách nhau ≥ 3 giờ. HLV xoá được khẩu phần (việc cho ăn chưa làm của bữa đó hôm nay bị bỏ theo).

Đề nghị cho app (Tien):
- Bữa "Quá hạn ghi nhận" vẫn hiện 2 nút: **"Không cho ăn được"** (gọi `PATCH /stable/tasks/:id/not-done` — server cho phép sau khi quá giờ, HLV được báo) và **"Đã cho ăn, quên ghi"** (gửi `performedAt` = giờ thật, phải trong khung giờ của bữa và trong 24 giờ; server lưu `recordedLate`).
- Hiện nhãn "Cho ăn bù" cho việc có `makeUpOf` (giờ lấy từ `scheduledDate` của việc, không lấy giờ khẩu phần).
- Thông báo `meal_missed`: biểu tượng/nhãn riêng nếu app phân loại thông báo.

## I. App Groom làm theo phản hồi (Tien, 16/10/2026)

Đối chiếu mục H, ghi chú của nhóm ngày 15/10 (Chủ ngựa, Bác sĩ, Quản lý) và code `main` tới `1fe4e7d`.

| Mục | App đã làm | Ghi chú |
|---|---|---|
| DEP-05 Chăm sóc móng | Loại `hoof_care` có nhãn "Chăm sóc móng", nằm ở tab Việc chuồng, có bộ lọc. Trước đó việc loại này **không hiện ở tab nào**. | |
| DEP-01 Đường dùng | Hiện ở dòng thuốc, chi tiết thuốc, toa trong chi tiết ngựa, và trong câu xác nhận liều ("đúng đường dùng (uống)"). | Toa cũ không có đường dùng thì không hiện gì. Form bác sĩ đã có ô chọn (`61150f8`). |
| DEP-03 Ưu tiên, nơi nhận, duyệt một phần | Đề xuất bổ sung có "Mức độ cần" (mặc định Khẩn khi gửi từ việc đang bị chặn) và "Giao về" (khu của ngựa / khu của tôi / Kho chung). Đề xuất vật tư mới cũng có mức Khẩn. Lịch sử hiện "Khẩn", "cho Block A", "Duyệt 6/10 · chờ hàng về", số thực nhận. | |
| Bữa/liều quá hạn | Hai nút: **"Đã cho ăn/cho dùng, quên ghi"** (chọn giờ thật, mốc 30 phút trong khung giờ và trong 24 giờ, gửi `performedAt`; hiện "Ghi nhận muộn") và **"Không làm được"**. Không cho "quên ghi" khi đã có bữa ăn bù hoặc khi việc vẫn bị chặn (thiếu kho, chưa có khẩu phần). | Có ở Cho ăn, Chi tiết bữa, Chi tiết thuốc. Tổng quan có banner "N bữa/liều quá hạn chưa ghi nhận". |
| Cho ăn bù | Bữa có `makeUpOf`: tiêu đề "Cho ăn bù — bữa tối", giờ lấy từ việc, kèm ghi chú của HLV, thẻ màu riêng. | |
| Thông báo | Nhãn và biểu tượng theo loại ("Bữa bị bỏ lỡ", "Y lệnh bác sĩ", "Việc được giao", "Đề xuất kho", "Lịch khám"…); nút "Đánh dấu đã đọc hết" (`PATCH /notifications/read-all`). Chuông chỉ ở Tổng quan. | |
| Lịch sử tiêm phòng / tẩy giun / đóng móng | Chi tiết ngựa → Lịch sử: danh sách từ `GET /horses/:id/care-events` (sản phẩm, số lô, liều, người làm, hẹn lần sau). Lịch chăm sóc định kỳ ghi thêm "Lần trước". Chỉ xem, không sửa. | Từ ghi chú của nhóm (phần Bác sĩ). |
| Lịch bác sĩ hẹn khám | **Server (Groom):** `GET /stable/my-care-plan` trả thêm `exams` — các yêu cầu khám đang mở của ngựa, kèm giờ hẹn và bác sĩ nhận. **App:** thẻ "Lịch bác sĩ khám" và dòng trong lịch trình hôm nay ở chi tiết ngựa; Tổng quan nhắc "Bác sĩ khám · Golden Wind 09:00 16/10". | Groom không đọc được `GET /health/exam-requests` (route chỉ cho Vet/HLV/Manager), nên đọc qua endpoint của Groom; không sửa logic của bác sĩ. |
| Buổi tập bị hủy / dừng | Lịch trình hôm nay vẫn hiện buổi đã hủy, kèm `cancelReason` ("Đã hủy: …") hoặc `abortReason`. | Từ ghi chú của nhóm (hủy buổi có lý do). |

Ghi chú của nhóm ngày 15/10 về Chủ ngựa (định giá, tổng quan, biểu đồ) và Quản lý (khóa tài khoản, đặt lại mật khẩu) không có phần nào thuộc Groom.
Nếu Quản lý khóa tài khoản Groom, app báo lỗi đăng nhập theo thông báo của server; đổi mật khẩu vẫn ở Hồ sơ của tôi.

### DEP-11 — Báo Groom khi bác sĩ hẹn giờ khám
- **Role phụ trách:** Bác sĩ thú y · **Ưu tiên:** P2 · **Trạng thái:** BLOCKED_BY_TEAM
- **Hiện có:** `PATCH /health/exam-requests/:id { action: 'accept', scheduledFor }` chỉ báo cho người yêu cầu (HLV/Quản lý). Groom chỉ thấy lịch khi mở app (`my-care-plan.exams`).
- **Cần bổ sung:** khi nhận hoặc đổi giờ khám, gửi thêm `Notification` loại `exam_request` cho Groom phụ trách ngựa (`StableAssignment.assignedCaretaker`), ví dụ "🩺 BS … hẹn khám Golden Wind 09:00 16/10 — giữ ngựa trong chuồng".
- **Groom dùng để:** nhận thông báo ngay thay vì phải mở app mới biết; app đã có nhãn "Lịch khám" cho loại thông báo này.

### Trạng thái DEP còn mở
- **DEP-04** cấp phát về khu: vẫn chờ chốt thiết kế (mục H).
- **DEP-11:** như trên.
- Các DEP khác đã xong ở backend/web và đã được app dùng.

### Kiểm thử (16/10/2026)
- Server: `groom.test.js` thêm 2 ca (bữa quá hạn: không cho ghi lúc này, ghi muộn với giờ thật thì `recordedLate`, báo không cho ăn được; lịch hẹn khám có trong `my-care-plan`).
- Kết quả tích hợp: 47 đạt, 2 bỏ qua (2 ca liều thuốc tự bỏ qua khi chạy gần nửa đêm), 0 lỗi, chạy 3 lần liền.
  Một lần chạy trước đó lỗi khởi động ở file `groom.test.js` và không lặp lại.
- Unit server 78 đạt; mobile 11/11 (thêm ca ghi muộn, cho ăn bù, chăm sóc móng, duyệt một phần).
- Chạy app bản web với server cục bộ và dữ liệu seed, chụp bằng Playwright, không lỗi console:
  - bữa quá hạn → "quên ghi" → "Ghi nhận muộn";
  - bữa ăn bù;
  - đường dùng trong xác nhận liều;
  - việc chăm sóc móng;
  - lịch khám và lịch sử tẩy giun ở chi tiết ngựa;
  - nhãn thông báo;
  - đề xuất Khẩn / Giao về.

### Ngựa 3D ở màn chi tiết ngựa (16/10/2026)
- Mô hình **"HORSE – Realistic 3D Model (DEMO FREE)"** của WildMesh 3D (Sketchfab), giấy phép **CC BY-NC 4.0**:
  dùng cho đồ án được, phải ghi công (app hiện dòng ghi công dưới khung), **không dùng thương mại**.
  Muốn dùng thương mại thì thay `mobile/assets/models/horse.glb` bằng mô hình có bản quyền.
- Điểm chấn thương lấy từ `GET /health/injury-markers` (toạ độ bác sĩ chấm trên sơ đồ nghiêng), đặt dọc thân ngựa.
  Bác sĩ không cần đổi gì.
- Trình xem `model-viewer` và bộ giải nén meshopt tải từ CDN (jsDelivr), nên lần đầu mở cần có mạng.

## J. Ngựa 3D theo giống, từ lúc Manager tạo ngựa (Tien, 16/10/2026)
Manager chọn giống khi tạo ngựa. Ai được giao ngựa đó (Head Trainer, bác sĩ thú y, Owner, Groom) đều thấy cùng một con ngựa 3D,
mang màu lông của giống ấy.

**Cách làm:** chỉ có một mô hình 3D. Texture thân (`M_Body`) và bờm/đuôi (`M_Hair`) là ảnh xám trung tính,
nên trình xem tô màu lông lên khi hiển thị. Không cần thêm file, không đổi database.

| Giống (giá trị lưu) | Châu lục | Màu lông mặc định (giá trị lưu) |
|---|---|---|
| Arabian | Châu Á | Grey: xám trắng |
| Akhal-Teke | Châu Á | Palomino: vàng kim, bờm kem |
| Thoroughbred | Châu Âu | Bay: hồng (nâu đỏ, bờm đen) |
| Friesian | Châu Âu | Black: đen tuyền |
| Quarter Horse | Châu Mỹ | Chestnut: hạt dẻ |
| Standardbred | Châu Mỹ | Dark Bay: nâu sẫm |

- Thứ tự chọn màu: lấy màu lông trong hồ sơ nếu nhận ra được, không thì lấy màu mặc định của giống, cuối cùng là Hồng.
  Dữ liệu cũ gõ tay vẫn khớp: chấp nhận tiếng Anh, tiếng Việt có dấu hoặc không dấu ("Grey", "xám", "nâu đỏ", "ngựa ô"…).
  Ví dụ seed: Golden Wind (Arabian, Chestnut) ra màu hạt dẻ.
- Bảng tra nằm ở `mobile/src/three/horseBreeds.js`, có bản sao giống hệt ở `client/src/features/horses/horse3d/horseBreeds.js`.
  `npm test` trong `mobile/` sẽ báo lỗi nếu hai file khác nhau. Sửa bản ở mobile rồi chép sang client.
- Web lấy mô hình từ `client/public/models/horse.glb` (bản sao của `mobile/assets/models/horse.glb`).

**Đã sửa ở phần của role khác.** Bạn Tien yêu cầu trực tiếp; mỗi chỗ chỉ thêm khung 3D hoặc đổi ô nhập, không đổi API hay quyền:
- **Manager**, `client/src/features/horses/HorseListPage.jsx` (form Thêm/Sửa ngựa):
  - ô Giống và Màu lông đổi từ ô gõ tự do sang ô chọn, có khung 3D xem trước đổi màu ngay khi chọn;
  - chọn giống thì tự điền màu lông mặc định, nếu Manager chưa tự chọn màu khác;
  - giá trị cũ không nằm trong danh sách vẫn hiển thị và giữ nguyên; xoá trắng thì gửi `''` như các ô khác.
- **Manager / Head Trainer / Owner**, `client/src/features/horses/HorseDetailPage.jsx`:
  - khung 3D bên cạnh "Hồ sơ lý lịch";
  - Owner: khung 3D thay avatar khi ngựa chưa có ảnh;
  - Giống/Màu lông hiện tên tiếng Việt.
- **Bác sĩ thú y**, `client/src/pages/veterinarian/HorseHealthDetail.jsx`: khung 3D thay ảnh minh hoạ mặc định khi ngựa chưa có ảnh.
  `Horse3DAnatomyViewer` (sơ đồ chấn thương) giữ nguyên.

**Kiểm thử:**
- Server cục bộ chạy dữ liệu seed, kịch bản Playwright:
  - Manager tạo "Bach Tuyet": chọn Ả Rập ra ngựa trắng; đổi sang Friesian thì màu tự điền "Đen tuyền" và ra ngựa đen;
  - lưu đúng `breed: "Arabian"`, `color: "Grey"`;
  - Head Trainer, bác sĩ thú y, Owner mở ngựa đó đều thấy ngựa trắng;
  - Groom mở Midnight Star (Black) thấy ngựa đen.
- `npm test` mobile 16/16; client build và lint không có cảnh báo mới; bundle Android OK.

## K. Nút Sáng/Tối cho mọi role trên web (Tien, 16/10/2026)
Theo yêu cầu của bạn Tien, nút Sáng/Tối (Doffy làm cho Manager, Head Trainer, Owner) nay có ở cả **bác sĩ thú y** và **Groom**.
Cả hai role này cũng dùng chung sidebar Team 8 như các role kia.
- `client/src/layouts/forestTheme.js`:
  - `CANVAS_ROLES` có đủ 5 role;
  - `FULL_DARK_ROLES` (trang tối hoàn toàn) gồm Manager, Head Trainer, bác sĩ, Groom; Owner vẫn giữ các khung sáng riêng;
  - `BOOTSTRAP_ROLES` gồm bác sĩ.
- `client/src/layouts/MainLayout.jsx`:
  - Trang của bác sĩ viết bằng Bootstrap. Khi bật Tối, layout đặt `data-bs-theme="dark"` trên `<body>`, nên dark mode của
    Bootstrap áp dụng cho cả modal và toast.
  - Bảng màu Bootstrap được đổi sang xanh rêu và vàng đồng.
  - Các lớp màu viết cứng (`bg-white`, `bg-light`, `text-dark`, `table-light`, `text-primary`…) được đổi màu theo, chỉ khi bật Tối.
  - Chế độ Sáng của bác sĩ giữ nguyên như cũ.
- `GroomMobileNotice.jsx` (trang Groom trên web) đọc rõ ở cả hai chế độ.
- `client/e2e/flow.spec.js`: bài test nút Sáng/Tối kiểm tra đủ 5 role.

**Kiểm thử:**
- Chụp 11 trang của bác sĩ ở chế độ Tối, kèm modal "Chỉ định mức tập":
  tổng quan, danh sách, chi tiết, khám bệnh, chấn thương, phác đồ, đơn thuốc, kho, lịch y tế, hồ sơ.
  Không có khối trắng hay chữ tối trên nền tối.
- Chụp trang Groom ở cả hai chế độ.
- Chạy cho cả 5 role: bật Tối đúng như bài test e2e mong đợi; bấm Sáng thì gỡ `data-bs-theme`.
- Client build OK.
- Chưa chạy được bộ `testUi.js` trên máy này, vì `@playwright/test` chưa được cài (cần `npm install`).
