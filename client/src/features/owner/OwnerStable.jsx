import { Card, EmptyNote, HorsePicker, OwnerPage, PageHead } from './kit';
import StableDetail from './StableDetail';
import { idOf } from './ownerFormat';
import { stallText, useHorseParam, useMyHorses, useStallsByHorse } from './useOwnerData';

/** Where each of the owner's horses lives and how it is cared for today, one horse at a time. */
export default function OwnerStable() {
  const { horses, isLoading } = useMyHorses();
  const { byHorse } = useStallsByHorse();
  const [horseId, setHorse] = useHorseParam(horses);
  // Opens on the first horse, so the page is never an empty prompt.
  const active = horses.find((h) => idOf(h) === horseId) || horses[0];
  const placed = horses.filter((h) => byHorse.has(idOf(h))).length;

  return (
    <OwnerPage>
      <PageHead
        eyebrow="Chủ sở hữu"
        title="Chuồng & chăm sóc"
        sub="Chuồng của ngựa trong khu chuồng 3D, người chăm sóc, việc chăm sóc hôm nay và khẩu phần ăn."
        stats={[
          { label: 'Đã xếp chuồng', value: `${placed}/${horses.length} con` },
          ...(active && byHorse.get(idOf(active)) ? [{ label: active.name, value: stallText(byHorse.get(idOf(active))) }] : []),
        ]}
      />
      <HorsePicker horses={horses} value={active ? idOf(active) : null} onChange={setHorse} allLabel={null} />
      {active ? (
        <StableDetail key={idOf(active)} horse={active} />
      ) : (
        <Card>
          <EmptyNote>{isLoading ? 'Đang tải…' : 'Bạn chưa có chiến mã nào.'}</EmptyNote>
        </Card>
      )}
    </OwnerPage>
  );
}
