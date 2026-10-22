import { useEffect, useMemo } from 'react';
import { Alert, Checkbox, DatePicker, Form, Input, Modal, Radio, Select, Tag } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { message } from '../../lib/antdStatic';
import { healthRecordApi } from './healthApi';
import { trainingSessionApi } from '../training/trainingApi';
import { OBJECTIVE_LABELS, SESSION_KINDS } from '../training/trainingVocab';
import { SESSION_STATUS_LABELS } from '../training/sessionStatus';
import { BODY_AREAS, EXAM_SYMPTOMS, PRIORITY_ORDER, PRIORITY_RULES, ruleOf } from '../../constants/examRequest';

const ALERT_TYPES = { normal: 'info', high: 'warning', urgent: 'error' };

/** Chips to tick any number of keys from a { key: label } list. */
function ChipPicker({ value = [], onChange, options, label }) {
  const toggle = (key) => onChange?.(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {Object.entries(options).map(([key, text]) => (
        <Tag.CheckableTag key={key} checked={value.includes(key)} onChange={() => toggle(key)} className="!m-0 !rounded-full !px-3 !py-0.5 !text-[13px]">
          {text}
        </Tag.CheckableTag>
      ))}
    </div>
  );
}

const sessionLabel = (s) =>
  [
    dayjs(s.scheduledAt).format('HH:mm DD/MM'),
    SESSION_KINDS[s.kind]?.label || OBJECTIVE_LABELS[s.objective] || (s.sessionType === 'trial_run' ? 'Chạy thử' : 'Buổi tập'),
    SESSION_STATUS_LABELS[s.status],
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * A Head Trainer's or Manager's request for the vet to see a horse: how urgent (which sets how soon
 * the vet must come), what they saw and where, since when, the session it came from, what was already
 * done, and whether training stops until the vet has seen it. `session` prefills the form from a
 * session held back by a medical gate. Mounted while open.
 */
export default function RequestExamModal({ horse, session = null, defaults = {}, onClose }) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const horseId = horse?._id;
  const priority = Form.useWatch('priority', form) || 'normal';
  const symptoms = Form.useWatch('symptoms', form) || [];

  // The horse's sessions of the last week and the next day, for "which session was it".
  const sessionsQ = useQuery({
    queryKey: ['training-sessions', 'for-exam', horseId],
    queryFn: () => trainingSessionApi.list({ horse: horseId, from: dayjs().subtract(7, 'day').startOf('day').toISOString(), to: dayjs().add(1, 'day').endOf('day').toISOString() }),
    enabled: Boolean(horseId),
  });
  const sessions = useMemo(() => {
    const list = sessionsQ.data?.data || [];
    return session && !list.some((s) => s._id === session._id) ? [session, ...list] : list;
  }, [sessionsQ.data, session]);

  // A request already waiting for this horse: the vet's one exam answers both.
  const openQ = useQuery({
    queryKey: ['exam-requests', 'open', horseId],
    queryFn: () => healthRecordApi.listExamRequests({ horse: horseId, status: 'pending' }),
    enabled: Boolean(horseId),
  });
  const waiting = (openQ.data?.data || [])[0];

  const send = useMutation({
    mutationFn: (payload) => healthRecordApi.requestExam(payload),
    onSuccess: () => {
      message.success(`Đã gửi yêu cầu khám ${horse?.name || 'ngựa'} tới bác sĩ thú y.`);
      queryClient.invalidateQueries({ queryKey: ['exam-requests'] });
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      onClose();
    },
    onError: (err) => message.error(err.message || 'Gửi yêu cầu thất bại.'),
  });

  // An urgent request stops the horse's training by default; the trainer can untick it.
  useEffect(() => {
    if (priority === 'urgent') form.setFieldValue('holdTraining', true);
  }, [priority, form]);

  const submit = (values) =>
    send.mutate({
      horse: horseId,
      priority: values.priority,
      symptoms: values.symptoms || [],
      bodyAreas: values.bodyAreas || [],
      observedAt: values.observedAt ? (values.observedAt.isAfter(dayjs()) ? dayjs() : values.observedAt).toISOString() : undefined,
      trainingSession: values.trainingSession || undefined,
      reason: values.reason?.trim() || '',
      firstAid: values.firstAid?.trim() || '',
      holdTraining: Boolean(values.holdTraining),
    });

  const rule = ruleOf(priority);
  const vet = horse?.assignedVet?.name;
  return (
    <Modal
      open
      title={`Yêu cầu bác sĩ kiểm tra — ${horse?.name || 'ngựa'}`}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Gửi yêu cầu"
      cancelText="Hủy"
      confirmLoading={send.isPending}
      width={680}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark="optional"
        onFinish={submit}
        initialValues={{
          priority: defaults.priority || (session ? 'high' : 'normal'),
          symptoms: defaults.symptoms || [],
          bodyAreas: [],
          observedAt: dayjs(),
          trainingSession: session?._id,
          reason: defaults.reason || '',
          firstAid: '',
          holdTraining: defaults.priority === 'urgent',
        }}
      >
        {waiting && (
          <Alert
            className="!mb-4"
            type="info"
            showIcon
            title={`${horse?.name} đã có yêu cầu đang chờ bác sĩ (gửi ${dayjs(waiting.createdAt).format('HH:mm DD/MM')}${waiting.acceptedBy?.name ? `, BS ${waiting.acceptedBy.name} đã nhận` : ''}).`}
            description="Vẫn gửi được: một lần khám của bác sĩ trả lời mọi yêu cầu đang mở của ngựa."
          />
        )}

        <Form.Item name="priority" label="Mức độ" required>
          <Radio.Group optionType="button" buttonStyle="solid" options={PRIORITY_ORDER.map((key) => ({ value: key, label: PRIORITY_RULES[key].label }))} />
        </Form.Item>
        <Alert className="!-mt-3 !mb-4" type={ALERT_TYPES[priority]} showIcon title={`Bác sĩ khám ${rule.window}`} description={rule.desc} />

        <Form.Item name="symptoms" label="Dấu hiệu quan sát được">
          <ChipPicker options={EXAM_SYMPTOMS} label="Dấu hiệu" />
        </Form.Item>
        <Form.Item name="bodyAreas" label="Vùng cơ thể">
          <ChipPicker options={BODY_AREAS} label="Vùng cơ thể" />
        </Form.Item>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Form.Item name="observedAt" label="Phát hiện lúc">
            <DatePicker showTime={{ format: 'HH:mm' }} format="HH:mm DD/MM/YYYY" className="w-full" disabledDate={(d) => d && d.isAfter(dayjs().endOf('day'))} allowClear={false} />
          </Form.Item>
          <Form.Item name="trainingSession" label="Buổi tập liên quan">
            <Select
              allowClear
              placeholder={sessionsQ.isLoading ? 'Đang tải buổi tập…' : sessions.length ? 'Không liên quan buổi tập' : 'Tuần này chưa có buổi tập'}
              options={sessions.map((s) => ({ value: s._id, label: sessionLabel(s) }))}
              disabled={!sessions.length}
            />
          </Form.Item>
        </div>

        <Form.Item
          name="reason"
          label="Mô tả"
          dependencies={['symptoms']}
          required={!symptoms.length}
          rules={[{ validator: (_, value) => (value?.trim() || form.getFieldValue('symptoms')?.length ? Promise.resolve() : Promise.reject(new Error('Mô tả tình trạng hoặc chọn ít nhất một dấu hiệu'))) }]}
          extra="Bác sĩ đọc mô tả này trước khi tới khám."
        >
          <Input.TextArea rows={3} maxLength={500} showCount placeholder="VD: Sau buổi phi nước đại sáng nay ngựa đi khập khiễng chân trước trái, sờ thấy nóng ở cổ chân." />
        </Form.Item>
        <Form.Item name="firstAid" label="Đã xử lý tạm thời">
          <Input maxLength={200} placeholder="VD: Đã dừng buổi tập, chườm lạnh 15 phút, cho nghỉ tại chuồng." />
        </Form.Item>

        <Form.Item name="holdTraining" valuePropName="checked" className="!mb-2">
          <Checkbox>Tạm dừng tập cho tới khi bác sĩ khám (mọi buổi tập của ngựa bị chặn)</Checkbox>
        </Form.Item>
        <div className="text-xs text-gray-500">{vet ? `Gửi tới bác sĩ phụ trách: ${vet}.` : 'Ngựa chưa có bác sĩ phụ trách: yêu cầu gửi tới mọi bác sĩ.'}</div>
      </Form>
    </Modal>
  );
}
