import axios from '../../lib/axiosClient';
export const groomWebApi = {
  tasks: (params) => axios.get('/stable/tasks', { params }),
  care: () => axios.get('/stable/my-care-plan'),
  incidents: () => axios.get('/stable/incidents'),
  supplies: () => axios.get('/inventory'),
  acknowledge: (id) => axios.patch(`/stable/tasks/${id}/acknowledge`, {}),
  complete: (id, body) => axios.patch(`/stable/tasks/${id}/complete`, body),
  notDone: (id, body) => axios.patch(`/stable/tasks/${id}/not-done`, body),
  incident: (id, body) => axios.post(`/stable/tasks/${id}/incident`, body),
  restock: (id, body) => axios.post(`/inventory/${id}/restock-request`, body),
  propose: (body) => axios.post('/inventory/proposals', body),
};
