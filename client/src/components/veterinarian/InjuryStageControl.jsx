import { useState } from 'react';
import useConfirm from './useConfirm';
import { setInjuryStage } from './vetActions';
import { ActionMenu, BusyButton, RecoveryStepper } from './ui';
import { RECOVERY_STEPS, recoveryMeta, shortBodyPart } from './vetFormat';

// The step that usually comes next, as the one button; the rest sit in the menu.
const NEXT = {
  new: { to: 'in_treatment', label: 'Bắt đầu điều trị', icon: 'bi-capsule' },
  in_treatment: { to: 'recovering', label: 'Chuyển sang hồi phục', icon: 'bi-graph-up-arrow' },
  recovering: { to: 'recovered', label: 'Xác nhận đã khỏi', icon: 'bi-check2-circle' },
};
const rank = (key) => RECOVERY_STEPS.findIndex((s) => s.key === key);

/**
 * Where an injury is in its recovery, and the way on: the stages as a line (read only), one button
 * for the next step, and the other stages in a menu — going back (it flared up again) or skipping
 * ahead asks first, and so does "healed", which ends the tracking. The stages also move on their own
 * with the horse's treatment (the server: a treatment starts → in treatment; the last ends → recovering).
 */
export default function InjuryStageControl({ marker, refresh, compact = false }) {
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const current = marker.recoveryStatus || 'new';
  const next = NEXT[current];
  const name = shortBodyPart(marker.bodyPart);

  const move = async (to) => {
    const label = recoveryMeta(to).label;
    if (to === 'recovered') {
      const ok = await confirm({ title: `${name}: xác nhận đã khỏi?`, body: 'Chấn thương ngừng được theo dõi; tình trạng sức khỏe của ngựa được tính lại theo các chấn thương còn lại.', confirmLabel: 'Đã khỏi' });
      if (!ok) return;
    } else if (rank(to) < rank(current)) {
      const ok = await confirm({ title: `${name}: quay lại “${label}”?`, body: 'Dùng khi chấn thương tái phát hoặc chưa hồi phục như dự kiến.', confirmLabel: 'Quay lại' });
      if (!ok) return;
    } else if (rank(to) > rank(current) + 1) {
      const ok = await confirm({ title: `${name}: chuyển thẳng sang “${label}”?`, body: `Bỏ qua bước “${recoveryMeta(RECOVERY_STEPS[rank(current) + 1].key).label}”.`, confirmLabel: 'Chuyển' });
      if (!ok) return;
    }
    setBusy(true);
    await setInjuryStage(marker, to, { refresh });
    setBusy(false);
  };

  const others = RECOVERY_STEPS.filter((s) => s.key !== current && s.key !== next?.to).map((s) => ({
    label: rank(s.key) < rank(current) ? `Quay lại: ${s.label}` : `Chuyển sang: ${s.label}`,
    icon: rank(s.key) < rank(current) ? 'bi-arrow-counterclockwise' : 'bi-skip-forward',
    onClick: () => move(s.key),
    disabled: busy,
  }));

  return (
    <div className={`vet-stage${compact ? ' is-compact' : ''}`}>
      <RecoveryStepper value={current} />
      <div className="vet-stage-actions">
        {next ? (
          <BusyButton size="sm" variant={next.to === 'recovered' ? 'vet' : 'vet-outline'} busy={busy} disabled={busy} onClick={() => move(next.to)}>
            <i className={`bi ${next.icon}`} aria-hidden="true" /> {next.label}
          </BusyButton>
        ) : (
          <span className="vet-small vet-faint">Đã ngừng theo dõi</span>
        )}
        <ActionMenu items={others} title="Chuyển sang giai đoạn khác" />
      </div>
      {confirmDialog}
    </div>
  );
}
