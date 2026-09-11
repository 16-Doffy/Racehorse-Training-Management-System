import { useState } from 'react';
import { Badge, Dropdown, List, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from './notificationsApi';
import { useRealtimeAlerts } from './useRealtimeAlerts';

const { Text } = Typography;

export default function AlertBell() {
  const [open, setOpen] = useState(false);
  const { unreadCount, resetUnreadCount } = useRealtimeAlerts();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list(),
    enabled: open,
  });

  const items = data?.data || [];

  return (
    <Dropdown
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) resetUnreadCount();
      }}
      trigger={['click']}
      popupRender={() => (
        <div className="bg-white rounded-md shadow-lg w-80 max-h-96 overflow-auto border border-gray-100">
          <List
            size="small"
            dataSource={items}
            locale={{ emptyText: 'Không có thông báo' }}
            renderItem={(item) => (
              <List.Item className="!px-4">
                <div>
                  <Text strong={!item.isRead}>{item.message}</Text>
                  <div className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString()}</div>
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
