import { useState } from 'react';
import { Table, Typography, Tag, Select, DatePicker, Button, Tooltip, Space, Alert } from 'antd';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { auditApi } from './auditApi';
import { ROLE_LABELS } from '../../constants/roles';
import PageHeroBanner from '../../components/common/PageHeroBanner';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// Actions are "<family>.<verb>"; both halves read in Vietnamese, unknown ones show their code.
const FAMILY_LABELS = {
  horse: 'Ngựa',
  trainingSession: 'Buổi tập',
  trainingPlan: 'Kế hoạch',
  user: 'Tài khoản',
  healthRecord: 'Hồ sơ khám',
  treatment: 'Phác đồ',
  dailyTask: 'Việc chăm sóc',
  inventory: 'Kho',
  stableAssignment: 'Phân chuồng',
  feeding: 'Khẩu phần',
  race: 'Giải đua',
  incident: 'Sự cố',
  careEvent: 'Chăm sóc định kỳ',
  examRequest: 'Yêu cầu khám',
};
const VERB_LABELS = {
  create: 'tạo',
  update: 'sửa',
  delete: 'xóa',
  save: 'lưu',
  archive: 'ngừng quản lý',
  unarchive: 'quản lý lại',
  start: 'bắt đầu',
  abort: 'dừng giữa chừng',
  pre_check: 'kiểm tra sẵn sàng',
  readiness_override: 'bỏ qua cảnh báo',
  reschedule: 'xếp lại lịch',
  missed: 'lỡ giờ',
  auto_cancelled_by_lock: 'tự hủy do khóa tập',
  generate_week: 'sinh lịch tuần',
  evaluation_corrected: 'sửa đánh giá',
  approve: 'duyệt',
  deactivate: 'khóa',
  role_change: 'đổi vai trò',
  change_password: 'đổi mật khẩu',
  self_register: 'tự đăng ký',
  update_profile: 'sửa hồ sơ cá nhân',
  make_up_meal: 'báo cho ăn bù',
  not_done: 'báo không làm được',
  consume: 'xuất kho',
  receive: 'nhận hàng',
  record_result: 'nhập kết quả',
  attach: 'đính kèm tệp',
  return_assessment: 'đánh giá trở lại tập',
  ended_awaiting_return: 'kết thúc điều trị',
  update_care_schedule: 'sửa lịch chăm sóc',
  transfer_ownership: 'chuyển chủ',
  accept: 'nhận',
  decline: 'từ chối',
};
const MODEL_LABELS = {
  Horse: 'Ngựa',
  TrainingSession: 'Buổi tập',
  TrainingPlan: 'Kế hoạch',
  User: 'Tài khoản',
  HealthRecord: 'Hồ sơ khám',
  Treatment: 'Phác đồ',
  DailyTask: 'Việc chăm sóc',
  InventoryItem: 'Vật tư',
  StableAssignment: 'Phân chuồng',
  FeedingSchedule: 'Khẩu phần',
  RaceEntry: 'Giải đua',
  ExamRequest: 'Yêu cầu khám',
  CareEvent: 'Chăm sóc định kỳ',
};

function actionLabel(action = '') {
  const [family, verb] = action.split('.');
  if (!FAMILY_LABELS[family]) return action;
  if (verb?.startsWith('decision_')) return `${FAMILY_LABELS[family]} · quyết định ${verb === 'decision_withdraw' ? 'rút' : 'tham gia'}`;
  return `${FAMILY_LABELS[family]} · ${VERB_LABELS[verb] || verb}`;
}

/** The record's metadata in one short line; the full JSON on hover. */
function MetadataCell({ value }) {
  if (!value || typeof value !== 'object' || Object.keys(value).length === 0) return <Text type="secondary">—</Text>;
  const line = Object.entries(value)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' · ');
  return (
    <Tooltip title={<pre className="!m-0 whitespace-pre-wrap text-xs">{JSON.stringify(value, null, 2)}</pre>}>
      <span className="block max-w-[320px] truncate text-xs text-gray-600">{line}</span>
    </Tooltip>
  );
}

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [filters, setFilters] = useState({ actor: undefined, family: undefined, action: undefined, targetModel: undefined, range: null });
  const [page, setPage] = useState(1);
  const set = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const params = {
    page,
    limit: PAGE_SIZE,
    actor: filters.actor,
    // A single action wins over its family.
    action: filters.action || (filters.family ? `${filters.family}.` : undefined),
    targetModel: filters.targetModel,
    from: filters.range?.[0]?.startOf('day').toISOString(),
    to: filters.range?.[1]?.endOf('day').toISOString(),
  };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['audit-logs', params], queryFn: () => auditApi.list(params), placeholderData: keepPreviousData });
  const { data: facetsData } = useQuery({ queryKey: ['audit-logs', 'facets'], queryFn: () => auditApi.facets() });
  const facets = facetsData?.data || { actions: [], targetModels: [], actors: [] };
  const items = data?.data?.items || [];
  const total = data?.data?.total || 0;

  const families = [...new Set(facets.actions.map((a) => a.split('.')[0]))];
  const actionsOfFamily = facets.actions.filter((a) => !filters.family || a.startsWith(`${filters.family}.`));
  const anyFilter = filters.actor || filters.family || filters.action || filters.targetModel || filters.range;

  const columns = [
    {
      title: 'Thời gian',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (d) => <span className="whitespace-nowrap tabular-nums">{dayjs(d).format('DD/MM/YYYY HH:mm')}</span>,
    },
    {
      title: 'Người thực hiện',
      key: 'actor',
      render: (_, r) => (
        <div>
          <div>{r.actor?.name || '—'}</div>
          {r.actor?.role && <Text type="secondary" className="!text-xs">{ROLE_LABELS[r.actor.role] || r.actor.role}</Text>}
        </div>
      ),
    },
    {
      title: 'Hành động',
      dataIndex: 'action',
      key: 'action',
      render: (a) => (
        <Tooltip title={a}>
          <Tag className="!m-0">{actionLabel(a)}</Tag>
        </Tooltip>
      ),
    },
    {
      title: 'Đối tượng',
      key: 'target',
      render: (_, r) => {
        if (!r.targetModel) return <Text type="secondary">—</Text>;
        const label = MODEL_LABELS[r.targetModel] || r.targetModel;
        const short = r.targetId ? `#${String(r.targetId).slice(-6)}` : '';
        return r.targetModel === 'Horse' && r.targetId ? (
          <Link to={`/horses/${r.targetId}`}>
            {label} {short}
          </Link>
        ) : (
          <span>
            {label} <Text type="secondary">{short}</Text>
          </span>
        );
      },
    },
    { title: 'Chi tiết', dataIndex: 'metadata', key: 'metadata', render: (v) => <MetadataCell value={v} /> },
  ];

  const totalLogs = total || 0;
  const totalActors = facets.actors?.length || 0;
  const totalFamilies = families.length;

  return (
    <div>
      <PageHeroBanner
        eyebrow="Kiểm toán hệ thống"
        roleLabel="Quản lý CLB"
        title="Nhật ký thao tác hệ thống"
        stats={[
          { label: 'Thao tác ghi nhận', value: `${totalLogs.toLocaleString('vi-VN')} nhật ký` },
          { label: 'Nhân sự thao tác', value: `${totalActors} người` },
          { label: 'Phân hệ nghiệp vụ', value: `${totalFamilies} nhóm việc` },
        ]}
      />

      <div className="light-surface-box bg-white p-3.5 rounded-xl border border-[#E4DFD3] shadow-xs mb-4">
        <Space wrap className="w-full">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Người thực hiện"
            style={{ width: 220 }}
            value={filters.actor}
            onChange={(actor) => set({ actor })}
            options={facets.actors.map((u) => ({ value: u._id, label: `${u.name}${u.isActive === false ? ' (đã khóa)' : ''}` }))}
          />
          <Select
            allowClear
            placeholder="Nhóm việc"
            style={{ width: 170 }}
            value={filters.family}
            onChange={(family) => set({ family, action: undefined })}
            options={families.map((f) => ({ value: f, label: FAMILY_LABELS[f] || f }))}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Hành động"
            style={{ width: 240 }}
            value={filters.action}
            onChange={(action) => set({ action })}
            options={actionsOfFamily.map((a) => ({ value: a, label: actionLabel(a) }))}
          />
          <Select
            allowClear
            placeholder="Loại đối tượng"
            style={{ width: 170 }}
            value={filters.targetModel}
            onChange={(targetModel) => set({ targetModel })}
            options={facets.targetModels.map((m) => ({ value: m, label: MODEL_LABELS[m] || m }))}
          />
          <RangePicker format="DD/MM/YYYY" value={filters.range} onChange={(range) => set({ range })} />
          {anyFilter && (
            <Button onClick={() => set({ actor: undefined, family: undefined, action: undefined, targetModel: undefined, range: null })}>Bỏ lọc</Button>
          )}
        </Space>
      </div>

      {isError && (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          title="Chưa tải được nhật ký thao tác"
          description={error?.message || 'Không thể lấy dữ liệu nhật ký lúc này.'}
          action={
            <Button size="small" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      )}

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={items}
        loading={isLoading && !data}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false, onChange: setPage, showTotal: (t) => `${t} thao tác` }}
        locale={{ emptyText: anyFilter ? 'Không có thao tác nào khớp bộ lọc.' : 'Chưa có thao tác nào.' }}
      />
    </div>
  );
}
