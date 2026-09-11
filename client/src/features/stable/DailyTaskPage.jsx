import { useState } from 'react';
import { Table, Button, Typography, Tag, message, Modal, Form, Input, Select, Upload } from 'antd';
import { CheckOutlined, WarningOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dailyTaskApi } from './stableApi';

const { Title } = Typography;

const TASK_LABELS = { feeding: 'Cho ăn', cleaning: 'Vệ sinh chuồng', bathing: 'Tắm rửa', icing: 'Ngâm chân nước đá' };
const STATUS_COLORS = { pending: 'default', completed: 'green', skipped: 'orange' };

export default function DailyTaskPage() {
  const [incidentTarget, setIncidentTarget] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['my-daily-tasks'], queryFn: () => dailyTaskApi.list() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['my-daily-tasks'] });

  const completeMutation = useMutation({
    mutationFn: (id) => dailyTaskApi.complete(id),
    onSuccess: () => {
      message.success('Đã đánh dấu hoàn thành.');
      invalidate();
    },
    onError: (err) => message.error(err.message || 'Thao tác thất bại.'),
  });

  const incidentMutation = useMutation({
    mutationFn: ({ id, formData }) => dailyTaskApi.reportIncident(id, formData),
    onSuccess: () => {
      message.success('Đã gửi báo cáo sự cố.');
      invalidate();
      setIncidentTarget(null);
      setFileList([]);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Gửi báo cáo thất bại.'),
  });

  const submitIncident = (values) => {
    const formData = new FormData();
    formData.append('description', values.description);
    formData.append('severity', values.severity);
    fileList.forEach((f) => formData.append('images', f.originFileObj));
    incidentMutation.mutate({ id: incidentTarget._id, formData });
  };

  const columns = [
    { title: 'Ngựa', dataIndex: ['horse', 'name'], key: 'horse' },
    { title: 'Công việc', dataIndex: 'taskType', key: 'taskType', render: (t) => TASK_LABELS[t] || t },
    {
      title: 'Ngày',
      dataIndex: 'scheduledDate',
      key: 'scheduledDate',
      render: (d) => new Date(d).toLocaleDateString(),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={STATUS_COLORS[s]}>{s === 'pending' ? 'Chưa xong' : s === 'completed' ? 'Hoàn thành' : 'Bỏ qua'}</Tag>,
    },
    {
      title: 'Sự cố',
      dataIndex: 'incidentReport',
      key: 'incidentReport',
      render: (r) => (r ? <Tag color="red">{r.description}</Tag> : '—'),
    },
    {
      title: '',
      key: 'actions',
      render: (_, record) => (
        <div className="flex gap-2">
          {record.status === 'pending' && (
            <Button size="small" icon={<CheckOutlined />} onClick={() => completeMutation.mutate(record._id)}>
              Hoàn thành
            </Button>
          )}
          <Button size="small" danger icon={<WarningOutlined />} onClick={() => setIncidentTarget(record)}>
            Báo sự cố
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>Công việc Hàng ngày</Title>
      <Table rowKey="_id" columns={columns} dataSource={data?.data} loading={isLoading} />

      <Modal
        title={`Báo cáo sự cố — ${incidentTarget?.horse?.name || ''}`}
        open={!!incidentTarget}
        onCancel={() => setIncidentTarget(null)}
        onOk={() => form.submit()}
        confirmLoading={incidentMutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submitIncident}>
          <Form.Item name="description" label="Mô tả sự cố" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="Ngựa bỏ ăn, có dấu hiệu đau bụng/sốt, móng bị xước..." />
          </Form.Item>
          <Form.Item name="severity" label="Mức độ" initialValue="medium">
            <Select
              options={[
                { value: 'low', label: 'Nhẹ' },
                { value: 'medium', label: 'Trung bình' },
                { value: 'high', label: 'Nghiêm trọng' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Hình ảnh thực tế">
            <Upload
              listType="picture-card"
              fileList={fileList}
              beforeUpload={() => false}
              onChange={({ fileList: fl }) => setFileList(fl)}
              multiple
            >
              {fileList.length >= 5 ? null : (
                <div>
                  <UploadOutlined />
                  <div className="mt-1">Tải ảnh lên</div>
                </div>
              )}
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
