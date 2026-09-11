import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Descriptions, Tag, Typography, Table, Card, Breadcrumb } from 'antd';
import { horsesApi } from './horsesApi';

const { Title } = Typography;

const STATUS_COLORS = { eligible: 'green', monitoring: 'gold', injured: 'red', quarantined: 'volcano' };

export default function HorseDetailPage() {
  const { id } = useParams();
  const { data, isLoading } = useQuery({ queryKey: ['horses', id], queryFn: () => horsesApi.getOne(id) });
  const horse = data?.data;

  if (isLoading || !horse) return null;

  const achievementColumns = [
    { title: 'Giải đua', dataIndex: 'race', key: 'race' },
    { title: 'Kết quả', dataIndex: 'result', key: 'result' },
    { title: 'Ngày', dataIndex: 'date', key: 'date', render: (d) => new Date(d).toLocaleDateString() },
  ];

  return (
    <div>
      <Breadcrumb
        className="mb-4"
        items={[{ title: <Link to="/horses">Danh sách Ngựa</Link> }, { title: horse.name }]}
      />
      <Title level={3}>{horse.name}</Title>

      <Card className="mb-4" title="Hồ sơ lý lịch">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Giống">{horse.breed}</Descriptions.Item>
          <Descriptions.Item label="Màu lông">{horse.color}</Descriptions.Item>
          <Descriptions.Item label="Ngày sinh">
            {horse.dob ? new Date(horse.dob).toLocaleDateString() : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Cân nặng">{horse.weightKg ? `${horse.weightKg} kg` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Chủ sở hữu">{horse.owner?.name || '—'}</Descriptions.Item>
          <Descriptions.Item label="Trạng thái sức khỏe">
            <Tag color={STATUS_COLORS[horse.healthStatus]}>{horse.healthStatus}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card className="mb-4" title="Dòng dõi (Pedigree)">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Ngựa bố (Sire)">{horse.sire?.name || 'Chưa cập nhật'}</Descriptions.Item>
          <Descriptions.Item label="Ngựa mẹ (Dam)">{horse.dam?.name || 'Chưa cập nhật'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Lịch sử thành tích thi đấu">
        <Table
          rowKey={(r) => `${r.race}-${r.date}`}
          columns={achievementColumns}
          dataSource={horse.achievements}
          pagination={false}
          locale={{ emptyText: 'Chưa có thành tích' }}
        />
      </Card>
    </div>
  );
}
