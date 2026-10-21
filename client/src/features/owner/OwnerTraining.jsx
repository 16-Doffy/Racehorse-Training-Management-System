import { HorsePicker, OwnerPage, PageHead } from './kit';
import TrainingDetail from './TrainingDetail';
import { useHorseParam, useMyHorses } from './useOwnerData';

/** The training of the owner's horses, all together or one at a time; the trainer's reviews are a tab here. */
export default function OwnerTraining() {
  const { horses } = useMyHorses();
  const [horseId, setHorse] = useHorseParam(horses);
  return (
    <OwnerPage>
      <PageHead eyebrow="Chủ sở hữu" title="Huấn luyện" sub="Lịch tập, kết quả từng buổi, kế hoạch của HLV và nhận xét sau mỗi buổi." />
      <HorsePicker horses={horses} value={horseId} onChange={setHorse} />
      <TrainingDetail key={horseId || 'all'} horses={horses} horseId={horseId} />
    </OwnerPage>
  );
}
