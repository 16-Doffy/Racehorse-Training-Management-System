import { Fragment, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Tooltip } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from '../../features/horses/horsesApi';

/**
 * The trainer's work in the order it is done, one step per menu tab (1 -> 5):
 * 1. Nhận ngựa -> 2. Khẩu phần -> 3. Giải đua -> 4. Kế hoạch -> 5. Buổi tập & đánh giá.
 * Designed as an executive command pipeline in the top bar.
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
  // On a phone the bar scrolls sideways: the step of this page is brought into view.
  const activeRef = useRef(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  return (
    <nav aria-label="Quy trình huấn luyện" className="st-flow-pipeline">
      <span className="st-flow-label">
        Quy trình 1→5
      </span>
      {STEPS.map((step, i) => {
        const active = step.match.some((m) => pathname.startsWith(m));
        const waiting = data ? rows.filter((items) => step.wait(items)).length : 0;
        return (
          <Fragment key={step.path}>
            {i > 0 && <RightOutlined className="shrink-0 !text-[9px]" style={{ color: 'var(--st-ink-muted)' }} />}
            <Tooltip title={waiting ? `${waiting} ${step.hint}` : step.optional ? 'Không bắt buộc' : 'Không có ngựa nào chờ bước này'}>
              <Link
                to={step.path}
                ref={active ? activeRef : undefined}
                aria-current={active ? 'step' : undefined}
                className={`st-flow-step${active ? ' is-active' : ''}`}
              >
                <span className="st-flow-step__num">
                  {i + 1}
                </span>
                <span>{step.title}</span>
                {waiting > 0 && (
                  <span className={`st-flow-step__badge${step.optional ? ' is-optional' : ''}`}>
                    {waiting}
                  </span>
                )}
              </Link>
            </Tooltip>
          </Fragment>
        );
      })}
    </nav>
  );
}
