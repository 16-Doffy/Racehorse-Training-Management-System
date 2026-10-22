/**
 * Actions more than one vet page offers, with the same question and the same feedback everywhere.
 * `confirm` comes from useConfirm(), `refresh` from useVetRefresh().
 */
import vetApi from '../../api/veterinarianApi';
import { message } from '../../lib/antdStatic';
import { LEVEL_META, errorText, recoveryMeta, shortBodyPart, treatmentLevel } from './vetFormat';

/**
 * Ends a treatment (an issued one is never edited: to change it, a new one replaces it). Ending one
 * that restricts training does not clear the horse: the vet is told so.
 */
export async function endTreatment(treatment, { confirm, refresh }) {
  const level = treatmentLevel(treatment);
  const horseName = treatment.horse?.name || 'ngựa';
  const ok = await confirm({
    title: `Kết thúc điều trị · ${horseName}`,
    body: `${
      level === 'high'
        ? 'Các liều chưa cho hôm nay sẽ được bỏ khỏi việc của nhân viên chăm sóc.'
        : `Kết thúc điều trị chưa cho ngựa tập lại: ngựa giữ mức "${LEVEL_META[level].label.toLowerCase()}" tới khi bạn đánh giá cho tập lại (Đổi mức tập). Các liều chưa cho hôm nay sẽ được bỏ.`
    } Chấn thương đang điều trị chuyển sang “Đang hồi phục”. Đơn đã kết thúc không mở lại được — chỉ muốn đổi thuốc thì dùng “Kê đơn mới thay đơn này”.`,
    confirmLabel: 'Kết thúc điều trị',
  });
  if (!ok) return false;
  try {
    await vetApi.updateTreatment(treatment._id, { status: 'completed' });
    message.success(`Đã kết thúc điều trị cho ${horseName}.`);
    await refresh?.();
    return true;
  } catch (err) {
    message.error(errorText(err, 'Không kết thúc được điều trị.'));
    return false;
  }
}

/** Moves an injury to another recovery stage; the server updates the horse's health status. */
export async function setInjuryStage(marker, stage, { refresh }) {
  try {
    await vetApi.updateInjuryMarker(marker._id, { recoveryStatus: stage });
    message.success(`${shortBodyPart(marker.bodyPart)}: ${recoveryMeta(stage).label.toLowerCase()}.`);
    await refresh?.();
  } catch (err) {
    message.error(errorText(err, 'Không cập nhật được chấn thương.'));
  }
}
