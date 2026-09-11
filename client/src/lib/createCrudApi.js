import axiosClient from './axiosClient';

/** Mirrors the shape of server/src/utils/crudFactory.js so scaffold modules stay one-liners. */
export function createCrudApi(basePath) {
  return {
    list: (params) => axiosClient.get(basePath, { params }),
    getOne: (id) => axiosClient.get(`${basePath}/${id}`),
    create: (payload) => axiosClient.post(basePath, payload),
    update: (id, payload) => axiosClient.put(`${basePath}/${id}`, payload),
    remove: (id) => axiosClient.delete(`${basePath}/${id}`),
  };
}
