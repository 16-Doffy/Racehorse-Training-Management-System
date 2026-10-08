import { taskApi } from '../api/endpoints';

/** The incident form is built at send time from plain data, so it can wait in storage until then. */
export function buildIncidentForm({ description, severity, photos = [] }) {
  const formData = new FormData();
  formData.append('description', description);
  formData.append('severity', severity);
  photos.forEach((photo, index) => {
    formData.append('images', {
      uri: photo.uri,
      name: photo.fileName || `incident-${index}.jpg`,
      type: photo.mimeType || 'image/jpeg',
    });
  });
  return formData;
}

const taskIs = (status) => async ({ taskId }) => (await taskApi.getOne(taskId)).data?.status === status;

/**
 * What the outbox knows how to send. `alreadyDone` answers "did an earlier try get through?" when
 * the server now says no to a repeat.
 */
export const handlers = {
  complete: {
    send: ({ taskId, payload }, config) => taskApi.complete(taskId, payload, config),
    alreadyDone: taskIs('completed'),
  },
  notDone: {
    send: ({ taskId, reason }, config) => taskApi.reportNotDone(taskId, reason, config),
    alreadyDone: taskIs('skipped'),
  },
  acknowledge: {
    send: ({ taskId }, config) => taskApi.acknowledge(taskId, config),
    alreadyDone: async ({ taskId }) => !!(await taskApi.getOne(taskId)).data?.acknowledgedAt,
  },
  incident: {
    send: ({ taskId, ...form }, config) => taskApi.reportIncident(taskId, buildIncidentForm(form), config),
  },
};
