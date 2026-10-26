import { Card, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { incidentApi } from '../stable/stableApi';
import { INCIDENT_STATUS_META, INCIDENT_SEVERITY_META, incidentStatusOf } from '../../constants/care';
import QuietCard from './QuietCard';
import { useFirst } from './useFirst';

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
  const [shown, more] = useFirst(tasks, 3);
  if (!isLoading && !tasks.length) return <QuietCard title="Sự cố đang mở">Không có sự cố nào đang mở</QuietCard>;

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] rounded-xl overflow-hidden"
      styles={{ title: { whiteSpace: 'normal', overflow: 'visible' }, header: { height: 'auto', whiteSpace: 'normal' } }}
      loading={isLoading}
      title={
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900 text-[15px]">Sự cố đang mở</span>
            {tasks.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                {tasks.length} chờ kết luận
              </span>
            )}
          </div>
          <Text type="secondary" className="!text-xs font-normal">
            {tasks.length > 0 ? `${tasks.length} sự cố` : 'Toàn đàn an toàn'}
          </Text>
        </div>
      }
    >
      <div className="flex flex-col divide-y divide-gray-100">
        {shown.map((t) => {
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
              <Text className="line-clamp-2 !text-sm text-gray-600" title={incident.description}>
                {incident.description}
              </Text>
              {incident.response && (
                <Text className="line-clamp-2 !text-sm">
                  {incident.handledBy?.name ? `Bác sĩ ${incident.handledBy.name}` : 'Bác sĩ'}: {incident.response}
                </Text>
              )}
            </div>
          );
        })}
      </div>
      {more}
    </Card>
  );
}
