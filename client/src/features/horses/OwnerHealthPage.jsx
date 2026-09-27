import { useState } from 'react';
import { Typography, Card, Row, Col, Tag, Table, Select, Statistic, Empty, Descriptions, Timeline } from 'antd';
import {
  HeartOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from './horsesApi';
import { healthRecordApi, treatmentApi, injuryMarkerApi } from '../health/healthApi';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const STATUS_CONFIG = {
  eligible: { color: 'green', icon: <CheckCircleOutlined />, label: '🟢 Sẵn sàng thi đấu', bg: '#f6ffed', border: '#b7eb8f' },
  monitoring: { color: 'gold', icon: <ExclamationCircleOutlined />, label: '🟡 Đang theo dõi', bg: '#fffbe6', border: '#ffe58f' },
  injured: { color: 'red', icon: <CloseCircleOutlined />, label: '🔴 Chấn thương', bg: '#fff2f0', border: '#ffccc7' },
  quarantined: { color: 'volcano', icon: <StopOutlined />, label: '⚫ Cách ly', bg: '#fff7e6', border: '#ffd591' },
};

export default function OwnerHealthPage() {
  const [selectedHorse, setSelectedHorse] = useState(null);

  const { data: horsesData, isLoading: horsesLoading } = useQuery({
    queryKey: ['horses'],
    queryFn: () => horsesApi.list(),
  });
  const horses = horsesData?.data || [];

  const { data: healthData, isLoading: healthLoading } = useQuery({
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
        <a onClick={() => setSelectedHorse(record._id)} className="font-medium">
          {name}
        </a>
      ),
    },
    { title: 'Giống', dataIndex: 'breed', key: 'breed' },
    {
      title: 'Trạng thái',
      dataIndex: 'healthStatus',
      key: 'healthStatus',
      render: (status) => {
        const cfg = STATUS_CONFIG[status] || {};
        return (
          <Tag color={cfg.color} icon={cfg.icon}>
            {cfg.label || status}
          </Tag>
        );
      },
    },
    {
      title: 'Cân nặng',
      dataIndex: 'weightKg',
      key: 'weightKg',
      render: (w) => (w ? `${w} kg` : '—'),
    },
  ];

  const treatmentColumns = [
    { title: 'Ngày tạo', dataIndex: 'createdAt', key: 'createdAt', render: (d) => dayjs(d).format('DD/MM/YYYY') },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (st) => (
      <Tag color={st === 'ongoing' ? 'blue' : st === 'completed' ? 'green' : 'default'}>
        {st === 'ongoing' ? 'Đang điều trị' : st === 'completed' ? 'Hoàn thành' : 'Đã hủy'}
      </Tag>
    )},
    { title: 'Khóa tập (Y tế)', dataIndex: 'isTrainingLocked', key: 'locked', render: (locked, record) => (
      locked ? <Tag color="red" icon={<StopOutlined />}>Đang khóa tập ({record.lockReason})</Tag> : <Tag color="green">Bình thường</Tag>
    )},
    { title: 'Thuốc / Ghi chú', key: 'meds', render: (_, record) => {
      const meds = record.medications?.length > 0 
        ? record.medications.map(m => `${m.name} (${m.dosage})`).join(', ') 
        : 'Không kê thuốc';
      return <span className="text-gray-600">{meds}</span>;
    }}
  ];

  const injuryColumns = [
    { title: 'Ngày bị', dataIndex: 'createdAt', key: 'createdAt', render: (d) => dayjs(d).format('DD/MM/YYYY') },
    { title: 'Vị trí', dataIndex: 'bodyPart', key: 'bodyPart', render: (val) => <span className="font-semibold text-gray-800">{val}</span> },
    { title: 'Mức độ', dataIndex: 'severity', key: 'severity', render: (sev) => {
      const colors = { minor: 'blue', moderate: 'orange', severe: 'red', critical: 'purple' };
      const labels = { minor: 'Nhẹ', moderate: 'Vừa', severe: 'Nghiêm trọng', critical: 'Nguy kịch' };
      return <Tag color={colors[sev] || 'default'}>{labels[sev] || sev}</Tag>;
    }},
    { title: 'Hồi phục', dataIndex: 'recoveryStatus', key: 'recoveryStatus', render: (rec) => {
      const colors = { newly_reported: 'red', treating: 'blue', recovering: 'orange', recovered: 'green' };
      const labels = { newly_reported: 'Mới bị', treating: 'Đang điều trị', recovering: 'Đang hồi phục', recovered: 'Đã khỏi' };
      return <Tag color={colors[rec] || 'default'}>{labels[rec] || rec}</Tag>;
    }},
    { title: 'Ghi chú', dataIndex: 'notes', key: 'notes' }
  ];

  return (
    <div>
      <Title level={3} className="!font-semibold !mb-2 !text-[#022c22]" style={{ fontFamily: 'Georgia, serif' }}>
        <HeartOutlined className="mr-2 text-[#eab308]" />
        Giám sát Sức khỏe Ngựa
      </Title>
      <Text className="block mb-6 text-gray-500">
        Theo dõi thể trạng và chỉ số sức khỏe của tất cả ngựa bạn sở hữu.
      </Text>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="premium-card p-4 flex items-center gap-4 border-t-4 border-t-green-500">
          <div className="w-12 h-12 rounded-full bg-green-50 text-green-500 flex items-center justify-center text-xl">
            <CheckCircleOutlined />
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Sẵn sàng</div>
            <div className="text-2xl font-bold text-[#022c22]">{statusCounts.eligible}</div>
          </div>
        </div>
        <div className="premium-card p-4 flex items-center gap-4 border-t-4 border-t-yellow-500">
          <div className="w-12 h-12 rounded-full bg-yellow-50 text-yellow-500 flex items-center justify-center text-xl">
            <ExclamationCircleOutlined />
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Theo dõi</div>
            <div className="text-2xl font-bold text-[#022c22]">{statusCounts.monitoring}</div>
          </div>
        </div>
        <div className="premium-card p-4 flex items-center gap-4 border-t-4 border-t-red-500">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-xl">
            <CloseCircleOutlined />
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Chấn thương</div>
            <div className="text-2xl font-bold text-[#022c22]">{statusCounts.injured}</div>
          </div>
        </div>
        <div className="premium-card p-4 flex items-center gap-4 border-t-4 border-t-orange-500">
          <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-xl">
            <StopOutlined />
          </div>
          <div>
            <div className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Cách ly</div>
            <div className="text-2xl font-bold text-[#022c22]">{statusCounts.quarantined}</div>
          </div>
        </div>
      </div>

      {/* Horse List Table */}
      <div className="premium-card p-5 mb-6">
        <h3 className="font-semibold text-lg text-[#022c22] mb-4">Danh sách Ngựa & Trạng thái</h3>
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={horses}
          loading={horsesLoading}
          pagination={false}
          size="middle"
          rowClassName={(record) =>
            record._id === selectedHorse ? 'bg-blue-50 cursor-pointer' : 'cursor-pointer hover:bg-gray-50 transition-colors'
          }
          onRow={(record) => ({
            onClick: () => setSelectedHorse(record._id),
          })}
        />
      </div>

      {/* Detail Panel */}
      {selectedHorseObj && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <h4 className="font-semibold text-xl text-gray-800 m-0">
              Chi tiết sức khỏe: {selectedHorseObj.name}
            </h4>
            <Tag
              className="rounded-full border-0 font-medium"
              color={STATUS_CONFIG[selectedHorseObj.healthStatus]?.color}
            >
              {STATUS_CONFIG[selectedHorseObj.healthStatus]?.label}
            </Tag>
          </div>

          <Row gutter={[16, 16]} className="mb-6">
            {/* Latest Vital Signs */}
            <Col xs={24} md={12}>
              <div className="premium-card p-5 h-full">
                <h4 className="font-bold text-[#022c22] mb-3 border-b pb-2">Chỉ số sinh tồn gần nhất</h4>
                {latestRecord ? (
                  <Descriptions column={1} size="small" colon={false} labelStyle={{ color: '#6b7280', width: '120px' }}>
                    <Descriptions.Item label="Ngày khám">
                      <span className="font-medium">{dayjs(latestRecord.date).format('DD/MM/YYYY HH:mm')}</span>
                    </Descriptions.Item>
                    <Descriptions.Item label="Nhịp tim">
                      {latestRecord.vitalSigns?.heartRate ? <span className="font-medium">{latestRecord.vitalSigns.heartRate} bpm</span> : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Nhiệt độ">
                      {latestRecord.vitalSigns?.temperatureC ? <span className="font-medium">{latestRecord.vitalSigns.temperatureC} °C</span> : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Nhịp thở">
                      {latestRecord.vitalSigns?.respiratoryRate ? <span className="font-medium">{latestRecord.vitalSigns.respiratoryRate} lần/phút</span> : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Cân nặng">
                      {selectedHorseObj.weightKg ? <span className="font-medium">{selectedHorseObj.weightKg} kg</span> : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Chẩn đoán">
                      <span className="text-gray-800">{latestRecord.diagnosis}</span>
                    </Descriptions.Item>
                  </Descriptions>
                ) : (
                  <Empty description="Chưa có hồ sơ khám bệnh" />
                )}
              </div>
            </Col>

            {/* Care Schedule */}
            <Col xs={24} md={12}>
              <div className="premium-card p-5 h-full">
                <h4 className="font-bold text-[#022c22] mb-3 border-b pb-2">Lịch chăm sóc định kỳ</h4>
                {selectedHorseObj.careSchedule ? (
                  <Descriptions column={1} size="small" colon={false} labelStyle={{ color: '#6b7280', width: '150px' }}>
                    <Descriptions.Item label="💉 Tiêm phòng tiếp theo">
                      <span className="font-medium">
                        {selectedHorseObj.careSchedule.nextVaccinationDue
                          ? dayjs(selectedHorseObj.careSchedule.nextVaccinationDue).format('DD/MM/YYYY')
                          : 'Chưa lên lịch'}
                      </span>
                    </Descriptions.Item>
                    <Descriptions.Item label="💊 Tẩy giun tiếp theo">
                      <span className="font-medium">
                        {selectedHorseObj.careSchedule.nextDewormingDue
                          ? dayjs(selectedHorseObj.careSchedule.nextDewormingDue).format('DD/MM/YYYY')
                          : 'Chưa lên lịch'}
                      </span>
                    </Descriptions.Item>
                    <Descriptions.Item label="🔧 Đóng móng tiếp theo">
                      <span className="font-medium">
                        {selectedHorseObj.careSchedule.nextFarrierDue
                          ? dayjs(selectedHorseObj.careSchedule.nextFarrierDue).format('DD/MM/YYYY')
                          : 'Chưa lên lịch'}
                      </span>
                    </Descriptions.Item>
                  </Descriptions>
                ) : (
                  <Empty description="Chưa có lịch chăm sóc" />
                )}
              </div>
            </Col>
          </Row>

          <Row gutter={[16, 16]} className="mb-6">
            <Col xs={24}>
              <div className="premium-card p-5 h-full">
                <h4 className="font-bold text-[#022c22] mb-3 border-b pb-2">Phác đồ điều trị & Y lệnh</h4>
                <Table 
                  columns={treatmentColumns} 
                  dataSource={horseTreatments} 
                  rowKey="_id" 
                  pagination={{ pageSize: 5 }} 
                  size="small"
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Ngựa không có phác đồ điều trị nào" /> }}
                />
              </div>
            </Col>
          </Row>
          
          <Row gutter={[16, 16]} className="mb-6">
            <Col xs={24}>
              <div className="premium-card p-5 h-full">
                <h4 className="font-bold text-[#022c22] mb-3 border-b pb-2">Hồ sơ chấn thương</h4>
                <Table 
                  columns={injuryColumns} 
                  dataSource={horseInjuries} 
                  rowKey="_id" 
                  pagination={{ pageSize: 5 }} 
                  size="small"
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Ngựa chưa từng ghi nhận chấn thương" /> }}
                />
              </div>
            </Col>
          </Row>

          {/* Vital Signs Chart */}
          {vitalChartData.length > 0 && (
            <div className="premium-card p-5 mb-6">
              <h4 className="font-bold text-[#022c22] mb-4">Biểu đồ Chỉ số Sinh tồn</h4>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={vitalChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  <Line yAxisId="left" type="monotone" dataKey="Nhịp tim (bpm)" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />
                  <Line yAxisId="right" type="monotone" dataKey="Nhiệt độ (°C)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />
                  <Line yAxisId="left" type="monotone" dataKey="Nhịp thở" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Health Records Timeline */}
          <div className="premium-card p-5">
            <h4 className="font-bold text-[#022c22] mb-4">Lịch sử Khám bệnh</h4>
            {horseRecords.length > 0 ? (
              <Timeline
                className="mt-2"
                items={horseRecords.slice(0, 10).map((r) => ({
                  color: STATUS_CONFIG[r.resultStatus]?.color || 'gray',
                  children: (
                    <div className="pb-4">
                      <span className="font-medium text-gray-800">{dayjs(r.date).format('DD/MM/YYYY')}</span>
                      <Tag className="ml-2 rounded-full border-0" color={STATUS_CONFIG[r.resultStatus]?.color}>
                        {STATUS_CONFIG[r.resultStatus]?.label || r.resultStatus}
                      </Tag>
                      <div className="mt-2 text-sm text-gray-600">
                        <span className="text-gray-400 mr-1">Chẩn đoán:</span>
                        <span className="font-medium">{r.diagnosis}</span>
                      </div>
                      {r.notes && (
                        <div className="mt-1 text-sm text-gray-600">
                          <span className="text-gray-400 mr-1">Ghi chú:</span>
                          <span>{r.notes}</span>
                        </div>
                      )}
                      {r.examinedBy?.name && (
                        <div className="mt-1 text-xs text-gray-400">
                          Bác sĩ: {r.examinedBy.name}
                        </div>
                      )}
                    </div>
                  ),
                }))}
              />
            ) : (
              <Empty description="Chưa có lịch sử khám bệnh cho ngựa này" />
            )}
          </div>
        </div>
      )}

      {!selectedHorseObj && !horsesLoading && (
        <div className="premium-card p-10 flex justify-center items-center">
          <Empty description="Chọn một con ngựa từ bảng trên để xem chi tiết sức khỏe" />
        </div>
      )}
    </div>
  );
}
