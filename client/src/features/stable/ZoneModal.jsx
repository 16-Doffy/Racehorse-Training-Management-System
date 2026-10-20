import { useRef, useState } from 'react';
import { Form, Input, InputNumber, Modal, Select } from 'antd';
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


const numberOf = (code) => Number(String(code).split('-')[1]) || 0;

/**
 * Everything about one zone, saved at once (PUT /stable/zones/:zone): its name and what it is for, its
 * stalls — an empty one is tapped to take it out, a taken one is locked with its horse — and new stalls
 * after its highest number, of a chosen type. The page mounts it afresh for each zone (key).
 */
export function ZoneEditModal({ zone, saving, onClose, onSave }) {
  const [form] = Form.useForm();
  const [removing, setRemoving] = useState([]);
  const [add, setAdd] = useState(0);
  const [type, setType] = useState(zone?.stalls[0]?.type || 'standard');
  if (!zone) return <Modal open={false} />;

  const highest = Math.max(0, ...zone.stalls.map((s) => numberOf(s.code)));
  const newCodes = Array.from({ length: add }, (_, i) => `${zone.key}-${String(highest + i + 1).padStart(2, '0')}`);
  const left = zone.stalls.length - removing.length + add;
  const toggle = (stall) => setRemoving((ids) => (ids.includes(stall._id) ? ids.filter((id) => id !== stall._id) : [...ids, stall._id]));
  const removedCodes = zone.stalls.filter((s) => removing.includes(s._id)).map((s) => s.code);
  const changes = [
    removedCodes.length ? `bỏ ${removedCodes.length} chuồng (${removedCodes.join(', ')})` : null,
    add ? `thêm ${add} chuồng (${newCodes.join(', ')})` : null,
  ].filter(Boolean);

  return (
    <Modal
      title={`Sửa ${zone.name}`}
      open
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Lưu thay đổi"
      okButtonProps={{ disabled: left < 1 }}
      confirmLoading={saving}
      destroyOnHidden
      width={640}
    >
      <div className="stall-ui">
        <Form
          form={form}
          layout="vertical"
          initialValues={{ zoneName: zone.name, zonePurpose: zone.purpose || '' }}
          onFinish={(values) =>
            onSave({ zoneName: values.zoneName, zonePurpose: values.zonePurpose, remove: removing, add, ...(add ? { type } : {}) })
          }
        >
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            <Form.Item name="zoneName" label="Tên khu" rules={[{ required: true, whitespace: true, message: 'Nhập tên khu' }]} className="!mb-3">
              <Input maxLength={60} placeholder="Khu A" />
            </Form.Item>
            <Form.Item name="zonePurpose" label="Dùng cho" className="!mb-3">
              <Input maxLength={120} placeholder="VD: Ngựa đua chủ lực" />
            </Form.Item>
          </div>
        </Form>

        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium sp-ink">Chuồng trong khu</span>
          <span className="text-xs sp-muted">Bấm chuồng trống để bỏ, bấm lại để giữ. Chuồng có ngựa thì giữ nguyên.</span>
        </div>
        <div className="sp-box mb-3">
          <div className="sp-codes">
            {zone.stalls.map((s) => {
              const going = removing.includes(s._id);
              const what = s.status === 'maintenance' ? 'bảo trì' : s.occupied ? s.occupant?.horse?.name || 'có ngựa' : 'trống';
              return (
                <button
                  key={s._id}
                  type="button"
                  disabled={s.occupied}
                  aria-pressed={going}
                  onClick={() => toggle(s)}
                  className={`sp-code sp-chip ${going ? 'is-going' : s.occupied ? 'is-locked' : 'is-kept'}`}
                  title={s.occupied ? `Còn ngựa ${what} — chuyển ngựa đi trước khi bỏ chuồng` : going ? 'Sẽ bỏ — bấm để giữ lại' : 'Bấm để bỏ chuồng này'}
                >
                  {s.code} <span className="sp-chip-what">· {what}</span>
                  {!s.occupied && <span className="sp-chip-x" aria-hidden="true">{going ? '↺' : '×'}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-1.5 text-sm font-medium sp-ink">Thêm chuồng mới</div>
        <div className="sp-box">
          <div className="flex flex-wrap items-center gap-3">
            <InputNumber min={0} max={Math.max(0, 40 - (zone.stalls.length - removing.length))} precision={0} value={add} onChange={(v) => setAdd(Number(v) || 0)} aria-label="Số chuồng thêm" />
            <span className="text-sm sp-muted">chuồng, loại</span>
            <Select
              size="middle"
              className="min-w-[160px]"
              value={type}
              onChange={setType}
              disabled={!add}
              options={Object.entries(STALL_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </div>
          {add > 0 && (
            <div className="sp-codes mt-2.5">
              {newCodes.map((code) => (
                <span key={code} className="sp-code" title="Mới">
                  {code}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 text-sm sp-ink">
          {left < 1 ? (
            <span style={{ color: '#b91c1c' }}>Khu phải còn ít nhất một chuồng — muốn bỏ cả khu thì dùng “Xoá khu”.</span>
          ) : changes.length ? (
            <>
              Khi lưu: {changes.join(' · ')}. Khu còn <b>{left}</b> chuồng.
            </>
          ) : (
            <span className="sp-muted">Khu có {zone.stalls.length} chuồng. Mã khu {zone.key} nằm trên biển chuồng nên không đổi.</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
