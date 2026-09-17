import { Badge, Dropdown, List, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useRealtimeAlerts } from './useRealtimeAlerts';

const { Text } = Typography;

export default function AlertBell() {
  const { notifications, unreadCount, markAllRead } = useRealtimeAlerts();

  return (
    <Dropdown
      trigger={['click']}
      onOpenChange={(open) => {
        if (open) markAllRead();
      }}
      popupRender={() => (
        <div className="bg-white rounded-md shadow-lg w-80 max-h-96 overflow-auto border border-gray-100">
          <List
            size="small"
            dataSource={notifications}
            locale={{ emptyText: 'Không có thông báo' }}
            renderItem={(item) => (
              <List.Item className="!px-4">
                <div>
                  <Text strong={!item.isRead}>{item.message}</Text>
                  <div className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString('vi-VN')}</div>
                </div>
              </List.Item>
            )}
          />
        </div>
      )}
    >
      <Badge count={unreadCount} size="small">
        <BellOutlined className="text-lg cursor-pointer" />
      </Badge>
    </Dropdown>
  );
}
