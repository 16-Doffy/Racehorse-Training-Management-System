import { useRef } from 'react';
import { Form, Input, InputNumber, Modal } from 'antd';
import { HomeOutlined, MedicineBoxOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { message } from '../../lib/antdStatic';
import { stallApi } from './stableApi';
import { STALL_TYPE_LABELS, groupZones } from './stall3d/stallStatus';
import { zonePreview } from './stallPicking';
import './stallPicker.css';

const TYPES = [
  { value: 'standard', icon: <HomeOutlined />, desc: 'Ngựa khỏe, ở và tập luyện hằng ngày.' },
  { value: 'isolation', icon: <SafetyCertificateOutlined />, desc: 'Ngựa nghi bệnh lây, tách riêng khỏi đàn.' },
  { value: 'recovery', icon: <MedicineBoxOutlined />, desc: 'Ngựa sau chấn thương, nghỉ và theo dõi.' },
];

function TypeCards({ value, onChange, id }) {
  return (
    <div className="sp-types" role="radiogroup" id={id}>
      {TYPES.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={value === t.value}
          className={`sp-type${value === t.value ? ' is-active' : ''}`}
          onClick={() => onChange?.(t.value)}
        >
          <div className="sp-type-title">
            {t.icon} {STALL_TYPE_LABELS[t.value]}
          </div>
          <div className="sp-type-desc">{t.desc}</div>
        </button>
      ))}
    </div>
  );
}

/**
 * A zone of numbered stalls in one go (POST /stable/stalls/generate): its key ("A"), how many stalls,
 * its name, what it is for and the stall type. The codes it will make are shown before saving. For a
 * zone that already exists only the missing numbers are added, under the zone's own name.
 */
export default function ZoneModal({ open, stalls = [], onClose, onCreated }) {
  const [form] = Form.useForm();
  const zone = Form.useWatch('zone', form);
  const count = Form.useWatch('count', form);
  const preview = zonePreview(stalls, zone, count);
  const existing = preview.key ? groupZones(stalls).find((z) => z.key === preview.key) : null;

  const mutation = useMutation({
    mutationFn: (values) => stallApi.generateZone(values),
    onSuccess: (res) => {
      const made = res?.data?.created?.length || 0;
      const skipped = res?.data?.skipped?.length || 0;
      message.success(`Đã tạo ${made} chuồng${skipped ? `, giữ nguyên ${skipped} chuồng đã có` : ''}.`);
      form.resetFields();
      onCreated?.(res);
    },
    onError: (err) => message.error(err.message || 'Không tạo được khu chuồng.'),
  });

  // The name follows the key ("Khu A") until the Manager writes their own; an existing zone shows its
  // own name and purpose, which go away again when the key moves on to a new zone.
  const filledFrom = useRef(null);
  const onValuesChange = (changed) => {
    if (!('zone' in changed)) return;
    const key = String(changed.zone || '').trim().toUpperCase();
    const known = groupZones(stalls).find((z) => z.key === key);
    if (known) {
      filledFrom.current = known;
      form.setFieldsValue({ zoneName: known.name, zonePurpose: known.purpose || '', type: known.stalls[0]?.type || 'standard' });
      return;
    }
    const fromZone = filledFrom.current;
    filledFrom.current = null;
    if (fromZone) form.setFieldsValue({ zonePurpose: '', type: 'standard' });
    if (fromZone || !form.isFieldTouched('zoneName') || /^Khu [A-Z0-9]{0,4}$/.test(form.getFieldValue('zoneName') || '')) {
      form.setFieldsValue({ zoneName: key ? `Khu ${key}` : '' });
    }
  };

  const fresh = preview.fresh.length;
  return (
    <Modal
      title="Thêm khu chuồng"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={fresh ? `Tạo ${fresh} chuồng` : 'Tạo chuồng'}
      okButtonProps={{ disabled: Boolean(preview.codes.length) && !fresh }}
      confirmLoading={mutation.isPending}
      destroyOnHidden
      width={600}
    >
      <div className="stall-ui">
        <p className="mb-4 text-sm sp-muted">Tạo một dãy chuồng đánh số sẵn theo mã khu, ví dụ A-01, A-02… Ngựa được xếp vào từng chuồng trên sơ đồ.</p>
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ count: 8, type: 'standard' }}
          onValuesChange={onValuesChange}
          onFinish={(values) => mutation.mutate({ ...values, zone: values.zone.trim().toUpperCase() })}
        >
          <div className="grid grid-cols-[110px_130px_minmax(0,1fr)] max-sm:grid-cols-2 gap-x-3">
            <Form.Item
              name="zone"
              label="Mã khu"
              className="sp-zone-key !mb-3"
              rules={[{ required: true, message: 'Nhập mã khu' }, { pattern: /^[A-Za-z0-9]{1,4}$/, message: '1–4 chữ hoặc số' }]}
            >
              <Input placeholder="A" maxLength={4} autoFocus />
            </Form.Item>
            <Form.Item name="count" label="Số chuồng" className="!mb-3" rules={[{ required: true, message: 'Nhập số chuồng' }]}>
              <InputNumber min={1} max={40} precision={0} className="!w-full" />
            </Form.Item>
            <Form.Item name="zoneName" label="Tên khu" className="max-sm:col-span-2 !mb-3" rules={[{ required: true, message: 'Ví dụ: Khu A' }]}>
              <Input placeholder="Khu A" maxLength={60} disabled={Boolean(existing)} />
            </Form.Item>
          </div>
          <Form.Item name="zonePurpose" label="Dùng cho" className="!mb-3">
            <Input placeholder="VD: Ngựa đua chủ lực" maxLength={120} disabled={Boolean(existing)} />
          </Form.Item>
          <Form.Item name="type" label="Loại chuồng" className="!mb-3">
            <TypeCards />
          </Form.Item>
        </Form>

        <div className="sp-box">
          {preview.codes.length ? (
            <>
              <div className="mb-2 text-sm sp-ink">
                {existing ? (
                  <>
                    <b>{existing.name}</b> đã có {existing.stalls.length} chuồng.{' '}
                    {fresh ? (
                      <>
                        Sẽ thêm <b>{fresh}</b> chuồng mới, chuồng cũ giữ nguyên.
                      </>
                    ) : (
                      <span className="sp-muted">Tăng số chuồng lên quá {existing.stalls.length} để thêm chuồng mới.</span>
                    )}
                  </>
                ) : (
                  <>
                    Sẽ tạo <b>{fresh}</b> chuồng mới:
                  </>
                )}
              </div>
              <div className="sp-codes">
                {preview.codes.map((code) => (
                  <span key={code} className={`sp-code${preview.existing.includes(code) ? ' is-existing' : ''}`} title={preview.existing.includes(code) ? 'Đã có' : 'Mới'}>
                    {code}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="text-sm sp-muted">Nhập mã khu và số chuồng để xem trước các mã chuồng sẽ tạo.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
