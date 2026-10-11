# Trang hướng dẫn test riêng

Từ thư mục gốc chạy `npm run test:guide`, mở **http://localhost:5190**.

Trang tách khỏi client, không cần đăng nhập hay kết nối database: 63 bước trong 7
nhóm, kết quả mong đợi, ghi chú, lưu tiến độ trong trình duyệt và xuất biên bản Markdown.
Nhập địa chỉ web project thật để các liên kết mở đúng môi trường/role.

`index.html` cũng mở trực tiếp được bằng trình duyệt khi không chạy server.
Để cập nhật dữ liệu theo `docs/TEST_CHECKLIST.md`, chạy
`node tools/test-flow-guide/build.cjs`. Các nhánh quyền bổ sung và kết quả kỹ thuật
được định nghĩa trong script. Server chỉ nghe localhost, cổng 5190.
