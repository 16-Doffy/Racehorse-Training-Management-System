import { Progress } from 'antd';
import { FOREST } from '../../layouts/forestTheme';

const num = (n, digits = 0) => (n == null ? null : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: digits }));

/** One figure: its name, the value large, what it is measured against under it. */
function Reading({ label, value, unit, sub, alert, className = '', children }) {
  return (
    <div className={`min-w-0 px-3 py-2 ${className}`}>
      <dt className={`text-xs ${alert ? 'text-rose-700' : 'text-gray-500'}`}>{label}</dt>
      <dd className="m-0 whitespace-nowrap">
        <span className={`text-xl font-semibold leading-tight tabular-nums ${alert ? 'text-rose-700' : 'text-gray-900'}`}>{value ?? '—'}</span>
        {unit && <span className="ml-1 text-xs text-gray-500">{unit}</span>}
      </dd>
      {sub && <dd className="m-0 truncate text-[11px] text-gray-500">{sub}</dd>}
      {children}
    </div>
  );
}

/**
 * A run's figures at one moment, beside the 3D horse (live or played back): heart rate against the
 * session's ceiling (red above it), speed against the target, distance against the course with its
 * progress. One strip split by hairlines, the same on a phone.
 */
export default function Telemetry({ heartRate, heartRateMax, speed, targetSpeed, distance = 0, targetDistance }) {
  const over = heartRate != null && heartRate > heartRateMax;
  const share = targetDistance ? Math.min(100, Math.round((distance / targetDistance) * 100)) : 0;
  return (
    <dl className="m-0 grid grid-cols-3 divide-x divide-gray-100 border-y border-gray-200">
      <Reading label="Nhịp tim" value={heartRate} unit="bpm" sub={`giới hạn ${heartRateMax}`} alert={over} className="pl-0" />
      <Reading label="Tốc độ" value={num(speed, 1)} unit="km/h" sub={targetSpeed ? `mục tiêu ${num(targetSpeed, 1)}` : null} />
      <Reading label="Cự ly" value={num(distance)} unit="m" sub={targetDistance ? `trên ${num(targetDistance)} m` : null}>
        <Progress className="!m-0 !mt-1" percent={share} size="small" showInfo={false} strokeColor={FOREST.primary} aria-label={`Đã chạy ${share}% cự ly`} />
      </Reading>
    </dl>
  );
}
