import { useState } from 'react';
import { Typography, Row, Col, Tag, Table, Empty, Descriptions, Timeline } from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from './horsesApi';
import { healthRecordApi, treatmentApi, injuryMarkerApi } from '../health/healthApi';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TRAINING_LEVEL_META } from '../../constants/health';
import dayjs from 'dayjs';

const STATUS_CONFIG = {
  eligible: { color: 'green', icon: <CheckCircleOutlined />, label: '🟢 Sẵn sàng thi đấu' },
  monitoring: { color: 'gold', icon: <ExclamationCircleOutlined />, label: '🟡 Đang theo dõi' },
  injured: { color: 'red', icon: <CloseCircleOutlined />, label: '🔴 Chấn thương' },
  quarantined: { color: 'volcano', icon: <StopOutlined />, label: '⚫ Cách ly' },
};

export default function OwnerHealthPage() {
  const [selectedHorse, setSelectedHorse] = useState(null);

  const { data: horsesData, isLoading: horsesLoading } = useQuery({
    queryKey: ['horses'],
    queryFn: () => horsesApi.list(),
  });
  const horses = horsesData?.data || [];

  const { data: healthData } = useQuery({
    queryKey: ['health-records'],
    queryFn: () => healthRecordApi.list(),
  });
  const allRecords = healthData?.data || [];

  const { data: treatmentsData } = useQuery({
    queryKey: ['treatments'],
    queryFn: () => treatmentApi.list(),
  });
  const allTreatments = treatmentsData?.data || [];

  const { data: injuriesData } = useQuery({
    queryKey: ['injuries'],
    queryFn: () => injuryMarkerApi.list(),
  });
  const allInjuries = injuriesData?.data || [];

  // Count by status
  const statusCounts = horses.reduce(
    (acc, h) => {
      acc[h.healthStatus] = (acc[h.healthStatus] || 0) + 1;
      return acc;
    },
    { eligible: 0, monitoring: 0, injured: 0, quarantined: 0 }
  );

  // Filter health records for selected horse
  const horseRecords = selectedHorse
    ? allRecords
        .filter((r) => r.horse?._id === selectedHorse || r.horse === selectedHorse)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
    : [];

  const horseTreatments = selectedHorse
    ? allTreatments
        .filter((t) => t.horse?._id === selectedHorse || t.horse === selectedHorse)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    : [];

  const horseInjuries = selectedHorse
    ? allInjuries
        .filter((i) => i.horse?._id === selectedHorse || i.horse === selectedHorse)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    : [];

  // Vital signs chart data
  const vitalChartData = horseRecords
    .filter((r) => r.vitalSigns?.heartRate || r.vitalSigns?.temperatureC)
    .slice(0, 20)
    .reverse()
    .map((r) => ({
      date: dayjs(r.date).format('DD/MM'),
      'Nhịp tim (bpm)': r.vitalSigns?.heartRate || null,
      'Nhiệt độ (°C)': r.vitalSigns?.temperatureC || null,
      'Nhịp thở': r.vitalSigns?.respiratoryRate || null,
    }));

  const selectedHorseObj = horses.find((h) => h._id === selectedHorse);
  const latestRecord = horseRecords[0];

  const columns = [
    {
      title: 'Tên ngựa',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <a onClick={() => setSelectedHorse(record._id)} className="font-semibold text-gray-800">
          {name}
        </a>
      ),
    },
    { 
      title: 'Giống', 
      dataIndex: 'breed', 
      key: 'breed',
      render: (b) => <span className="text-gray-600">{b}</span>
    },
    {
      title: 'Trạng thái',
      dataIndex: 'healthStatus',
      key: 'healthStatus',
      render: (status) => {
        const cfg = STATUS_CONFIG[status] || {};
        return (
          <span className={`border border-gray-200 bg-gray-50 text-xs px-3 py-1 rounded-full font-medium ${
            status === 'eligible' ? 'text-emerald-600' : 
            status === 'monitoring' ? 'text-yellow-600' :
            status === 'injured' ? 'text-red-600' : 'text-gray-600'
          }`}>
            {cfg.label || status}
          </span>
        );
      },
    },
    {
      title: 'Cân nặng',
      dataIndex: 'weightKg',
      key: 'weightKg',
      render: (w) => <span className="text-gray-500 font-medium">{w ? `${w} kg` : '—'}</span>,
    },
  ];

  const treatmentColumns = [
    { title: 'Ngày tạo', dataIndex: 'createdAt', key: 'createdAt', render: (d) => <span className="text-gray-500">{dayjs(d).format('DD/MM/YYYY')}</span> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (st) => (
      <span className={`text-xs px-2 py-0.5 rounded font-medium ${st === 'ongoing' ? 'bg-blue-50 text-blue-600 border border-blue-200' : st === 'completed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-gray-100 text-gray-500'}`}>
        {st === 'ongoing' ? 'Đang điều trị' : st === 'completed' ? 'Hoàn thành' : 'Đã hủy'}
      </span>
    )},
    { title: 'Khóa tập', dataIndex: 'isTrainingLocked', key: 'locked', render: (locked, record) => (
      locked ? <span className="text-xs text-red-600 font-medium"><StopOutlined /> Khóa ({record.lockReason})</span> : <span className="text-xs text-emerald-600 font-medium">Bình thường</span>
    )},
    { title: 'Thuốc / Ghi chú', key: 'meds', render: (_, record) => {
      const meds = record.medications?.length > 0 
        ? record.medications.map(m => `${m.name} (${m.dosage})`).join(', ') 
        : 'Không kê thuốc';
      return <span className="text-gray-600 text-sm">{meds}</span>;
    }}
  ];

  const injuryColumns = [
    { title: 'Ngày bị', dataIndex: 'createdAt', key: 'createdAt', render: (d) => <span className="text-gray-500">{dayjs(d).format('DD/MM/YYYY')}</span> },
    { title: 'Vị trí', dataIndex: 'bodyPart', key: 'bodyPart', render: (val) => <span className="font-semibold text-gray-800">{val}</span> },
    { title: 'Mức độ', dataIndex: 'severity', key: 'severity', render: (sev) => {
      const colors = { minor: 'bg-blue-50 text-blue-600 border-blue-200', moderate: 'bg-yellow-50 text-yellow-600 border-yellow-200', severe: 'bg-red-50 text-red-600 border-red-200', critical: 'bg-purple-50 text-purple-600 border-purple-200' };
      const labels = { minor: 'Nhẹ', moderate: 'Vừa', severe: 'Nghiêm trọng', critical: 'Nguy kịch' };
      return <span className={`text-xs px-2 py-0.5 rounded border font-medium ${colors[sev] || 'bg-gray-100'}`}>{labels[sev] || sev}</span>;
    }},
    { title: 'Hồi phục', dataIndex: 'recoveryStatus', key: 'recoveryStatus', render: (rec) => {
      const colors = { newly_reported: 'bg-red-50 text-red-600 border-red-200', treating: 'bg-blue-50 text-blue-600 border-blue-200', recovering: 'bg-yellow-50 text-yellow-600 border-yellow-200', recovered: 'bg-emerald-50 text-emerald-600 border-emerald-200' };
      const labels = { newly_reported: 'Mới bị', treating: 'Đang điều trị', recovering: 'Đang hồi phục', recovered: 'Đã khỏi' };
      return <span className={`text-xs px-2 py-0.5 rounded border font-medium ${colors[rec] || 'bg-gray-100'}`}>{labels[rec] || rec}</span>;
    }},
    { title: 'Ghi chú', dataIndex: 'notes', key: 'notes', render: (n) => <span className="text-gray-500 text-sm">{n}</span> }
  ];

  const StatCard = ({ title, value, tagText, tagClass, subtitle }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <span className="text-gray-500 text-sm font-medium">{title}</span>
      </div>
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-3xl font-bold text-gray-900">{value}</span>
        {tagText && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${tagClass}`}>
            {tagText}
          </span>
        )}
      </div>
      <span className="text-xs text-gray-400 font-medium">{subtitle}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-gray-800 p-4 md:px-8 md:pb-8 md:pt-4 font-sans">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 m-0 mb-1 tracking-tight">Giám sát Y tế & Sức khỏe</h1>
        <p className="text-sm text-gray-500 m-0">
          Theo dõi thể trạng, lịch sử điều trị và chỉ số sinh tồn của toàn bộ danh mục chiến mã.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard 
          title="Sẵn sàng thi đấu" 
          value={statusCounts.eligible}
          tagText="Tốt"
          tagClass="bg-emerald-100 text-emerald-700"
          subtitle={`${horses.length > 0 ? Math.round(statusCounts.eligible/horses.length*100) : 0}% tổng số`}
        />
        <StatCard 
          title="Đang theo dõi" 
          value={statusCounts.monitoring}
          tagText="Cần lưu ý"
          tagClass="bg-yellow-100 text-yellow-700"
          subtitle="Giám sát cường độ"
        />
        <StatCard 
          title="Chấn thương" 
          value={statusCounts.injured}
          tagText="Đang điều trị"
          tagClass="bg-red-100 text-red-700"
          subtitle="Khóa tập luyện"
        />
        <StatCard 
          title="Đang cách ly" 
          value={statusCounts.quarantined}
          tagText="Nghiêm ngặt"
          tagClass="bg-orange-100 text-orange-700"
          subtitle="Phòng ngừa"
        />
      </div>

      {/* Horse List Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 m-0">Danh sách Ngựa</h2>
        </div>
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={horses}
          loading={horsesLoading}
          pagination={false}
          className="custom-table"
          rowClassName={(record) => record._id === selectedHorse ? 'bg-blue-50 cursor-pointer' : 'cursor-pointer hover:bg-gray-50 transition-colors'}
          onRow={(record) => ({ onClick: () => setSelectedHorse(record._id) })}
        />
      </div>

      {/* Detail Panel */}
      {selectedHorseObj && (
        <div className="animate-fade-in flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900 m-0">
              Chi tiết: {selectedHorseObj.name}
            </h2>
            <span className={`text-xs px-2 py-1 rounded-full font-medium border ${STATUS_CONFIG[selectedHorseObj.healthStatus]?.color === 'green' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-gray-100 border-gray-200'}`}>
              {STATUS_CONFIG[selectedHorseObj.healthStatus]?.label}
            </span>
            <Tag color={TRAINING_LEVEL_META[selectedHorseObj.trainingClearance?.level || 'high']?.color} className="!m-0">
              {TRAINING_LEVEL_META[selectedHorseObj.trainingClearance?.level || 'high']?.label}
            </Tag>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Latest Vital Signs */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 text-base mb-4">Chỉ số sinh tồn gần nhất</h3>
              {latestRecord ? (
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Ngày khám:</span><span className="font-medium text-gray-900">{dayjs(latestRecord.date).format('DD/MM/YYYY HH:mm')}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Nhịp tim:</span><span className="font-medium text-gray-900">{latestRecord.vitalSigns?.heartRate || '—'} bpm</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Nhiệt độ:</span><span className="font-medium text-gray-900">{latestRecord.vitalSigns?.temperatureC || '—'} °C</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Nhịp thở:</span><span className="font-medium text-gray-900">{latestRecord.vitalSigns?.respiratoryRate || '—'} lần/p</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Chẩn đoán:</span><span className="font-medium text-gray-900 text-right">{latestRecord.diagnosis}</span></div>
                </div>
              ) : (
                <Empty description="Chưa có hồ sơ khám bệnh" />
              )}
            </div>

            {/* Care Schedule */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 text-base mb-4">Lịch chăm sóc y tế định kỳ</h3>
              {selectedHorseObj.careSchedule ? (
                 <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center text-sm border-b border-gray-100 pb-2">
                    <span className="text-gray-500 flex items-center gap-2">💉 Tiêm phòng tiếp theo</span>
                    <span className="font-medium text-gray-900">{selectedHorseObj.careSchedule.nextVaccinationDue ? dayjs(selectedHorseObj.careSchedule.nextVaccinationDue).format('DD/MM/YYYY') : 'Chưa lên lịch'}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-b border-gray-100 pb-2">
                    <span className="text-gray-500 flex items-center gap-2">💊 Tẩy giun tiếp theo</span>
                    <span className="font-medium text-gray-900">{selectedHorseObj.careSchedule.nextDewormingDue ? dayjs(selectedHorseObj.careSchedule.nextDewormingDue).format('DD/MM/YYYY') : 'Chưa lên lịch'}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm pb-2">
                    <span className="text-gray-500 flex items-center gap-2">🔧 Đóng móng tiếp theo</span>
                    <span className="font-medium text-gray-900">{selectedHorseObj.careSchedule.nextFarrierDue ? dayjs(selectedHorseObj.careSchedule.nextFarrierDue).format('DD/MM/YYYY') : 'Chưa lên lịch'}</span>
                  </div>
                 </div>
              ) : (
                <Empty description="Chưa có lịch chăm sóc" />
              )}
            </div>
          </div>

          {/* Treatment & Injury Tables */}
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-gray-100"><h3 className="font-semibold text-gray-900 m-0">Phác đồ điều trị & Y lệnh</h3></div>
              <Table 
                columns={treatmentColumns} 
                dataSource={horseTreatments} 
                rowKey="_id" 
                pagination={{ pageSize: 5 }} 
                size="middle"
                className="custom-table"
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có phác đồ điều trị" /> }}
              />
            </div>
            
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-gray-100"><h3 className="font-semibold text-gray-900 m-0">Hồ sơ chấn thương</h3></div>
              <Table 
                columns={injuryColumns} 
                dataSource={horseInjuries} 
                rowKey="_id" 
                pagination={{ pageSize: 5 }} 
                size="middle"
                className="custom-table"
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có chấn thương" /> }}
              />
            </div>
          </div>

          {/* Vital Signs Chart */}
          {vitalChartData.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="font-semibold text-gray-900 m-0 mb-6">Biểu đồ Chỉ số Sinh tồn (20 lần khám gần nhất)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={vitalChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Line yAxisId="left" type="monotone" dataKey="Nhịp tim (bpm)" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />
                  <Line yAxisId="right" type="monotone" dataKey="Nhiệt độ (°C)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />
                  <Line yAxisId="left" type="monotone" dataKey="Nhịp thở" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {!selectedHorseObj && !horsesLoading && (
        <div className="mt-6 flex justify-center items-center py-12 text-gray-400 border border-dashed border-gray-300 rounded-xl bg-gray-50">
          Vui lòng chọn một chiến mã từ bảng trên để xem hồ sơ bệnh án
        </div>
      )}
    </div>
  );
}
