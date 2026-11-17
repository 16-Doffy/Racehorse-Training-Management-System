import { useState } from 'react';
import { Button, Modal } from 'antd';
import SegmentsEditor, { segmentsProblem } from './SegmentsEditor';
import { PRESETS_BY_KIND, SESSION_KINDS, defaultPreset, heaviestKind, presetSegments } from './trainingVocab';

/**
 * One day of a phase's normal week, in parts: warm-up, the work, cool-down — as the sessions booked
 * from it will be. `day`: { kind, segments } as it is; `kinds`: what the slot allows (light only in the
 * afternoon). `onSave({ kind, segments })`: the kind is the hardest part's.
 */
export default function TemplateDayModal({ open, title, slot, day, kinds, start = null, onSave, onClose }) {
  const [parts, setParts] = useState(() => (day?.segments?.length ? day.segments.map((s) => ({ ...s })) : presetSegments(defaultPreset(day?.kind || kinds[0], slot))));
  // The afternoon is light and short: its own ready-made sessions; the morning, the full ones.
  const presets = kinds
    .flatMap((k) => PRESETS_BY_KIND[k] || [])
    .filter((name) => (slot === 'afternoon' ? name.startsWith('afternoon_') || name === 'walk' : !name.startsWith('afternoon_')));
  const problem = segmentsProblem(parts, { kinds });
  const kind = heaviestKind(parts) || day?.kind;

  return (
    <Modal
      open={open}
      title={title}
      width={880}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-gray-500">
            {kind ? (
              <>
                Buổi này tính là <b>{SESSION_KINDS[kind]?.label}</b> (phần nặng nhất) khi đối chiếu mức tập bác sĩ cho phép.
              </>
            ) : null}
          </span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Hủy</Button>
            <Button type="primary" disabled={Boolean(problem)} title={problem || undefined} onClick={() => onSave({ kind, segments: parts })}>
              Lưu buổi này
            </Button>
          </div>
        </div>
      }
    >
      <p className="mb-3 text-sm text-gray-600">
        Chia buổi thành các phần theo thứ tự: khởi động → bài chính → thả lỏng. Mỗi tuần của giai đoạn, buổi tập được xếp đúng các phần này;
        HLV vẫn đổi được từng buổi cụ thể trong Buổi tập &amp; đánh giá.
      </p>
      <SegmentsEditor value={parts} onChange={setParts} kinds={kinds} presets={presets} start={start} onPreset={(name) => setParts(presetSegments(name))} />
      {problem && <div className="mt-2 text-xs text-red-600">{problem}</div>}
    </Modal>
  );
}
