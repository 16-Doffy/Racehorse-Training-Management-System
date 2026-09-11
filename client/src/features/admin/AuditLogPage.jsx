import { Table, Typography, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from './auditApi';

const { Title } = Typography;

export default function AuditLogPage() {
  const { data, isLoading } = useQuery({ queryKey: ['audit-logs'], queryFn: () => auditApi.list() });
  const items = data?.data?.items || [];

  const columns = [
    { title: 'Thời gian', dataIndex: 'createdAt', key: 'createdAt', render: (d) => new Date(d).toLocaleString() },
    { title: 'Người thực hiện', dataIndex: ['actor', 'name'], key: 'actor' },
    { title: 'Hành động', dataIndex: 'action', key: 'action', render: (a) => <Tag>{a}</Tag> },
    { title: 'Đối tượng', dataIndex: 'targetModel', key: 'targetModel' },
  ];

  return (
    <div>
      <Title level={3}>Nhật ký Thao tác Hệ thống (Audit Log)</Title>
      <Table rowKey="_id" columns={columns} dataSource={items} loading={isLoading} />
    </div>
  );
}
