# Racehorse TMS: web đang có gì và chạy theo luồng nào (26/10/2026)

Duy cập nhật (Claude soạn). Đọc mục 1–3 để hiểu hệ thống, mục 4 cho phần mới hôm nay, mục 5 trước khi
code. Chi tiết API: Swagger tại `/api-docs` của server; chuồng: [STALL_API.md](STALL_API.md).

## 1. Năm vai trò

| Vai trò | Dùng ở đâu | Việc chính |
|---|---|---|
| Quản lý (`manager`) | Web | Nhân sự, danh mục ngựa (thêm ngựa 3 bước: hồ sơ, người phụ trách, chuồng), sơ đồ chuồng và người chăm sóc, kho vật tư và yêu cầu nhập kho, tài chính, báo cáo, nhật ký |
| HLV trưởng (`head_trainer`) | Web | Kế hoạch huấn luyện, buổi tập và đánh giá, khẩu phần và lịch ăn, giao việc chăm sóc, đăng ký giải và quyết định dự giải |
| Bác sĩ thú y (`veterinarian`) | Web | Khám, chẩn đoán chấn thương, phác đồ điều trị, khóa tập hoặc chỉ cho tập nhẹ, cho tập lại |
| Nhân viên chăm sóc (`groom`) | App điện thoại (`mobile/`) | Cho ăn, tắm, chườm lạnh, dùng thuốc theo y lệnh, báo sự cố. Đăng nhập web thì được chỉ sang app |
| Chủ ngựa (`owner`) | Web | Xem ngựa của mình, chuồng, lịch sử giải, tiền thưởng; không sửa được gì của CLB |

Mỗi HLV và bác sĩ chỉ thấy ngựa được giao cho mình; server lọc, không phải giao diện.

## 2. Luồng chính, từ lúc nhận ngựa tới khi có kết quả giải

1. **Nhận ngựa** (Quản lý): thêm ngựa với chủ, HLV, bác sĩ, chuồng. Chuồng nào thì người chăm sóc của chuồng đó.
2. **Khám tiếp nhận** (bác sĩ): kết luận đủ điều kiện, mức được tập (`none` khóa, `light`/`moderate` hạn chế, `high` tự do). Giấy khám có hạn 14 ngày cho bài nặng.
3. **Đăng ký giải** (HLV), rồi **lập kế hoạch** cho giải đó: các giai đoạn (nền tảng, sức mạnh, tốc độ, giảm tải, hồi phục), mỗi giai đoạn có mặt sân, cường độ, km/tuần và lịch tuần mẫu.
4. **Lịch tập tự xếp:** kế hoạch đang áp dụng luôn có sẵn buổi tập tuần này và tuần sau (xếp khi áp dụng, kiểm lại mỗi giờ). Tám ngày trước giải tự có buổi chạy thử đủ cự ly. Ngày đua không xếp. Ngựa bị khóa thì không xếp gì.
5. **Lịch ăn cả kỳ:** HLV xem lịch ăn cho mọi ngày của kế hoạch (ngày tập ăn nhiều thức ăn tinh hơn ngày nghỉ) và xác nhận một lần. Mỗi ngày hệ thống tự tạo việc cho ăn cho nhân viên theo lịch đó, hoặc theo khẩu phần cố định nếu chưa có lịch.
6. **Hằng ngày** (nhân viên, trên app): cho ăn đúng giờ, ghi nhận; kho tự trừ. Lỡ bữa thì HLV được báo và có thể giao cho ăn bù.
7. **Buổi tập** (HLV): **Kiểm tra sẵn sàng** (y tế, giấy khám, dinh dưỡng, sốt, người chăm sóc), rồi **Bắt đầu**. Cảm biến mô phỏng gửi nhịp tim, tốc độ, cự ly mỗi 5 giây; ngựa 3D chạy theo tốc độ đó. Đủ cự ly thì tự kết thúc, rồi HLV **đánh giá** (đạt hay chưa đạt so với chỉ tiêu). Sau buổi nặng tự sinh việc chườm lạnh và tắm cho nhân viên.
8. **Nghi chấn thương:** cảm biến thấy tốc độ tụt và nhịp tim vọt lên hai lần liền thì hệ thống tự dừng buổi, gửi bác sĩ yêu cầu khám gấp, giao chườm lạnh, báo HLV và chủ ngựa.
9. **Bác sĩ khóa tập:** buổi sắp tới bị hủy (ghi rõ do bác sĩ). Lượt giải đã xác nhận được đánh dấu "Cần xem lại quyết định" kèm lý do. **Bác sĩ cho tập lại:** lịch theo kế hoạch tự xếp lại; buổi HLV tự hủy thì vẫn để trống.
10. **Phong độ dự giải:** mỗi kế hoạch có kết luận Đủ điều kiện, Đúng tiến độ, Chưa đạt hoặc Không đủ điều kiện, tính từ đầu kế hoạch tới hôm nay (mục 3). HLV vẫn là người **quyết định dự giải** trên trang Giải đua: cần buổi chạy thử, hoặc ghi lý do ngoại lệ.
11. **Kết quả giải** (HLV hoặc Quản lý): tiền thưởng tự ghi vào doanh thu của chủ ngựa.

Thông báo: mỗi việc liên quan tới vai trò nào thì menu của vai trò đó hiện số đỏ. Bấm thông báo là mở đúng trang và đúng dòng.

## 3. Quy định CLB mà hệ thống áp dụng

Đặt trong `server/src/config/clubPolicy.js` (đổi được bằng biến môi trường); web đọc qua `GET /settings/policy`, nên chữ trên màn luôn khớp server.

- **Kiểm tra sẵn sàng:** mở từ 60 phút trước đến 30 phút sau giờ tập, kết quả có hiệu lực 2 giờ. Từ 38,6 °C là sốt, không tập. Buổi chiều chỉ tập nhẹ.
- **Dinh dưỡng trước buổi tập:**
  - Bữa có thức ăn tinh: bài vừa và nặng bị chặn 60 phút, cảnh báo tới 90 phút.
  - Bữa chỉ có cỏ: chờ 60 phút, chỉ cảnh báo.
  - Lỡ bữa ngay trước buổi tập (hoặc 24 giờ không ghi nhận bữa nào) mà 6 giờ qua chưa ăn gì: chặn bài nặng, bài nhẹ chỉ cảnh báo.
- **Bữa ăn:**
  - Giờ các bữa: sáng trước 11:00, trưa 11:00–15:59, chiều từ 16:00; hai bữa cách nhau ít nhất 3 giờ.
  - Nhân viên chỉ ghi nhận bữa được từ giờ hẹn; giờ ăn tính theo lúc cho ăn thật.
  - Loại thức ăn của vật tư: `concentrate` (cám, ngũ cốc), `forage` (cỏ), `supplement` (dầu, khoáng).
- **Gợi ý khẩu phần** (`server/src/modules/feeding/rationRules.js`, theo NRC 2007):
  - Cả ngày 2–2,5% cân nặng; thức ăn tinh không quá 0,5% cân nặng mỗi bữa.
  - Vai trò từng bữa: bữa sáng trước giờ tập chủ yếu cỏ, bữa trưa nhẹ, bữa chiều là bữa chính kèm chất bổ sung (khoáng mỗi ngày, dầu ở giai đoạn sức mạnh và tốc độ, điện giải ngày tập nặng).
  - Chọn món trong kho: món ngựa đang ăn; nếu không có thì món đủ dùng cả tuần, hết hạn sớm nhất.
  - Cân nặng ngoài 350–700 kg thì cảnh báo.
- **Phong độ dự giải** (`server/src/modules/training/raceForm.js`): tập từ 80% số buổi đến hạn, đạt chỉ tiêu từ 70% số buổi đã tập, chạy thử cho giải đạt, bác sĩ không khóa hay hạn chế.

## 4. Mới trong ngày 23/10 (đã lên `main`)

**Ăn uống và chăm sóc (HLV)**

- **Lịch ăn cả kỳ:** `GET /feeding/calendar/:planId` xem; `POST .../confirm` xác nhận một lần; `PATCH .../day/:date/:slot` sửa một bữa.
- **Gợi ý một bữa:** `GET /feeding/suggest?horse=&slot=`; form "Thêm khẩu phần" hiện gợi ý này.
- **Thời khóa biểu cho ăn theo tuần của một ngựa:** `GET /feeding/timetable?horse=&week=`, cho biết mỗi bữa đã cho ăn chưa, ai cho, lúc nào.
- **Tab Công việc chăm sóc và tab Khẩu phần ăn** nhóm theo ngựa. Bấm một con thì ra thời khóa biểu cho ăn và các việc của nó.

**Lịch tập và giải đua**

- **Hủy buổi có nguồn:** buổi bị hủy ghi `cancelSource` (`trainer`, `medical`, `plan`, `archive`), dùng để lịch tự xếp lại sau khi bác sĩ cho tập.
- **Lịch tuần:** buổi hủy rồi xếp lại chỉ hiện một ô. Các tuần chưa xếp hiện buổi "Dự kiến" theo lịch tuần mẫu, kèm ngày đua, ngựa đang khóa và "Còn N ngày tới giải".
- **Kết luận phong độ** có ở thẻ kế hoạch, bảng kế hoạch, trang Giải đua và lịch tuần; API trả ở `progress.form` của kế hoạch.

**Ngựa 3D chuyển động** (màn HLV và Quản lý)

- **Mô hình:** "Horse" của henrysteve973 (Sketchfab, CC BY 4.0), file `client/public/models/horse-animated.glb`. Dựng lại từ file gốc bằng `tools/horse-model/prepare-animated.mjs`. Mỗi con tô màu lông theo giống và màu trên hồ sơ.
- **Thẻ mô phỏng buổi tập:**
  - Ngựa chạy theo tốc độ cảm biến: đi bộ dưới 9 km/h, kiệu dưới 20, phi chậm dưới 45, trên nữa là phi nước đại.
  - Mặt sân lấy theo giai đoạn kế hoạch (cỏ, đất, cát, tổng hợp). Buổi dốc thì ngựa nghiêng.
  - Kịch bản "mệt": đầu cúi, chậm dần. Kịch bản "nghi chấn thương": đi khập khiễng một lần đo, rồi đứng co chân đau, có vòng đỏ ở móng.
- **Chỗ khác:** form tạo buổi (ngựa đã chọn tập thử bài đã chọn); trang chi tiết ngựa (khỏe thì gặm cỏ, hồi phục thì đi bộ, bị khóa thì đứng nghỉ); form thêm ngựa.
- **Code:** `client/src/features/horses/horse3d/` gồm `horseMotion.js` (chọn chuyển động), `horseStage.js` (cảnh three.js), `MovingHorse3D.jsx`. Màn chủ ngựa và bác sĩ vẫn dùng `Horse3D` (mô hình đứng yên WildMesh).

## 4b. Mới ngày 26/10

**3D theo buổi tập**

- **Chấn thương đúng chân:** nút "Mô phỏng sự cố" cho HLV chọn chân đau. Server lưu `TrainingSession.simLeg`; lý do dừng, việc chườm lạnh và yêu cầu khám (`bodyAreas`) đều ghi chân đó. Ngựa 3D khập khiễng và co đúng chân ấy.
- **Trang chi tiết ngựa:** đọc vết thương bác sĩ đánh dấu (InjuryMarker) hoặc chân què ở lần khám mới nhất (`clinical.lamenessLimb`). Ngựa đứng co chân đau hoặc có vòng đỏ ở vùng bị thương.
- **Bầu trời theo giờ buổi tập:** buổi 07:30 có trời sáng, buổi 17:00 có hoàng hôn (prop `hour` của `MovingHorse3D`).
- **Chạy thử:** cột mốc đỏ dọc rào và cột đích. Cột đích hiện khi lần đo tới sẽ về đích. Nhãn báo "còn N m".
- **Tập dốc** có đồi phía xa. **Kiệu** là dáng chạy riêng, dựng lại từ clip Walk.
- **Xem lại buổi chạy:** server lưu mọi lần đo vào `TrainingSession.trace` (tối đa 400, `select: false`, kèm cờ `tired`/`injury`). `GET /training/sessions/:id/readings` trả cả buổi khi buổi đã xong. Nút "Xem lại buổi chạy" có ở lịch tuần và danh sách (`SessionReplay.jsx`): ngựa 3D chạy lại, biểu đồ, phát/tạm dừng/tua. Các buổi chạy trước 26/10 không xem lại được.
- **Dashboard HLV:** khi có buổi đang chạy, sân oval hiện vị trí từng ngựa theo phần cự ly đã chạy (`LiveTrackOval.jsx`).

**Giao diện HLV/Quản lý** (theo đề xuất của Antigravity, `scratch/UI_UX_REDESIGN_HLV_MANAGER.md`)

- **Header** (`PageHeroBanner`) gọn còn một tầng. Số liệu nằm cùng hàng tiêu đề. Các trang Thu chi, Nhân sự, Giải đua, Nhật ký, Kho bỏ dải ô số riêng.
- **Hồ sơ ngựa:** thông số và người phụ trách nằm chung một thẻ cạnh ngựa 3D. Phần dưới chia tab: hành trình, chuồng (3D chỉ tải khi mở tab), thành tích. Có thể mở thẳng bằng `?tab=stall`.
- **Lịch tuần:** bộ lọc và chọn tuần chung một hàng. Thẻ buổi có vạch màu trạng thái bên trái. Ngày nghỉ là gạch mảnh.
- **Thẻ kế hoạch:** bỏ hộp lồng nhau. Câu quy định phong độ chuyển vào dấu "?".
- **Thẻ trực tiếp:** dải số đo kẻ mảnh (`Telemetry.jsx`).
- **Xếp chuồng:** "Cần xử lý" gọn còn một dòng nút. Thanh chọn khu nằm ngay trên khung 3D.
- **Dashboard:** bỏ viền đỉnh nhiều màu. Thẻ không có việc thu còn một dòng (`QuietCard.jsx`).
- **Lưu ý cỡ chữ heading:** một style toàn cục nằm ngoài layer của Tailwind đè lên `text-*` của `h1`/`h2`/`h3`. Muốn đổi cỡ heading thì dùng `!text-...`.

**Gọn khi CLB có nhiều ngựa** (Duy góp ý: màn dài, rối)

- Nguyên tắc: mỗi ngựa một dòng thấp; chi tiết mở khi rê chuột hoặc bấm; bảng dài có ô tìm ngựa (không phân biệt dấu, `utils/fold.js`) và lọc "Cần chú ý".
- **Lịch tuần:** mỗi ngựa khoảng 50 px. Phong độ là chấm màu cạnh tên. "Xếp lại tuần" thành nút biểu tượng. Thẻ buổi một dòng, chỉ thêm dòng thứ hai khi có kết quả hoặc đang chờ xử lý. Ngựa có lịch trong tuần xếp lên đầu. Bảng cuộn trong khung, tiêu đề ngày và cột tên ngựa đứng yên (`wc-sticky`, có màu nền riêng ở chế độ tối trong `MainLayout`).
- **Kế hoạch:** bảng mỗi ngựa một dòng (giai đoạn, tiến độ, buổi tới, giải, phong độ, trạng thái). Bấm "+" mở chi tiết.
- **Chăm sóc và khẩu phần:** có ô tìm ngựa và lọc "Cần chú ý". Bỏ cột và nhãn trùng. Thời khóa biểu cho ăn hết cuộn ngang nhờ `table-fixed`.
- Header các màn HLV/Quản lý bỏ câu mô tả dài.

**Bãi cỏ 360°, trời giờ thực, chuyển ngựa, màu trạng thái** (Duy góp ý: xoay 360° không khớp cảnh, ngựa hơi tối, phải quay lại danh sách mới xem ngựa khác)

- **Ngựa đang nghỉ** đứng trong bãi cỏ tròn có rào quanh, xoay hướng nào cũng kín cảnh (`horseStage.js`, `PADDOCK`). Bên ngoài rào có cổng giằng chéo, nhà trại với đường đất từ cổng tới cửa, cây phong, kiện rơm tròn, silo, máng nước, hàng cây và đồi thấp ở chân trời. Ngựa đang tập vẫn chạy trên dải đường chạy. Ở dải này góc xoay bị giới hạn để không nhìn thấy mép.
- **Ngựa đang hồi phục** đi vòng trong bãi, camera đi theo.
- **Trời bãi cỏ theo giờ thực ở Việt Nam,** chuyển dần từng phút qua đêm, bình minh, sáng, trưa, chiều, hoàng hôn, chạng vạng. Mặt trời đi theo giờ. Góc khung ghi giờ, ví dụ "Chiều, 17:32".
- **Màu lông** ngựa chuyển động được làm đều lại (`prepare-animated.mjs`, hàm `evenOut`), nên giống màu ngựa trong chuồng 3D. `tools/horse-model/coat-luma.mjs` dùng để đo độ sáng hai mô hình.
- **Hồ sơ ngựa** có nút ‹ › và ô chọn để chuyển sang ngựa khác của HLV, vẫn giữ tab đang mở.
- **Lịch tuần và thời khóa biểu cho ăn:** mỗi buổi tập và bữa ăn tô màu theo trạng thái (xanh lá: xong; đỏ: bỏ lỡ; xanh dương: đang chạy; vàng hoặc xanh ngọc: đang chờ). Cột hôm nay có nhãn "Hôm nay".
- **Danh sách ngựa trên màn rộng:** không còn khoảng trắng giữa bảng. Mọi cột có bề rộng cố định, trừ "Bước tiếp theo" lấy phần còn lại.
  - Màn rộng thêm cột tuổi và cân nặng: HLV từ 1200 px, Quản lý từ 1600 px.
  - Từ 1600 px, HLV thêm cột chủ và bác sĩ, và cột kế hoạch (giai đoạn, tuần, số ngày tới giải, buổi tới).
  - Ngựa đủ điều kiện chỉ ghi "Đủ điều kiện" một lần.
  - Ghi chú dài của bác sĩ hiện tối đa 2 dòng.
- **Ngựa 3D mới cho mọi vai trò:** trang ngựa của bác sĩ (`HorseHealthDetail`) bỏ `Horse3D` cũ, dùng cùng bãi cỏ và trời theo giờ như HLV. Ngựa co hoặc đỡ đúng chân mà bác sĩ đã đánh dấu. Trang chủ ngựa (đã dùng `MovingHorse3D`) nay cũng có đồng hồ. Đồng hồ ẩn khi khung hẹp dưới 300 px (điện thoại).
- **Hồ sơ ngựa (HLV/Quản lý):** khung 3D to hơn (chiếm 14/24 cột) và cao bằng thẻ hồ sơ bên cạnh (prop `fill`). Ban đêm sáng hơn, kiểu trời có trăng, nên ngựa lông sẫm vẫn nhìn rõ.
- **Dashboard HLV/Quản lý không còn khoảng trắng lớn:**
  - Mỗi thẻ cảnh báo chỉ hiện vài dòng đầu, phần còn lại sau nút "Xem tất cả" (`useFirst.jsx`).
  - Bữa ăn bỏ lỡ: mỗi ngựa một dòng, một nút "Báo cho ăn bù" cho mọi bữa còn thiếu của ngựa đó.
  - Y lệnh bác sĩ: mỗi ngựa một dòng (tiến độ, số liều bỏ lỡ), bấm để xem từng liều.
  - Ngựa bị hạn chế, yêu cầu khám, sự cố: văn bản dài cắt còn 1–2 dòng.
  - Biểu đồ thể lực chuyển xuống một hàng ngang toàn trang, nên hai cột phía trên dài gần bằng nhau.
- **Demo tự chạy sáng 27/10 (05:00, dự phòng 06:30) trên dữ liệu thật** (`server/scripts/demoFlows.js`, workflow "Demo flows (live)"):
  - Lượt 1 có 9 ngựa "Test Demo 27/10 R1 · …":
    - Đạt (kèm giải, chạy thử, quyết định dự giải);
    - Không đạt;
    - Chấn thương (cảm biến tự dừng, bác sĩ kê đơn và khóa tập, rút khỏi giải);
    - Mệt;
    - Chỉ tập nhẹ;
    - Khóa giữa buổi;
    - Dừng vì mưa;
    - Ăn bù;
    - Lỡ giờ.
  - Lượt 1 có thêm 2 sự cố chuồng (1 đã xử lý, 1 còn mở) và 1 đề xuất nhập kho được duyệt một phần.
  - Lượt 2–4 (05:45, 06:30, 07:15) mỗi lượt có Đạt và Không đạt. Giải "TEST Cúp Demo 28/10".
- **Góp ý mentor RV2 (27/10):**
  - **Tab HLV theo thứ tự công việc:** menu đánh số 1 Danh sách ngựa → 2 Khẩu phần & Chăm sóc → 3 Đăng ký giải đua → 4 Kế hoạch → 5 Buổi tập & đánh giá. Thanh "Quy trình" ở hàng trên cùng (`TrainerFlowBar.jsx`) tô sáng bước của trang đang mở và đếm số ngựa chờ mỗi bước.
  - **Khu thường / khu cách ly** (`stable/placement.js`):
    - ngựa bị bác sĩ kết luận cách ly chỉ được xếp vào chuồng cách ly, và Quản lý được báo để chuyển ngựa;
    - sơ đồ đánh dấu ngựa sai khu (ngựa cách ly ở ngoài khu cách ly, ngựa khỏe chiếm chuồng cách ly, ngựa chấn thương ở chuồng thường khi đã có chuồng hồi phục) và đưa vào "Cần xử lý → Sai khu theo sức khỏe".
  - **Dữ liệu demo sạch** (`demoFlows.js` `DEMO_MODE=prepare`): cất các ngựa test cũ, tạo khu cách ly + khu hồi phục, tạo 3 ngựa "Demo 1 · Mới tiếp nhận", "Demo 2 · Sẵn sàng tập", "Demo 3 · Diễn tập chấn thương". Chạy lại được nhiều lần.
  - **Dữ liệu trên web thật đã dọn (27/10, bằng phiên Quản lý):**
    - cất 18 ngựa test ("Test Demo …", "Sao Mai Test"), khôi phục được trong "Đã ngừng quản lý";
    - đổi tên 2 ngựa đủ hồ sơ thành "Demo · Sẵn sàng tập" (A-02) và "Demo · Diễn tập chấn thương" (A-04);
    - tạo Khu cách ly (CL, 3 chuồng) và Khu hồi phục (HP, 2 chuồng); Taurus đang chấn thương chuyển sang HP-01; ngựa "demo" mới tiếp nhận ở C-01.
    - Còn 7 ngựa, không còn mục "Cần xử lý".
- **CI:** giới hạn job nâng từ 15 lên 30 phút. Đã có 2 lần CI bị hủy đúng mốc 15 phút; một lần riêng bước cài trình duyệt mất 9 phút.

## 5. Cho dev: cách làm, test, deploy

- **Nhánh:** code trên nhánh của mình. Trước khi làm và trước khi merge: `git pull origin main`, sửa xung đột trên nhánh mình. Merge trên GitHub chọn **Create a merge commit**.
- **Test trước khi merge:**
  - **Server (đơn vị + tích hợp):** `npm run test:server`. Cần MongoDB chạy replica set và biến `TEST_MONGO_URI`.
  - **App điện thoại:** `npm run test:mobile`.
  - **Giao diện:** `npm run test:ui`. Bộ chạy mở app một lần trước cho Vite biên dịch xong rồi mới chạy test.
  - **Web:** `npm run lint -w client` và `npm run build`.

  Làm lại trang nào thì sửa test của trang đó trong cùng lượt.
- **Deploy:** push lên `main` thì Vercel build web, Render deploy server khi `server/` đổi. Gói Hobby của Vercel ít RAM: `client/src/index.css` có `@source not "../public"` để Tailwind không quét file mô hình 3D. Dòng này **đừng xóa**, nếu không build hết bộ nhớ.
- **React 19 với thẻ `<model-viewer>`:** thuộc tính bật tắt phải truyền boolean (`autoplay`, không phải `autoplay=""`). Viết `""` thì sau khi chuyển trang ngựa đứng im ở tư thế gốc.
- **Cờ server:**
  - `AUTO_SCHEDULE_PLANS=false` tắt lịch tự xếp; test harness đã tắt sẵn.
  - `ENABLE_SENSOR_SIMULATOR=true` bật cảm biến mô phỏng và nút "Mô phỏng sự cố".
- **Chủ từng phần** (sửa file của ai thì nhắn người đó):
  - backend và màn Quản lý, HLV: Duy;
  - màn bác sĩ: trunghieu;
  - màn chủ ngựa: Quân;
  - app nhân viên chăm sóc: Tien.

## 6. Còn chờ Duy chốt

- Kết quả giải có bắt buộc qua bước quyết định dự giải không (dự kiến có).
- Dọn dữ liệu demo "Test Demo …" trên web thật, và các bản ghi chuồng cũ của ngựa đã ngừng quản lý.
- Đưa ngựa 3D chuyển động sang màn chủ ngựa và bác sĩ (cần chủ màn đồng ý).
- Lưu từng lần đo của buổi tập để xem lại buổi đã chạy (hiện chỉ lưu số tổng hợp).
