# Trang hướng dẫn test riêng

Bản công khai (không cần chạy lệnh): https://claude.ai/artifact/495trt4fgGWhx1E9iJQ9RH. Ai chưa mở được thì nhờ Duy chia sẻ quyền xem.
Trên máy: từ thư mục gốc chạy `npm run test:guide`, mở **http://localhost:5190**.

Trang tách khỏi client, không cần đăng nhập hay kết nối database: 63 bước trong 7
nhóm, kết quả mong đợi, ghi chú, lưu tiến độ trong trình duyệt và biên bản Markdown để sao chép.
Nhập địa chỉ web project thật để các liên kết mở đúng môi trường/role.

Mục "Thông số mẫu · form HLV" có bảng cho 10 form của HLV: điền gì để test qua, quy tắc hệ thống
kiểm tra và một giá trị thử sai. Dữ liệu nằm ở `forms.cjs`; khi form hoặc quy tắc đổi thì sửa file đó rồi
chạy `build.cjs`.

`index.html` cũng mở trực tiếp được bằng trình duyệt khi không chạy server.
Để cập nhật dữ liệu theo `docs/TEST_CHECKLIST.md`, chạy
`node tools/test-flow-guide/build.cjs`. Các nhánh quyền bổ sung và kết quả kỹ thuật
được định nghĩa trong script. Server chỉ nghe localhost, cổng 5190.
Sau khi đổi `index.html` hoặc dữ liệu, bản công khai cần đăng lại cùng link (Duy đăng).
