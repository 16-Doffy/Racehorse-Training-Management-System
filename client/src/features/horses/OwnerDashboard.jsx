import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Typography, Progress, Table, Select, Button, Tag, Dropdown } from 'antd';
import {
  SettingOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CalendarOutlined,
  EditOutlined,
  MoreOutlined
} from '@ant-design/icons';
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';

import { horsesApi } from '../../features/horses/horsesApi';
import { trainingSessionApi } from '../../features/training/trainingApi';
import { financeApi } from '../../features/finance/financeApi';

const { Text } = Typography;

// Mock data for the chart
const chartData = [
  { name: 'Oct', value: 45 },
  { name: 'Nov', value: 55 },
  { name: 'Dec', value: 40 },
  { name: 'Jan', value: 65 },
  { name: 'Feb', value: 50 },
  { name: 'Mar', value: 75 },
  { name: 'Apr', value: 60 },
  { name: 'May', value: 85 },
  { name: 'Jun', value: 90 },
  { name: 'Jul', value: 65 },
  { name: 'Aug', value: 55 },
  { name: 'Sep', value: 80 },
];

// Custom Health Bar Component matching the image (vertical bars)
const HealthBars = ({ percent }) => {
  const totalBars = 12;
  const activeBars = Math.round((percent / 100) * totalBars);
  
  return (
    <div className="flex gap-[2px] h-4">
      {Array.from({ length: totalBars }).map((_, i) => (
        <div 
          key={i} 
          className={`w-1.5 rounded-sm ${i < activeBars ? 'bg-emerald-500' : 'bg-gray-200'}`}
        />
      ))}
    </div>
  );
};

// Barcode Progress Component for Goals
const BarcodeProgress = ({ current, target }) => {
  const totalTicks = 40;
  const activeTicks = Math.round((current / target) * totalTicks);
  
  return (
    <div className="flex gap-[2px] h-8 w-full">
      {Array.from({ length: totalTicks }).map((_, i) => (
        <div 
          key={i} 
          className={`flex-1 rounded-sm ${i < activeTicks ? 'bg-gray-400' : 'bg-gray-200'}`}
        />
      ))}
    </div>
  );
};

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const { data: horsesData } = useQuery({
    queryKey: ['horses'],
    queryFn: () => horsesApi.list(),
  });
  const horses = horsesData?.data || [];

  const { data: sessionsData } = useQuery({
    queryKey: ['training-sessions'],
    queryFn: () => trainingSessionApi.list(),
  });
  const allSessions = sessionsData?.data || [];

  const { data: financeData } = useQuery({
    queryKey: ['finance', 'mine'],
    queryFn: () => financeApi.listMine(),
  });
  const financeRecords = financeData?.data || [];

  // Computed Stats
  const totalValue = financeRecords.filter(r => r.type === 'revenue').reduce((s, r) => s + r.amount, 0) || 2845000000;
  const eligibleHorses = horses.filter(h => h.healthStatus === 'eligible').length;
  const eligibleRate = horses.length > 0 ? (eligibleHorses / horses.length) * 100 : 28.4;
  
  const upcomingSessions = allSessions.filter(s => ['scheduled', 'ready', 'blocked', 'in_progress'].includes(s.status));

  // Top Card Component
  const StatCard = ({ title, value, change, isPositive, prevText }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <span className="text-gray-500 text-sm font-medium">{title}</span>
        <ArrowUpOutlined className="text-gray-400 rotate-45 text-xs" />
      </div>
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 font-medium ${isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {isPositive ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          {change}
        </span>
      </div>
      <span className="text-xs text-gray-400 font-medium">{prevText}</span>
    </div>
  );

  // Table Columns
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      render: (text) => <span className="text-gray-500 font-medium">OP-{text}</span>,
    },
    {
      title: 'Tên Chiến Mã',
      dataIndex: 'name',
      key: 'name',
      render: (text) => <span className="font-semibold text-gray-800">{text}</span>,
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'stage',
      key: 'stage',
      render: (stage) => (
        <span className="border border-gray-200 text-gray-600 bg-gray-50 text-xs px-3 py-1 rounded-full font-medium">
          {stage}
        </span>
      ),
    },
    {
      title: 'Mức Ưu Tiên',
      dataIndex: 'priority',
      key: 'priority',
      render: (p) => <span className="text-gray-500">{p}</span>,
    },
    {
      title: 'Sức Khỏe',
      dataIndex: 'health',
      key: 'health',
      render: (health) => <HealthBars percent={health} />,
    },
    {
      title: 'Định Giá',
      dataIndex: 'value',
      key: 'value',
      render: (val) => <span className="font-semibold text-gray-800">{val}</span>,
    },
    {
      title: 'Sửa',
      key: 'edit',
      align: 'right',
      render: (_, record) => (
        <Button 
          type="text" 
          icon={<EditOutlined className="text-gray-400" />} 
          onClick={() => navigate(`/horses/${record.key}`)}
          className="hover:bg-gray-50 rounded-lg"
        />
      ),
    }
  ];

  const tableData = horses.map((h, i) => ({
    key: h._id || i,
    id: (h._id || '104' + i).substring(0, 4).toUpperCase(),
    name: h.name,
    stage: h.healthStatus === 'eligible' ? 'Sẵn sàng thi đấu' : h.healthStatus === 'monitoring' ? 'Theo dõi y tế' : h.healthStatus === 'injured' ? 'Chấn thương' : 'Cách ly',
    priority: 1,
    health: h.healthStatus === 'eligible' ? 95 : 60,
    value: `${(400000000 + (Math.random() * 200000000)).toLocaleString('vi-VN', {maximumFractionDigits:0})} đ`
  }));

  if (tableData.length === 0) {
    // Fill with mock if no data to match the screenshot look
    for (let i = 0; i < 8; i++) {
      tableData.push({
        key: i,
        id: `184${i}`,
        name: ['Asterion Bioworks', 'Bluehaven Systems', 'Cinder Health', 'Drift Manufacturing'][i % 4],
        stage: ['Sẵn sàng thi đấu', 'Theo dõi y tế', 'Chấn thương', 'Cách ly'][i % 4],
        priority: 1,
        health: 40 + (i * 10),
        value: `${(200000000 + (i * 50000000)).toLocaleString('vi-VN')} đ`
      });
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-gray-800 p-4 md:px-8 md:pb-8 md:pt-4 font-sans">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 m-0 mb-1 tracking-tight">Tổng quan Hoạt động</h1>
        <p className="text-sm text-gray-500 m-0">
          Theo dõi chất lượng huấn luyện, cơ hội thi đấu và tỷ lệ thành công qua các chu kỳ.
        </p>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard 
          title="Tổng Giá trị Tài sản" 
          value={`${totalValue.toLocaleString('vi-VN')} đ`} 
          change="+12%" 
          isPositive={true} 
          prevText="2.542.000.000 đ tháng trước" 
        />
        <StatCard 
          title="Tỷ lệ Sẵn sàng Đua" 
          value={`${eligibleRate.toFixed(1)}%`} 
          change="-2.5%" 
          isPositive={false} 
          prevText="30.9% tháng trước" 
        />
        <StatCard 
          title="Phiên tập Đang chờ" 
          value={upcomingSessions.length || 42} 
          change="+7" 
          isPositive={true} 
          prevText="35 tháng trước" 
        />
        <StatCard 
          title="Tỷ lệ Chiến thắng" 
          value="18.1%" 
          change="+1.0%" 
          isPositive={true} 
          prevText="15.5% tháng trước" 
        />
      </div>

      {/* Main Chart Section */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-base font-semibold text-gray-900 m-0">Lưu lượng Huấn luyện Định kỳ</h2>
          <Select 
            defaultValue="12months" 
            options={[
              { value: '12months', label: '12 tháng gần nhất' },
              { value: '6months', label: '6 tháng gần nhất' },
              { value: '30days', label: '30 ngày qua' },
              { value: 'this_year', label: 'Năm nay' }
            ]} 
            className="w-40"
            size="small"
          />
        </div>
        
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 h-64">
          {/* Chart */}
          <div className="flex-1 h-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={32}>
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#9ca3af', dy: 10 }} 
                />
                <Tooltip 
                  cursor={{fill: '#f3f4f6'}}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar 
                  dataKey="value" 
                  fill="#e5e7eb" 
                  radius={[4, 4, 4, 4]} 
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          {/* Chart Summary */}
          <div className="w-full lg:w-72 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-gray-100 pt-6 lg:pt-0 lg:pl-8">
            <div className="mb-6">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-bold text-gray-900">523</span>
                <span className="text-gray-500 font-medium text-sm">lượt tập</span>
              </div>
              <p className="text-xs text-gray-400 m-0 leading-relaxed">Tổng số lượt tập luyện được ghi nhận trong 12 tháng qua.</p>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-2">Đạt chuẩn thể lực</div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xl font-bold text-gray-900">184</span>
                <span className="text-gray-500 font-medium text-xs">lần sẵn sàng</span>
              </div>
              <p className="text-xs text-gray-400 m-0 mb-3">35% số lượt tập luyện đạt chỉ tiêu thi đấu</p>
              
              <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden mb-1">
                <div className="h-full bg-gray-400 w-[35%] rounded-full"></div>
              </div>
              <div className="flex justify-between text-[10px] font-medium text-gray-400">
                <span>184 sẵn sàng</span>
                <span>523 tổng cộng</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2 Middle Cards: Meetings & Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        
        {/* Timeline (Upcoming Meetings) */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-semibold text-gray-900 m-0">Lịch trình Sắp tới</h2>
            <Button size="small" icon={<CalendarOutlined />} className="text-xs font-medium text-gray-600 border-gray-200">
              Xem Lịch
            </Button>
          </div>
          
          <div className="relative pt-2">
            {/* Time markers */}
            <div className="flex justify-between text-xs text-gray-500 font-medium mb-2 relative z-10">
              <span>08:45</span>
              <span>09:00</span>
              <span>10:00</span>
              <span>10:20</span>
            </div>
            
            {/* Horizontal Timeline Track */}
            <div className="relative h-1 bg-gray-100 rounded-full mb-4">
              {/* Event Bar spanning from 09:00 to 10:20 (approx 33% to 100%) */}
              <div className="absolute left-[33%] right-0 top-0 bottom-0 bg-emerald-500 rounded-full"></div>
            </div>
            
            {/* Timeline Event Details */}
            <div className="relative w-full">
              <div className="ml-[33%] pl-2 border-l-2 border-emerald-100">
                <div className="text-gray-900 text-sm font-semibold mb-0.5">Đánh giá với HLV Trưởng</div>
                <div className="text-gray-500 text-xs flex items-center gap-1">
                  <span>🐎</span> Trường đua trung tâm
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Goals Progress */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-gray-900 m-0 mb-4">Mục tiêu Giải đấu Tháng</h2>
          
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl font-bold text-gray-900">12</span>
            <span className="text-gray-500 font-medium text-sm">lượt đăng ký</span>
            <span className="text-xs text-gray-400 font-medium ml-auto">18 chỉ tiêu</span>
          </div>
          
          <BarcodeProgress current={12} target={18} />
          
          <p className="text-xs text-gray-500 font-medium mt-3">67% chỉ tiêu đăng ký giải tháng này đã hoàn thành.</p>
        </div>
      </div>

      {/* Bottom Table Section */}
      <div className="bg-white border border-gray-200 rounded-xl p-0 overflow-hidden mb-6">
        <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900 m-0 mb-1">Cơ hội Đăng ký thi đấu</h2>
            <p className="text-xs text-gray-400 m-0">Theo dõi các chiến mã đủ điều kiện đang trong giai đoạn huấn luyện, hồi phục và xét duyệt.</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <input 
              type="text" 
              placeholder="Tìm kiếm..." 
              className="border border-gray-200 rounded px-3 py-1 text-sm outline-none focus:border-gray-400 min-w-[200px]"
            />
            <Select 
              size="middle" 
              defaultValue="all" 
              options={[
                {value:'all', label:'Tất cả giai đoạn'},
                {value:'ready', label:'Sẵn sàng thi đấu'},
                {value:'training', label:'Đang huấn luyện'},
                {value:'recovery', label:'Đang hồi phục'}
              ]} 
              className="min-w-[120px]" 
            />
            <Select 
              size="middle" 
              defaultValue="all" 
              options={[
                {value:'all', label:'Tất cả sức khỏe'},
                {value:'excellent', label:'Rất tốt'},
                {value:'good', label:'Tốt'},
                {value:'needs_attention', label:'Cần theo dõi'},
                {value:'injured', label:'Chấn thương'}
              ]} 
              className="min-w-[120px]" 
            />
          </div>
        </div>
        
        <Table 
          columns={columns} 
          dataSource={tableData} 
          pagination={{ pageSize: 10, position: ['bottomRight'] }}
          className="custom-table"
          rowSelection={{
            type: 'checkbox',
          }}
        />
      </div>
      
    </div>
  );
}
