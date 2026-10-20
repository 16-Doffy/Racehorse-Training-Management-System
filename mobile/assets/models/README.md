# Mô hình 3D của con ngựa

Màn chi tiết ngựa (components/HorseStage.jsx) hiển thị mô hình `horse.glb` trong thư mục này.
Cách nối mô hình vào app nằm trong `src/three/horseModel.js`.

Mô hình đang dùng: **HORSE – Realistic 3D Model (DEMO FREE)** của WildMesh 3D trên Sketchfab
(https://sketchfab.com/3d-models/horse-realistic-3d-model-demo-free-65d6a70a6721495f938c93e80a5998e4).

- Giấy phép: CC BY-NC 4.0. Phải ghi công tác giả (app hiện dòng ghi công dưới khung 3D) và
  **không dùng cho mục đích thương mại**.
- Muốn dùng thương mại thì đổi sang mô hình mua bản quyền, cùng tên file `horse.glb`.

Tải về:
1. Đăng nhập Sketchfab (tài khoản miễn phí).
2. Bấm "Download 3D Model" và chọn định dạng **GLB**.
3. Chép file vào thư mục này.

File gốc thường nặng (texture 4K). Nén lại trước khi đưa vào app, để app mở nhanh trên điện thoại:

```
npx @gltf-transform/cli optimize horse-original.glb horse.glb --texture-compress webp --texture-size 2048
```

## Màu lông theo giống
Texture thân (`M_Body`) và bờm/đuôi (`M_Hair`) là ảnh xám, nên app tô màu lông của từng con ngựa lên khi hiển thị
(`src/three/horseBreeds.js`). Mô hình thay thế cũng cần texture xám trung tính như vậy, và tên vật liệu khai báo trong
`coatMaterials` (`src/three/horseModel.js`).

Web dùng bản sao của file này ở `client/public/models/horse.glb`. Thay mô hình thì chép đè cả hai file.

## Bản không yên cương cho bác sĩ
Bản đồ chấn thương 3D của bác sĩ (web) dùng `client/public/models/horse-bare.glb`: chính mô hình này đã
bỏ yên và dây cương (vật liệu `M_Saddle1`, `M_Saddle2`), giữ nguyên khung xương, hoạt ảnh và đơn vị — để
khám và đánh dấu được vùng lưng, đầu. Dòng ghi công trên web ghi rõ "bản đã bỏ yên cương" (CC BY-NC
yêu cầu nêu việc chỉnh sửa). Thay `horse.glb` thì tạo lại bản này bằng `tools/horse-model/strip-tack.mjs`
(hướng dẫn chạy ở đầu file).
