import { Empty, Typography } from 'antd';

const { Title, Paragraph } = Typography;

/**
 * Placeholder for scaffold modules (feeding, inventory, race, finance, ...): the API and data
 * model already exist end-to-end, only the dedicated UI is left for a later phase.
 */
export default function ComingSoonPage({ title, description }) {
  return (
    <div className="p-6">
      <Title level={3}>{title}</Title>
      <Paragraph type="secondary">{description}</Paragraph>
      <Empty description="Chức năng đang được phát triển ở giai đoạn tiếp theo" />
    </div>
  );
}
