import { Card, Tag, Typography, Empty } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { incidentApi } from '../stable/stableApi';
import { INCIDENT_STATUS_META, INCIDENT_SEVERITY_META, incidentStatusOf } from '../../constants/care';

const { Text } = Typography;

/**
 * Incidents the grooms reported that a vet has not closed yet. An open one keeps the horse's
 * medical readiness gate amber, so this is the list that explains why a session shows a warning —
 * and whether the vet has picked the report up.
 */
export default function OpenIncidentsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['incidents', 'unresolved'],
    queryFn: () => incidentApi.list({ status: 'unresolved' }),
  });
  const tasks = data?.data || [];

  return (
    <Card
      className="!mt-6"
      loading={isLoading}
      title={
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span>Sự cố đang mở</span>
          {tasks.length > 0 && (
            <Text type="secondary" className="!text-xs">
              {tasks.length} sự cố chờ bác sĩ kết luận
            </Text>
          )}
        </div>
      }
    >
      {tasks.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có sự cố nào đang chờ xử lý." />
      ) : (
        <div className="flex flex-col divide-y divide-gray-100">
          {tasks.slice(0, 6).map((t) => {
            const incident = t.incidentReport;
            const status = INCIDENT_STATUS_META[incidentStatusOf(incident)];
            const severity = INCIDENT_SEVERITY_META[incident.severity];
            return (
              <div key={t._id} className="py-2.5 flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/horses/${t.horse?._id}`} className="font-medium">
                    {t.horse?.name || 'Ngựa'}
                  </Link>
                  <Tag color={status.color} className="!m-0">
                    {status.label}
                  </Tag>
                  {severity && (
                    <Tag color={severity.color} className="!m-0">
                      {severity.label}
                    </Tag>
                  )}
                  <Text type="secondary" className="!text-xs">
                    {t.assignedTo?.name ? `${t.assignedTo.name} báo ` : 'báo '}
                    {dayjs(incident.reportedAt).format('DD/MM HH:mm')}
                  </Text>
                </div>
                <Text className="!text-sm text-gray-600">{incident.description}</Text>
                {incident.response && (
                  <Text className="!text-sm">
                    {incident.handledBy?.name ? `Bác sĩ ${incident.handledBy.name}` : 'Bác sĩ'}: {incident.response}
                  </Text>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
