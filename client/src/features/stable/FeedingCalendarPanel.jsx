import { useState } from 'react';
import { Alert, Button, Empty, Form, InputNumber, Modal, Select, Space, Table, Tag, TimePicker, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { message } from '../../lib/antdStatic';
import { feedingApi } from '../feeding/feedingApi';
import { PHASE_LABELS } from '../training/trainingVocab';

const { Text } = Typography;
const SLOT_LABELS = { morning: 'Sáng', noon: 'Trưa', evening: 'Chiều' };
const WORK_LABELS = { rest: 'Nghỉ tập', light: 'Tập nhẹ', moderate: 'Tập vừa', high: 'Tập nặng' };

function MealCell({ meal }) {
  if (!meal) return <Text type="secondary">Chưa có</Text>;
  return (
    <div className="min-w-40 text-sm">
      <Text strong className="tabular-nums">{meal.time}</Text>
      {(meal.items || []).map((item) => <Text type="secondary" key={`${item.inventoryItem?._id || item.inventoryItem}`} className="!block !text-xs">{item.name} {item.amount} {item.unit}</Text>)}
    </div>
  );
}

export default function FeedingCalendarPanel({ plans = [], horseId, feedItems = [] }) {
  const queryClient = useQueryClient();
  const [chosenPlan, setChosenPlan] = useState(null);
  const [page, setPage] = useState(null);
  const [clockDraft, setClockDraft] = useState({});
  const [editing, setEditing] = useState(null);
  const [editForm] = Form.useForm();
  const available = plans.filter((p) => p.status === 'active' && (!horseId || String(p.horse?._id || p.horse) === String(horseId)));
  const planId = available.some((p) => p._id === chosenPlan) ? chosenPlan : available[0]?._id;
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['feeding-calendar', planId],
    queryFn: () => feedingApi.calendar(planId),
    enabled: Boolean(planId),
  });
  const calendar = data?.data;
  const days = calendar?.days || [];
  const defaultTimes = Object.fromEntries((days.find((d) => !d.past) || days[0])?.meals?.map((m) => [m.slot, m.time]) || []);
  const times = { ...defaultTimes, ...(clockDraft[planId] || {}) };
  const editedTimes = Boolean(clockDraft[planId] && Object.keys(clockDraft[planId]).length);
  const future = days.filter((d) => !d.past);
  const firstFuture = days.findIndex((d) => !d.past);
  const startPage = Math.max(0, Math.floor(Math.max(0, firstFuture) / 7));
  const actualPage = Math.min(Math.max(page ?? startPage, 0), Math.max(0, Math.ceil(days.length / 7) - 1));
  const shown = days.slice(actualPage * 7, actualPage * 7 + 7);
  const confirmed = future.filter((d) => d.approved && !d.stale).length;
  const mutation = useMutation({
    mutationFn: () => feedingApi.confirmCalendar(planId, calendar.plan.updatedAt, clockDraft[planId] || {}),
    onSuccess: (res) => {
      message.success(res.data?.changed ? `Đã xác nhận lịch ăn; nhân viên đã nhận thông báo.` : 'Lịch ăn đã được xác nhận.');
      setClockDraft((old) => Object.fromEntries(Object.entries(old).filter(([key]) => key !== planId)));
      queryClient.invalidateQueries({ queryKey: ['feeding-calendar', planId] });
      queryClient.invalidateQueries({ queryKey: ['feeding'] });
      queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
    },
    onError: (err) => message.error(err.message || 'Chưa xác nhận được lịch ăn. Tải lại và thử lại.'),
  });
  const editMutation = useMutation({
    mutationFn: (values) => feedingApi.updateCalendarMeal(planId, editing.date, editing.slot, {
      time: dayjs(values.time).format('HH:mm'),
      items: values.items.map((item) => ({ inventoryItem: item.inventoryItem, amount: item.amount })),
    }),
    onSuccess: () => {
      message.success('Đã sửa bữa ăn; nhân viên đã nhận thông báo.');
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['feeding-calendar', planId] });
      queryClient.invalidateQueries({ queryKey: ['feeding'] });
      queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
    },
    onError: (err) => message.error(err.message || 'Chưa sửa được bữa ăn. Tải lại lịch và thử lại.'),
  });
  const editDay = (day) => {
    const meal = day.meals[0];
    setEditing({ date: day.date, slot: meal.slot, day });
    editForm.setFieldsValue({ time: dayjs(meal.time, 'HH:mm'), items: meal.items.map((item) => ({ inventoryItem: item.inventoryItem?._id || item.inventoryItem, amount: item.amount })) });
  };
  const changeEditSlot = (slot) => {
    const meal = editing.day.meals.find((m) => m.slot === slot);
    setEditing({ ...editing, slot });
    editForm.setFieldsValue({ time: dayjs(meal.time, 'HH:mm'), items: meal.items.map((item) => ({ inventoryItem: item.inventoryItem?._id || item.inventoryItem, amount: item.amount })) });
  };

  const columns = [
    { title: 'Ngày', key: 'date', width: 125, render: (_, d) => <div><Text strong>{dayjs(d.date).format('ddd DD/MM')}</Text><div><Tag color={d.approved && !d.stale ? 'green' : d.stale ? 'gold' : 'default'}>{d.past ? 'Đã qua' : d.approved && !d.stale ? 'Đã xác nhận' : d.stale ? 'Cần xác nhận lại' : 'Dự kiến'}</Tag></div></div> },
    { title: 'Kế hoạch tập', key: 'phase', width: 170, render: (_, d) => <div><div>{PHASE_LABELS[d.phase] || d.phase}</div><Text type="secondary" className="!text-xs">{WORK_LABELS[d.work] || d.work}</Text></div> },
    ...Object.entries(SLOT_LABELS).map(([slot, label]) => ({ title: label, key: slot, render: (_, d) => {
      const meal = d.meals?.find((m) => m.slot === slot);
      return <MealCell meal={meal ? { ...meal, time: d.past || !editedTimes && d.approved && !d.stale ? meal.time : times[slot] || meal.time } : null} />;
    } })),
    { title: '', key: 'edit', render: (_, d) => d.past || !d.approved || d.stale ? null : <Button size="small" onClick={() => editDay(d)}>Sửa bữa</Button> },
  ];

  return (
    <section className="mb-6" aria-label="Lịch cho ăn theo kế hoạch huấn luyện">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold m-0">Lịch cho ăn theo kế hoạch tập</h2>
          <Text type="secondary" className="block !text-sm">Xem từng ngày của cả kế hoạch, rồi xác nhận một lần để giao lịch cho nhân viên.</Text>
        </div>
        {available.length > 0 && <Select aria-label="Chọn kế hoạch huấn luyện" value={planId} className="w-full sm:!w-72" onChange={(value) => { setChosenPlan(value); setPage(null); }} options={available.map((p) => ({ value: p._id, label: `${p.horse?.name || 'Ngựa'}: ${p.goal || PHASE_LABELS[p.phase] || 'Kế hoạch tập'}` }))} />}
      </div>
      {!available.length ? (
        <Empty description={<span>{horseId ? 'Ngựa này chưa có kế hoạch tập đang áp dụng.' : 'Chưa có kế hoạch tập đang áp dụng.'} <Link to="/training/plans">Mở kế hoạch huấn luyện</Link> để lập lịch ăn.</span>} />
      ) : isError ? (
        <Alert
          type="error"
          title="Không tải được lịch ăn"
          description={
            <Space direction="vertical" size={2}>
              <span>{error?.message?.includes('Route not found') ? 'API lịch ăn cần máy chủ mới nhất (nhánh NDuy). Hãy chạy server local hoặc kiểm tra deploy.' : error?.message}</span>
              <Button size="small" onClick={() => refetch()}>Thử lại</Button>
            </Space>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3 border-y border-current/10 py-3">
            <div className="text-sm">
              <Text strong>{calendar?.horse?.name || 'Ngựa'}</Text>
              <Text type="secondary"> — {days.length} ngày, {confirmed}/{future.length} ngày tới đã xác nhận</Text>
              <div><Text type="secondary" className="!text-xs">Người cho ăn: {calendar?.caretaker?.name || 'chưa xếp'}; nhân viên thấy lịch trước và ghi nhận từ giờ hẹn.</Text></div>
            </div>
            <Button type="primary" disabled={isLoading || !future.length || Boolean(calendar?.problems?.length) || confirmed === future.length && !editedTimes} loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Xác nhận lịch ăn toàn kỳ
            </Button>
          </div>
          {(calendar?.problems || []).length > 0 && <Alert className="!mb-3" type="warning" title="Chưa thể xác nhận" description={calendar.problems.join(' ')} />}
          {calendar?.weightNote && <Alert className="!mb-3" type="warning" title="Kiểm tra cân nặng trước khi xác nhận" description={calendar.weightNote} />}
          {(calendar?.warnings || []).length > 0 && <Alert className="!mb-3" type="info" title="Kho cần bổ sung trong kỳ" description={calendar.warnings.join(' ')} />}
          <div className="flex flex-wrap gap-x-4 gap-y-2 items-end mb-3">
            {Object.entries(SLOT_LABELS).map(([slot, label]) => <label key={slot} className="flex flex-col gap-1 text-xs">
              Giờ bữa {label.toLowerCase()}
              <TimePicker aria-label={`Giờ bữa ${label.toLowerCase()}`} format="HH:mm" minuteStep={15} allowClear={false} value={times[slot] ? dayjs(times[slot], 'HH:mm') : null} onChange={(_, value) => setClockDraft((old) => ({ ...old, [planId]: { ...(old[planId] || {}), [slot]: value } }))} />
            </label>)}
            <Text type="secondary" className="!text-xs">Bữa ăn mở đúng giờ đã đặt. Thay giờ rồi xác nhận lại lịch.</Text>
          </div>
          <Table rowKey="date" size="small" columns={columns} dataSource={shown} loading={isLoading && !calendar} pagination={false} scroll={{ x: 900 }} locale={{ emptyText: 'Kế hoạch chưa có ngày để xếp lịch ăn.' }} />
          {days.length > 7 && <div className="flex items-center justify-between mt-3 gap-2">
            <Button disabled={actualPage === 0} onClick={() => setPage(actualPage - 1)}>7 ngày trước</Button>
            <Text type="secondary" className="!text-xs text-center">{shown[0] ? `${dayjs(shown[0].date).format('DD/MM/YYYY')} – ${dayjs(shown.at(-1).date).format('DD/MM/YYYY')}` : ''}</Text>
            <Button disabled={(actualPage + 1) * 7 >= days.length} onClick={() => setPage(actualPage + 1)}>7 ngày sau</Button>
          </div>}
        </>
      )}
      <Modal title={`Sửa bữa ngày ${editing ? dayjs(editing.date).format('DD/MM/YYYY') : ''}`} open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => editForm.submit()} okText="Lưu bữa ăn" confirmLoading={editMutation.isPending} destroyOnHidden>
        <Form form={editForm} layout="vertical" onFinish={(values) => editMutation.mutate(values)}>
          <Form.Item label="Bữa"><Select value={editing?.slot} onChange={changeEditSlot} options={Object.entries(SLOT_LABELS).map(([value, label]) => ({ value, label: `Bữa ${label.toLowerCase()}` }))} /></Form.Item>
          <Form.Item name="time" label="Giờ cho ăn" rules={[{ required: true, message: 'Chọn giờ cho ăn.' }]}><TimePicker className="w-full" format="HH:mm" minuteStep={15} allowClear={false} /></Form.Item>
          <Text strong className="!block !mb-2">Món trong bữa</Text>
          <Form.List name="items">{(fields, { add, remove }) => <div className="flex flex-col gap-2">
            {fields.map((field) => <div key={field.key} className="flex flex-wrap gap-2 items-start">
              <Form.Item name={[field.name, 'inventoryItem']} rules={[{ required: true, message: 'Chọn món.' }]} className="!mb-0 min-w-44 flex-1"><Select options={feedItems.map((item) => ({ value: item._id, label: `${item.name} (${item.unit})` }))} /></Form.Item>
              <Form.Item name={[field.name, 'amount']} rules={[{ required: true, message: 'Nhập lượng.' }, { type: 'number', min: 0.01 }]} className="!mb-0"><InputNumber min={0.01} step={0.5} className="!w-24" /></Form.Item>
              {fields.length > 1 && <Button size="small" danger onClick={() => remove(field.name)}>Xoá</Button>}
            </div>)}
            <Button size="small" onClick={() => add({})}>Thêm món</Button>
          </div>}</Form.List>
        </Form>
      </Modal>
    </section>
  );
}
