import { HorsePicker, OwnerPage, PageHead } from './kit';
import RaceDetail from './RaceDetail';
import { useHorseParam, useMyHorses } from './useOwnerData';

/** The races of the owner's horses: what is coming with the trainer's decision, and the results. */
export default function OwnerRaces() {
  const { horses } = useMyHorses();
  const [horseId, setHorse] = useHorseParam(horses);
  return (
    <OwnerPage>
      <PageHead eyebrow="Chủ sở hữu" title="Giải đua" sub="Các giải sắp tới cùng quyết định của HLV, kết quả và tiền thưởng của từng chiến mã." />
      <HorsePicker horses={horses} value={horseId} onChange={setHorse} />
      <RaceDetail horses={horses} horseId={horseId} />
    </OwnerPage>
  );
}
