import { useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Empty, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { groomWebApi as api } from './api';
import { APPETITE_LABELS, MANURE_LABELS, WATER_INTAKE_LABELS, TASK_TYPE_LABELS, TASK_SOURCE_META, INCIDENT_STATUS_META, INCIDENT_SEVERITY_META } from '../../constants/care';
import { fileHref } from '../../lib/files';

const STATUS = { pending: ['Chưa xong', 'gold'], completed: ['Hoàn thành', 'green'], skipped: ['Không thực hiện', 'orange'] };
const MEALS = { morning: 'Bữa sáng', noon: 'Bữa trưa', evening: 'Bữa tối' };
const options = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const stamp = (at) => at ? dayjs(at).format('DD/MM/YYYY HH:mm') : '—';
const TABS = [ ['tasks', 'Công việc'], ['care', 'Chuồng & Y lệnh'], ['incidents', 'Sự cố'], ['supplies', 'Vật tư'] ];
const TITLES = { complete: 'Ghi nhận hoàn thành', notDone: 'Không thực hiện được', incident: 'Báo sự cố', restock: 'Đề xuất bổ sung', propose: 'Đề xuất vật tư mới' };

function ActionDialog({ action, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState([]);
  const operation = useRef(null);
  const { mode, target } = action;
  async function submit(values) {
    setBusy(true);
    setError('');
    try {
      if (mode === 'complete' || mode === 'notDone') {
        operation.current ||= { clientOpId: crypto.randomUUID(), performedAt: new Date().toISOString() };
        const body = mode === 'complete' ? { observation: values, ...operation.current } : { ...values, ...operation.current };
        await api[mode](target._id, body);
      } else if (mode === 'incident') {
        const body = new FormData();
        body.append('description', values.description.trim());
        body.append('severity', values.severity);
        files.forEach((file) => body.append('images', file));
        await api.incident(target._id, body);
      } else if (mode === 'restock') await api.restock(target._id, { ...values, ...(target.task ? { task: target.task } : {}) });
      else await api.propose(values);
      onSaved();
    } catch (err) { setError(err.message || 'Không gửi được. Hãy kiểm tra kết nối và thử lại.'); }
    finally { setBusy(false); }
  }
  const positive = [{ required: true, type: 'number', min: 0.001, message: 'Nhập số lượng lớn hơn 0.' }];
  return <Modal open title={`${TITLES[mode]}${target?.horse?.name ? ` — ${target.horse.name}` : target?.name ? ` — ${target.name}` : ''}`}
    onCancel={onClose} closable={!busy} mask={{ closable: !busy }} footer={null}>
    {error && <Alert type="error" showIcon title={error} className="!mb-4" />}
    <Form form={form} layout="vertical" onFinish={submit} initialValues={{ severity: 'medium', category: 'feed' }}>
      {mode === 'complete' && <>
        <Form.Item name="appetite" label="Ăn uống"><Select allowClear options={options(APPETITE_LABELS)} /></Form.Item>
        <Form.Item name="amountEatenPercent" label="Tỷ lệ ăn (%)"><InputNumber min={0} max={100} /></Form.Item>
        <Form.Item name="manure" label="Phân"><Select allowClear options={options(MANURE_LABELS)} /></Form.Item>
        <Form.Item name="waterIntake" label="Uống nước"><Select allowClear options={options(WATER_INTAKE_LABELS)} /></Form.Item>
        <Form.Item name="behaviourNote" label="Quan sát thêm"><Input.TextArea rows={2} maxLength={2000} /></Form.Item>
      </>}
      {mode === 'notDone' && <Form.Item name="reason" label="Lý do không thực hiện" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} maxLength={2000} /></Form.Item>}
      {mode === 'incident' && <>
        <Form.Item name="description" label="Mô tả sự cố" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} maxLength={2000} /></Form.Item>
        <Form.Item name="severity" label="Mức độ" rules={[{ required: true }]}><Select options={options(Object.fromEntries(Object.entries(INCIDENT_SEVERITY_META).map(([k, v]) => [k, v.label])))} /></Form.Item>
        <Form.Item label="Ảnh (tối đa 5, mỗi ảnh tối đa 5 MB)"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => {
          const chosen = Array.from(event.target.files || []);
          if (chosen.length > 5 || chosen.some((file) => file.size > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp|gif)$/.test(file.type))) { setError('Chọn tối đa 5 ảnh JPEG/PNG/WebP/GIF, mỗi ảnh tối đa 5 MB.'); event.target.value = ''; setFiles([]); }
          else { setError(''); setFiles(chosen); }
        }} /></Form.Item>
        {target.incidentReport && <Alert type="warning" title="Việc này đã có sự cố. Gửi lại sẽ cập nhật báo cáo trên cùng công việc." className="!mb-4" />}
      </>}
      {mode === 'propose' && <>
        <Form.Item name="name" label="Tên vật tư" rules={[{ required: true, whitespace: true }]}><Input maxLength={200} /></Form.Item>
        <Form.Item name="category" label="Loại" rules={[{ required: true }]}><Select options={options({ feed: 'Thức ăn', medicine: 'Thuốc', equipment: 'Dụng cụ' })} /></Form.Item>
        <Form.Item name="unit" label="Đơn vị" rules={[{ required: true, whitespace: true }]}><Input maxLength={30} /></Form.Item>
        <Form.Item name="stableBlock" label="Khu chuồng"><Input maxLength={200} /></Form.Item>
      </>}
      {['restock', 'propose'].includes(mode) && <>
        <Form.Item name="quantity" label={`Số lượng${target?.unit ? ` (${target.unit})` : ''}`} rules={positive}><InputNumber min={0.001} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="note" label="Lý do đề xuất"><Input.TextArea rows={2} maxLength={2000} /></Form.Item>
      </>}
      <Space><Button onClick={onClose} disabled={busy}>Hủy</Button><Button type="primary" htmlType="submit" loading={busy}>Gửi xác nhận</Button></Space>
    </Form>
  </Modal>;
}

export default function GroomWebPage() {
  const userId = useSelector((state) => state.auth.user?._id);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = TABS.find(([key]) => pathname === `/groom/${key}`)?.[0] || 'tasks';
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [status, setStatus] = useState('all');
  const [action, setAction] = useState(null);
  const [working, setWorking] = useState(null);
  const client = useQueryClient();
  const { message } = App.useApp();
  const query = useQuery({ queryKey: ['groom-web', userId, active, active === 'tasks' ? date : null],
    queryFn: () => api[active](active === 'tasks' && date ? { date } : undefined), refetchInterval: 15000 });
  const rows = query.data?.data || [];
  const refresh = () => client.invalidateQueries({ queryKey: ['groom-web', userId] });
  function saved() { setAction(null); message.success('Đã ghi nhận trên hệ thống.'); refresh(); }
  async function acknowledge(task) {
    setWorking(task._id);
    try { await api.acknowledge(task._id); message.success('Đã tiếp nhận công việc.'); }
    catch (err) { message.error(err.message || 'Không tiếp nhận được.'); }
    finally { setWorking(null); refresh(); }
  }
  const taskColumns = [
    { title: 'Ngựa / Công việc', key: 'task', render: (_, t) => <>
      <Typography.Text strong>{t.horse?.name || '—'}</Typography.Text><div>{TASK_TYPE_LABELS[t.taskType] || t.taskType}{t.mealSlot ? ` · ${MEALS[t.mealSlot]}` : ''}</div>
      <Tag color={TASK_SOURCE_META[t.source]?.color}>{TASK_SOURCE_META[t.source]?.label || t.source}</Tag>
      {t.note && <div>{t.note}</div>}
      {(t.supplies || []).map((s, i) => <div key={i}>{s.name || 'Vật tư'}: {s.amount} {s.unit}</div>)}
    </> },
    { title: 'Thời gian / Trạng thái', key: 'status', render: (_, t) => <>
      <div>{stamp(t.scheduledDate)}</div><Tag color={STATUS[t.status]?.[1]}>{STATUS[t.status]?.[0] || t.status}</Tag>
      {t.acknowledgedAt && <div>Đã tiếp nhận</div>}{t.completedAt && <div>Thực hiện: {stamp(t.completedAt)}</div>}
      {t.recordedLate && <Tag color="orange">Đồng bộ muộn</Tag>}
      {t.skipReason && <div>{t.skipReason}</div>}
      {t.timing?.reason && t.status === 'pending' && <div>{t.timing.reason}</div>}
      {t.supplyStatus?.ok === false && <div className="text-red-600">Thiếu vật tư: {t.supplyStatus.missing.map((s) => `${s.name}: thiếu ${s.short} ${s.unit}`).join('; ')}</div>}
      {t.observation?.behaviourNote && <div>Quan sát: {t.observation.behaviourNote}</div>}
      {t.observation?.appetite && <div>Ăn: {APPETITE_LABELS[t.observation.appetite]}</div>}
      {t.observation?.manure && <div>Phân: {MANURE_LABELS[t.observation.manure]}</div>}
      {t.observation?.waterIntake && <div>Uống: {WATER_INTAKE_LABELS[t.observation.waterIntake]}</div>}
    </> },
    { title: 'Thao tác', key: 'actions', render: (_, t) => <Space wrap>
      {t.status === 'pending' && <>
        <Button disabled={Boolean(working) || Boolean(t.acknowledgedAt) || t.timing?.state === 'missed'} loading={working === t._id} onClick={() => acknowledge(t)}>Tiếp nhận</Button>
        <Button type="primary" disabled={!t.timing?.canComplete || t.supplyStatus?.ok === false} onClick={() => setAction({ mode: 'complete', target: t })}>Hoàn thành</Button>
        <Button onClick={() => setAction({ mode: 'notDone', target: t })}>Không làm được</Button>
        {(t.supplyStatus?.missing || []).map((s) => <Button key={String(s.inventoryItem)} onClick={() => setAction({ mode: 'restock', target: { _id: s.inventoryItem, name: s.name, unit: s.unit, task: t._id } })}>Bổ sung {s.name}</Button>)}
      </>}
      <Button onClick={() => setAction({ mode: 'incident', target: t })}>Báo sự cố</Button>
    </Space> },
  ];
  return <div className="space-y-4">
    <div className="flex justify-between items-center gap-3"><Typography.Title level={3} className="!mb-0">Nhân viên chăm sóc</Typography.Title><Button onClick={refresh} loading={query.isFetching}>Làm mới</Button></div>
    <Alert type="info" showIcon title="Web hỗ trợ kiểm tra chăm sóc" description="Thao tác ghi trực tiếp vào cùng hệ thống với mobile. Cần kết nối mạng khi gửi." />
    <Tabs activeKey={active} onChange={(key) => navigate(`/groom/${key}`)} items={TABS.map(([key, label]) => ({ key, label }))} />
    {query.error && <Alert type="error" showIcon title={query.error.message || 'Không tải được dữ liệu.'} />}
    {active === 'tasks' && <>
      <Space wrap><label>Ngày <input aria-label="Ngày công việc" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded p-2" /></label>
        <Button onClick={() => setDate('')}>Tất cả ngày</Button>
        <Select aria-label="Trạng thái công việc" value={status} onChange={setStatus} style={{ width: 180 }} options={[{ value: 'all', label: 'Mọi trạng thái' }, ...options(Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v[0]])))]} />
      </Space>
      <Table rowKey="_id" loading={query.isLoading} columns={taskColumns} dataSource={rows.filter((t) => status === 'all' || t.status === status)} scroll={{ x: 850 }} />
    </>}
    {active === 'care' && <Space orientation="vertical" style={{ width: '100%' }}>
      {!rows.length && !query.isLoading && <Empty description="Chưa được phân công ngựa." />}
      {rows.map((sheet) => <Card key={sheet.horse._id} title={sheet.horse.name}>
        <p>Chuồng: {sheet.stall?.stableBlock || 'Chưa có'} · Mức tập cho phép: {sheet.trainingClearance?.label || '—'}</p>
        {sheet.trainingClearance?.restricted && <Alert type="warning" title={sheet.trainingClearance.reason || 'Đang hạn chế tập theo chỉ định bác sĩ.'} />}
        <Typography.Title level={5}>Khẩu phần</Typography.Title>
        {sheet.rations.map((r) => <div key={r._id}><strong>{MEALS[r.mealTime]} · {r.timeOfDay}</strong>{r.items.map((i, n) => <div key={n}>{i.stock?.name || i.name}: {i.amount ?? i.quantity} {i.unit || i.stock?.unit}{i.stock ? ` · Tồn ${i.stock.available} ${i.stock.unit}` : ''}</div>)}</div>)}
        <Typography.Title level={5}>Y lệnh</Typography.Title>
        {sheet.prescriptions.map((p) => <div key={p._id}><p>Bác sĩ {p.prescribedBy || '—'}: {p.careInstructions || 'Theo đơn thuốc'}</p>{p.medications.map((m, n) => <p key={n}>{m.name} · {m.dosage} · {(m.times || []).join(', ')}{m.stock ? ` · Tồn ${m.stock.available} ${m.stock.unit}` : ''}</p>)}</div>)}
        {sheet.shortages.length > 0 && <Alert type="warning" title="Vật tư thiếu trong ngày" description={sheet.shortages.map((s) => `${s.name}: thiếu ${s.short} ${s.unit}`).join('; ')} />}
      </Card>)}
    </Space>}
    {active === 'incidents' && <Table rowKey="_id" loading={query.isLoading} scroll={{ x: 650 }} dataSource={rows} columns={[
      { title: 'Ngựa', render: (_, t) => t.horse?.name },
      { title: 'Báo cáo', render: (_, t) => <><div>{t.incidentReport.description}</div><small>{stamp(t.incidentReport.reportedAt)}</small><div>{(t.incidentReport.images || []).map((src, i) => <a key={i} href={fileHref(src)} target="_blank" rel="noreferrer">Ảnh {i + 1} </a>)}</div></> },
      { title: 'Xử lý của bác sĩ', render: (_, t) => <><Tag color={INCIDENT_STATUS_META[t.incidentReport.status || 'open']?.color}>{INCIDENT_STATUS_META[t.incidentReport.status || 'open']?.label}</Tag><div>{t.incidentReport.response || 'Chưa có phản hồi'}</div></> },
    ]} />}
    {active === 'supplies' && <>
      <Button onClick={() => setAction({ mode: 'propose' })}>Đề xuất vật tư mới</Button>
      <Table rowKey="_id" loading={query.isLoading} scroll={{ x: 650 }} dataSource={rows} columns={[
        { title: 'Vật tư', dataIndex: 'name' }, { title: 'Tồn kho', render: (_, i) => `${i.quantity} ${i.unit}` },
        { title: 'Đề xuất của tôi', render: (_, i) => (i.restockRequests || []).filter((r) => String(r.requestedBy?._id || r.requestedBy) === userId).map((r) => <div key={r._id}>{r.quantity} {i.unit} · {r.receivedAt ? 'Đã nhận hàng' : ({ pending: 'Chờ duyệt', approved: r.awaitingDelivery ? 'Đã duyệt, chờ hàng' : 'Đã duyệt, đã cộng kho', received: 'Đã nhận hàng', rejected: 'Từ chối' }[r.status] || r.status)}{r.reviewNote ? ` · ${r.reviewNote}` : ''}</div>) },
        { title: 'Thao tác', render: (_, i) => <Button disabled={i.isProposed} onClick={() => setAction({ mode: 'restock', target: i })}>Đề xuất bổ sung</Button> },
      ]} />
    </>}
    {action && <ActionDialog key={`${action.mode}-${action.target?._id || 'new'}`} action={action} onClose={() => setAction(null)} onSaved={saved} />}
  </div>;
}
