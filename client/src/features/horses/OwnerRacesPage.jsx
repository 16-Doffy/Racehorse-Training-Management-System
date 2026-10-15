import { useState } from 'react';
import { Table, Select, Empty } from 'antd';
import { TrophyOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { raceApi } from '../race/raceApi';
import { horsesApi } from './horsesApi';
import { formatVnd } from '../../constants/horse';
import dayjs from 'dayjs';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import { OwnerCard, Pill, StatStrip } from './ownerUi';

const STATUS_LABELS = {
  registered: 'Đã đăng ký',
  confirmed: 'Đã xác nhận',
  completed: 'Đã hoàn thành',
  withdrawn: 'Đã rút lui',
};

const STATUS_TONES = { registered: 'neutral', confirmed: 'info', completed: 'good', withdrawn: 'bad' };

export default function OwnerRacesPage() {
  const [selectedHorse, setSelectedHorse] = useState(null);

  const { data: racesData, isLoading: racesLoading } = useQuery({
    queryKey: ['races'],
    queryFn: () => raceApi.list(),
  });

  const { data: horsesData, isLoading: horsesLoading } = useQuery({
    queryKey: ['horses'],
    queryFn: () => horsesApi.list(),
  });

  const allRaces = racesData?.data || [];
  const myHorses = horsesData?.data || [];

  // Filter races to only include ones where the horse is owned by the user
  const myHorseIds = myHorses.map((h) => h._id);
  const myRaces = allRaces.filter((r) => myHorseIds.includes(r.horse?._id) || myHorseIds.includes(r.horse));

  // Apply selected horse filter if any
  const displayedRaces = selectedHorse
    ? myRaces.filter((r) => r.horse?._id === selectedHorse || r.horse === selectedHorse)
    : myRaces;

  // Stats calculation
  const totalRaces = displayedRaces.length;
  const upcomingRaces = displayedRaces.filter((r) => r.status === 'registered' || r.status === 'confirmed').length;
  const winCount = displayedRaces.filter((r) => r.status === 'completed' && r.position === 1).length;

  const columns = [
    {
      title: 'Giải đua',
      dataIndex: 'raceName',
      key: 'raceName',
      render: (name, r) => (
        <div className="min-w-0">
          <div className="font-semibold text-gray-900">{name}</div>
          <div className="text-xs text-gray-500">{r.horse?.name || '—'}</div>
        </div>
      ),
    },
    {
      title: 'Ngày thi đấu',
      dataIndex: 'raceDate',
      key: 'raceDate',
      render: (d) => <span className="text-gray-600 tabular-nums">{dayjs(d).format('DD/MM/YYYY')}</span>,
    },
    {
      title: 'Cự ly',
      dataIndex: 'distance',
      key: 'distance',
      render: (v) => (v ? <span className="text-gray-600 tabular-nums">{v} m</span> : <span className="text-gray-400">—</span>),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Pill tone={STATUS_TONES[s]}>{STATUS_LABELS[s] || s}</Pill>,
    },
    {
      title: 'Thứ hạng',
      dataIndex: 'position',
      key: 'position',
      render: (pos) => {
        if (!pos) return <span className="text-gray-400">—</span>;
        if (pos === 1) return <span className="font-semibold text-amber-600 inline-flex items-center gap-1"><TrophyOutlined /> Hạng 1</span>;
        return <span className="font-semibold text-gray-700">Hạng {pos}</span>;
      },
    },
    {
      title: 'Thời gian',
      dataIndex: 'finishTime',
      key: 'finishTime',
      align: 'right',
      render: (t) => (t ? <span className="text-gray-600 tabular-nums">{t} giây</span> : <span className="text-gray-400">—</span>),
    },
    {
      title: 'Tiền thưởng',
      dataIndex: 'prizeMoney',
      key: 'prizeMoney',
      align: 'right',
      render: (p) => (p ? <span className="font-semibold text-emerald-700 tabular-nums">{formatVnd(p)}</span> : <span className="text-gray-400">—</span>),
    },
  ];

  return (
    <div className="light-surface-box owner-ui text-gray-800 font-sans">
      <PageHeroBanner eyebrow="TEAM 8 • GIẢI ĐUA & THÀNH TÍCH" roleLabel="Horse Owner" title="Lịch Sử & Đăng Ký Giải Đua" subtitle="Theo dõi thành tích thi đấu, danh hiệu và các giải đua sắp tới của chiến mã." />

      <div className="flex items-center gap-3 mb-4">
        <span className="font-medium text-gray-500 text-sm">Chiến mã</span>
        <Select
          allowClear
          placeholder="Tất cả chiến mã"
          className="min-w-[220px]"
          value={selectedHorse}
          onChange={setSelectedHorse}
          options={myHorses.map((h) => ({ value: h._id, label: h.name }))}
          loading={horsesLoading}
        />
      </div>

      <StatStrip
        className="mb-4"
        items={[
          { label: 'Tổng số giải', value: totalRaces, hint: 'Đã và đang đăng ký' },
          { label: 'Sắp diễn ra', value: upcomingRaces, hint: 'Lịch thi đấu dự kiến' },
          { label: 'Chiến thắng', value: winCount, hint: 'Về nhất', tone: winCount ? 'good' : undefined },
        ]}
      />

      <OwnerCard title="Bảng vàng thành tích" flush>
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={displayedRaces}
          loading={racesLoading || horsesLoading}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có thông tin giải đua cho ngựa này" />,
          }}
        />
      </OwnerCard>
    </div>
  );
}
