import { useQuery } from '@tanstack/react-query';
import axiosClient from '../../lib/axiosClient';

// The club's own rules (server: config/clubPolicy.js). These defaults are shown until the server
// answers, and match the server's own defaults.
export const DEFAULT_POLICY = {
  digestHardMinutes: 60,
  digestMinutes: 90,
  forageDigestMinutes: 60,
  maxFastHours: 6,
  precheckOpensBeforeMin: 60,
  precheckClosesAfterMin: 30,
  precheckValidHours: 2,
  feverC: 38.6,
  clearanceDays: 14,
  morningTime: '07:30',
  afternoonTime: '16:00',
  afternoonLightOnly: true,
  icingAfterMin: 15,
  bathingAfterMin: 45,
};

/** The club's training and care policy, so every screen words the rules the same way the server applies them. */
export function useClubPolicy() {
  const { data } = useQuery({
    queryKey: ['club-policy'],
    queryFn: () => axiosClient.get('/settings/policy'),
    staleTime: 10 * 60 * 1000,
  });
  return { ...DEFAULT_POLICY, ...(data?.data || {}) };
}

/** "Kiểm tra sẵn sàng từ 60 phút trước đến 30 phút sau giờ tập; kết quả có hiệu lực 2 giờ." */
export const precheckRuleText = (p) =>
  `Theo quy định CLB: kiểm tra sẵn sàng từ ${p.precheckOpensBeforeMin} phút trước đến ${p.precheckClosesAfterMin} phút sau giờ tập; kết quả có hiệu lực ${p.precheckValidHours} giờ.`;

const LIGHT_KINDS = ['walk', 'canter'];
/** Mirrors the server's slotKindProblem: heavy work booked in the afternoon, under the club's rule. */
export function afternoonProblem(policy, kind, when) {
  if (!policy.afternoonLightOnly || !kind || !when) return null;
  const hour = typeof when.hour === 'function' ? when.hour() : new Date(when).getHours();
  return hour >= 12 && !LIGHT_KINDS.includes(kind) ? 'Theo quy định CLB, buổi chiều chỉ tập nhẹ (đi bộ hoặc phi chậm) — xếp bài này vào buổi sáng.' : null;
}
