import { useState } from 'react';
import { Alert, Button, Input, Modal } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { message } from '../../lib/antdStatic';
import { trainingSessionApi } from './trainingApi';
import SegmentsEditor, { partsSummary, segmentsProblem } from './SegmentsEditor';
import { useClubPolicy } from './useClubPolicy';
import { TRAINING_LEVEL_META, intensityAllowed } from '../../constants/health';
import { AFTERNOON_KINDS, PRESETS_BY_KIND, SESSION_KINDS, WORKOUT_PRESETS, defaultPreset, heaviestKind, presetSegments } from './trainingVocab';

// The kinds a booked session can change to: the trial stays the race's own booking.
const CHANGE_KINDS = ['walk', 'canter', 'hill', 'breeze'];
const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

/** Its parts as they are, else the kind's usual workout, else one part of the kind's own numbers. */
function startingParts(session, slot) {
  if (session.segments?.length) return session.segments.map(({ _id, ...s }) => ({ ...s }));
  const preset = defaultPreset(session.kind, slot);
  if (preset) return presetSegments(preset);
  const rx = session.prescription || {};
  return [{ kind: session.kind, durationMinutes: rx.durationMinutes || 30, distanceM: rx.distanceM, targetSpeedKmh: rx.targetSpeedKmh, targetHeartRateMax: rx.targetHeartRateMax }];
}

/**
 * "Đổi bài tập": the work of one booked session, changed for that day only — another kind, other parts,
 * other numbers, a word to the groom. The plan's week template stays as it is. The server checks the
 * vet's clearance, puts a pre-checked session back to be checked again, tells the groom, and the day's
 * confirmed meals follow the new work.
 */
export default function ChangeWorkoutModal({ session, clearance, onClose }) {
  const policy = useClubPolicy();
  const queryClient = useQueryClient();
  const slot = dayjs(session.scheduledAt).hour() >= 12 ? 'afternoon' : 'morning';
  const kinds = slot === 'afternoon' && policy.afternoonLightOnly ? AFTERNOON_KINDS : CHANGE_KINDS;
  const [parts, setParts] = useState(() => startingParts(session, slot));
  const [note, setNote] = useState(session.coachNote || '');
  const kind = heaviestKind(parts);
  const allowed = (k) => intensityAllowed(clearance, SESSION_KINDS[k]?.intensity);
  const problem = segmentsProblem(parts, { kinds }) || (kind && !allowed(kind) ? `Bác sĩ đang cho ngựa ${TRAINING_LEVEL_META[clearance?.level]?.label?.toLowerCase() || 'tập hạn chế'} — không xếp "${SESSION_KINDS[kind].label}" được.` : null);

  const save = useMutation({
    mutationFn: () => {
      const main = parts.find((s) => s.kind === kind) || parts[0];
      return trainingSessionApi.update(session._id, {
        kind,
        segments: parts.map((s) => ({ ...s, note: s.note?.trim() || undefined })),
        prescription: { reps: 1, targetSpeedKmh: main.targetSpeedKmh, targetHeartRateMax: main.targetHeartRateMax },
        coachNote: note.trim(),
      });
    },
    onSuccess: () => {
      message.success('Đã đổi bài tập. Nhân viên chăm sóc đã được báo; bữa ăn ngày này theo bài mới.');
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['feeding'] });
      onClose();
    },
    onError: (err) => {
      if (err?.status === 409) queryClient.invalidateQueries({ queryKey: ['training-sessions'] });
      message.error(err.message || 'Không đổi được bài tập.');
    },
  });

  const presets = kinds
    .flatMap((k) => PRESETS_BY_KIND[k] || [])
    .filter((name) => (slot === 'afternoon' ? name.startsWith('afternoon_') || name === 'walk' : !name.startsWith('afternoon_')));
  // The work as it is booked now: its parts, else one part of its own numbers.
  const rx = session.prescription || {};
  const current = session.segments?.length ? session.segments : [{ kind: session.kind, durationMinutes: rx.durationMinutes, distanceM: rx.distanceM }];
  const changed = JSON.stringify(parts.map(({ kind: k, durationMinutes, distanceM }) => [k, durationMinutes || 0, distanceM || 0])) !== JSON.stringify(current.map(({ kind: k, durationMinutes, distanceM }) => [k, durationMinutes || 0, distanceM || 0]));

  return (
    <Modal
      open
      width={940}
      title={`Đổi bài tập — ${session.horse?.name || 'Ngựa'} · ${WEEKDAY[dayjs(session.scheduledAt).day()]} ${dayjs(session.scheduledAt).format('DD/MM, HH:mm')}`}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-gray-500">Chỉ đổi buổi này; tuần mẫu của giai đoạn giữ nguyên.</span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Hủy</Button>
            <Button type="primary" disabled={Boolean(problem)} loading={save.isPending} onClick={() => save.mutate()}>
              Lưu bài mới
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-sm">
        <span className="text-gray-500">Hiện tại:</span>
        <span className="font-medium text-gray-900">{SESSION_KINDS[session.kind]?.label || session.kind}</span>
        <span className="text-gray-500">({partsSummary(current)})</span>
        <ArrowRightOutlined className="mx-1 text-xs text-gray-400" />
        <span className="text-gray-500">Mới:</span>
        <span className="font-medium text-gray-900">{SESSION_KINDS[kind]?.label || '—'}</span>
        <span className="text-gray-500">({partsSummary(parts)})</span>
        {!changed && <span className="text-xs text-gray-400">· chưa đổi</span>}
      </div>
      {(clearance && clearance.level !== 'high') || session.status === 'ready' || (slot === 'afternoon' && policy.afternoonLightOnly) ? (
        <div className="mb-4 flex flex-col gap-2">
          {clearance && clearance.level !== 'high' && (
            <Alert type="warning" showIcon title={`Bác sĩ: ${TRAINING_LEVEL_META[clearance.level]?.label || clearance.level}. Các mẫu nặng hơn mức này bị khóa.`} />
          )}
          {session.status === 'ready' && <Alert type="info" showIcon title="Buổi này đã kiểm tra sẵn sàng cho bài cũ — đổi bài thì cần kiểm tra lại trước khi bắt đầu." />}
          {slot === 'afternoon' && policy.afternoonLightOnly && <Alert type="info" showIcon title="Buổi chiều: theo quy định CLB chỉ đi bộ hoặc phi chậm." />}
        </div>
      ) : null}
      <SegmentsEditor
        value={parts}
        onChange={setParts}
        kinds={kinds}
        presets={presets}
        onPreset={(name) => setParts(presetSegments(name))}
        presetDisabled={(name) => (allowed(WORKOUT_PRESETS[name].kind) ? null : 'Nặng hơn mức bác sĩ cho phép')}
        start={dayjs(session.scheduledAt).format('HH:mm')}
      />
      <div className="mt-4 mb-6">
        <div className="mb-1.5 text-sm text-gray-600">Dặn nhân viên / lý do đổi</div>
        <Input.TextArea rows={2} maxLength={300} showCount value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Sân dốc ướt, đổi sang phi chậm; thắng yên nhẹ." />
      </div>
      {problem && <div className="text-xs text-red-600">{problem}</div>}
    </Modal>
  );
}
