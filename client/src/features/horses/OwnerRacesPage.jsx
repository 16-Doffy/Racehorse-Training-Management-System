import { useState } from 'react';
import { Table, Typography, Tag, Select, Empty, Statistic, Row, Col, Card } from 'antd';
import { TrophyOutlined, StarOutlined, FlagOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { raceApi } from '../race/raceApi';
import { horsesApi } from './horsesApi';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const STATUS_LABELS = {
  registered: 'Đã đăng ký',
  confirmed: 'Đã xác nhận tham gia',
  completed: 'Đã thi đấu xong',
  withdrawn: 'Đã rút lui',
};

const STATUS_COLORS = { 
  registered: 'default', 
  confirmed: 'blue', 
  completed: 'green', 
  withdrawn: 'red' 
};

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
  const completedRaces = displayedRaces.filter(r => r.status === 'completed').length;
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
      render: (name) => <span className="font-semibold text-[#022c22]">{name || '—'}</span>,
    },
    { 
      title: 'Tên giải đua', 
      dataIndex: 'raceName', 
      key: 'raceName',
      render: (name) => <span className="font-medium text-gray-800">{name}</span>
    },
    {
      title: 'Ngày thi đấu',
      dataIndex: 'raceDate',
      key: 'raceDate',
      render: (d) => <span className="text-gray-600">{dayjs(d).format('DD/MM/YYYY')}</span>,
    },
    { 
      title: 'Cự ly', 
      dataIndex: 'distance', 
      key: 'distance', 
      render: (v) => v ? <Tag>{v}m</Tag> : '—' 
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={STATUS_COLORS[s]} className="rounded-full px-3">{STATUS_LABELS[s] || s}</Tag>,
    },
    {
      title: 'Kết quả chung cuộc',
      dataIndex: 'result',
      key: 'result',
      render: (v) => {
        if (!v) return <span className="text-gray-400 italic">Chưa có kết quả</span>;
        
        const isWin = v.toLowerCase().includes('nhất') || v.includes('1') || v.toLowerCase().includes('win');
        if (isWin) {
          return <span className="font-bold text-yellow-600"><TrophyOutlined className="mr-1" /> {v}</span>;
        }
        return <span className="font-semibold text-gray-700">{v}</span>;
      },
    },
  ];

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
        <div>
          <Title level={3} className="!font-semibold !mb-2 !text-[#022c22]" style={{ fontFamily: 'Georgia, serif' }}>
            <TrophyOutlined className="mr-2 text-yellow-500" />
            Lịch sử & Đăng ký Giải đua
          </Title>
          <Text className="block text-gray-500">
            Theo dõi thành tích thi đấu và các giải đua sắp tới của ngựa bạn sở hữu.
          </Text>
        </div>
        
        <div className="bg-white p-2 rounded-lg shadow-sm border flex items-center">
          <span className="text-sm text-gray-500 mr-2 ml-1">Lọc theo ngựa:</span>
          <Select
            allowClear
            placeholder="Tất cả ngựa"
            style={{ width: 200 }}
            value={selectedHorse}
            onChange={setSelectedHorse}
            options={myHorses.map(h => ({ value: h._id, label: h.name }))}
            loading={horsesLoading}
          />
        </div>
      </div>

      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24} sm={8} lg={6}>
          <div className="premium-card p-4 flex items-center gap-4 border-l-4 border-l-blue-500">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-2xl">
              <AppstoreOutlined />
            </div>
            <div>
              <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Tổng Giải Đua</div>
              <div className="text-2xl font-bold text-[#022c22]">{totalRaces}</div>
            </div>
          </div>
        </Col>
        <Col xs={24} sm={8} lg={6}>
          <div className="premium-card p-4 flex items-center gap-4 border-l-4 border-l-yellow-500">
            <div className="w-12 h-12 rounded-full bg-yellow-50 text-yellow-500 flex items-center justify-center text-2xl">
              <StarOutlined />
            </div>
            <div>
              <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Chiến Thắng (Ước tính)</div>
              <div className="text-2xl font-bold text-[#022c22]">{winCount}</div>
            </div>
          </div>
        </Col>
        <Col xs={24} sm={8} lg={6}>
          <div className="premium-card p-4 flex items-center gap-4 border-l-4 border-l-green-500">
            <div className="w-12 h-12 rounded-full bg-green-50 text-green-500 flex items-center justify-center text-2xl">
              <FlagOutlined />
            </div>
            <div>
              <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Sắp Diễn Ra</div>
              <div className="text-2xl font-bold text-[#022c22]">{upcomingRaces}</div>
            </div>
          </div>
        </Col>
      </Row>

      <div className="premium-card p-1">
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={displayedRaces}
          loading={racesLoading || horsesLoading}
          pagination={{ pageSize: 10 }}
          locale={{ 
            emptyText: <Empty description="Chưa có thông tin giải đua cho ngựa này." />
          }}
          className="border-0"
        />
      </div>
    </div>
  );
}
