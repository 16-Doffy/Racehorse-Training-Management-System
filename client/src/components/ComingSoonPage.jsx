import { Empty, Typography } from 'antd';

const { Title, Paragraph } = Typography;

/**
 * Placeholder for scaffold modules (feeding, inventory, race, finance, ...): the API and data
 * model already exist end-to-end, only the dedicated UI is left for a later phase.
 */
export default function ComingSoonPage({ title, description }) {
  return (
    // No extra padding wrapper here: MainLayout's <Content> already pads every page (p-4),
    // so adding more here would make this page's margins inconsistent with the rest of the app.
    <div>
      <Title level={3}>{title}</Title>
      <Paragraph type="secondary">{description}</Paragraph>
      <Empty description="Chức năng đang được phát triển ở giai đoạn tiếp theo" className="mt-8" />
    </div>
  );
}
