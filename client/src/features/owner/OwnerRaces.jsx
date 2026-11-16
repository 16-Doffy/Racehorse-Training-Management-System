import { OwnerPage, PageHead } from './kit';
import RaceDetail from './RaceDetail';
import { useMyHorses } from './useOwnerData';

/** The races of the owner's horses, race first: pick a race to see which of their horses run it and how. */
export default function OwnerRaces() {
  const { horses } = useMyHorses();
  return (
    <OwnerPage>
      <PageHead eyebrow="Chủ sở hữu" title="Giải đua" sub="Các giải ngựa của bạn tham gia: chọn một giải để xem ngựa nào thi đấu, quyết định của HLV và kết quả." />
      <RaceDetail horses={horses} />
    </OwnerPage>
  );
}
