import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Tooltip } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from '../../features/horses/horsesApi';

/**
 * Quick status bar for the trainer's main work areas, showing how many horses need attention
 * in each area without forcing a rigid 1 -> 5 order.
 */
const STEPS = [
  { path: '/horses', match: ['/horses'], title: 'Nhận ngựa', wait: (items) => ['owner', 'trainer', 'vet', 'stall', 'health'].some((k) => items[k] === false), hint: 'ngựa chưa tiếp nhận xong (chuồng, người phụ trách hoặc khám — Quản lý / bác sĩ làm)' },
  { path: '/stable/tasks?tab=rations', match: ['/stable/tasks'], title: 'Khẩu phần', wait: (items) => items.rations === false, hint: 'ngựa chưa có khẩu phần ăn' },
  { path: '/races', match: ['/races'], title: 'Giải đua', wait: (items) => items.race === false, hint: 'ngựa chưa đăng ký giải (không bắt buộc)', optional: true },
  { path: '/training/plans', match: ['/training/plans'], title: 'Kế hoạch', wait: (items) => items.plan === false, hint: 'ngựa chưa có kế hoạch huấn luyện' },
  { path: '/training/sessions', match: ['/training/sessions'], title: 'Buổi tập & đánh giá', wait: (items) => items.schedule === false, hint: 'ngựa chưa có buổi tập trong 7 ngày tới' },
];

export default function TrainerFlowBar() {
  const { pathname } = useLocation();
  const { data } = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists() });
  const rows = (data?.data || []).map((r) => Object.fromEntries((r.items || []).map((i) => [i.key, i.done])));
  const activeRef = useRef(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  return (
    <nav aria-label="Điều hướng nhanh huấn luyện" className="st-flow-pipeline">
      {STEPS.map((step) => {
        const active = step.match.some((m) => pathname.startsWith(m));
        const waiting = data ? rows.filter((items) => step.wait(items)).length : 0;
        return (
          <Tooltip key={step.path} title={waiting ? `${waiting} ${step.hint}` : step.optional ? 'Không bắt buộc' : 'Không có ngựa nào chờ mục này'}>
            <Link
              to={step.path}
              ref={active ? activeRef : undefined}
              aria-current={active ? 'page' : undefined}
              className={`st-flow-step${active ? ' is-active' : ''}`}
            >
              <span>{step.title}</span>
              {waiting > 0 && (
                <span className={`st-flow-step__badge${step.optional ? ' is-optional' : ''}`}>
                  {waiting}
                </span>
              )}
            </Link>
          </Tooltip>
        );
      })}
    </nav>
  );
}
