/**
 * The club's stock list — the same 35 items the live database holds (10 foods, 15 medicines and
 * medical supplies, 10 pieces of equipment), used by the seed to fill a local database.
 *
 * `unit` is what a ration or a dose is measured in and what stock goes down by; `packUnit` /
 * `packSize` say how it is bought ("1 bao = 25 kg"), so deliveries and requests can be counted in
 * packs. `reorderLevel` is the minimum stock below which the Manager is warned.
 */
const INVENTORY_ITEMS = [
  // ---- Thức ăn (feed) ----
  { category: 'feed', name: 'Yến mạch (Oats)', unit: 'kg', packUnit: 'bao', packSize: 25, reorderLevel: 50, quantity: 250, description: 'Cung cấp năng lượng cho ngựa đua' },
  { category: 'feed', name: 'Cỏ khô Alfalfa (Alfalfa Hay)', unit: 'kg', packUnit: 'kiện', packSize: 20, reorderLevel: 40, quantity: 200, description: 'Bổ sung protein và chất xơ' },
  { category: 'feed', name: 'Cỏ khô Timothy (Timothy Hay)', unit: 'kg', packUnit: 'kiện', packSize: 20, reorderLevel: 40, quantity: 200, description: 'Hỗ trợ hệ tiêu hóa' },
  { category: 'feed', name: 'Thức ăn viên chuyên dụng (Horse Pellets)', unit: 'kg', packUnit: 'bao', packSize: 20, reorderLevel: 40, quantity: 100, description: 'Bổ sung dinh dưỡng hằng ngày' },
  { category: 'feed', name: 'Cám ngũ cốc (Grain Mix)', unit: 'kg', packUnit: 'bao', packSize: 25, reorderLevel: 50, quantity: 100, description: 'Cung cấp năng lượng' },
  { category: 'feed', name: 'Bột điện giải (Electrolyte Powder)', unit: 'g', packUnit: 'hộp', packSize: 1000, reorderLevel: 500, quantity: 3000, description: 'Bổ sung điện giải sau vận động theo chỉ định' },
  { category: 'feed', name: 'Vitamin tổng hợp (Multivitamin)', unit: 'g', packUnit: 'hộp', packSize: 1000, reorderLevel: 300, quantity: 2000, description: 'Bổ sung vitamin theo nhu cầu' },
  { category: 'feed', name: 'Khoáng chất (Mineral Supplement)', unit: 'kg', packUnit: 'túi', packSize: 5, reorderLevel: 5, quantity: 20, description: 'Bổ sung khoáng chất' },
  { category: 'feed', name: 'Muối liếm (Salt Lick Block)', unit: 'viên', reorderLevel: 2, quantity: 10, description: 'Bổ sung muối và hỗ trợ cân bằng điện giải' },
  { category: 'feed', name: 'Dầu hạt lanh (Flaxseed Oil)', unit: 'lít', packUnit: 'can', packSize: 5, reorderLevel: 2, quantity: 10, description: 'Bổ sung chất béo trong khẩu phần' },

  // ---- Thuốc & vật tư y tế (medicine) — what the vet prescribes and uses ----
  { category: 'medicine', name: 'Dung dịch sát trùng (Antiseptic Solution)', unit: 'ml', packUnit: 'chai', packSize: 500, reorderLevel: 500, quantity: 2000, description: 'Làm sạch vết thương theo chỉ định' },
  { category: 'medicine', name: 'Gạc y tế (Sterile Gauze)', unit: 'miếng', packUnit: 'hộp', packSize: 100, reorderLevel: 50, quantity: 300, description: 'Băng bó vết thương' },
  { category: 'medicine', name: 'Băng cuốn thú y (Vet Wrap)', unit: 'cuộn', packUnit: 'hộp', packSize: 12, reorderLevel: 6, quantity: 24, description: 'Cố định băng và bảo vệ vùng bị thương' },
  { category: 'medicine', name: 'Nhiệt kế điện tử (Digital Thermometer)', unit: 'cái', reorderLevel: 1, quantity: 3, description: 'Kiểm tra thân nhiệt' },
  { category: 'medicine', name: 'Ống nghe thú y (Veterinary Stethoscope)', unit: 'cái', reorderLevel: 1, quantity: 2, description: 'Nghe nhịp tim và âm thanh hô hấp' },
  { category: 'medicine', name: 'Dung dịch truyền (IV Fluids)', unit: 'túi', reorderLevel: 5, quantity: 20, description: 'Hỗ trợ điều trị khi có chỉ định' },
  { category: 'medicine', name: 'Kim tiêm thú y (Veterinary Needles)', unit: 'cái', packUnit: 'hộp', packSize: 100, reorderLevel: 50, quantity: 200, description: 'Phục vụ tiêm thuốc và vaccine' },
  { category: 'medicine', name: 'Dung dịch vệ sinh móng (Hoof Cleaning Solution)', unit: 'ml', packUnit: 'chai', packSize: 500, reorderLevel: 500, quantity: 1500, description: 'Vệ sinh và hỗ trợ chăm sóc móng' },
  { category: 'medicine', name: 'Túi chườm lạnh (Cold Therapy Pack)', unit: 'túi', reorderLevel: 2, quantity: 10, description: 'Hỗ trợ xử lý chấn thương phần mềm' },
  { category: 'medicine', name: 'Thuốc tẩy giun (Dewormer)', unit: 'tuýp', reorderLevel: 4, quantity: 12, description: 'Kiểm soát ký sinh trùng theo lịch thú y' },
  // Treatment drugs the vet prescribes from stock.
  { category: 'medicine', name: 'Phenylbutazone (Bute) 1g', unit: 'viên', packUnit: 'hộp', packSize: 100, reorderLevel: 20, quantity: 100, description: 'Giảm đau, kháng viêm cơ xương khớp' },
  { category: 'medicine', name: 'Flunixin meglumine (Banamine) tiêm', unit: 'ml', packUnit: 'lọ', packSize: 100, reorderLevel: 50, quantity: 200, description: 'Giảm đau, hạ sốt, chống viêm (tiêm)' },
  { category: 'medicine', name: 'Kháng sinh Penicillin tiêm', unit: 'ml', packUnit: 'lọ', packSize: 100, reorderLevel: 50, quantity: 200, description: 'Điều trị nhiễm khuẩn theo chỉ định' },
  { category: 'medicine', name: 'Vắc-xin uốn ván (Tetanus Vaccine)', unit: 'liều', packUnit: 'hộp', packSize: 10, reorderLevel: 4, quantity: 10, description: 'Tiêm phòng uốn ván định kỳ' },
  { category: 'medicine', name: 'Gel kháng viêm bôi ngoài', unit: 'ml', packUnit: 'tuýp', packSize: 100, reorderLevel: 100, quantity: 300, description: 'Bôi giảm sưng gân, khớp' },

  // ---- Dụng cụ (equipment) ----
  { category: 'equipment', name: 'Bàn chải lông ngựa (Horse Grooming Brush)', unit: 'cái', reorderLevel: 2, quantity: 8, description: 'Chải lông, vệ sinh ngựa' },
  { category: 'equipment', name: 'Dụng cụ vệ sinh móng (Hoof Pick)', unit: 'cái', reorderLevel: 2, quantity: 8, description: 'Làm sạch móng ngựa' },
  { category: 'equipment', name: 'Yên ngựa (Horse Saddle)', unit: 'cái', reorderLevel: 1, quantity: 4, description: 'Phục vụ cưỡi và huấn luyện' },
  { category: 'equipment', name: 'Dây cương (Bridle)', unit: 'bộ', reorderLevel: 1, quantity: 4, description: 'Điều khiển ngựa khi tập luyện' },
  { category: 'equipment', name: 'Dây dắt ngựa (Lead Rope)', unit: 'sợi', reorderLevel: 2, quantity: 8, description: 'Dẫn ngựa di chuyển' },
  { category: 'equipment', name: 'Xô đựng nước (Water Bucket)', unit: 'cái', reorderLevel: 2, quantity: 8, description: 'Cung cấp nước uống' },
  { category: 'equipment', name: 'Máng ăn (Feed Trough)', unit: 'cái', reorderLevel: 1, quantity: 4, description: 'Đựng thức ăn' },
  { category: 'equipment', name: 'Ủng chườm lạnh (Ice Boots)', unit: 'đôi', reorderLevel: 1, quantity: 4, description: 'Hỗ trợ làm mát chân sau vận động' },
  { category: 'equipment', name: 'Chăn ngựa (Horse Blanket)', unit: 'cái', reorderLevel: 1, quantity: 6, description: 'Giữ ấm và bảo vệ cơ thể' },
  { category: 'equipment', name: 'Mũ bảo hộ cưỡi ngựa (Riding Helmet)', unit: 'cái', reorderLevel: 1, quantity: 4, description: 'Bảo vệ người cưỡi trong quá trình huấn luyện' },
];

module.exports = { INVENTORY_ITEMS };
