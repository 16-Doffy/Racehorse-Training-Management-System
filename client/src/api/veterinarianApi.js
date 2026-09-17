import axiosClient from './axiosClient';

export const veterinarianApi = {
  // Horses
  getHorses: (params) => axiosClient.get('/horses', { params }),
  getHorseById: (id) => axiosClient.get(`/horses/${id}`),
  updateCareSchedule: (id, payload) => axiosClient.patch(`/horses/${id}/care-schedule`, payload),

  // Health Records (Medical Examinations & Diagnoses)
  getHealthRecords: (params) => axiosClient.get('/health/records', { params }),
  getHealthRecordById: (id) => axiosClient.get(`/health/records/${id}`),
  createHealthRecord: (payload) => axiosClient.post('/health/records', payload),
  updateHealthRecord: (id, payload) => axiosClient.put(`/health/records/${id}`, payload),

  // Treatment Plans & Prescriptions
  getTreatments: (params) => axiosClient.get('/health/treatments', { params }),
  getTreatmentById: (id) => axiosClient.get(`/health/treatments/${id}`),
  createTreatment: (payload) => axiosClient.post('/health/treatments', payload),
  updateTreatment: (id, payload) => axiosClient.put(`/health/treatments/${id}`, payload),

  // Emergency Training Lock
  setTrainingLock: (treatmentId, payload) =>
    axiosClient.post(`/health/treatments/${treatmentId}/lock-training`, payload),

  // Injury Markers & Injury Management
  getInjuryMarkers: (params) => axiosClient.get('/health/injury-markers', { params }),
  createInjuryMarker: (payload) => axiosClient.post('/health/injury-markers', payload),
  updateInjuryMarker: (id, payload) => axiosClient.put(`/health/injury-markers/${id}`, payload),

  // Realtime / Role Notifications
  getNotifications: (params) => axiosClient.get('/notifications', { params }),
  markNotificationAsRead: (id) => axiosClient.patch(`/notifications/${id}/read`),
  markAllNotificationsAsRead: () => axiosClient.patch('/notifications/read-all'),
};

export default veterinarianApi;
