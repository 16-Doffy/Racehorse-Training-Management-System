import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Tabs } from 'antd';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  DashboardOutlined,
  HeartOutlined,
  HistoryOutlined,
  HomeOutlined,
  IdcardOutlined,
  LineChartOutlined,
  PlayCircleOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import MovingHorse3D from '../horses/horse3d/MovingHorse3D';
import { liveMotion, restingMotion } from '../horses/horse3d/horseMotion';
import { breedLabel, coatLabel } from '../horses/horse3d/horseBreeds';
import HorseTimeline from '../horses/HorseTimeline';
import { HORSE_SEX_LABELS } from '../../constants/horse';
import { Card, ClearancePill, Facts, HealthPill, OwnerPage, PageHead, Pill, Tiles } from './kit';
import { AgendaList, CareSchedule } from './lists';
import HealthDetail from './HealthDetail';
import TrainingDetail from './TrainingDetail';
import RaceDetail from './RaceDetail';
import StableDetail from './StableDetail';
import { capFirst, clearanceOf, fmtDate, fmtDateTime, horseFacts, idOf, money, placeText } from './ownerFormat';
import { agendaItems } from './ownerInsights';
import { stallText, useHorse, useOwnerSummary, useRaces, useSessions, useStallsByHorse, useTabParam } from './useOwnerData';

const TABS = ['overview', 'health', 'training', 'races', 'stall', 'journal'];

const ageText = (dob) => {
  if (!dob) return null;
  const years = dayjs().diff(dob, 'year');
  const months = dayjs().diff(dob, 'month') % 12;
  return years ? `${years} tuổi${months ? ` ${months} tháng` : ''}` : `${months} tháng tuổi`;
};

/**
 * One of the owner's horses: the horse in 3D beside its name, status and key figures, then a tab for
 * each part of its life at the club (the tab is kept in the URL, so a link can open it).
 */
export default function OwnerHorse() {
  const { id } = useParams();
  const { horse, isLoading, isError, refetch } = useHorse(id);
  const { rows } = useOwnerSummary();
  const { byHorse } = useStallsByHorse();
  const { sessions } = useSessions();
  const { races } = useRaces();
  const [tab, setTab] = useTabParam(TABS);

  const row = rows.find((r) => idOf(r.horse) === id);
  const stall = byHorse.get(id);
  // A session running now: the horse moves as its last reading says; otherwise as the vet's word lets it.
  const running = sessions.find((s) => idOf(s.horse) === id && s.status === 'in_progress');
  const agenda = useMemo(() => agendaItems({ sessions, races, horseIds: new Set([id]), limit: 5 }), [sessions, races, id]);

  if (isLoading) {
    return (
      <OwnerPage>
        <PageHead back={{ to: '/horses', label: 'Ngựa của tôi' }} title="Đang tải hồ sơ…" />
      </OwnerPage>
    );
  }
  if (!horse) {
    return (
      <OwnerPage>
        <PageHead
          back={{ to: '/horses', label: 'Ngựa của tôi' }}
          title="Không mở được hồ sơ ngựa"
          sub={isError ? 'Ngựa không thuộc quyền sở hữu của bạn, hoặc kết nối đang gián đoạn.' : 'Không tìm thấy con ngựa này.'}
          actions={isError && <Button onClick={() => refetch()}>Thử lại</Button>}
        />
      </OwnerPage>
    );
  }

  const examined = row ? Boolean(row.health.lastExam) : true;
  // A horse no vet has examined yet is not called fit: it grazes, but the caption says it has no exam.
  const resting = restingMotion(horse);
  const live = running && liveMotion(running, running.metrics?.lastSpeed);
  const motion = live ? { ...live, label: `Đang tập · ${live.label}` } : examined || resting.tone ? resting : { ...resting, label: 'Chưa có hồ sơ khám · thư giãn gặm cỏ' };
  const clearance = clearanceOf(horse);
  const stats = row?.raceStats;

  const tiles = [
    horse.valuationVnd != null && { label: 'Định giá', value: money(horse.valuationVnd), sub: horse.valuationUpdatedAt ? `Cập nhật ${fmtDate(horse.valuationUpdatedAt)}` : null },
    { label: 'Cân nặng', value: horse.weightKg ? `${horse.weightKg} kg` : '—', sub: ageText(horse.dob) },
    { label: 'Thành tích', value: stats?.completed ? `${stats.wins} thắng / ${stats.completed} giải` : 'Chưa thi đấu', sub: stats?.prize ? `Thưởng ${money(stats.prize)}` : null },
    row && {
      label: `Thu / chi năm ${row.money.year}`,
      value: `${row.money.revenue < row.money.cost ? '−' : ''}${money(Math.abs(row.money.revenue - row.money.cost))}`,
      sub: `Thu ${money(row.money.revenue)} · chi ${money(row.money.cost)}`,
    },
  ].filter(Boolean);

  const overview = (
    <div className="own-grid-main">
      <div className="flex flex-col gap-4 min-w-0">
        <Card title="Tình hình hiện tại" icon={<DashboardOutlined />}>
          <Facts
            items={[
              ['Sức khỏe', row?.health.lastExam ? `Khám gần nhất ${fmtDate(row.health.lastExam.date)} — ${row.health.lastExam.diagnosis}` : 'Chưa được bác sĩ khám'],
              ['Mức tập', `${capFirst(clearance.label)}${clearance.reason ? ` — ${clearance.reason}` : ''}`],
              ['Buổi tập tiếp theo', row?.next ? `${row.next.kind} · ${fmtDateTime(row.next.at)}` : 'Chưa xếp'],
              [
                'Buổi tập gần nhất',
                row?.last
                  ? `${row.last.kind} · ${fmtDateTime(row.last.at)} · ${row.last.status === 'aborted' ? 'dừng giữa chừng' : row.last.met === true ? 'đạt chỉ tiêu' : row.last.met === false ? 'chưa đạt' : 'đã xong'}${row.last.rating ? ` · ${row.last.rating}/10` : ''}`
                  : 'Chưa có',
              ],
              ['Giải đua', row?.upcomingRace ? `${row.upcomingRace.name} · ${fmtDate(row.upcomingRace.date)}` : row?.lastRace ? `Gần nhất: ${row.lastRace.name} — ${row.lastRace.result || placeText(row.lastRace.position)}` : 'Chưa đăng ký giải'],
            ]}
          />
          {row?.last?.comment && (
            <div className="own-quote mt-3">
              <span className="own-faint text-xs block mb-0.5">HLV nhận xét buổi gần nhất</span>
              {row.last.comment}
            </div>
          )}
          {row?.last?.videoUrl && (
            <a href={row.last.videoUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold inline-flex items-center gap-1 mt-2">
              <PlayCircleOutlined /> Xem video buổi tập
            </a>
          )}
        </Card>
        <Card title="Sắp tới" icon={<CalendarOutlined />} flush>
          <AgendaList items={agenda} horsesById={new Map()} showHorse={false} />
        </Card>
      </div>
      <div className="flex flex-col gap-4 min-w-0">
        <Card title="Hồ sơ" icon={<IdcardOutlined />}>
          {/* Only what the Manager filled in: the papers are optional on the horse form. */}
          <Facts
            items={[
              ['Giống', breedLabel(horse.breed) || '—'],
              horse.color && ['Màu lông', coatLabel(horse.color)],
              HORSE_SEX_LABELS[horse.sex] && ['Giới tính', HORSE_SEX_LABELS[horse.sex]],
              horse.dob && ['Ngày sinh', `${fmtDate(horse.dob)} (${ageText(horse.dob)})`],
              horse.microchipNumber && ['Số vi mạch', horse.microchipNumber],
              horse.registrationNumber && ['Số đăng ký', horse.registrationNumber],
            ]}
          />
        </Card>
        <Card title="Người phụ trách" icon={<TeamOutlined />} extra={<button type="button" className="own-link-btn" onClick={() => setTab('stall')}>Xem chuồng</button>}>
          <Facts
            items={[
              ['HLV', horse.assignedTrainer?.name || 'Chưa phân công'],
              ['Bác sĩ thú y', horse.assignedVet?.name || 'Chưa phân công'],
              ['Chăm sóc', stall?.caretaker || 'Chưa có'],
              ['Chuồng', stallText(stall) || 'Chưa xếp chuồng'],
            ]}
          />
        </Card>
        <Card title="Chăm sóc định kỳ" icon={<CalendarOutlined />} flush>
          <CareSchedule horse={horse} />
        </Card>
      </div>
    </div>
  );

  return (
    <OwnerPage>
      <section className="own-card own-hero">
        <div className="own-hero-visual">
          {/* No photo on file: the horse in 3D, in the breed and coat the Manager set, doing what its health allows (or its workout). */}
          {horse.photoUrl ? (
            <img src={horse.photoUrl} alt={horse.name} />
          ) : (
            <MovingHorse3D
              breed={horse.breed}
              color={horse.color}
              motion={motion}
              // At rest it is out in the long grass of the pasture; in a session, on the track.
              surface={running ? 'dirt' : 'pasture'}
              height={300}
              compact
            />
          )}
        </div>
        <div className="own-hero-body">
          <Link className="own-back" to="/horses">
            <ArrowLeftOutlined /> Ngựa của tôi
          </Link>
          <div>
            <div className="own-eyebrow">Hồ sơ chiến mã</div>
            <h1 className="own-title">{horse.name}</h1>
            <div className="own-muted mt-1">{[horseFacts(horse), horse.color && coatLabel(horse.color)].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="own-hero-pills">
            <HealthPill status={horse.healthStatus} examined={examined} />
            <ClearancePill horse={horse} />
            {stall && (
              <Pill dot={false}>
                <HomeOutlined /> {stallText(stall)}
              </Pill>
            )}
          </div>
          {clearance.restricted && (
            <div className={`own-note${clearance.level === 'none' ? ' is-bad' : ''}`}>
              {capFirst(clearance.label)}
              {clearance.reason ? ` — ${clearance.reason}` : ''}. Hết hạn chế khi bác sĩ nâng mức hoặc kết thúc điều trị.
            </div>
          )}
          <Tiles items={tiles} />
        </div>
      </section>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'overview', label: <span><DashboardOutlined /> Tổng quan</span>, children: overview },
          { key: 'health', label: <span><HeartOutlined /> Sức khỏe</span>, children: <HealthDetail horse={horse} examined={examined} /> },
          { key: 'training', label: <span><LineChartOutlined /> Huấn luyện</span>, children: <TrainingDetail horses={[horse]} horseId={id} /> },
          { key: 'races', label: <span><TrophyOutlined /> Giải đua</span>, children: <RaceDetail horses={[horse]} horseId={id} /> },
          { key: 'stall', label: <span><HomeOutlined /> Chuồng & chăm sóc</span>, children: <StableDetail horse={horse} /> },
          // The same record every role sees; the API lets an owner read their own horse.
          { key: 'journal', label: <span><HistoryOutlined /> Nhật ký</span>, children: <HorseTimeline horseId={id} /> },
        ]}
      />
    </OwnerPage>
  );
}
