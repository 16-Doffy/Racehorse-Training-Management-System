import { Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { horsesApi } from './horsesApi';

const { Title } = Typography;

const STATUS_COLORS = {
  eligible: 'green',
  monitoring: 'gold',
  injured: 'red',
  quarantined: 'volcano',
};

const STATUS_LABELS = {
  eligible: 'Đủ điều kiện',
  monitoring: 'Cần theo dõi',
  injured: 'Chấn thương',
  quarantined: 'Cách ly',
};

export default function HorseListPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const horses = data?.data || [];

  const columns = [
    { title: 'Tên ngựa', dataIndex: 'name', key: 'name' },
    { title: 'Giống', dataIndex: 'breed', key: 'breed' },
    { title: 'Màu lông', dataIndex: 'color', key: 'color' },
    { title: 'Chủ sở hữu', dataIndex: ['owner', 'name'], key: 'owner' },
    {
      title: 'Trạng thái sức khỏe',
      dataIndex: 'healthStatus',
      key: 'healthStatus',
      render: (status) => <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status] || status}</Tag>,
    },
  ];

  return (
    <div>
      <Title level={3}>Danh sách Ngựa</Title>
      <Table
        rowKey="_id"
        columns={columns}
        dataSource={horses}
        loading={isLoading}
        onRow={(record) => ({ onClick: () => navigate(`/horses/${record._id}`) })}
        rowClassName="cursor-pointer"
      />
    </div>
  );
}
