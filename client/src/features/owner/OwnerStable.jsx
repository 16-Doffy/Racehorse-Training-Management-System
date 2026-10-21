import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { HomeOutlined, RightOutlined } from '@ant-design/icons';
import Stall3D from '../stable/stall3d/Stall3D';
import StableMap from '../stable/StableMap';
import { STALL_TYPE_LABELS, groupZones } from '../stable/stall3d/stallStatus';
import { Card, EmptyNote, Facts, HealthPill, HorseAvatar, OwnerPage, PageHead } from './kit';
import StableDetail from './StableDetail';
import { fmtDate, horseFacts, idOf } from './ownerFormat';
import { useHorseParam, useMyHorses, useStallsByHorse } from './useOwnerData';

// The owner's horses that are on no stall of the map: a hand-written stall, or none yet.
const OFF_MAP = 'off-map';

/**
 * Where the owner's horses live, the way the stable is laid out: pick the zone, then the stall (on the
 * map or in the barn in 3D), and the horse in it shows with today's care and its rations. Only the
 * stalls of the owner's horses can be picked; the others show as the map has them. The horse stays in
 * the URL (?horse=<id>), and the zone follows it.
 */
export default function OwnerStable() {
  const { horses, isLoading } = useMyHorses();
  const { stalls, byHorse, isLoading: mapLoading, isError: mapFailed, refetch } = useStallsByHorse();
  const [horseId, setHorse] = useHorseParam(horses);

  // The zones holding one of the owner's horses, in the stable's order, each with those stalls (`mine`).
  const { zones, offMap, mineSet } = useMemo(() => {
    const ids = new Set(horses.map(idOf));
    const withMine = groupZones(stalls)
      .map((z) => ({ ...z, mine: z.stalls.filter((s) => ids.has(idOf(s.occupant?.horse))) }))
      .filter((z) => z.mine.length);
    const onMap = new Set(withMine.flatMap((z) => z.mine.map((s) => idOf(s.occupant.horse))));
    return { zones: withMine, offMap: horses.filter((h) => !onMap.has(idOf(h))), mineSet: ids };
  }, [horses, stalls]);

  const stallOf = (id) => zones.flatMap((z) => z.mine).find((s) => idOf(s.occupant.horse) === id) || null;
  // Opens on the first horse of the first zone, so the page is never an empty prompt.
  const activeId = horseId || (zones[0] ? idOf(zones[0].mine[0].occupant.horse) : offMap[0] ? idOf(offMap[0]) : null);
  const horse = horses.find((h) => idOf(h) === activeId) || null;
  const stall = horse ? stallOf(activeId) : null;
  const zoneKey = stall ? stall.zone : horse ? OFF_MAP : null;
  const zone = zones.find((z) => z.key === zoneKey) || null;

  const pickZone = (key) => {
    const first = key === OFF_MAP ? offMap[0] : zones.find((z) => z.key === key)?.mine[0]?.occupant.horse;
    if (first) setHorse(idOf(first));
  };
  // A stall of someone else's horse, or an empty one, picks nothing.
  const pickStall = (code) => {
    const s = zone?.mine.find((it) => it.code === code);
    if (s) setHorse(idOf(s.occupant.horse));
  };

  const tabs = [
    ...zones.map((z) => ({ key: z.key, name: z.name, sub: `${z.mine.length} ngựa của bạn · ${z.stalls.length} chuồng` })),
    ...(offMap.length ? [{ key: OFF_MAP, name: 'Chưa có trên sơ đồ', sub: `${offMap.length} ngựa` }] : []),
  ];
  const placed = horses.filter((h) => byHorse.has(idOf(h))).length;
  const loading = (isLoading && !horses.length) || (mapLoading && !stalls.length);

  return (
    <OwnerPage>
      <PageHead
        eyebrow="Chủ sở hữu"
        title="Chuồng & chăm sóc"
        sub="Chọn khu, rồi chọn chuồng trên sơ đồ hoặc trong khu chuồng 3D để xem ngựa trong đó, người chăm sóc, việc chăm sóc hôm nay và khẩu phần ăn."
        stats={[
          { label: 'Đã xếp chuồng', value: `${placed}/${horses.length} con` },
          ...(zones.length ? [{ label: 'Đang ở', value: `${zones.length} khu` }] : []),
        ]}
      />

      {loading || mapFailed || !horse ? (
        <Card>
          <EmptyNote>
            {loading ? (
              'Đang tải sơ đồ chuồng…'
            ) : mapFailed ? (
              <>
                Chưa tải được sơ đồ chuồng.{' '}
                <button type="button" className="own-link-btn" onClick={() => refetch()}>
                  Thử lại
                </button>
              </>
            ) : (
              'Bạn chưa có chiến mã nào.'
            )}
          </EmptyNote>
        </Card>
      ) : (
        <Card title="Chuồng của ngựa bạn" icon={<HomeOutlined />}>
          <div className="own-step">
            <div className="own-step-label">
              <b>1</b> Chọn khu
            </div>
            <div className="own-zones" role="group" aria-label="Chọn khu">
              {tabs.map((t) => (
                <button key={t.key} type="button" aria-pressed={t.key === zoneKey} className={`own-zone${t.key === zoneKey ? ' is-active' : ''}`} onClick={() => pickZone(t.key)}>
                  <b>{t.name}</b>
                  <span>{t.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="own-step">
            <div className="own-step-label">
              <b>2</b> {zone ? 'Chọn chuồng · ngựa trong chuồng' : 'Chọn ngựa'}
            </div>
            {zone && stall ? (
              <div className="own-barn">
                <Stall3D stalls={zone.stalls} focusCode={stall.code} onSelect={pickStall} height="clamp(300px, 52vh, 500px)" />
                <aside className="own-barn-side">
                  <StableMap stalls={zone.stalls} zoneKey={zone.key} selectedCode={stall.code} onSelect={pickStall} canSelect={(s) => mineSet.has(idOf(s.occupant?.horse))} compact />
                  <InStall horse={horse} stall={stall} />
                </aside>
              </div>
            ) : (
              <OffMapList horses={offMap} byHorse={byHorse} activeId={activeId} onPick={setHorse} />
            )}
          </div>
        </Card>
      )}

      {horse && !loading && (
        <>
          <h2 className="own-section-title">Chăm sóc {horse.name}</h2>
          <StableDetail key={activeId} horse={horse} showStall={false} />
        </>
      )}
    </OwnerPage>
  );
}

/** The horse in the picked stall and the stall's facts, beside the map. */
function InStall({ horse, stall }) {
  return (
    <div className="own-stall-card">
      <div className="own-stall-horse">
        <HorseAvatar horse={horse} size={44} />
        <div className="min-w-0 flex-1">
          <div className="own-horse-name">{horse.name}</div>
          <div className="own-horse-meta">{horseFacts(horse) || 'Chiến mã của bạn'}</div>
        </div>
        <HealthPill status={horse.healthStatus} />
      </div>
      <Facts
        items={[
          ['Chuồng', <span className="own-num">{stall.code}</span>],
          ['Khu', `${stall.zoneName}${stall.zonePurpose ? ` · ${stall.zonePurpose}` : ''}`],
          stall.type && stall.type !== 'standard' && ['Loại', STALL_TYPE_LABELS[stall.type] || stall.type],
          ['Chăm sóc', stall.caretaker?.name || stall.occupant?.caretaker?.name || 'Chưa gán'],
          ['Vào chuồng', fmtDate(stall.occupant?.since)],
        ]}
      />
      <Link className="own-stall-link" to={`/horses/${idOf(horse)}`}>
        Hồ sơ {horse.name} <RightOutlined />
      </Link>
    </div>
  );
}

/** The owner's horses with no stall on the map: on a hand-written stall, or not placed yet. */
function OffMapList({ horses, byHorse, activeId, onPick }) {
  return (
    <>
      <ul className="own-list own-offmap">
        {horses.map((h) => {
          const s = byHorse.get(idOf(h));
          const active = idOf(h) === activeId;
          return (
            <li key={h._id}>
              <button type="button" aria-pressed={active} className={`own-row${active ? ' is-active' : ''}`} onClick={() => onPick(idOf(h))}>
                <HorseAvatar horse={h} size={36} />
                <div className="own-row-main">
                  <div className="own-row-title">{h.name}</div>
                  <div className="own-row-sub">{s?.handwritten ? `Chuồng ghi tay “${s.code}”, chưa có trên sơ đồ` : 'Chưa được xếp chuồng'}</div>
                </div>
                <div className="own-row-side">
                  <HealthPill status={h.healthStatus} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="own-faint mt-2 mb-0 text-xs">Quản lý CLB xếp ngựa vào chuồng trên sơ đồ; khi đó chuồng hiện trong khu của nó, có 3D.</p>
    </>
  );
}
