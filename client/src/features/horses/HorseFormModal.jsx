import { useState } from 'react';
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Segmented, Select } from 'antd';
import { ArrowLeftOutlined, CheckCircleFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import Horse3D from './horse3d/Horse3D';
import { BREEDS, COATS, REGIONS, coatValueOfBreed } from './horse3d/horseBreeds';
import { HORSE_SEX_LABELS, horseSexOptions } from '../../constants/horse';
import { CaretakerSelect, StallPicker } from '../stable/StallPicker';
import { stallGroom } from '../stable/stallPicking';
import './horseForm.css';

// The Manager picks a breed and sees the horse in 3D, in the coat the breed is known for.
const breedOptions = REGIONS.map((region) => ({
  label: region,
  options: BREEDS.filter((b) => b.region === region).map((b) => ({ value: b.value, label: b.label, origin: b.origin, coat: COATS[b.coat] })),
}));
const coatOptions = Object.values(COATS).map((c) => ({ value: c.value, label: c.label, hint: c.hint, swatch: c.swatch }));
const Swatch = ({ color }) => (
  <span className="inline-block shrink-0 rounded-full" style={{ width: 12, height: 12, background: color, boxShadow: '0 0 0 1px rgba(0,0,0,.25)' }} />
);

const TABS = { profile: 'Hồ sơ', staff: 'Phụ trách', stall: 'Chuồng' };
const STEP_FIELDS = {
  profile: ['name', 'breed', 'color', 'sex', 'dob', 'weightKg', 'microchipNumber', 'registrationNumber', 'valuationVnd'],
  staff: ['owner', 'assignedTrainer', 'assignedVet'],
  stall: ['stall', 'caretaker'],
};
const TAB_OF_FIELD = Object.fromEntries(Object.entries(STEP_FIELDS).flatMap(([tab, fields]) => fields.map((f) => [f, tab])));

/**
 * The horse's record, for the Manager: the horse in 3D with what has been filled in so far on the left,
 * and the form in three steps on the right — the horse itself, the people responsible for it, and
 * (for a new horse) the stall it goes into with its groom.
 *
 * A new horse enters the club only whole: each step is checked before the next one opens, and "Thêm
 * ngựa" is on the last step alone — a horse without its owner, trainer and vet is seen by nobody who
 * should see it, and one without a stall gets no groom and no daily care. Editing a horse on record
 * keeps every step open and saves from any of them. Every step stays mounted, so saving checks them
 * all and opens the one with a mistake.
 */
export default function HorseFormModal({
  open,
  editTarget,
  form,
  saving,
  onCancel,
  onFinish,
  ownerOptions = [],
  trainerOptions = [],
  vetOptions = [],
  stalls = [],
  unplaced = [],
  grooms = [],
  currentStall,
  onOpenStable,
}) {
  const [tab, setTab] = useState('profile');
  const [failed, setFailed] = useState([]);
  // How far a new horse has got: a step opens once every step before it checks out.
  const [reached, setReached] = useState(0);
  const v = {
    name: Form.useWatch('name', form),
    breed: Form.useWatch('breed', form),
    color: Form.useWatch('color', form),
    dob: Form.useWatch('dob', form),
    sex: Form.useWatch('sex', form),
    owner: Form.useWatch('owner', form),
    trainer: Form.useWatch('assignedTrainer', form),
    vet: Form.useWatch('assignedVet', form),
    stall: Form.useWatch('stall', form),
    caretaker: Form.useWatch('caretaker', form),
  };
  const creating = !editTarget;
  const tabs = Object.keys(TABS);
  const index = tabs.indexOf(tab);
  const next = tabs[index + 1];
  const prev = tabs[index - 1];
  const pickedStall = stalls.find((s) => s._id === v.stall) || null;
  const groomOptions = grooms.map((g) => ({ value: g._id, label: g.name }));
  const freeStalls = stalls.filter((s) => !s.occupied && s.status !== 'maintenance').length;
  // What a new horse needs on each step before it can be added.
  const need = (message) => (creating ? [{ required: true, message }] : []);
  const complete = {
    profile: !!(v.name?.trim() && v.breed && v.sex && v.dob),
    staff: !!(v.owner && v.trainer && v.vet),
    stall: !!(v.stall && v.caretaker),
  };

  // Forward, a new horse goes one checked step at a time; back, or when editing, anywhere.
  const goTo = async (target) => {
    const to = tabs.indexOf(target);
    if (!creating || to <= index) return setTab(target);
    for (let i = index; i < to; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await form.validateFields(STEP_FIELDS[tabs[i]]);
      } catch {
        setFailed((f) => [...new Set([...f, tabs[i]])]);
        return setTab(tabs[i]);
      }
    }
    setReached((r) => Math.max(r, to));
    return setTab(target);
  };

  // Picking a breed fills in the coat it is known for, unless the Manager already chose another.
  const onBreedChange = (nextBreed) => {
    const current = form.getFieldValue('color');
    if (!current || current === coatValueOfBreed(v.breed)) form.setFieldValue('color', coatValueOfBreed(nextBreed) || undefined);
  };
  const labelOf = (options, id) => options.find((o) => String(o.value) === String(id || ''))?.label;
  const breedLabel = BREEDS.find((b) => b.value === v.breed)?.label?.split(' (')[0];
  const age = v.dob ? dayjs().diff(v.dob, 'year') : null;
  const facts = [
    ['Chủ', labelOf(ownerOptions, v.owner)],
    ['HLV', labelOf(trainerOptions, v.trainer)],
    ['Bác sĩ', labelOf(vetOptions, v.vet)],
    ['Chuồng', creating ? (pickedStall ? pickedStall.code : null) : currentStall],
    ...(creating && pickedStall ? [['Chăm sóc', labelOf(groomOptions, v.caretaker)]] : []),
  ];

  const okText = editTarget ? 'Lưu' : pickedStall ? `Thêm ngựa vào ${pickedStall.code}` : 'Thêm ngựa';
  const refreshFailed = () => setFailed([...new Set(form.getFieldsError().filter((f) => f.errors.length).map((f) => TAB_OF_FIELD[f.name[0]]))]);
  // A new horse is added from its last step only, once a stall and its groom are chosen.
  const canAdd = !creating || (tab === tabs[tabs.length - 1] && freeStalls > 0);

  return (
    <Modal
      title={editTarget ? `Sửa hồ sơ — ${editTarget.name}` : `Thêm ngựa mới · bước ${index + 1}/${tabs.length}`}
      open={open}
      onCancel={onCancel}
      afterOpenChange={(isOpen) => {
        if (!isOpen) return;
        setTab('profile');
        setFailed([]);
        setReached(0);
      }}
      destroyOnHidden
      width={980}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Hủy
        </Button>,
        creating && prev ? (
          <Button key="back" icon={<ArrowLeftOutlined />} onClick={() => setTab(prev)}>
            Quay lại
          </Button>
        ) : null,
        next ? (
          <Button key="next" type={creating ? 'primary' : 'default'} onClick={() => goTo(next)}>
            Tiếp: {TABS[next]}
          </Button>
        ) : null,
        canAdd ? (
          <Button key="ok" type="primary" loading={saving} onClick={() => form.submit()}>
            {okText}
          </Button>
        ) : null,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        onFinishFailed={({ errorFields }) => {
          const tabsWithErrors = [...new Set(errorFields.map((f) => TAB_OF_FIELD[f.name[0]]))];
          setFailed(tabsWithErrors);
          if (tabsWithErrors.length && !tabsWithErrors.includes(tab)) setTab(tabsWithErrors[0]);
        }}
        onFieldsChange={() => failed.length && refreshFailed()}
        onValuesChange={(changed) => {
          // A stall comes with its groom: the horse placed there is theirs to look after.
          if (!('stall' in changed)) return;
          const groom = stallGroom(stalls.find((s) => s._id === changed.stall));
          if (groom) form.setFieldValue('caretaker', groom);
        }}
      >
        <div className="hf-ui grid gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
          {/* The horse as everyone it is assigned to will see it, and what has been filled in so far. */}
          <aside className="min-w-0">
            <div className="hf-summary">
              <Horse3D breed={v.breed} color={v.color} height="var(--hf-stage)" compact />
              <div className={`hf-name mt-2 ${v.name ? '' : 'is-empty'}`}>{v.name || 'Ngựa mới'}</div>
              <div className="hf-muted text-xs">
                {[breedLabel || 'Chưa chọn giống', HORSE_SEX_LABELS[v.sex], age !== null && age >= 0 ? `${age} tuổi` : null].filter(Boolean).join(' · ')}
              </div>
              <dl className="hf-facts">
                {facts.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt>{label}</dt>
                    <dd className={value ? '' : 'is-empty'} title={value || undefined}>
                      {value || 'Chưa chọn'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>

          <div className="min-w-0">
            <Segmented
              block
              className="!mb-4"
              value={tab}
              onChange={goTo}
              options={tabs.map((key, i) => ({
                value: key,
                // A new horse's later steps open only through the step before them.
                disabled: creating && i > reached + 1,
                label: (
                  <span>
                    {complete[key] && !failed.includes(key) ? <CheckCircleFilled className="mr-1.5 text-emerald-600" /> : `${i + 1}. `}
                    {TABS[key]}
                    {failed.includes(key) ? <span className="hf-tab-error" aria-label="có lỗi" /> : null}
                  </span>
                ),
              }))}
            />
            {creating && (
              <p className="hf-muted -mt-2 mb-3 text-xs">
                Ngựa mới chỉ được thêm khi đủ 3 bước: hồ sơ, người phụ trách (chủ, HLV, bác sĩ) và chuồng cùng nhân viên chăm sóc.
              </p>
            )}

            <div hidden={tab !== 'profile'}>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                <Form.Item name="name" label="Tên ngựa" rules={[{ required: true, message: 'Nhập tên ngựa' }]} className="!mb-3">
                  <Input placeholder="VD: Thunder Bolt" />
                </Form.Item>
                <Form.Item name="breed" label="Giống" rules={need('Chọn giống ngựa')} className="!mb-3">
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="Chọn giống ngựa"
                    popupMatchSelectWidth={400}
                    options={breedOptions}
                    onChange={onBreedChange}
                    optionRender={(option) => (
                      <div className="flex items-center gap-2">
                        <Swatch color={option.data.coat.swatch} />
                        <span>{option.data.label}</span>
                        <span className="ml-auto text-xs text-gray-400">
                          {option.data.origin} · {option.data.coat.label}
                        </span>
                      </div>
                    )}
                  />
                </Form.Item>
                <Form.Item name="color" label="Màu lông" className="!mb-3">
                  <Select
                    allowClear
                    placeholder="Theo giống"
                    options={coatOptions}
                    optionRender={(option) => (
                      <div className="flex items-center gap-2" title={option.data.hint}>
                        <Swatch color={option.data.swatch} />
                        <span>{option.data.label}</span>
                      </div>
                    )}
                  />
                </Form.Item>
                <Form.Item name="sex" label="Giới tính" rules={need('Chọn giới tính')} className="!mb-3">
                  <Select allowClear placeholder="Chọn giới tính" options={horseSexOptions} />
                </Form.Item>
                <Form.Item name="dob" label="Ngày sinh" rules={need('Chọn ngày sinh')} className="!mb-3">
                  <DatePicker className="w-full" format="DD/MM/YYYY" placeholder="Chọn ngày" disabledDate={(d) => d && d.isAfter(dayjs(), 'day')} />
                </Form.Item>
                <Form.Item name="weightKg" label="Cân nặng (kg)" className="!mb-3">
                  <InputNumber min={50} max={1200} className="!w-full" placeholder="VD: 480" />
                </Form.Item>
              </div>
              <div className="hf-section-title">Giấy tờ & định giá</div>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
                <Form.Item
                  name="microchipNumber"
                  label="Số vi mạch"
                  className="!mb-3"
                  rules={[{ pattern: /^[A-Za-z0-9]{9,15}$/, message: '9–15 chữ số hoặc chữ cái' }]}
                >
                  <Input placeholder="985141002345678" maxLength={15} />
                </Form.Item>
                <Form.Item name="registrationNumber" label="Số đăng ký" className="!mb-3">
                  <Input placeholder="Số trong sổ giống" maxLength={40} />
                </Form.Item>
                <Form.Item name="valuationVnd" label="Định giá (₫)" className="!mb-3" tooltip="Chỉ Quản lý và chủ ngựa thấy.">
                  <InputNumber
                    min={0}
                    step={1000000}
                    className="!w-full"
                    formatter={(val) => (val === undefined || val === null || val === '' ? '' : Number(val).toLocaleString('vi-VN'))}
                    parser={(val) => (val ? val.replace(/[^0-9]/g, '') : '')}
                    placeholder="500.000.000"
                  />
                </Form.Item>
              </div>
            </div>

            <div hidden={tab !== 'staff'}>
              <Form.Item name="owner" label="Chủ sở hữu" rules={need('Chọn chủ sở hữu')} className="!mb-3">
                <Select allowClear showSearch optionFilterProp="label" placeholder="Chọn chủ sở hữu" options={ownerOptions} />
              </Form.Item>
              <Form.Item
                name="assignedTrainer"
                label="Huấn luyện viên phụ trách"
                rules={need('Chọn HLV phụ trách')}
                extra="Chỉ HLV được gán mới thấy và lập kế hoạch huấn luyện cho ngựa này."
                className="!mb-3"
              >
                <Select allowClear showSearch optionFilterProp="label" placeholder="Chưa gán — chưa HLV nào thấy ngựa này" options={trainerOptions} />
              </Form.Item>
              <Form.Item
                name="assignedVet"
                label="Bác sĩ thú y phụ trách"
                rules={need('Chọn bác sĩ phụ trách')}
                extra="Yêu cầu khám cho ngựa này sẽ gửi thẳng tới bác sĩ được gán."
                className="!mb-1"
              >
                <Select allowClear showSearch optionFilterProp="label" placeholder="Chưa gán — chưa bác sĩ nào thấy ngựa này" options={vetOptions} />
              </Form.Item>
            </div>

            <div hidden={tab !== 'stall'}>
              {creating ? (
                <>
                  {freeStalls === 0 ? (
                    <Alert
                      className="!mb-3"
                      type="error"
                      showIcon
                      title="Trại không còn chuồng trống"
                      description="Ngựa mới phải vào một chuồng. Thêm chuồng hoặc dời một ngựa ra ở trang Chuồng trại, rồi quay lại thêm ngựa."
                      action={
                        <Button size="small" onClick={onOpenStable}>
                          Mở Chuồng trại
                        </Button>
                      }
                    />
                  ) : (
                    <p className="hf-muted mb-3 text-xs">
                      Chọn một chuồng trống ({freeStalls} chuồng còn trống). Ngựa vào chuồng ngay khi thêm, và nhân viên chăm sóc chuồng đó nhận việc cho ăn, cho thuốc của ngựa.
                    </p>
                  )}
                  <Form.Item name="stall" label="Chuồng" rules={need('Chọn chuồng cho ngựa')} className="!mb-3">
                    <StallPicker stalls={stalls} allowClear />
                  </Form.Item>
                  {pickedStall && (
                    <Form.Item name="caretaker" label="Nhân viên chăm sóc" rules={need('Chọn nhân viên chăm sóc')} className="!mb-1">
                      <CaretakerSelect grooms={grooms} stalls={stalls} unplaced={unplaced} stall={pickedStall} />
                    </Form.Item>
                  )}
                </>
              ) : (
                // The stall of a horse on record is its own record (with the groom and the daily tasks),
                // changed on the stable page.
                <div className="hf-summary flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span>
                    Chuồng hiện tại: <b className="tabular-nums">{currentStall || 'chưa xếp'}</b>
                  </span>
                  <Button size="small" onClick={onOpenStable}>
                    {currentStall ? 'Đổi chuồng' : 'Xếp chuồng'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Form>
    </Modal>
  );
}

