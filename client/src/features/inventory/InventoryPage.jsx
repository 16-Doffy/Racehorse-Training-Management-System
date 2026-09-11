import { Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from './inventoryApi';

const { Title, Paragraph } = Typography;

// Read-only listing wired to the real scaffold API; restock requests/approval flow come later.
export default function InventoryPage() {
  const { data, isLoading } = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });

  const columns = [
    { title: 'Tên vật tư', dataIndex: 'name', key: 'name' },
    { title: 'Danh mục', dataIndex: 'category', key: 'category' },
    { title: 'Số lượng', dataIndex: 'quantity', key: 'quantity' },
    { title: 'Đơn vị', dataIndex: 'unit', key: 'unit' },
    { title: 'Khu vực', dataIndex: 'stableBlock', key: 'stableBlock' },
  ];

  return (
    <div>
      <Title level={3}>Vật tư & Thức ăn</Title>
      <Paragraph type="secondary">Đề xuất bổ sung vật tư sẽ được bổ sung ở giai đoạn tiếp theo.</Paragraph>
      <Table rowKey="_id" columns={columns} dataSource={data?.data} loading={isLoading} />
    </div>
  );
}
