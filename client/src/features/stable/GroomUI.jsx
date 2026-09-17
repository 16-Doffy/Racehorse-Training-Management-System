import { Image, Tag } from 'antd';
import { WarningFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import { HEADING_FONT, SEVERITY_CONFIG, toUploadUrl } from './groomConfig';

/** Page heading shared by every Groom screen, same treatment as the Owner pages. */
export function GroomPageHeader({ icon, title, subtitle, extra }) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-[#022c22] mb-1 tracking-tight" style={{ fontFamily: HEADING_FONT }}>
          {icon && <span className="mr-2 text-[#eab308]">{icon}</span>}
          {title}
        </h1>
        {subtitle && <p className="text-gray-500 text-sm m-0">{subtitle}</p>}
      </div>
      {extra && <div className="flex items-center gap-3 flex-wrap">{extra}</div>}
    </div>
  );
}

/** Colored-top stat card, same as the Owner health/evaluation pages. */
export function StatCard({ icon, label, value, suffix, accent = 'border-t-[#022c22]', iconClass = 'bg-gray-50 text-[#022c22]', onClick }) {
  return (
    <div
      className={`premium-card p-4 flex items-center gap-4 border-t-4 ${accent} ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
      onClick={onClick}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0 ${iconClass}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">{label}</div>
        <div className="text-2xl font-bold text-[#022c22]">
          {value}
          {suffix && <span className="text-sm font-normal text-gray-400 ml-1">{suffix}</span>}
        </div>
      </div>
    </div>
  );
}

/** Initial-letter avatar for a horse (seed data has no photos). */
export function HorseAvatar({ name, size = 40, className = '' }) {
  return (
    <div
      className={`rounded-full bg-[#022c22] text-[#eab308] flex items-center justify-center font-bold shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4, fontFamily: HEADING_FONT }}
    >
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

/** Reported incident: severity, description, time and photo evidence (click to enlarge). */
export function IncidentBox({ report }) {
  const severity = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.medium;
  return (
    <div className="mt-2 bg-red-50/60 border border-red-100 rounded-lg p-3">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <WarningFilled style={{ color: '#ef4444' }} />
        <span className="text-xs font-bold text-red-700 uppercase tracking-wider">Sự cố đã báo</span>
        <Tag color={severity.color} className="!m-0 rounded-full">
          {severity.label}
        </Tag>
        {report.reportedAt && (
          <span className="text-[11px] text-gray-400 ml-auto">{dayjs(report.reportedAt).format('HH:mm DD/MM/YYYY')}</span>
        )}
      </div>
      <div className="text-sm text-gray-700">{report.description}</div>
      {report.images?.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          <Image.PreviewGroup>
            {report.images.map((src) => (
              <Image
                key={src}
                src={toUploadUrl(src)}
                width={56}
                height={56}
                className="object-cover rounded-md"
                fallback="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56'><rect width='56' height='56' fill='%23f3f4f6'/><text x='50%' y='54%' font-size='9' text-anchor='middle' fill='%239ca3af'>Không tải được</text></svg>"
              />
            ))}
          </Image.PreviewGroup>
        </div>
      )}
    </div>
  );
}
