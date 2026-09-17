import { useQuery } from '@tanstack/react-query';
import { treatmentApi } from '../health/healthApi';
import { horsesApi } from '../horses/horsesApi';

/**
 * Set of horse ids currently under an active Vet training lock or in injured/quarantined status.
 * Used to warn/disable in the Head Trainer's own plan/session creation forms before submitting.
 */
export function useLockedHorseIds() {
  const { data: treatmentsData } = useQuery({
    queryKey: ['treatments', 'locked'],
    queryFn: () => treatmentApi.list({ isTrainingLocked: true }),
  });
  const { data: horsesData } = useQuery({
    queryKey: ['horses'],
    queryFn: () => horsesApi.list(),
  });

  const lockedSet = new Set();

  (treatmentsData?.data || []).forEach((t) => {
    if (t.isTrainingLocked && t.status === 'ongoing') {
      const hId = (t.horse?._id || t.horse)?.toString();
      if (hId) lockedSet.add(hId);
    }
  });

  (horsesData?.data || []).forEach((h) => {
    if (h.healthStatus === 'injured' || h.healthStatus === 'quarantined') {
      const hId = h._id?.toString();
      if (hId) lockedSet.add(hId);
    }
  });

  return lockedSet;
}
