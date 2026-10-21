import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownOutlined, ArrowLeftOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { clearanceOf, coatSwatch, healthOf, inkOn } from './ownerFormat';
import './owner.css';

/**
 * The pieces every Horse Owner page is built from, so the pages read as one calm product on the light
 * and the dark canvas: a page header, cards, status pills, figures, the horse picker. Colours come from
 * the tokens in owner.css.
 */

export function OwnerPage({ children }) {
  return <div className="own-ui own-page">{children}</div>;
}

/** The page title line. `stats` read "label: value" (each in its own span); `back` is { to, label }. */
export function PageHead({ eyebrow, title, sub, stats = [], actions, back }) {
  return (
    <header className="own-head">
      <div className="own-head-main">
        {back && (
          <Link className="own-back" to={back.to}>
            <ArrowLeftOutlined /> {back.label}
          </Link>
        )}
        {eyebrow && <div className="own-eyebrow">{eyebrow}</div>}
        <h1 className="own-title">{title}</h1>
        {sub && <p className="own-sub">{sub}</p>}
        {stats.length > 0 && (
          <div className="own-head-stats">
            {stats.map((s) => (
              <span className="own-head-stat" key={s.label}>
                <span>{s.label}:</span>
                <span>{s.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="own-head-actions">{actions}</div>}
    </header>
  );
}

/** A card with an optional title row. `flush` leaves the body edge to edge (for a list). */
export function Card({ title, icon, extra, flush = false, className = '', children, ...rest }) {
  return (
    <section className={`own-card${flush ? ' is-flush' : ''} ${className}`} {...rest}>
      {(title || extra) && (
        <div className="own-card-head">
          <h2 className="own-card-title">
            {icon}
            {title}
          </h2>
          {extra}
        </div>
      )}
      <div className="own-card-body">{children}</div>
    </section>
  );
}

/** A status word on a soft tint, with a dot. tone: good · watch · bad · quar · info · brass · neutral. */
export function Pill({ tone = 'neutral', dot = true, wrap = false, title, children }) {
  return (
    <span title={title} className={`own-pill is-${tone}${dot ? '' : ' no-dot'}${wrap ? ' is-wrap' : ''}`}>
      {children}
    </span>
  );
}

/** The vet's conclusion; "Chưa khám" while no vet has examined the horse (the default status is no assessment). */
export function HealthPill({ status, examined = true }) {
  if (!examined) return <Pill>Chưa khám</Pill>;
  const health = healthOf(status);
  return <Pill tone={health.tone}>{health.label}</Pill>;
}

/** How hard the horse may train, only while the vet holds it back (full training says nothing new). */
export function ClearancePill({ horse }) {
  const c = clearanceOf(horse);
  if (!c.restricted) return null;
  return (
    <Pill tone={c.tone} title={c.reason || undefined}>
      {c.label}
    </Pill>
  );
}

/** "+12%" / "−3" against last month; `change` is { text, up } or null. */
export function Change({ change }) {
  if (!change) return null;
  return (
    <span className={`own-stat-change ${change.up ? 'is-up' : 'is-down'}`}>
      {change.up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {change.text}
    </span>
  );
}

/** A row of figures. items: [{ label, icon, value, tone, change, sub }]. */
export function Stats({ items, cols }) {
  return (
    <div className="own-stats" style={{ '--cols': cols || items.length }}>
      {items.map((it) => (
        <div className="own-stat" key={it.label}>
          <div className="own-stat-label">
            {it.icon}
            <span>{it.label}</span>
          </div>
          <div className={`own-stat-value${it.tone ? ` is-${it.tone}` : ''}`}>
            <span>{it.value}</span>
            <Change change={it.change} />
          </div>
          {it.sub && <div className="own-stat-sub">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** Small labelled figures inside a card. items: [{ label, value, sub }]. */
export function Tiles({ items, cols }) {
  return (
    <div className="own-tiles" style={{ '--cols': cols || items.length }}>
      {items.map((it) => (
        <div className="own-tile" key={it.label}>
          <div className="own-tile-label">{it.label}</div>
          <div className="own-tile-value">{it.value}</div>
          {it.sub && <div className="own-tile-sub">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** The horse's coat colour behind its initial. */
export function HorseAvatar({ horse, size = 40 }) {
  const coat = coatSwatch(horse);
  const ink = inkOn(coat);
  return (
    <span
      className="own-avatar"
      aria-hidden="true"
      style={{ width: size, height: size, background: coat, color: ink, textShadow: ink === '#fff' ? undefined : 'none', fontSize: Math.round(size * 0.42) }}
    >
      {(horse?.name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** One chip per horse (with its health dot) and, unless `allLabel` is null, one for all of them. */
export function HorsePicker({ horses, value, onChange, allLabel = 'Tất cả ngựa' }) {
  return (
    <div className="own-picker" role="radiogroup" aria-label="Chọn ngựa">
      {allLabel && (
        <button type="button" role="radio" aria-checked={!value} className={`own-pick is-all${!value ? ' is-active' : ''}`} onClick={() => onChange(null)}>
          {allLabel}
        </button>
      )}
      {horses.map((h) => {
        const active = value === String(h._id);
        return (
          <button key={h._id} type="button" role="radio" aria-checked={active} className={`own-pick${active ? ' is-active' : ''}`} onClick={() => onChange(String(h._id))}>
            <HorseAvatar horse={h} size={26} />
            {h.name}
            <span className={`own-pick-dot is-${healthOf(h.healthStatus).tone}`} title={healthOf(h.healthStatus).label} />
          </button>
        );
      })}
    </div>
  );
}

export function EmptyNote({ children }) {
  return <div className="own-empty">{children}</div>;
}

/** Label and value pairs; falsy entries are skipped. */
export function Facts({ items }) {
  return (
    <dl className="own-facts">
      {items.filter(Boolean).map(([label, value]) => (
        <Fragment key={label}>
          <dt>{label}</dt>
          <dd>{value ?? '—'}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** The day of an event as a small calendar chip. */
export function DateChip({ date, sub }) {
  const d = new Date(date);
  return (
    <span className="own-date">
      <b>{String(d.getDate()).padStart(2, '0')}</b>
      <span>{sub || `Th${d.getMonth() + 1}`}</span>
    </span>
  );
}

/** A list row; a `to` makes the whole row a link. */
export function Row({ to, lead, title, sub, side, children }) {
  const body = (
    <>
      {lead}
      <div className="own-row-main">
        <div className="own-row-title">{title}</div>
        {sub && <div className="own-row-sub">{sub}</div>}
        {children}
      </div>
      {side && <div className="own-row-side">{side}</div>}
    </>
  );
  return to ? (
    <Link className="own-row" to={to}>
      {body}
    </Link>
  ) : (
    <div className="own-row">{body}</div>
  );
}

/** A row of shown items and a "show more" button under them. */
export function MoreButton({ shown, total, onMore }) {
  if (shown >= total) return null;
  return (
    <button type="button" className="own-more" onClick={onMore}>
      Xem thêm ({total - shown})
    </button>
  );
}
