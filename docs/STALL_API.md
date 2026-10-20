# Chuồng trên sơ đồ: API cho các màn

Từ 20/10/2026 chuồng không còn chỉ là chữ tự do. Manager lập **danh mục chuồng** theo khu (A-01, A-02, …, CL-01). Xếp ngựa thì chọn một chuồng trong danh mục. Bản mẫu giao diện (khu chuồng 3D kiểu trang trại, sơ đồ theo tab, xem như từng vai trò): https://claude.ai/artifact/TJdbytRPox64uKA2DSXmBG

Tất cả nằm dưới `/api/v1/stable`. Request/response chi tiết ở `/api-docs` (OpenAPI, nhóm "Stable (Groom)").

## Màn cũ không phải sửa gì

`StableAssignment.stableBlock` vẫn còn và **luôn là mã chuồng** khi ngựa được xếp vào chuồng trên sơ đồ, ví dụ `"A-03"`. Màn nào đang hiện `stableBlock` vẫn đúng: việc của nhân viên chăm sóc, danh sách ngựa, xuất file. Các xếp chuồng cũ (chữ tự do) vẫn chạy như trước.

## Các route

| Route | Ai gọi | Dùng để |
|---|---|---|
| `GET /stable/stalls` | mọi vai trò | Sơ đồ: mọi chuồng đang dùng, theo khu và thứ tự, kèm ngựa đang ở |
| `GET /stable/stalls/by-horse/:horseId` | ai xem được ngựa đó | Chuồng và người chăm sóc của một ngựa, cho màn chi tiết ngựa |
| `POST /stable/stalls/generate` | Manager | Tạo cả khu: `{ zone: "A", count: 8, zoneName: "Khu A", zonePurpose: "Ngựa đua chủ lực" }` |
| `POST /stable/stalls` | Manager | Tạo một chuồng: `{ zone: "CL", number: 1, type: "isolation" }` |
| `PATCH /stable/stalls/:id` | Manager | Đổi tên/mục đích khu, loại, thứ tự; bảo trì `{ status: "maintenance", maintenanceNote }` |
| `DELETE /stable/stalls/:id` | Manager | Ngừng dùng một chuồng trống (giữ lại mã) |
| `POST /stable/assignments` | Manager | Xếp ngựa: `{ horse, stall: "<id chuồng>", assignedCaretaker }`. Vẫn nhận `stableBlock` như cũ |

## Dữ liệu một chuồng

```json
{
  "_id": "…", "code": "A-03", "zone": "A", "zoneName": "Khu A", "zonePurpose": "Ngựa đua chủ lực",
  "type": "standard", "order": 2, "status": "active", "maintenanceNote": "", "maintenanceUntil": null,
  "isActive": true, "occupied": true,
  "occupant": {
    "assignment": "…",
    "horse": { "_id": "…", "name": "Hoàng Kim", "breed": "Arabian", "color": "…", "healthStatus": "eligible" },
    "caretaker": { "_id": "…", "name": "…" },
    "since": "2026-10-12T…"
  }
}
```

- `type`: `standard` (thường), `isolation` (cách ly), `recovery` (hồi phục).
- `status`: `active` hoặc `maintenance`. Chuồng bảo trì không xếp ngựa được. Chuồng đang có ngựa thì không đặt bảo trì được (409).
- `occupant`:
  - `null`: chuồng trống.
  - `{ "hidden": true }`: chuồng có ngựa nhưng người gọi không được xem con ngựa đó. Cứ hiện là "có ngựa", không ghi tên.
- Màu trạng thái gợi ý: `healthStatus` `eligible` xanh, `monitoring` vàng, `injured`/`quarantined` đỏ; chuồng trống xám; bảo trì gạch chéo.
- `GET /stable/stalls` trả thêm `unplaced`: các ngựa (người gọi xem được) vẫn đang ở chuồng chữ tự do. Manager kéo chúng vào sơ đồ.

## Mỗi vai trò thấy gì, làm được gì

API đã áp dụng đúng bảng này: màn nào cũng gọi chung một route, server tự ẩn những gì vai trò đó không được xem.
Chỉ Quản lý xếp và đổi chuồng (kèm người chăm sóc): đó là phân bổ chuồng và nhân sự cho cả trại, vai trò khác không thấy đủ. Từ 20/10/2026 HLV gọi `POST /stable/assignments` nhận 403.

| Vai trò | Thấy chuồng (trống, có ngựa, bảo trì) | Thấy ngựa (tên, giống, người chăm sóc) | Thấy ngựa trong chuồng (3D) | Làm được |
|---|---|---|---|---|
| Quản lý CLB | Tất cả | Tất cả | Tất cả, có tên trên biển | Lập khu, thêm/bỏ chuồng, đặt bảo trì, xếp và đổi chuồng mọi ngựa |
| HLV | Tất cả | Ngựa mình phụ trách | Ngựa mình có tên; ngựa khác là dáng ngựa chung, biển "CÓ NGỰA" | Chỉ xem; cần đổi chuồng thì đề nghị Quản lý |
| Bác sĩ | Tất cả | Ngựa mình phụ trách, ngựa chưa có bác sĩ, đã khám hoặc đang chờ khám | Như HLV | Chỉ xem; cần chuyển khu cách ly thì báo Quản lý |
| Chủ ngựa | Tất cả | Chỉ ngựa của mình | Như HLV | Chỉ xem |
| NV chăm sóc | Tất cả | Tất cả (biết chuồng bên cạnh) | App điện thoại: Tien quyết | Chỉ xem; mã chuồng trên từng việc |

"Thấy chuồng" nghĩa là biết chuồng nào trống, có ngựa hay đang bảo trì. Với ngựa không được xem, API trả `occupant: { "hidden": true }`: màn hiện "Có ngựa", không tên, không người chăm sóc.

## Ai làm phần nào

| Màn | Người | Việc |
|---|---|---|
| Manager: sơ đồ khu, xếp/đổi chuồng, bảo trì; chi tiết ngựa có chuồng 3D | Claude | xong (`/admin/stables`, chi tiết ngựa) |
| HLV: chuồng 3D trong chi tiết ngựa, cột Chuồng ở danh sách ngựa | Claude | xong |
| Bác sĩ: ngựa chấn thương nổi đỏ trên sơ đồ; đề nghị Quản lý chuyển ngựa sang khu cách ly (chuồng `type: "isolation"`) | trunghieu | gọi `GET /stable/stalls` |
| Chủ ngựa: chuồng của ngựa mình, có 3D | Quân | gọi `GET /stable/stalls/by-horse/:horseId`, dùng component chung khi có |
| NV chăm sóc (app): mã chuồng trên từng việc, danh sách chuồng mình phụ trách | Tien | `stableBlock` đã là mã chuồng; lọc `GET /stable/stalls` theo `occupant.caretaker._id` |

## Gắn vào màn web của bạn

Các component sẵn trong `client/src/features/stable/`:

- `HorseStallCard`: thẻ "Chuồng" của một ngựa (3D khu chuồng nhìn vào chuồng của nó, mã, khu, người chăm sóc).
  `<HorseStallCard horseId={horse._id} canManage={false} />`. Hợp cho màn chủ ngựa, màn bác sĩ.
- `stall3d/Stall3D`: chỉ cảnh 3D. `<Stall3D stalls={stallsCuaMotKhu} focusCode="A-03" onSelect={(code) => …} height={360} />`.
  `stalls` lấy từ `GET /stable/stalls` (lọc theo `zone`); three.js chỉ tải khi component hiện lên.
- `StableMapBoard`: sơ đồ khu + 3D + thông tin chuồng. `canManage={false}` cho vai trò chỉ xem.
- API client: `stallApi` trong `stableApi.js` (`map`, `forHorse`, …).

App điện thoại (Tien) không dùng được component web này. `stableBlock` đã là mã chuồng, `GET /stable/stalls` cho cả sơ đồ.
