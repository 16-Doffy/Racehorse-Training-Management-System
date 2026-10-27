import { Fragment, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { theme, Tooltip } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from '../../features/horses/horsesApi';

/**
 * The trainer's work in the order it is done, one step per menu tab: take the horse on, feed it, set
 * its race, plan the cycle, run and evaluate the sessions. The page the trainer is on is lit; each
 * step counts the horses still waiting for it (GET /horses/checklist, the same checklist as the
 * horse list's "Bước tiếp theo"). Sits in the top bar, so it adds no height to the page.
 */
// Dark text on a light accent (the gold of the dark canvas), white on a dark one (the light canvas's green).
const inkOn = (color) => {
  const text = String(color || '').trim();
  let rgb = null;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (hex) {
    const h = hex[1].length <= 4 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else {
    const m = /rgba?\(([^)]+)\)/i.exec(text);
    if (m) rgb = m[1].split(/[\s,/]+/).slice(0, 3).map(Number);
  }
  if (!rgb || rgb.some((n) => Number.isNaN(n))) return '#fff';
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return lum > 0.55 ? '#061812' : '#fff';
};

const STEPS = [
  { path: '/horses', match: ['/horses'], title: 'Nhận ngựa', wait: (items) => ['owner', 'trainer', 'vet', 'stall', 'health'].some((k) => items[k] === false), hint: 'ngựa chưa tiếp nhận xong (chuồng, người phụ trách hoặc khám — Quản lý / bác sĩ làm)' },
  { path: '/stable/tasks?tab=rations', match: ['/stable/tasks'], title: 'Khẩu phần', wait: (items) => items.rations === false, hint: 'ngựa chưa có khẩu phần ăn' },
  { path: '/races', match: ['/races'], title: 'Giải đua', wait: (items) => items.race === false, hint: 'ngựa chưa đăng ký giải (không bắt buộc)', optional: true },
  { path: '/training/plans', match: ['/training/plans'], title: 'Kế hoạch', wait: (items) => items.plan === false, hint: 'ngựa chưa có kế hoạch huấn luyện' },
  { path: '/training/sessions', match: ['/training/sessions'], title: 'Buổi tập & đánh giá', wait: (items) => items.schedule === false, hint: 'ngựa chưa có buổi tập trong 7 ngày tới' },
];

export default function TrainerFlowBar() {
  const { token } = theme.useToken();
  const { pathname } = useLocation();
  const { data } = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists() });
  const rows = (data?.data || []).map((r) => Object.fromEntries((r.items || []).map((i) => [i.key, i.done])));
  const ink = inkOn(token.colorPrimary);
  // On a phone the bar scrolls sideways: the step of this page is brought into view.
  const activeRef = useRef(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  return (
    <nav aria-label="Quy trình huấn luyện" className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto py-0.5">
      <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide" style={{ color: token.colorTextSecondary }}>
        Quy trình
      </span>
      {STEPS.map((step, i) => {
        const active = step.match.some((m) => pathname.startsWith(m));
        const waiting = data ? rows.filter((items) => step.wait(items)).length : 0;
        return (
          <Fragment key={step.path}>
            {i > 0 && <RightOutlined className="shrink-0 !text-[9px]" style={{ color: token.colorTextQuaternary }} />}
            <Tooltip title={waiting ? `${waiting} ${step.hint}` : step.optional ? 'Không bắt buộc' : 'Không có ngựa nào chờ bước này'}>
              <Link
                to={step.path}
                ref={active ? activeRef : undefined}
                aria-current={active ? 'step' : undefined}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
                style={active ? { background: token.colorPrimary, color: ink } : { color: token.colorText, background: token.colorFillTertiary }}
              >
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
                  style={active ? { background: ink, color: token.colorPrimary } : { background: token.colorPrimaryBg, color: token.colorPrimary }}
                >
                  {i + 1}
                </span>
                {/* Its own colour: the dark canvas recolours every link's text, which a gold step cannot carry. */}
                <span style={{ color: active ? ink : token.colorText }}>{step.title}</span>
                {waiting > 0 && (
                  <span
                    className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
                    style={step.optional ? { background: token.colorFillSecondary, color: token.colorTextSecondary } : { background: token.colorWarningBg, color: token.colorWarningText }}
                  >
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
