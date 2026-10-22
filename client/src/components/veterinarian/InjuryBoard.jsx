import { useEffect, useMemo, useState } from 'react';
import HorseInjuryViewer from './HorseInjuryViewer';
import InjuryStageControl from './InjuryStageControl';
import { EmptyNote, FilterChips, HealthPill, HorseAvatar, LevelPill, Pill, SearchBox } from './ui';
import { SEVERITY_META, ago, clearanceOf, fmtDate, idOf, isActiveInjury, recoveryMeta, shortBodyPart } from './vetFormat';

const SEVERITY_RANK = { severe: 0, moderate: 1, mild: 2 };
const byConcern = (a, b) =>
  Number(isActiveInjury(b)) - Number(isActiveInjury(a)) || (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || new Date(b.createdAt) - new Date(a.createdAt);

/**
 * Injuries as a list beside the horse in 3D, so many of them still read: the list (by horse, worst
 * first, filtered by stage and searched) on the left, and on the right the horse of the chosen injury
 * with its marks and that injury's details — its stage moves there, its exam opens in place
 * (onOpenExam). `horse`: one horse's injuries (its page), no grouping. `horses`: the horses to group by.
 */
export default function InjuryBoard({ injuries, horse = null, horses = [], refresh, onOpenExam }) {
  const [status, setStatus] = useState('active');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [folded, setFolded] = useState(() => new Set());
  const horseById = useMemo(() => new Map(horses.map((h) => [h._id, h])), [horses]);
  const horseOf = (m) => horse || horseById.get(idOf(m.horse)) || (typeof m.horse === 'object' ? m.horse : null);

  const activeCount = injuries.filter(isActiveInjury).length;
  const q = query.trim().toLowerCase();
  const shown = injuries
    .filter((m) => (status === 'active' ? isActiveInjury(m) : status === 'recovered' ? !isActiveInjury(m) : true))
    .filter((m) => !q || horseOf(m)?.name?.toLowerCase().includes(q) || m.bodyPart?.toLowerCase().includes(q) || m.notes?.toLowerCase().includes(q))
    .sort(byConcern);

  // One group per horse (worst injury first), or a single group on a horse's own page.
  const groups = [];
  for (const m of shown) {
    const key = horse ? 'one' : idOf(m.horse);
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, horse: horseOf(m), items: [] }));
    g.items.push(m);
  }

  const selected = shown.find((m) => m._id === selectedId) || shown[0] || null;
  useEffect(() => {
    if (selected && selected._id !== selectedId) setSelectedId(selected._id);
  }, [selected, selectedId]);
  const selHorse = selected ? horseOf(selected) : horse;
  // The marks on the 3D horse: its injuries still tracked, and the chosen one even if healed.
  const marks = selected ? injuries.filter((m) => idOf(m.horse) === idOf(selected.horse) && (isActiveInjury(m) || m._id === selected._id)) : [];

  const fold = (key) =>
    setFolded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="vet-inj">
      <div className="vet-inj-main">
        <div className="vet-toolbar mb-2">
          {!horse && <SearchBox value={query} onChange={setQuery} placeholder="Tìm ngựa, vị trí tổn thương…" />}
          <FilterChips
            value={status}
            onChange={setStatus}
            options={[
              { value: 'active', label: 'Đang theo dõi', count: activeCount },
              { value: 'recovered', label: 'Đã khỏi', count: injuries.length - activeCount },
              { value: 'all', label: 'Tất cả', count: injuries.length },
            ]}
          />
        </div>

        {shown.length === 0 ? (
          <div className="vet-card">
            <EmptyNote icon="bi-shield-check" title={status === 'active' ? 'Không có chấn thương nào đang theo dõi' : q ? 'Không tìm thấy chấn thương nào' : 'Chưa có chấn thương nào'} />
          </div>
        ) : (
          <div className="vet-stack" style={{ gap: 10 }}>
            {groups.map((g) => {
              const closed = folded.has(g.key);
              const clearance = clearanceOf(g.horse);
              return (
                <section key={g.key} className="vet-card vet-inj-group">
                  {!horse && (
                    <button type="button" className="vet-inj-group-head" onClick={() => fold(g.key)} aria-expanded={!closed}>
                      <HorseAvatar horse={g.horse} size={32} />
                      <span className="vet-row-title text-truncate">{g.horse?.name || 'Ngựa'}</span>
                      <span className="vet-small vet-muted">{g.items.length} chấn thương</span>
                      <span className="ms-auto d-flex flex-wrap align-items-center gap-1 justify-content-end">
                        {g.horse && <HealthPill status={g.horse.healthStatus} />}
                        {clearance.restricted && <LevelPill level={clearance.level} short />}
                      </span>
                      <i className={`bi ${closed ? 'bi-chevron-down' : 'bi-chevron-up'} vet-faint`} aria-hidden="true" />
                    </button>
                  )}
                  {!closed &&
                    g.items.map((m) => {
                      const stage = recoveryMeta(m.recoveryStatus);
                      const active = m._id === selected?._id;
                      return (
                        <button key={m._id} type="button" className={`vet-inj-row${active ? ' is-active' : ''}`} onClick={() => setSelectedId(m._id)} aria-pressed={active}>
                          <span className={`vet-inj-sev is-${m.severity}`} aria-hidden="true" />
                          <span className="vet-inj-text">
                            <span className="d-flex flex-wrap align-items-center gap-2">
                              <b title={m.bodyPart}>{shortBodyPart(m.bodyPart)}</b>
                              <Pill tone={SEVERITY_META[m.severity]?.tone}>{SEVERITY_META[m.severity]?.label || m.severity}</Pill>
                            </span>
                            <span className="vet-small vet-muted d-block text-truncate">
                              Ghi {fmtDate(m.createdAt)}
                              {m.notes ? ` · ${m.notes}` : ''}
                            </span>
                          </span>
                          <Pill tone={stage.tone}>{stage.label}</Pill>
                        </button>
                      );
                    })}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <aside className="vet-inj-side">
        <div className="vet-card vet-inj-panel">
          <HorseInjuryViewer horse={selHorse} injuries={marks} selectedId={selected?._id} onSelect={setSelectedId} height={340} />
          {selected ? (
            <div className="vet-inj-detail">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span className="vet-sheet-horse">{shortBodyPart(selected.bodyPart)}</span>
                <Pill tone={SEVERITY_META[selected.severity]?.tone}>{SEVERITY_META[selected.severity]?.label || selected.severity}</Pill>
              </div>
              {selected.bodyPart !== shortBodyPart(selected.bodyPart) && <div className="vet-small vet-muted">{selected.bodyPart}</div>}
              <div className="mt-2">
                <InjuryStageControl key={selected._id} marker={selected} refresh={refresh} />
              </div>
              <dl className="vet-sheet-facts mt-3">
                {!horse && (
                  <>
                    <dt>Ngựa</dt>
                    <dd>{selHorse?.name || '—'}</dd>
                  </>
                )}
                <dt>Ghi nhận</dt>
                <dd>
                  {fmtDate(selected.createdAt)} <span className="vet-faint">({ago(selected.createdAt)})</span>
                </dd>
                <dt>Ghi chú</dt>
                <dd>{selected.notes || <span className="vet-faint fst-italic">Không ghi</span>}</dd>
                <dt>Phiếu khám</dt>
                <dd>
                  {selected.healthRecord && onOpenExam ? (
                    <button type="button" className="vet-link" onClick={() => onOpenExam(idOf(selected.healthRecord))}>
                      <i className="bi bi-clipboard2-pulse" aria-hidden="true" /> Xem phiếu khám
                    </button>
                  ) : (
                    <span className="vet-faint fst-italic">Ghi riêng, không theo phiếu khám</span>
                  )}
                </dd>
              </dl>
              <div className="vet-small vet-faint mt-2">
                <i className="bi bi-arrow-repeat me-1" aria-hidden="true" />
                Tự chuyển theo đơn thuốc: kê đơn → Đang điều trị; kết thúc đơn cuối → Đang hồi phục. “Đã khỏi” do bác sĩ xác nhận.
              </div>
            </div>
          ) : (
            <div className="vet-inj-detail vet-small vet-faint">Chọn một chấn thương trong danh sách.</div>
          )}
        </div>
      </aside>
    </div>
  );
}
