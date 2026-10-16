import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';

// Small building blocks shared by the Horse Owner pages, so they read as one compact, calm screen:
// one thin-bordered card, one strip of figures, one kind of status label. The Owner pages carry the
// `owner-ui` class on their root; MainLayout.jsx styles the tables inside it.

/** A white card with an optional title row. `flush` leaves the body edge to edge (for a table). */
export function OwnerCard({ title, extra, flush = false, className = '', children }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden ${className}`}>
      {(title || extra) && (
        <div className="flex items-center justify-between gap-3 px-[20px] py-3.5 border-b border-gray-100">
          {/* A div, not an h2: the global Bootstrap rule `h2 { font-size: 2rem }` outranks Tailwind's text-sm. */}
          <div role="heading" aria-level={2} className="text-sm font-semibold text-gray-900">{title}</div>
          {extra}
        </div>
      )}
      <div className={flush ? '' : 'p-[20px]'}>{children}</div>
    </div>
  );
}

const TONES = {
  neutral: 'bg-gray-100 text-gray-600',
  info: 'bg-blue-50 text-blue-700',
  good: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  bad: 'bg-red-50 text-red-700',
};

/** A status label: a coloured dot and a word on a soft tint. */
export function Pill({ tone = 'neutral', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${TONES[tone] || TONES.neutral} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

/** "+12%" / "-3" beside a figure; `change` is { text, up } or null. */
export function ChangeBadge({ change }) {
  if (!change) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${change.up ? 'text-emerald-600' : 'text-red-600'}`}>
      {change.up ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
      {change.text}
    </span>
  );
}

/**
 * A row of figures in one bordered strip. items: [{ label, value, hint, change, tone }]; `tone`
 * ('good' | 'warn' | 'bad') tints the value. `cols` is the column count on wide screens.
 */
export function StatStrip({ items, cols = items.length, className = '' }) {
  const wide = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }[cols] || 'lg:grid-cols-4';
  const valueTone = { good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-600' };
  return (
    <div className={`grid grid-cols-2 ${wide} gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden ${className}`}>
      {items.map((item) => (
        <div key={item.label} className="bg-white px-4 py-3.5 min-w-0">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{item.label}</div>
          <div className="flex items-baseline gap-2 mt-1 flex-wrap">
            <span className={`text-xl font-bold tabular-nums leading-tight ${valueTone[item.tone] || 'text-gray-900'}`}>{item.value}</span>
            <ChangeBadge change={item.change} />
          </div>
          {item.hint && <div className="text-xs text-gray-400 mt-0.5">{item.hint}</div>}
        </div>
      ))}
    </div>
  );
}

/** A label and its value on one line, for the small fact lists inside a card. */
export function FactRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-gray-100 last:border-0 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900 text-right">{children}</span>
    </div>
  );
}
