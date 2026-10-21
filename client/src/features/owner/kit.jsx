import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownOutlined, ArrowLeftOutlined, ArrowUpOutlined, CheckOutlined, DownOutlined, LeftOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { clearanceOf, coatSwatch, healthOf, horseFacts, inkOn } from './ownerFormat';
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

/** All the owner's horses at once: their count on a brass tile, in the place of a horse's avatar. */
function HerdAvatar({ count, size = 40 }) {
  return (
    <span className="own-herd" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {count}
    </span>
  );
}

// "Sao Mai" is found by "sao mai" and by "Sáo Mãi": the search ignores case and Vietnamese marks.
const fold = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');

/**
 * Which horse the page is about: the picked horse (or all of them, unless `allLabel` is null) on a button
 * that opens the list of them, searchable once there are more than a few, and a step to the previous
 * and the next one beside it.
 */
export function HorsePicker({ horses, value, onChange, allLabel = 'Tất cả ngựa' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef(null);
  const buttonRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const uid = useId();

  // In order: "all" (null) first when offered, then each horse.
  const choices = useMemo(() => [...(allLabel ? [null] : []), ...horses], [allLabel, horses]);
  const at = choices.findIndex((h) => (h ? String(h._id) === value : !value));
  const picked = value ? horses.find((h) => String(h._id) === value) : null;
  const q = fold(query.trim());
  const shown = q ? horses.filter((h) => fold(h.name).includes(q)) : choices;
  const searchable = horses.length > 5;

  useEffect(() => {
    if (!open) return undefined;
    (searchRef.current || listRef.current)?.focus();
    const away = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[cursor]?.scrollIntoView({ block: 'nearest' });
  }, [open, cursor]);

  const show = () => {
    setQuery('');
    setCursor(Math.max(at, 0));
    setOpen(true);
  };
  const pick = (h) => {
    onChange(h ? String(h._id) : null);
    setOpen(false);
    buttonRef.current?.focus();
  };
  const step = (by) => {
    const next = at + by;
    if (next >= 0 && next < choices.length) onChange(choices[next] ? String(choices[next]._id) : null);
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' && e.target === buttonRef.current) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.min(Math.max(c + (e.key === 'ArrowDown' ? 1 : -1), 0), shown.length - 1));
    } else if (e.key === 'Enter' && cursor < shown.length) {
      e.preventDefault();
      pick(shown[cursor]);
    }
  };

  const health = picked ? healthOf(picked.healthStatus) : null;
  return (
    <div className="own-switch" ref={boxRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="own-switch-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Chọn ngựa, đang xem: ${picked ? picked.name : allLabel || '—'}`}
        disabled={!horses.length}
        onClick={() => (open ? setOpen(false) : show())}
      >
        {picked ? <HorseAvatar horse={picked} size={40} /> : <HerdAvatar count={horses.length} />}
        <span className="own-switch-text">
          <span className="own-switch-name">
            <span>{picked ? picked.name : allLabel || 'Chưa có ngựa'}</span>
            {health && <span className={`own-dot is-${health.tone}`} title={health.label} />}
          </span>
          <span className="own-switch-meta">{picked ? horseFacts(picked) || 'Chiến mã của bạn' : `${horses.length} chiến mã`}</span>
        </span>
        <DownOutlined className="own-switch-caret" />
      </button>

      {choices.length > 1 && (
        <div className="own-switch-step">
          <button type="button" aria-label="Ngựa trước" title="Ngựa trước" disabled={at <= 0} onClick={() => step(-1)}>
            <LeftOutlined />
          </button>
          <button type="button" aria-label="Ngựa sau" title="Ngựa sau" disabled={at < 0 || at >= choices.length - 1} onClick={() => step(1)}>
            <RightOutlined />
          </button>
        </div>
      )}

      {open && (
        <div className="own-switch-panel">
          {searchable && (
            <label className="own-switch-search">
              <SearchOutlined />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                placeholder={`Tìm trong ${horses.length} chiến mã`}
                aria-label="Tìm ngựa theo tên"
                aria-controls={`${uid}-list`}
                aria-activedescendant={shown.length ? `${uid}-${cursor}` : undefined}
              />
            </label>
          )}
          <ul ref={listRef} id={`${uid}-list`} className="own-switch-list" role="listbox" aria-label="Chọn ngựa" tabIndex={-1} aria-activedescendant={!searchable && shown.length ? `${uid}-${cursor}` : undefined}>
            {shown.map((h, i) => {
              const selected = h ? String(h._id) === value : !value;
              const tone = h ? healthOf(h.healthStatus) : null;
              return (
                <li
                  key={h ? h._id : 'all'}
                  id={`${uid}-${i}`}
                  role="option"
                  aria-selected={selected}
                  className={`own-switch-opt${i === cursor ? ' is-cursor' : ''}${selected ? ' is-selected' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(h)}
                >
                  {h ? <HorseAvatar horse={h} size={32} /> : <HerdAvatar count={horses.length} size={32} />}
                  <span className="own-switch-text">
                    <span className="own-switch-opt-name">{h ? h.name : allLabel}</span>
                    <span className="own-switch-meta">{h ? horseFacts(h) || 'Chiến mã của bạn' : `Xem chung ${horses.length} chiến mã`}</span>
                  </span>
                  {tone && <span className={`own-switch-health is-${tone.tone}`}>{tone.label}</span>}
                  <CheckOutlined className="own-switch-check" />
                </li>
              );
            })}
            {shown.length === 0 && <li className="own-switch-none">Không có ngựa nào tên “{query.trim()}”.</li>}
          </ul>
        </div>
      )}
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
