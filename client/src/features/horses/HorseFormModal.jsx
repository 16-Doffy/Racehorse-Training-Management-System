import { useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Modal, Segmented, Select } from 'antd';
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
const TAB_OF_FIELD = {
  name: 'profile', breed: 'profile', color: 'profile', dob: 'profile', weightKg: 'profile', sex: 'profile',
  microchipNumber: 'profile', registrationNumber: 'profile', valuationVnd: 'profile',
  owner: 'staff', assignedTrainer: 'staff', assignedVet: 'staff',
  stall: 'stall', caretaker: 'stall',
};

/**
 * The horse's record, for the Manager: the horse in 3D with what has been filled in so far on the left,
 * and the form in three short steps on the right — the horse itself, the people responsible for it,
 * and (for a new horse) the stall it goes into with its groom. Every step stays mounted, so saving
 * from any step checks them all and opens the one with a mistake.
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
  const next = tabs[tabs.indexOf(tab) + 1];
  const pickedStall = stalls.find((s) => s._id === v.stall) || null;
  const groomOptions = grooms.map((g) => ({ value: g._id, label: g.name }));

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

  const okText = editTarget ? 'Lưu' : pickedStall ? `Thêm & xếp vào ${pickedStall.code}` : 'Thêm ngựa';
  const refreshFailed = () => setFailed([...new Set(form.getFieldsError().filter((f) => f.errors.length).map((f) => TAB_OF_FIELD[f.name[0]]))]);

  return (
    <Modal
      title={editTarget ? `Sửa hồ sơ — ${editTarget.name}` : 'Thêm ngựa mới'}
      open={open}
      onCancel={onCancel}
      afterOpenChange={(isOpen) => {
        if (!isOpen) return;
        setTab('profile');
        setFailed([]);
      }}
      destroyOnHidden
      width={980}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Hủy
        </Button>,
        next ? (
          <Button key="next" onClick={() => setTab(next)}>
            Tiếp: {TABS[next]}
          </Button>
        ) : null,
        <Button key="ok" type="primary" loading={saving} onClick={() => form.submit()}>
          {okText}
        </Button>,
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
              onChange={setTab}
              options={tabs.map((key, i) => ({
                value: key,
                label: (
                  <span>
                    {i + 1}. {TABS[key]}
                    {failed.includes(key) ? <span className="hf-tab-error" aria-label="có lỗi" /> : null}
                  </span>
                ),
              }))}
            />

            <div hidden={tab !== 'profile'}>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                <Form.Item name="name" label="Tên ngựa" rules={[{ required: true, message: 'Nhập tên ngựa' }]} className="!mb-3">
                  <Input placeholder="VD: Thunder Bolt" />
                </Form.Item>
                <Form.Item name="breed" label="Giống" className="!mb-3">
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
                <Form.Item name="sex" label="Giới tính" className="!mb-3">
                  <Select allowClear placeholder="Chọn giới tính" options={horseSexOptions} />
                </Form.Item>
                <Form.Item name="dob" label="Ngày sinh" className="!mb-3">
                  <DatePicker className="w-full" format="DD/MM/YYYY" placeholder="Chọn ngày" />
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
              <Form.Item name="owner" label="Chủ sở hữu" className="!mb-3">
                <Select allowClear showSearch optionFilterProp="label" placeholder="Chọn chủ sở hữu" options={ownerOptions} />
              </Form.Item>
              <Form.Item
                name="assignedTrainer"
                label="Huấn luyện viên phụ trách"
                extra="Chỉ HLV được gán mới thấy và lập kế hoạch huấn luyện cho ngựa này."
                className="!mb-3"
              >
                <Select allowClear showSearch optionFilterProp="label" placeholder="Chưa gán — chưa HLV nào thấy ngựa này" options={trainerOptions} />
              </Form.Item>
              <Form.Item
                name="assignedVet"
                label="Bác sĩ thú y phụ trách"
                extra="Yêu cầu khám cho ngựa này sẽ gửi thẳng tới bác sĩ được gán."
                className="!mb-1"
              >
                <Select allowClear showSearch optionFilterProp="label" placeholder="Chưa gán — chưa bác sĩ nào thấy ngựa này" options={vetOptions} />
              </Form.Item>
            </div>

            <div hidden={tab !== 'stall'}>
              {creating ? (
                <>
                  <p className="hf-muted mb-3 text-xs">
                    Không bắt buộc. Chọn một chuồng trống thì ngựa được xếp vào ngay khi lưu, và người chăm sóc chuồng đó nhận việc cho ăn, cho thuốc của ngựa.
                  </p>
                  <Form.Item name="stall" label="Chuồng" className="!mb-3">
                    <StallPicker stalls={stalls} allowClear />
                  </Form.Item>
                  {pickedStall && (
                    <Form.Item name="caretaker" label="Nhân viên chăm sóc" className="!mb-1">
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

