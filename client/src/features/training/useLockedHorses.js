import { useQuery } from '@tanstack/react-query';
import { treatmentApi } from '../health/healthApi';

/**
 * Set of horse ids currently under an active Vet training lock. Used to warn/disable in the
 * Head Trainer's own plan/session creation forms *before* they hit the 409 the backend already
 * enforces — the API rejection was already there, this just surfaces it proactively in the UI
 * instead of only after a failed submit.
 */
export function useLockedHorseIds() {
  const { data } = useQuery({
    queryKey: ['treatments', 'locked'],
    queryFn: () => treatmentApi.list({ isTrainingLocked: true, status: 'ongoing' }),
  });

  const treatments = data?.data || [];
  return new Set(treatments.map((t) => t.horse?._id || t.horse));
}
