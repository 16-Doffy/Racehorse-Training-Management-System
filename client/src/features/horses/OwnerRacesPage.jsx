import { useState } from 'react';
import { Table, Select, Empty } from 'antd';
import { TrophyOutlined, StarOutlined, FlagOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { raceApi } from '../race/raceApi';
import { horsesApi } from './horsesApi';
import dayjs from 'dayjs';

const STATUS_LABELS = {
  registered: 'Đã đăng ký',
  confirmed: 'Đã xác nhận',
  completed: 'Đã hoàn thành',
  withdrawn: 'Đã rút lui',
};

const STATUS_COLORS = { 
  registered: 'bg-gray-100 text-gray-600 border-gray-200', 
  confirmed: 'bg-blue-50 text-blue-600 border-blue-200', 
  completed: 'bg-emerald-50 text-emerald-600 border-emerald-200', 
  withdrawn: 'bg-red-50 text-red-600 border-red-200' 
};

const StatCard = ({ title, value, subtitle, icon, iconColorClass }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
    <div className="flex justify-between items-center mb-4">
      <span className="text-gray-500 text-sm font-medium">{title}</span>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${iconColorClass}`}>
        {icon}
      </div>
    </div>
    <div className="flex items-baseline gap-3 mb-1">
      <span className="text-3xl font-bold text-gray-900">{value}</span>
    </div>
    <span className="text-xs text-gray-400 font-medium">{subtitle}</span>
  </div>
);

export default function OwnerRacesPage() {
  const [selectedHorse, setSelectedHorse] = useState(null);

  const { data: racesData, isLoading: racesLoading } = useQuery({ 
    queryKey: ['races'], 
    queryFn: () => raceApi.list() 
  });
  
  const { data: horsesData, isLoading: horsesLoading } = useQuery({ 
    queryKey: ['horses'], 
    queryFn: () => horsesApi.list() 
  });

  const allRaces = racesData?.data || [];
  const myHorses = horsesData?.data || [];

  // Filter races to only include ones where the horse is owned by the user
  const myHorseIds = myHorses.map(h => h._id);
  const myRaces = allRaces.filter(r => myHorseIds.includes(r.horse?._id) || myHorseIds.includes(r.horse));

  // Apply selected horse filter if any
  const displayedRaces = selectedHorse
    ? myRaces.filter(r => r.horse?._id === selectedHorse || r.horse === selectedHorse)
    : myRaces;

  // Stats calculation
  const totalRaces = displayedRaces.length;
  const upcomingRaces = displayedRaces.filter(r => r.status === 'registered' || r.status === 'confirmed').length;
  
  // Very naive "win" detection: checks if result text contains "1", "nhất", "win"
  const winCount = displayedRaces.filter(r => 
    r.status === 'completed' && 
    r.result && 
    (r.result.toLowerCase().includes('nhất') || r.result.includes('1') || r.result.toLowerCase().includes('win'))
  ).length;

  const columns = [
    {
      title: 'Chiến mã',
      dataIndex: ['horse', 'name'],
      key: 'horse',
      render: (name) => <span className="font-semibold text-gray-900">{name || '—'}</span>,
    },
    { 
      title: 'Tên giải đua', 
      dataIndex: 'raceName', 
      key: 'raceName',
      render: (name) => <span className="font-medium text-gray-700">{name}</span>
    },
    {
      title: 'Ngày thi đấu',
      dataIndex: 'raceDate',
      key: 'raceDate',
      render: (d) => <span className="text-gray-500 font-medium">{dayjs(d).format('DD/MM/YYYY')}</span>,
    },
    { 
      title: 'Cự ly', 
      dataIndex: 'distance', 
      key: 'distance', 
      render: (v) => v ? <span className="text-gray-600 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded text-xs font-medium">{v}m</span> : <span className="text-gray-400">—</span> 
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <span className={`text-xs px-2 py-0.5 rounded border font-medium ${STATUS_COLORS[s] || 'bg-gray-100 text-gray-600'}`}>{STATUS_LABELS[s] || s}</span>,
    },
    {
      title: 'Kết quả chung cuộc',
      dataIndex: 'result',
      key: 'result',
      render: (v) => {
        if (!v) return <span className="text-gray-400 font-medium">—</span>;
        
        const isWin = v.toLowerCase().includes('nhất') || v.includes('1') || v.toLowerCase().includes('win');
        if (isWin) {
          return <span className="font-bold text-yellow-600 flex items-center gap-1"><TrophyOutlined /> {v}</span>;
        }
        return <span className="font-semibold text-gray-700">{v}</span>;
      },
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-gray-800 p-4 md:px-8 md:pb-8 md:pt-4 font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 m-0 mb-1 tracking-tight">Lịch sử & Đăng ký Giải đua</h1>
        <p className="text-sm text-gray-500 m-0">
          Theo dõi thành tích thi đấu, danh hiệu và các giải đua sắp tới của chiến mã.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <span className="font-medium text-gray-500 text-sm">Tra cứu thành tích:</span>
          <Select
            allowClear
            placeholder="Tất cả chiến mã"
            className="min-w-[200px]"
            size="middle"
            value={selectedHorse}
            onChange={setSelectedHorse}
            options={myHorses.map(h => ({ value: h._id, label: h.name }))}
            loading={horsesLoading}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard 
          title="Tổng Số Giải" 
          value={totalRaces}
          subtitle="Đã và đang đăng ký"
          icon={<AppstoreOutlined />}
          iconColorClass="bg-blue-100 text-blue-600"
        />
        <StatCard 
          title="Sắp Diễn Ra" 
          value={upcomingRaces}
          subtitle="Lịch thi đấu dự kiến"
          icon={<FlagOutlined />}
          iconColorClass="bg-emerald-100 text-emerald-600"
        />
        <StatCard 
          title="Chiến Thắng" 
          value={winCount}
          subtitle="Vô địch giải (Ước tính)"
          icon={<StarOutlined />}
          iconColorClass="bg-yellow-100 text-yellow-600"
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 m-0">Bảng vàng Thành tích</h2>
        </div>
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={displayedRaces}
          loading={racesLoading || horsesLoading}
          pagination={{ pageSize: 10, position: ['bottomRight'] }}
          className="custom-table"
          locale={{ 
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có thông tin giải đua cho ngựa này" />
          }}
        />
      </div>
    </div>
  );
}
