import { Typography } from 'antd';
import { MobileOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

/**
 * The Groom / Stable Hand role moved to the Expo mobile app in /mobile: the work happens in the
 * stalls, with one hand on the horse and a phone camera for incident photos. The web client keeps
 * no groom screens, so a groom signing in here lands on this notice instead of a blank shell.
 */
export default function GroomMobileNotice() {
  return (
    <div className="max-w-[720px] mx-auto">
      <div className="premium-card p-10 text-center">
        <div className="w-16 h-16 rounded-full bg-[#022c22] text-[#eab308] flex items-center justify-center text-3xl mx-auto mb-6">
          <MobileOutlined />
        </div>
        <Title level={3} className="!text-[#022c22]" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          Vai trò Nhân viên Chăm sóc dùng trên điện thoại
        </Title>
        <Paragraph type="secondary" className="!mb-6">
          Toàn bộ công việc chăm sóc — sơ đồ chuồng trại, việc hàng ngày, khẩu phần ăn, báo cáo sự cố kèm ảnh và vật tư
          khu vực — đã chuyển sang ứng dụng di động, nên bản web không còn các màn hình này.
        </Paragraph>
        <div className="bg-[#fdfbf7] border border-gray-100 rounded-xl p-5 text-left">
          <Text strong className="block mb-2">
            Cách mở ứng dụng
          </Text>
          <ol className="text-gray-600 text-sm pl-5 m-0 flex flex-col gap-1">
            <li>Cài <strong>Expo Go</strong> trên điện thoại (CH Play hoặc App Store).</li>
            <li>
              Trên máy tính, chạy <code>npm install</code> rồi <code>npm start</code> trong thư mục <code>mobile/</code>.
            </li>
            <li>Mở Expo Go và quét mã QR hiện trong cửa sổ terminal.</li>
            <li>Đăng nhập bằng chính tài khoản Nhân viên Chăm sóc của bạn.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
