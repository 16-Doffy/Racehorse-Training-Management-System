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
  getExamRequests: (params) => axiosClient.get('/health/exam-requests', { params }),
  updateExamRequest: (id, payload) => axiosClient.patch(`/health/exam-requests/${id}`, payload),
  getClearances: () => axiosClient.get('/health/clearances'),

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
  deleteInjuryMarker: (id) => axiosClient.delete(`/health/injury-markers/${id}`),

  // Inventory & Restock Request
  getInventory: (params) => axiosClient.get('/inventory', { params }),
  requestRestock: (id, quantity) => axiosClient.post(`/inventory/${id}/restock-request`, { quantity }),

  // Realtime / Role Notifications
  getNotifications: (params) => axiosClient.get('/notifications', { params }),

  // Attachments for Health Records
  uploadRecordAttachments: (recordId, formData) =>
    axiosClient.post(`/health/records/${recordId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteRecordAttachment: (recordId, attachmentId) =>
    axiosClient.delete(`/health/records/${recordId}/attachments/${attachmentId}`),

  // Stable Incident Reports
  getIncidents: (params) => axiosClient.get('/stable/incidents', { params }),
  handleIncident: (taskId, payload) => axiosClient.patch(`/stable/incidents/${taskId}`, payload),

  // Inventory New Item Proposal
  proposeItem: (payload) => axiosClient.post('/inventory/proposals', payload),
};

export default veterinarianApi;
