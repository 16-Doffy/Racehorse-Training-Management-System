import { Badge, Dropdown, List, Typography, Tag, Empty } from 'antd';
import {
  BellOutlined,
  ExclamationCircleFilled,
  WarningFilled,
  InfoCircleFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import { useRealtimeAlerts, TYPE_LABELS } from './useRealtimeAlerts';

dayjs.extend(relativeTime);
dayjs.locale('vi');

const { Text } = Typography;

// One icon+color per severity so the eye can triage the list at a glance without reading every
// line — independent of whatever the message text says (older rows predate the Vietnamese
// rewrite and still read in English, but the icon/color/type-tag/horse-name are always accurate
// since they come from dedicated fields, not parsed out of the message).
const SEVERITY_META = {
  critical: { color: '#cf1322', icon: <ExclamationCircleFilled /> },
  warning: { color: '#d48806', icon: <WarningFilled /> },
  info: { color: '#1677ff', icon: <InfoCircleFilled /> },
};

function NotificationRow({ item, onMarkRead }) {
  const meta = SEVERITY_META[item.severity] || SEVERITY_META.info;
  return (
    <List.Item
      className={`!px-4 !py-3 items-start cursor-pointer hover:bg-gray-50 transition-colors ${!item.isRead ? 'bg-blue-50/60' : ''}`}
      onClick={() => {
        if (!item.isRead && onMarkRead) onMarkRead(item._id);
      }}
    >
      <div className="flex gap-3 w-full">
        <div style={{ color: meta.color, fontSize: 18, marginTop: 2 }}>{meta.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Tag color={meta.color} className="!m-0 !text-xs">
              {TYPE_LABELS[item.type] || TYPE_LABELS.system}
            </Tag>
            {item.horse?.name && (
              <Text strong className="!text-xs">
                {item.horse.name}
              </Text>
            )}
          </div>
          <Text className={`block !text-sm mt-1 ${!item.isRead ? 'font-medium' : 'text-gray-600'}`}>
            {item.message}
          </Text>
          <Text type="secondary" className="!text-xs">
            {dayjs(item.createdAt).fromNow()}
          </Text>
        </div>
        {!item.isRead && <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" title="Chưa đọc - Nhấp để đánh dấu đã đọc" />}
      </div>
    </List.Item>
  );
}

export default function AlertBell() {
  const { notifications, unreadCount, markAllRead, markOneRead } = useRealtimeAlerts();

  return (
    <Dropdown
      trigger={['click']}
      // Opening the bell deliberately does NOT mark everything read. Glancing at the list is not
      // the same as having dealt with it — an unread training lock or incident report should
      // survive until the reader clears it, either per-row or with the header action below.
      popupRender={() => (
        <div className="bg-white rounded-lg shadow-lg w-96 max-h-[28rem] overflow-auto border border-gray-100">
          <div className="px-4 py-2.5 border-b border-gray-100 font-medium text-sm sticky top-0 bg-white flex justify-between items-center">
            <span>Thông báo</span>
            {unreadCount > 0 && (
              <span className="text-xs text-blue-600 hover:underline cursor-pointer" onClick={markAllRead}>
                Đánh dấu tất cả đã đọc
              </span>
            )}
          </div>
          <List
            dataSource={notifications}
            locale={{ emptyText: <Empty description="Không có thông báo" className="!py-6" /> }}
            renderItem={(item) => <NotificationRow key={item._id} item={item} onMarkRead={markOneRead} />}
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
