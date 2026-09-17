import { useState } from 'react';
import { Modal, Form, Input, Radio, Upload, Tag, Alert, Button, message } from 'antd';
import { CameraOutlined, WarningFilled } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { dailyTaskApi } from './stableApi';
import { HEADING_FONT, INCIDENT_PRESETS, SEVERITY_CONFIG, TASK_CONFIG } from './groomConfig';

const MAX_IMAGES = 5;
const MAX_IMAGE_MB = 5; // matches server/src/middlewares/uploadMiddleware.js

/**
 * Incident report for one daily task, with quick symptom presets and photo evidence.
 * The form lives in its own component so `destroyOnHidden` resets it every time the modal closes.
 */
export default function IncidentReportModal({ task, open, onClose }) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={560}
      title={
        <div className="flex items-center gap-2 text-[#022c22]">
          <WarningFilled style={{ color: '#ef4444' }} />
          <span style={{ fontFamily: HEADING_FONT }}>Báo cáo sự cố tại chuồng</span>
        </div>
      }
    >
      {task && <IncidentForm task={task} onDone={onClose} />}
    </Modal>
  );
}

function IncidentForm({ task, onDone }) {
  const [form] = Form.useForm();
  const [presets, setPresets] = useState([]);
  const [fileList, setFileList] = useState([]);
  const queryClient = useQueryClient();
  const taskCfg = TASK_CONFIG[task.taskType] || { label: task.taskType, emoji: '📋' };

  const mutation = useMutation({
    mutationFn: (formData) => dailyTaskApi.reportIncident(task._id, formData),
    onSuccess: () => {
      message.success('Đã gửi báo cáo sự cố. Bác sĩ thú y đã được thông báo.');
      queryClient.invalidateQueries({ queryKey: ['my-daily-tasks'] });
      onDone();
    },
    onError: (err) => message.error(err.message || 'Gửi báo cáo thất bại.'),
  });

  const togglePreset = (preset, checked) =>
    setPresets((prev) => (checked ? [...prev, preset] : prev.filter((p) => p !== preset)));

  const onFinish = ({ detail, severity }) => {
    const description = [presets.join(', '), detail?.trim()].filter(Boolean).join('. ');
    if (!description) {
      message.warning('Chọn ít nhất một dấu hiệu hoặc nhập mô tả sự cố.');
      return;
    }
    const formData = new FormData();
    formData.append('description', description);
    formData.append('severity', severity);
    fileList.forEach((f) => formData.append('images', f.originFileObj));
    mutation.mutate(formData);
  };

  const beforeUpload = (file) => {
    if (!file.type.startsWith('image/')) {
      message.error('Chỉ chấp nhận file ảnh (jpeg, png, webp, gif).');
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      message.error(`Ảnh "${file.name}" vượt quá ${MAX_IMAGE_MB}MB.`);
      return Upload.LIST_IGNORE;
    }
    return false; // keep the file locally; it is sent with the form, not uploaded on select
  };

  return (
    <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ severity: 'medium' }} requiredMark={false}>
      <div className="bg-[#fdfbf7] border border-gray-100 rounded-xl p-3 mb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#022c22] text-[#eab308] flex items-center justify-center font-bold shrink-0">
          {task.horse?.name?.[0] || '?'}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-[#022c22]">{task.horse?.name || 'Không rõ ngựa'}</div>
          <div className="text-xs text-gray-500">
            {taskCfg.emoji} {taskCfg.label} • {dayjs(task.scheduledDate).format('DD/MM/YYYY')}
          </div>
        </div>
      </div>

      {task.incidentReport && (
        <Alert
          type="warning"
          showIcon
          className="!mb-4"
          title="Công việc này đã có báo cáo sự cố"
          description="Gửi báo cáo mới sẽ thay thế báo cáo trước đó."
        />
      )}

      <Form.Item label={<span className="font-medium">Dấu hiệu ghi nhận</span>}>
        <div className="flex flex-wrap gap-y-2">
          {INCIDENT_PRESETS.map((preset) => (
            <Tag.CheckableTag
              key={preset}
              checked={presets.includes(preset)}
              onChange={(checked) => togglePreset(preset, checked)}
              className="!border !border-gray-200 !rounded-full !px-3 !py-1"
            >
              {preset}
            </Tag.CheckableTag>
          ))}
        </div>
      </Form.Item>

      <Form.Item name="detail" label={<span className="font-medium">Mô tả chi tiết</span>}>
        <Input.TextArea rows={3} maxLength={500} showCount placeholder="Thời điểm phát hiện, biểu hiện cụ thể, đã xử lý tạm thời gì..." />
      </Form.Item>

      <Form.Item name="severity" label={<span className="font-medium">Mức độ</span>}>
        <Radio.Group buttonStyle="solid" optionType="button">
          {Object.entries(SEVERITY_CONFIG).map(([value, cfg]) => (
            <Radio.Button key={value} value={value}>
              {cfg.label}
            </Radio.Button>
          ))}
        </Radio.Group>
      </Form.Item>

      <Form.Item
        label={<span className="font-medium">Hình ảnh thực tế</span>}
        extra={`Tối đa ${MAX_IMAGES} ảnh, mỗi ảnh ≤ ${MAX_IMAGE_MB}MB.`}
      >
        <Upload
          listType="picture-card"
          accept="image/*"
          multiple
          fileList={fileList}
          beforeUpload={beforeUpload}
          onChange={({ fileList: fl }) => setFileList(fl.slice(0, MAX_IMAGES))}
          showUploadList={{ showPreviewIcon: false }}
        >
          {fileList.length >= MAX_IMAGES ? null : (
            <div className="text-gray-500">
              <CameraOutlined className="text-lg" />
              <div className="mt-1 text-xs">Thêm ảnh</div>
            </div>
          )}
        </Upload>
      </Form.Item>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button onClick={onDone}>Huỷ</Button>
        <Button type="primary" danger htmlType="submit" loading={mutation.isPending}>
          Gửi báo cáo
        </Button>
      </div>
    </Form>
  );
}
