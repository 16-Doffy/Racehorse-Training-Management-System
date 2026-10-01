/**
 * The club's standard stock list: 10 foods, 10 medicines / medical supplies, 10 pieces of
 * equipment. The Manager can import it (POST /inventory/catalog/import — only the names not
 * already in stock are added, with quantity 0 to fill in) and add anything else by hand.
 *
 * `unit` is the unit things are used and counted in — what a ration or a dose is measured in and
 * what stock goes down by. `packUnit` / `packSize` describe how it is bought ("1 bao = 25 kg"),
 * so stock can be received and requested by the pack. `reorderLevel` is the minimum stock below
 * which the Manager is warned.
 */
const CATALOG = [
  // ---- Thức ăn (feed) ----
  { category: 'feed', name: 'Yến mạch (Oats)', unit: 'kg', packUnit: 'bao', packSize: 25, reorderLevel: 50, description: 'Cung cấp năng lượng cho ngựa đua' },
  { category: 'feed', name: 'Cỏ khô Alfalfa (Alfalfa Hay)', unit: 'kg', packUnit: 'kiện', packSize: 20, reorderLevel: 40, description: 'Bổ sung protein và chất xơ' },
  { category: 'feed', name: 'Cỏ khô Timothy (Timothy Hay)', unit: 'kg', packUnit: 'kiện', packSize: 20, reorderLevel: 40, description: 'Hỗ trợ hệ tiêu hóa' },
  { category: 'feed', name: 'Thức ăn viên chuyên dụng (Horse Pellets)', unit: 'kg', packUnit: 'bao', packSize: 20, reorderLevel: 40, description: 'Bổ sung dinh dưỡng hằng ngày' },
  { category: 'feed', name: 'Cám ngũ cốc (Grain Mix)', unit: 'kg', packUnit: 'bao', packSize: 25, reorderLevel: 50, description: 'Cung cấp năng lượng' },
  { category: 'feed', name: 'Bột điện giải (Electrolyte Powder)', unit: 'g', packUnit: 'hộp', packSize: 1000, reorderLevel: 500, description: 'Bổ sung điện giải sau vận động theo chỉ định' },
  { category: 'feed', name: 'Vitamin tổng hợp (Multivitamin)', unit: 'g', packUnit: 'hộp', packSize: 1000, reorderLevel: 300, description: 'Bổ sung vitamin theo nhu cầu' },
  { category: 'feed', name: 'Khoáng chất bổ sung (Mineral Supplement)', unit: 'g', packUnit: 'túi', packSize: 5000, reorderLevel: 1000, description: 'Bổ sung khoáng chất' },
  { category: 'feed', name: 'Muối liếm (Salt Lick Block)', unit: 'viên', reorderLevel: 2, description: 'Bổ sung muối, cân bằng điện giải — đặt sẵn trong chuồng' },
  { category: 'feed', name: 'Dầu hạt lanh (Flaxseed Oil)', unit: 'ml', packUnit: 'chai', packSize: 1000, reorderLevel: 1000, description: 'Bổ sung chất béo trong khẩu phần' },

  // ---- Thuốc & vật tư y tế (medicine) — what the vet prescribes and uses ----
  { category: 'medicine', name: 'Phenylbutazone (Bute) 1g', unit: 'viên', packUnit: 'hộp', packSize: 100, reorderLevel: 20, description: 'Giảm đau, kháng viêm cơ xương khớp' },
  { category: 'medicine', name: 'Flunixin meglumine (Banamine) tiêm', unit: 'ml', packUnit: 'lọ', packSize: 100, reorderLevel: 50, description: 'Giảm đau, hạ sốt, chống viêm (tiêm)' },
  { category: 'medicine', name: 'Kháng sinh Penicillin tiêm', unit: 'ml', packUnit: 'lọ', packSize: 100, reorderLevel: 50, description: 'Điều trị nhiễm khuẩn theo chỉ định' },
  { category: 'medicine', name: 'Thuốc tẩy giun Ivermectin (Dewormer)', unit: 'tuýp', reorderLevel: 4, description: 'Kiểm soát ký sinh trùng theo lịch thú y (1 tuýp/liều)' },
  { category: 'medicine', name: 'Vắc-xin uốn ván (Tetanus Vaccine)', unit: 'liều', packUnit: 'hộp', packSize: 10, reorderLevel: 4, description: 'Tiêm phòng uốn ván định kỳ' },
  { category: 'medicine', name: 'Gel kháng viêm bôi ngoài', unit: 'ml', packUnit: 'tuýp', packSize: 100, reorderLevel: 100, description: 'Bôi giảm sưng gân, khớp' },
  { category: 'medicine', name: 'Dung dịch sát trùng Povidine (Antiseptic)', unit: 'ml', packUnit: 'chai', packSize: 500, reorderLevel: 500, description: 'Làm sạch vết thương theo chỉ định' },
  { category: 'medicine', name: 'Gạc y tế vô trùng (Sterile Gauze)', unit: 'miếng', packUnit: 'hộp', packSize: 100, reorderLevel: 50, description: 'Băng bó vết thương' },
  { category: 'medicine', name: 'Băng cuốn thú y (Vet Wrap)', unit: 'cuộn', packUnit: 'hộp', packSize: 12, reorderLevel: 6, description: 'Cố định băng, bảo vệ vùng bị thương' },
  { category: 'medicine', name: 'Kim tiêm thú y (Veterinary Needles)', unit: 'cái', packUnit: 'hộp', packSize: 100, reorderLevel: 50, description: 'Tiêm thuốc và vắc-xin' },

  // ---- Dụng cụ (equipment) ----
  { category: 'equipment', name: 'Bàn chải lông ngựa (Grooming Brush)', unit: 'cái', reorderLevel: 2, description: 'Chải lông, vệ sinh ngựa' },
  { category: 'equipment', name: 'Dụng cụ vệ sinh móng (Hoof Pick)', unit: 'cái', reorderLevel: 2, description: 'Làm sạch móng ngựa' },
  { category: 'equipment', name: 'Yên ngựa (Horse Saddle)', unit: 'cái', reorderLevel: 1, description: 'Phục vụ cưỡi và huấn luyện' },
  { category: 'equipment', name: 'Dây cương (Bridle)', unit: 'bộ', reorderLevel: 1, description: 'Điều khiển ngựa khi tập luyện' },
  { category: 'equipment', name: 'Dây dắt ngựa (Lead Rope)', unit: 'sợi', reorderLevel: 2, description: 'Dắt ngựa di chuyển' },
  { category: 'equipment', name: 'Xô đựng nước (Water Bucket)', unit: 'cái', reorderLevel: 2, description: 'Cung cấp nước uống' },
  { category: 'equipment', name: 'Máng ăn (Feed Trough)', unit: 'cái', reorderLevel: 1, description: 'Đựng thức ăn' },
  { category: 'equipment', name: 'Ủng chườm lạnh (Ice Boots)', unit: 'đôi', reorderLevel: 1, description: 'Làm mát chân sau vận động' },
  { category: 'equipment', name: 'Chăn ngựa (Horse Blanket)', unit: 'cái', reorderLevel: 1, description: 'Giữ ấm và bảo vệ cơ thể' },
  { category: 'equipment', name: 'Mũ bảo hộ cưỡi ngựa (Riding Helmet)', unit: 'cái', reorderLevel: 1, description: 'Bảo vệ người cưỡi khi huấn luyện' },
];

// Units the Manager is offered per category (they can still type another one).
const UNIT_SUGGESTIONS = {
  feed: { units: ['kg', 'g', 'lít', 'ml', 'viên'], packUnits: ['bao', 'kiện', 'hộp', 'túi', 'chai', 'can'] },
  medicine: { units: ['viên', 'ml', 'g', 'liều', 'tuýp', 'miếng', 'cái', 'cuộn', 'túi'], packUnits: ['hộp', 'lọ', 'chai', 'tuýp', 'gói'] },
  equipment: { units: ['cái', 'bộ', 'đôi', 'sợi', 'cuộn'], packUnits: [] },
};

const CODE_PREFIX = { feed: 'TA', medicine: 'YT', equipment: 'DC' };

module.exports = { CATALOG, UNIT_SUGGESTIONS, CODE_PREFIX };
