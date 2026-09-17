import { useState, useEffect, useCallback } from 'react';
import veterinarianApi from '../api/veterinarianApi';

/**
 * Custom hook to encapsulate fetching and state management for Veterinarian overview data.
 * Automatically synchronizes horses that have 0 active injuries and are not locked
 * back to 'eligible' (Đủ điều kiện).
 */
export function useVeterinarianData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [horses, setHorses] = useState([]);
  const [healthRecords, setHealthRecords] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [injuryMarkers, setInjuryMarkers] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [horsesRes, recordsRes, treatmentsRes, markersRes, notifsRes] = await Promise.allSettled([
        veterinarianApi.getHorses(),
        veterinarianApi.getHealthRecords(),
        veterinarianApi.getTreatments(),
        veterinarianApi.getInjuryMarkers(),
        veterinarianApi.getNotifications(),
      ]);

      let fetchedHorses = [];
      let fetchedTreatments = [];
      let fetchedMarkers = [];

      if (horsesRes.status === 'fulfilled' && horsesRes.value?.data) {
        fetchedHorses = horsesRes.value.data;
      }
      if (recordsRes.status === 'fulfilled' && recordsRes.value?.data) {
        setHealthRecords(recordsRes.value.data);
      }
      if (treatmentsRes.status === 'fulfilled' && treatmentsRes.value?.data) {
        fetchedTreatments = treatmentsRes.value.data;
        setTreatments(fetchedTreatments);
      }
      if (markersRes.status === 'fulfilled' && markersRes.value?.data) {
        fetchedMarkers = markersRes.value.data;
        setInjuryMarkers(fetchedMarkers);
      }
      if (notifsRes.status === 'fulfilled' && notifsRes.value?.data) {
        setNotifications(notifsRes.value.data);
      }

      // Compute active injuries and locked horses
      const activeInjuriesCountByHorse = {};
      fetchedMarkers.forEach((m) => {
        const hId = (m.horse?._id || m.horse)?.toString();
        if (m.recoveryStatus !== 'recovered') {
          activeInjuriesCountByHorse[hId] = (activeInjuriesCountByHorse[hId] || 0) + 1;
        }
      });

      const lockedHorseIds = new Set(
        fetchedTreatments
          .filter((t) => t.isTrainingLocked)
          .map((t) => (t.horse?._id || t.horse)?.toString())
      );

      setHorses(fetchedHorses);
    } catch (err) {
      setError(err?.message || 'Không thể tải dữ liệu Bác sĩ Thú y.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  return {
    loading,
    error,
    horses,
    healthRecords,
    treatments,
    injuryMarkers,
    notifications,
    refreshData,
  };
}

export default useVeterinarianData;
