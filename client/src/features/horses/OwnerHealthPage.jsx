import { useState } from 'react';
import { Tag, Table, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { horsesApi } from './horsesApi';
import { healthRecordApi, treatmentApi, injuryMarkerApi } from '../health/healthApi';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TRAINING_LEVEL_META } from '../../constants/health';
import dayjs from 'dayjs';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import { FactRow, OwnerCard, Pill, StatStrip } from './ownerUi';

const STATUS_CONFIG = {
  eligible: { tone: 'good', label: 'Sẵn sàng thi đấu' },
  monitoring: { tone: 'warn', label: 'Đang theo dõi' },
  injured: { tone: 'bad', label: 'Chấn thương' },
  quarantined: { tone: 'neutral', label: 'Cách ly' },
};

const TREATMENT_STATUS = {
  ongoing: { tone: 'info', label: 'Đang điều trị' },
  completed: { tone: 'good', label: 'Hoàn thành' },
  cancelled: { tone: 'neutral', label: 'Đã hủy' },
};

const SEVERITY = {
  minor: { tone: 'info', label: 'Nhẹ' },
  moderate: { tone: 'warn', label: 'Vừa' },
  severe: { tone: 'bad', label: 'Nghiêm trọng' },
  critical: { tone: 'bad', label: 'Nguy kịch' },
};

const RECOVERY = {
  newly_reported: { tone: 'bad', label: 'Mới bị' },
  treating: { tone: 'info', label: 'Đang điều trị' },
  recovering: { tone: 'warn', label: 'Đang hồi phục' },
  recovered: { tone: 'good', label: 'Đã khỏi' },
};

const dateOrNone = (d) => (d ? dayjs(d).format('DD/MM/YYYY') : 'Chưa lên lịch');

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

  // The detail below follows the row picked in the table; it opens on the first horse.
  const activeHorseId = selectedHorse || horses[0]?._id || null;

  // Filter health records for selected horse
  const horseRecords = activeHorseId
    ? allRecords
        .filter((r) => r.horse?._id === activeHorseId || r.horse === activeHorseId)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
    : [];

  const horseTreatments = activeHorseId
    ? allTreatments
        .filter((t) => t.horse?._id === activeHorseId || t.horse === activeHorseId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    : [];

  const horseInjuries = activeHorseId
    ? allInjuries
        .filter((i) => i.horse?._id === activeHorseId || i.horse === activeHorseId)
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

  const selectedHorseObj = horses.find((h) => h._id === activeHorseId);
  const latestRecord = horseRecords[0];
  const selectedStatus = STATUS_CONFIG[selectedHorseObj?.healthStatus];
  const level = TRAINING_LEVEL_META[selectedHorseObj?.trainingClearance?.level || 'high'];

  const columns = [
    {
      title: 'Tên ngựa',
      dataIndex: 'name',
      key: 'name',
      render: (name) => <span className="font-semibold text-gray-900">{name}</span>,
    },
    {
      title: 'Giống',
      dataIndex: 'breed',
      key: 'breed',
      render: (b) => <span className="text-gray-600">{b || '—'}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'healthStatus',
      key: 'healthStatus',
      render: (status) => <Pill tone={STATUS_CONFIG[status]?.tone}>{STATUS_CONFIG[status]?.label || status}</Pill>,
    },
    {
      title: 'Cân nặng',
      dataIndex: 'weightKg',
      key: 'weightKg',
      align: 'right',
      render: (w) => <span className="text-gray-600 tabular-nums">{w ? `${w} kg` : '—'}</span>,
    },
  ];

  const treatmentColumns = [
    { title: 'Ngày tạo', dataIndex: 'createdAt', key: 'createdAt', render: (d) => <span className="text-gray-600 tabular-nums">{dayjs(d).format('DD/MM/YYYY')}</span> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (st) => {
      const cfg = TREATMENT_STATUS[st] || TREATMENT_STATUS.cancelled;
      return <Pill tone={cfg.tone}>{cfg.label}</Pill>;
    }},
    { title: 'Khóa tập', dataIndex: 'isTrainingLocked', key: 'locked', render: (locked, record) => (
      locked ? <Pill tone="bad">Khóa{record.lockReason ? ` · ${record.lockReason}` : ''}</Pill> : <span className="text-gray-500">Bình thường</span>
    )},
    { title: 'Thuốc / Ghi chú', key: 'meds', render: (_, record) => {
      const meds = record.medications?.length > 0
        ? record.medications.map((m) => `${m.name} (${m.dosage})`).join(', ')
        : 'Không kê thuốc';
      return <span className="text-gray-600">{meds}</span>;
    }},
  ];

  const injuryColumns = [
    { title: 'Ngày bị', dataIndex: 'createdAt', key: 'createdAt', render: (d) => <span className="text-gray-600 tabular-nums">{dayjs(d).format('DD/MM/YYYY')}</span> },
    { title: 'Vị trí', dataIndex: 'bodyPart', key: 'bodyPart', render: (val) => <span className="font-semibold text-gray-900">{val}</span> },
    { title: 'Mức độ', dataIndex: 'severity', key: 'severity', render: (sev) => <Pill tone={SEVERITY[sev]?.tone}>{SEVERITY[sev]?.label || sev}</Pill> },
    { title: 'Hồi phục', dataIndex: 'recoveryStatus', key: 'recoveryStatus', render: (rec) => <Pill tone={RECOVERY[rec]?.tone}>{RECOVERY[rec]?.label || rec}</Pill> },
    { title: 'Ghi chú', dataIndex: 'notes', key: 'notes', render: (n) => <span className="text-gray-500">{n}</span> },
  ];

  return (
    <div className="light-surface-box owner-ui text-gray-800 font-sans">
      <PageHeroBanner eyebrow="TEAM 8 • Y TẾ & SỨC KHỎE CHIẾN MÃ" roleLabel="Horse Owner" title="Giám Sát Y Tế & Sức Khỏe" subtitle="Theo dõi thể trạng, lịch sử điều trị và chỉ số sinh tồn của toàn bộ danh mục chiến mã." />

      <StatStrip
        className="mb-4"
        items={[
          {
            label: 'Sẵn sàng thi đấu',
            value: statusCounts.eligible,
            hint: `${horses.length > 0 ? Math.round((statusCounts.eligible / horses.length) * 100) : 0}% tổng số`,
            tone: statusCounts.eligible ? 'good' : undefined,
          },
          { label: 'Đang theo dõi', value: statusCounts.monitoring, hint: 'Giám sát cường độ', tone: statusCounts.monitoring ? 'warn' : undefined },
          { label: 'Chấn thương', value: statusCounts.injured, hint: 'Khóa tập luyện', tone: statusCounts.injured ? 'bad' : undefined },
          { label: 'Đang cách ly', value: statusCounts.quarantined, hint: 'Phòng ngừa' },
        ]}
      />

      {/* Horse List Table: the picked row drives the detail below */}
      <OwnerCard title="Danh sách ngựa" flush className="mb-4">
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={horses}
          loading={horsesLoading}
          pagination={false}
          rowClassName={(record) => (record._id === activeHorseId ? 'bg-emerald-50/60 cursor-pointer' : 'cursor-pointer')}
          onRow={(record) => ({ onClick: () => setSelectedHorse(record._id) })}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bạn chưa có chiến mã nào" /> }}
        />
      </OwnerCard>

      {/* Detail Panel */}
      {selectedHorseObj && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center flex-wrap gap-2.5">
            <div role="heading" aria-level={2} className="text-lg font-semibold text-gray-900">{selectedHorseObj.name}</div>
            {selectedStatus && <Pill tone={selectedStatus.tone}>{selectedStatus.label}</Pill>}
            {level && <Tag color={level.color} className="!m-0">{level.label}</Tag>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OwnerCard title="Chỉ số sinh tồn gần nhất">
              {latestRecord ? (
                <div>
                  <FactRow label="Ngày khám">{dayjs(latestRecord.date).format('DD/MM/YYYY HH:mm')}</FactRow>
                  <FactRow label="Nhịp tim">{latestRecord.vitalSigns?.heartRate || '—'} bpm</FactRow>
                  <FactRow label="Nhiệt độ">{latestRecord.vitalSigns?.temperatureC || '—'} °C</FactRow>
                  <FactRow label="Nhịp thở">{latestRecord.vitalSigns?.respiratoryRate || '—'} lần/phút</FactRow>
                  <FactRow label="Chẩn đoán">{latestRecord.diagnosis || '—'}</FactRow>
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có hồ sơ khám bệnh" />
              )}
            </OwnerCard>

            <OwnerCard title="Lịch chăm sóc y tế định kỳ">
              {selectedHorseObj.careSchedule ? (
                <div>
                  <FactRow label="Tiêm phòng tiếp theo">{dateOrNone(selectedHorseObj.careSchedule.nextVaccinationDue)}</FactRow>
                  <FactRow label="Tẩy giun tiếp theo">{dateOrNone(selectedHorseObj.careSchedule.nextDewormingDue)}</FactRow>
                  <FactRow label="Đóng móng tiếp theo">{dateOrNone(selectedHorseObj.careSchedule.nextFarrierDue)}</FactRow>
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có lịch chăm sóc" />
              )}
            </OwnerCard>
          </div>

          <OwnerCard title="Phác đồ điều trị & y lệnh" flush>
            <Table
              columns={treatmentColumns}
              dataSource={horseTreatments}
              rowKey="_id"
              pagination={{ pageSize: 5, hideOnSinglePage: true }}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có phác đồ điều trị" /> }}
            />
          </OwnerCard>

          <OwnerCard title="Hồ sơ chấn thương" flush>
            <Table
              columns={injuryColumns}
              dataSource={horseInjuries}
              rowKey="_id"
              pagination={{ pageSize: 5, hideOnSinglePage: true }}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có chấn thương" /> }}
            />
          </OwnerCard>

          {/* Vital Signs Chart */}
          {vitalChartData.length > 0 && (
            <OwnerCard title="Chỉ số sinh tồn (20 lần khám gần nhất)">
              <ResponsiveContainer width="100%" height={280}>
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
            </OwnerCard>
          )}
        </div>
      )}
    </div>
  );
}
