// Finance categories as stored (English keys, plus whatever was typed before there was a list) and
// how they read. Shared by the finance table, the manager's report and the entry form.
export const FINANCE_CATEGORIES = {
  cost: [
    { value: 'feed', label: 'Thức ăn' },
    { value: 'medical', label: 'Y tế' },
    { value: 'training', label: 'Huấn luyện' },
    { value: 'equipment', label: 'Trang thiết bị' },
    { value: 'transport', label: 'Vận chuyển' },
    { value: 'staff', label: 'Nhân sự' },
    { value: 'race_fee', label: 'Lệ phí giải đua' },
    { value: 'other', label: 'Khác' },
  ],
  revenue: [
    { value: 'prize', label: 'Tiền thưởng giải' },
    { value: 'sponsorship', label: 'Tài trợ' },
    { value: 'other', label: 'Khác' },
  ],
};

const LABELS = Object.fromEntries([...FINANCE_CATEGORIES.cost, ...FINANCE_CATEGORIES.revenue].map((c) => [c.value, c.label]));

export const categoryLabel = (category) => LABELS[category] || category;
