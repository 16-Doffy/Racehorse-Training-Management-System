import { Modal, Form, Select, DatePicker, InputNumber, Input, Button } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled, MinusCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { surfaceOptions, minPrepFor, earliestRaceDate, PRE_RACE_DAYS, RECOVERY_DAYS_BEFORE_RACE } from '../training/trainingVocab';
import { useClubPolicy } from '../training/useClubPolicy';
import './race.css';

// The usual flat-race distances, one click each; any other is typed.
const DISTANCES = [
  { m: 1000, note: 'nước rút' },
  { m: 1200, note: 'nước rút' },
  { m: 1600, note: 'trung bình' },
  { m: 2000, note: 'trung bình' },
  { m: 2400, note: 'đường dài' },
  { m: 3200, note: 'đường dài' },
];
// Two races of one horse closer than this leave it no time to recover and prepare again.
const MIN_DAYS_BETWEEN_RACES = 28;
const refId = (x) => String(x?._id || x || '');
const DAYS_OF_WEEK = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

const ICONS = {
  ok: <CheckCircleFilled />,
  bad: <CloseCircleFilled />,
  warn: <ExclamationCircleFilled />,
  idle: <MinusCircleOutlined />,
};

/** One thing checked before the horse is entered: ok, a problem, a warning, or not yet known. */
function CheckRow({ state, title, children }) {
  return (
    <li className={`rc-check is-${state}`}>
      <span className="rc-check-icon" aria-hidden="true">
        {ICONS[state]}
      </span>
      <div className="min-w-0">
        <div className="rc-check-title">{title}</div>
        <div className="rc-check-detail">{children}</div>
      </div>
    </li>
  );
}

/**
 * The race entry form, with what is checked before a horse is entered beside it: the horse is fit to
 * train, there is time enough to prepare it for the distance (trainingVocab minPrepFor, the server's own
 * rule — days sooner can't be picked), it has no other race too close, and what its plan is now.
 * `horses`, `entries` (all race entries) and `plans` (training plans) for those checks.
 */
export default function RaceEntryForm({ open, onClose, onSubmit, loading = false, horseOptions = [], horses = [], entries = [], plans = [] }) {
  const [form] = Form.useForm();
  const policy = useClubPolicy();
  const horseId = Form.useWatch('horse', form);
  const distance = Form.useWatch('distance', form);
  const raceDate = Form.useWatch('raceDate', form);
  const today = dayjs().startOf('day');
  const leadTime = policy.raceEntryMinPrep !== false;

  // The horse's health.
  const horse = horses.find((h) => refId(h) === String(horseId || ''));
  const grounded = horse && (horse.trainingClearance?.level === 'none' || ['injured', 'quarantined'].includes(horse.healthStatus));
  const recovering = horse && !grounded && horse.trainingClearance?.restricted;

  // Time to prepare for this distance.
  const need = distance ? minPrepFor(distance) : null;
  const earliest = need ? dayjs(earliestRaceDate(distance)) : null;
  const daysLeft = raceDate ? raceDate.startOf('day').diff(today, 'day') : null;
  const enough = !leadTime || !need || !raceDate ? null : !raceDate.startOf('day').isBefore(earliest);

  // Its other races: the same day is refused, closer than MIN_DAYS_BETWEEN_RACES warned about.
  const others = horseId ? entries.filter((e) => refId(e.horse) === String(horseId) && ['registered', 'confirmed'].includes(e.status) && !dayjs(e.raceDate).isBefore(today, 'day')) : [];
  const gapTo = (e) => Math.abs(dayjs(e.raceDate).startOf('day').diff(raceDate.startOf('day'), 'day'));
  const sameDay = raceDate ? others.find((e) => gapTo(e) === 0) : null;
  const close = raceDate && !sameDay ? others.filter((e) => gapTo(e) < MIN_DAYS_BETWEEN_RACES).sort((a, b) => gapTo(a) - gapTo(b))[0] : null;

  // Its plan now: one horse follows one plan at a time.
  const activePlan = horseId ? plans.find((p) => p.status === 'active' && refId(p.horse) === String(horseId)) : null;

  const blocked = grounded || recovering || enough === false || Boolean(sameDay);

  const pickDistance = (m) => {
    form.setFieldValue('distance', m);
    if (raceDate) form.validateFields(['raceDate']).catch(() => {});
  };

  return (
    <Modal
      title="Đăng ký giải đua"
      open={open}
      onCancel={onClose}
      afterClose={() => form.resetFields()}
      width={960}
      destroyOnHidden
      footer={
        <div className="rc-form flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">Sau khi đăng ký, bấm "Lập kế hoạch" trên thẻ giải để bắt đầu chuẩn bị.</span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Hủy</Button>
            <Button className="rc-primary" loading={loading} disabled={blocked} onClick={() => form.submit()}>
              Đăng ký giải
            </Button>
          </div>
        </div>
      }
    >
      <div className="rc-form">
        <div className="rc-form-grid">
          <Form
            form={form}
            layout="vertical"
            requiredMark="optional"
            initialValues={{ surface: 'turf' }}
            onFinish={(values) => onSubmit({ ...values, raceDate: values.raceDate.startOf('day').toISOString() })}
          >
            <Form.Item name="horse" label="Ngựa" rules={[{ required: true, message: 'Chọn ngựa' }]}>
              <Select placeholder="Chọn ngựa" options={horseOptions} showSearch optionFilterProp="label" />
            </Form.Item>
            <Form.Item name="raceName" label="Tên giải đua" rules={[{ required: true, whitespace: true, message: 'Nhập tên giải' }]}>
              <Input placeholder="VD: Cúp Mùa Xuân 2027" />
            </Form.Item>
            <Form.Item name="venue" label="Trường đua">
              <Input placeholder="VD: Trường đua Đại Nam" />
            </Form.Item>
            <Form.Item label="Cự ly" required className="!mb-2">
              <div className="rc-chips">
                {DISTANCES.map((d) => (
                  <button key={d.m} type="button" className={`rc-chip${distance === d.m ? ' is-on' : ''}`} onClick={() => pickDistance(d.m)}>
                    {d.m} m<small>{d.note}</small>
                  </button>
                ))}
              </div>
              <Form.Item name="distance" noStyle rules={[{ required: true, message: 'Chọn hoặc nhập cự ly' }]}>
                <InputNumber min={400} max={6000} step={100} suffix="m" className="!w-40" placeholder="Cự ly khác" />
              </Form.Item>
            </Form.Item>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Form.Item
                name="raceDate"
                label="Ngày đua"
                dependencies={['distance']}
                rules={[
                  { required: true, message: 'Chọn ngày đua' },
                  {
                    // The distance as it is now (it may have just changed), not as it was at the last render.
                    validator: (_, value) => {
                      const d = form.getFieldValue('distance');
                      if (!value || !d || !leadTime) return Promise.resolve();
                      const first = dayjs(earliestRaceDate(d));
                      return value.startOf('day').isBefore(first) ? Promise.reject(new Error(`Không kịp chuẩn bị — sớm nhất ${first.format('DD/MM/YYYY')}`)) : Promise.resolve();
                    },
                  },
                ]}
              >
                <DatePicker
                  className="w-full"
                  format="DD/MM/YYYY"
                  placeholder={leadTime && earliest ? `Từ ${earliest.format('DD/MM/YYYY')}` : 'Chọn ngày đua'}
                  disabledDate={(d) => d && (leadTime && earliest ? d.isBefore(earliest, 'day') : d.isBefore(today, 'day'))}
                  defaultPickerValue={(leadTime && earliest) || undefined}
                />
              </Form.Item>
              <Form.Item name="surface" label="Mặt sân">
                <Select options={surfaceOptions} />
              </Form.Item>
            </div>
          </Form>

          {/* What is checked before the horse is entered. */}
          <aside className="rc-plan" aria-live="polite">
            <p className="rc-plan-title">Kiểm tra trước khi đăng ký</p>
            <ul className="rc-checklist">
              <CheckRow state={!horse ? 'idle' : grounded || recovering ? 'bad' : 'ok'} title="Sức khỏe ngựa">
                {!horse
                  ? 'Chọn ngựa để xem tình trạng.'
                  : grounded
                    ? 'Bác sĩ đang khóa tập hoặc ngựa chấn thương — không đăng ký được.'
                    : recovering
                      ? `Đang hồi phục: bác sĩ chỉ cho ${horse.trainingClearance?.label || 'tập nhẹ'} — đăng ký khi ngựa khỏe lại.`
                      : 'Đủ điều kiện tập luyện.'}
              </CheckRow>

              <CheckRow state={!need ? 'idle' : enough === false ? 'bad' : enough ? 'ok' : 'idle'} title="Thời gian chuẩn bị">
                {!need ? (
                  'Chọn cự ly: giải càng dài, ngựa càng cần nhiều tuần huấn luyện.'
                ) : !leadTime ? (
                  `CLB đang không giới hạn thời gian đăng ký trước (nên có ${need.weeks} tuần huấn luyện cho cự ly ${need.label}).`
                ) : enough === false ? (
                  <>
                    Không kịp: giải {distance} m cần ít nhất {need.weeks} tuần huấn luyện và {need.prepDays} ngày chuẩn bị. Chọn ngày đua từ <b>{earliest.format('DD/MM/YYYY')}</b>.
                  </>
                ) : enough ? (
                  <>
                    Còn <b>{Math.floor(daysLeft / 7)} tuần</b> tới ngày đua — đủ cho {need.weeks} tuần huấn luyện và {need.prepDays} ngày chuẩn bị.
                  </>
                ) : (
                  <>
                    Cần {need.weeks} tuần huấn luyện + {need.prepDays} ngày chuẩn bị: đua từ <b>{earliest.format('DD/MM/YYYY')}</b>.{' '}
                    <Button size="small" type="link" className="!h-auto !p-0" onClick={() => form.setFieldValue('raceDate', earliest)}>
                      Chọn ngày này
                    </Button>
                  </>
                )}
              </CheckRow>

              <CheckRow state={!horse || !raceDate ? 'idle' : sameDay ? 'bad' : close ? 'warn' : 'ok'} title="Lịch thi đấu của ngựa">
                {!horse || !raceDate
                  ? 'Chọn ngựa và ngày đua để kiểm tra trùng lịch.'
                  : sameDay
                    ? `Trùng ngày với "${sameDay.raceName}" — một ngựa không đua hai giải cùng ngày.`
                    : close
                      ? `Cách "${close.raceName}" (${dayjs(close.raceDate).format('DD/MM')}) chỉ ${gapTo(close)} ngày — nên cách nhau từ ${MIN_DAYS_BETWEEN_RACES} ngày để ngựa hồi phục và chuẩn bị lại.`
                      : others.length
                        ? `Không sát giải nào (${others.length} giải khác đã đăng ký).`
                        : 'Chưa có giải nào khác.'}
              </CheckRow>

              <CheckRow state={!horse ? 'idle' : activePlan ? 'warn' : 'ok'} title="Kế hoạch huấn luyện">
                {!horse
                  ? 'Mỗi ngựa theo một kế hoạch tại một thời điểm.'
                  : activePlan
                    ? `Đang theo kế hoạch "${activePlan.goal || 'hiện tại'}" — hoàn thành hoặc hủy kế hoạch đó rồi mới lập kế hoạch cho giải này.`
                    : 'Chưa có kế hoạch đang chạy: lập kế hoạch ngay sau khi đăng ký.'}
              </CheckRow>
            </ul>

            {raceDate && (
              <div className="rc-summary">
                <div>
                  <span>Ngày đua</span>
                  <b>
                    {DAYS_OF_WEEK[raceDate.day()]}, {raceDate.format('DD/MM/YYYY')}
                  </b>
                </div>
                <div>
                  <span>Còn</span>
                  <b>{daysLeft} ngày</b>
                </div>
                {need && (
                  <div>
                    <span>Cự ly</span>
                    <b>
                      {distance} m · {need.label}
                    </b>
                  </div>
                )}
              </div>
            )}
            <p className="rc-hint">
              Trước giải: kế hoạch xong sớm {PRE_RACE_DAYS} ngày (nghỉ, khám, di chuyển), có {RECOVERY_DAYS_BEFORE_RACE} ngày hồi phục sau buổi chạy thử. Ngựa chỉ được xác nhận dự giải khi HLV đã đánh giá hoàn thành từng giai đoạn.
            </p>
          </aside>
        </div>
      </div>
    </Modal>
  );
}
