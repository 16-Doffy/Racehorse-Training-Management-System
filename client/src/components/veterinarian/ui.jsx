/**
 * The building blocks of the vet's pages (styles in vet.css). Every page is made of the same few
 * pieces — a card, a pill, a row with one main action — so the pages read alike and stay quiet.
 */
import { Fragment, useState } from 'react';
import { Button, Dropdown, Form, Modal, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { fileHref } from '../../lib/files';
import { coatFor } from '../../features/horses/horse3d/horseBreeds';
import { RECOVERY_STEPS, VITALS, dueInfo, fmtDate, healthMeta, horseFacts, levelMeta, vitalOff } from './vetFormat';
import './vet.css';

export function VetCard({ title, icon, count, extra, children, flush = false, className = '', bodyClassName = '' }) {
  // A heading holds text only; a richer title (a horse with its avatar) goes in a plain block.
  const TitleTag = typeof title === 'string' ? 'h2' : 'div';
  return (
    <section className={`vet-card ${className}`}>
      {(title || extra) && (
        <header className="vet-card-head">
          {title && (
            <TitleTag className="vet-card-title">
              {icon && <i className={`bi ${icon}`} aria-hidden="true" />}
              {title}
              {count !== undefined && count !== null && <span className="vet-count">{count}</span>}
            </TitleTag>
          )}
          {extra && <div className="d-flex align-items-center gap-2 flex-wrap">{extra}</div>}
        </header>
      )}
      <div className={`vet-card-body${flush ? ' is-flush' : ''} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Pill({ tone = 'neutral', icon, children, lg = false, title, className = '' }) {
  return (
    <span className={`vet-pill vet-tone-${tone}${lg ? ' is-lg' : ''} ${className}`} title={title}>
      {icon && <i className={`bi ${icon}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function HealthPill({ status, lg }) {
  const meta = healthMeta(status);
  return (
    <Pill tone={meta.tone} icon={meta.icon} lg={lg}>
      {meta.label}
    </Pill>
  );
}

export function LevelPill({ level, lg, short = false, title }) {
  const meta = levelMeta(level);
  return (
    <Pill tone={meta.tone} icon={meta.icon} lg={lg} title={title}>
      {short ? meta.short : meta.label}
    </Pill>
  );
}

/** The horse's photo, or its initial on its coat colour (the same coat the 3D horse wears). */
export function HorseAvatar({ horse, size = 40 }) {
  const [broken, setBroken] = useState(false);
  const src = horse?.photoUrl && !broken ? fileHref(horse.photoUrl) : null;
  const coat = coatFor({ breed: horse?.breed, color: horse?.color });
  const lightCoat = coat.key === 'grey' || coat.key === 'palomino';
  return (
    <span
      className="vet-avatar"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: src ? 'var(--vet-card-2)' : coat.swatch,
        color: lightCoat ? '#1a2b22' : '#ffffff',
        borderRadius: size >= 56 ? 16 : 12,
      }}
    >
      {src ? <img src={src} alt="" onError={() => setBroken(true)} /> : (horse?.name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Avatar, name and the short facts line; used as the first cell of most lists. */
export function HorseCell({ horse, sub, size = 40 }) {
  return (
    <div className="d-flex align-items-center gap-3" style={{ minWidth: 0 }}>
      <HorseAvatar horse={horse} size={size} />
      <div style={{ minWidth: 0 }}>
        <div className="vet-row-title text-truncate">{horse?.name || 'Ngựa'}</div>
        <div className="vet-small vet-muted text-truncate">{sub ?? horseFacts(horse)}</div>
      </div>
    </div>
  );
}

export function FilterChips({ options, value, onChange, label = 'Bộ lọc' }) {
  return (
    <div className="vet-chips" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`vet-chip${value === o.value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.tone && <span className={`vet-dot vet-text-${o.tone}`} aria-hidden="true" />}
          {o.label}
          {o.count !== undefined && <span className="vet-chip-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Tìm kiếm…' }) {
  return (
    <div className="vet-search">
      <i className="bi bi-search" aria-hidden="true" />
      <Form.Control type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function EmptyNote({ icon = 'bi-inbox', title, children, action }) {
  return (
    <div className="vet-empty">
      <i className={`bi ${icon}`} aria-hidden="true" />
      {title && <div className="vet-empty-title">{title}</div>}
      {children && <div className="vet-small mt-1">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Header of a detail or form page: a way back, the title, and the page's few actions. */
export function PageHead({ back, title, subtitle, actions }) {
  const navigate = useNavigate();
  return (
    <div className="vet-page-head">
      <div style={{ minWidth: 0 }}>
        {back && (
          <button type="button" className="vet-back" onClick={() => navigate(back.to)}>
            <i className="bi bi-arrow-left" aria-hidden="true" />
            {back.label}
          </button>
        )}
        <h1 className="vet-title" style={{ fontSize: 26 }}>
          {title}
        </h1>
        {subtitle && <div className="vet-muted mt-1">{subtitle}</div>}
      </div>
      {actions && <div className="d-flex flex-wrap align-items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * The "…" menu that holds a row's or a page's secondary actions, so each place shows one main button.
 * items: [{ label, icon, onClick, danger, disabled } | { divider: true } | null]
 */
export function ActionMenu({ items, label, icon = 'bi-three-dots', size = 'sm', align = 'end', variant = 'vet-outline', title = 'Thao tác khác' }) {
  const visible = items.filter(Boolean);
  if (!visible.length) return null;
  return (
    <Dropdown align={align} onClick={(e) => e.stopPropagation()}>
      <Dropdown.Toggle variant={variant} size={size || undefined} className={label ? '' : `vet-icon-btn vet-no-caret${size ? '' : ' is-md'}`} title={title} aria-label={title}>
        {label || <i className={`bi ${icon}`} aria-hidden="true" />}
      </Dropdown.Toggle>
      <Dropdown.Menu className="vet-menu" popperConfig={{ strategy: 'fixed' }}>
        {visible.map((item, i) =>
          item.divider ? (
            <Dropdown.Divider key={`divider-${i}`} />
          ) : (
            <Dropdown.Item key={item.label} as="button" type="button" onClick={item.onClick} disabled={item.disabled} className={item.danger ? 'is-danger' : ''}>
              {item.icon && <i className={`bi ${item.icon}`} aria-hidden="true" />}
              {item.label}
            </Dropdown.Item>
          )
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}

/** A small set of mutually exclusive options shown side by side (a radio group). */
export function Choices({ value, onChange, options, disabled = false, label }) {
  return (
    <div className="vet-choices" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value === '' ? '__empty' : o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={o.title}
            className={`vet-choice${active ? ` is-active vet-tone-${o.tone || 'neutral'}` : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.icon && <i className={`bi ${o.icon}`} aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, required = false, hint, children, className = '', controlId }) {
  return (
    <Form.Group className={className} controlId={controlId}>
      {label && <Form.Label className={required ? 'vet-req' : ''}>{label}</Form.Label>}
      {children}
      {hint && <Form.Text as="div">{hint}</Form.Text>}
    </Form.Group>
  );
}

export function Section({ title, extra, children }) {
  return (
    <div className="vet-section">
      {(title || extra) && (
        <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
          {title && <div className="vet-section-title">{title}</div>}
          {extra}
        </div>
      )}
      {children}
    </div>
  );
}

/** A due date as a coloured chip: overdue red, soon amber, later green; empty when not set. */
export function DueChip({ date, onClick, soonDays = 7, title }) {
  const info = dueInfo(date, soonDays);
  if (info.key === 'none') {
    return (
      <button type="button" className="vet-due is-empty" onClick={onClick} title={title}>
        <span className="vet-due-date">Chưa đặt</span>
        <span className="vet-due-rel">Đặt lịch</span>
      </button>
    );
  }
  return (
    <button type="button" className={`vet-due vet-tone-${info.tone}`} onClick={onClick} title={title}>
      <span className="vet-due-date">{fmtDate(date)}</span>
      <span className="vet-due-rel">{info.rel}</span>
    </button>
  );
}

export function Vitals({ vitalSigns }) {
  return (
    <div className="vet-vitals">
      {VITALS.map((v) => {
        const value = vitalSigns?.[v.key];
        const has = value !== undefined && value !== null && value !== '';
        return (
          <div key={v.key} className={`vet-vital${vitalOff(v, value) ? ' is-off' : ''}`}>
            <div className="vet-vital-label">{v.label}</div>
            <div className="vet-vital-value">
              {has ? value : '—'}
              {has && <small>{v.unit}</small>}
            </div>
            <div className="vet-vital-range">
              Chuẩn {v.min}–{v.max}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Where an injury is in its recovery; a dot can be clicked to move it there. */
export function RecoveryStepper({ value, onChange, disabled = false }) {
  const current = Math.max(
    0,
    RECOVERY_STEPS.findIndex((s) => s.key === value)
  );
  const meta = RECOVERY_STEPS[current];
  return (
    <div className="vet-stepper">
      {RECOVERY_STEPS.map((step, i) => (
        <Fragment key={step.key}>
          {i > 0 && <span className={`vet-step-line${i <= current ? ' is-done' : ''}`} aria-hidden="true" />}
          <button
            type="button"
            className={`vet-step${i <= current ? ' is-done' : ''}${i === current ? ' is-current' : ''}`}
            style={i <= current ? { color: `var(--vet-${i === current ? meta.tone : 'good'})` } : undefined}
            title={i === current ? step.label : `Chuyển sang: ${step.label}`}
            aria-label={i === current ? `Hiện tại: ${step.label}` : `Chuyển sang: ${step.label}`}
            disabled={disabled || i === current || !onChange}
            onClick={(e) => {
              e.stopPropagation();
              onChange?.(step.key);
            }}
          >
            <span className="vet-step-dot" />
          </button>
        </Fragment>
      ))}
      <span className="ms-2 vet-small fw-semibold" style={{ color: `var(--vet-${meta.tone})` }}>
        {meta.label}
      </span>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="vet-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key} className={`vet-tab${value === t.key ? ' is-active' : ''}`} onClick={() => onChange(t.key)}>
          {t.icon && <i className={`bi ${t.icon}`} aria-hidden="true" />}
          {t.label}
          {t.count ? <span className="vet-tab-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Callout({ tone = 'info', icon = 'bi-info-circle-fill', children, action, className = '' }) {
  return (
    <div className={`vet-callout vet-tone-${tone} ${className}`}>
      <i className={`bi ${icon}`} aria-hidden="true" />
      <div className="vet-callout-body flex-grow-1">{children}</div>
      {action}
    </div>
  );
}

export function Progress({ value = 0, max = 1, tone = 'good' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="vet-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%`, background: `var(--vet-${tone})` }} />
    </div>
  );
}

export function TimeChips({ times }) {
  if (!times?.length) return <span className="vet-small vet-faint">Theo chỉ dẫn</span>;
  return (
    <span className="d-inline-flex flex-wrap gap-1">
      {times.map((t) => (
        <span key={t} className="vet-time">
          {t}
        </span>
      ))}
    </span>
  );
}

export function BusyButton({ busy = false, children, variant = 'vet', disabled, ...props }) {
  return (
    <Button variant={variant} {...props} disabled={busy || disabled}>
      {busy && <Spinner animation="border" size="sm" aria-hidden="true" />}
      {children}
    </Button>
  );
}

export function LoadingBlock({ rows = 3, height = 56 }) {
  return (
    <div className="d-flex flex-column gap-2 p-3" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="vet-skeleton" style={{ height }} />
      ))}
    </div>
  );
}

/**
 * A modal in the vet's look. With `onSubmit`, the body and footer are one form: Enter submits and
 * the footer's submit button works without wiring.
 */
export function VetModal({ show, onHide, title, icon, size, busy = false, children, footer, onSubmit }) {
  const content = (
    <>
      <Modal.Header closeButton={!busy}>
        <Modal.Title>
          {icon && <i className={`bi ${icon} me-2`} aria-hidden="true" />}
          {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>{children}</Modal.Body>
      {footer && <Modal.Footer>{footer}</Modal.Footer>}
    </>
  );
  return (
    <Modal show={show} onHide={() => !busy && onHide()} centered size={size} className="vet-ui" backdrop={busy ? 'static' : true}>
      {onSubmit ? (
        <Form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {content}
        </Form>
      ) : (
        content
      )}
    </Modal>
  );
}
