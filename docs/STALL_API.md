# Chuồng trên sơ đồ: API cho các màn

Từ 20/10/2026 chuồng không còn chỉ là chữ tự do. Manager lập **danh mục chuồng** theo khu (A-01, A-02, …, CL-01). Xếp ngựa thì chọn một chuồng trong danh mục. Bản mẫu giao diện (dãy chuồng 3D, sơ đồ khu): https://claude.ai/artifact/TJdbytRPox64uKA2DSXmBG

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
| `POST /stable/assignments` | Manager, HLV | Xếp ngựa: `{ horse, stall: "<id chuồng>", assignedCaretaker }`. Vẫn nhận `stableBlock` như cũ |

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

## Ai làm phần nào

| Màn | Người | Việc |
|---|---|---|
| Manager: sơ đồ khu, xếp/đổi chuồng, bảo trì; chi tiết ngựa có chuồng 3D | Claude | đang làm |
| HLV: chuồng 3D trong chi tiết ngựa, sơ đồ chỉ xem | Claude | đang làm |
| Bác sĩ: ngựa chấn thương nổi đỏ trên sơ đồ; chuyển ngựa sang khu cách ly (`POST /stable/assignments` với chuồng `type: "isolation"`, cần quyền Manager/HLV hoặc nhờ Manager) | trunghieu | gọi `GET /stable/stalls` |
| Chủ ngựa: chuồng của ngựa mình, có 3D | Quân | gọi `GET /stable/stalls/by-horse/:horseId`, dùng component chung khi có |
| NV chăm sóc (app): mã chuồng trên từng việc, danh sách chuồng mình phụ trách | Tien | `stableBlock` đã là mã chuồng; lọc `GET /stable/stalls` theo `occupant.caretaker._id` |

Component 3D dùng chung (`Stall3D`) sẽ nằm ở `client/src/features/stable/`. Màn web nào cũng gắn được: truyền vào một chuồng (dữ liệu như trên) là hiện chuồng có biển tên, đèn trạng thái và con ngựa bên trong.
