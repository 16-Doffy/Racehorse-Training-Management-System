import { Choices, Pill } from './ui';
import { LEVEL_META, LEVEL_ORDER } from './vetFormat';

/**
 * The four training levels the vet chooses from. `cards` shows each with what it means (for the
 * decision itself), `pills` a compact row (inside a longer form). `labels` renames a level for the
 * context, e.g. high = "Không hạn chế" on a treatment.
 */
export default function TrainingLevelPicker({ value, onChange, current, disabled = false, variant = 'cards', labels = {} }) {
  if (variant === 'pills') {
    return (
      <Choices
        value={value}
        onChange={onChange}
        disabled={disabled}
        label="Mức vận động"
        options={LEVEL_ORDER.map((key) => ({ value: key, label: labels[key] || LEVEL_META[key].label, tone: LEVEL_META[key].tone, icon: LEVEL_META[key].icon }))}
      />
    );
  }
  return (
    <div className="vet-level-grid" role="radiogroup" aria-label="Mức vận động">
      {LEVEL_ORDER.map((key) => {
        const meta = LEVEL_META[key];
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={`vet-level-card${active ? ` is-active vet-tone-${meta.tone}` : ''}`}
            onClick={() => onChange(key)}
          >
            <span className="d-flex align-items-center gap-2 w-100">
              <i className={`bi ${meta.icon}`} aria-hidden="true" />
              <span className="fw-semibold">{labels[key] || meta.label}</span>
              {current === key && (
                <Pill tone="neutral" className="ms-auto">
                  Hiện tại
                </Pill>
              )}
            </span>
            <span className="vet-level-desc">{meta.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
