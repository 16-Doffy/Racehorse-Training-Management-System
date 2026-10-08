import { useMemo, useRef } from 'react';
import { Modal, Form, Checkbox, InputNumber, Input, Alert, Typography, Row, Col } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { message } from '../../lib/antdStatic';
import { trainingSessionApi } from './trainingApi';
import ReadinessPanel from './ReadinessPanel';
import confirmReadinessOverride, { needsOverride } from './confirmReadinessOverride';

const { Text } = Typography;

const clock = (d) => new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

/**
 * The pre-check: shortly before the session the trainer looks at the horse, the system re-runs the
 * readiness gates for *now*, and the session becomes READY — the only state it can be started from.
 *
 * The server decides everything that matters (the time window, the medical block, the amber gates);
 * this screen shows the answer and asks for what only the trainer can give: that they saw the horse,
 * and their reason when they go ahead past a warning.
 */
export default function PreCheckModal({ session, open, onClose, onDone, onRequestExam }) {
  const [form] = Form.useForm();
  const lastValues = useRef({});
  // The board is judged for the moment the trainer opens the check, not re-asked on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date().toISOString(), [open, session?._id]);

  const mutation = useMutation({
    mutationFn: (payload) => trainingSessionApi.preCheck(session._id, payload),
    onSuccess: () => {
      message.success('Buổi tập đã sẵn sàng — bạn có thể bắt đầu.');
      form.resetFields();
      onDone?.();
      onClose();
    },
    onError: (err) => {
      const code = err?.data?.code;
      if (needsOverride(err)) {
        confirmReadinessOverride({
          readiness: err.data.readiness,
          okText: 'Vẫn xác nhận sẵn sàng',
          onConfirm: (reason) => mutation.mutate({ ...lastValues.current, overrideReason: reason }),
        });
        return;
      }
      if (code === 'READINESS_BLOCKED') {
        // The server has put the session on hold: show it that way and let the trainer come back later.
        message.error(err.message);
        onDone?.();
        onClose();
        return;
      }
      if (code === 'OUTSIDE_PRECHECK_WINDOW') {
        message.warning(`Chỉ kiểm tra sẵn sàng được từ ${clock(err.data.opensAt)} đến ${clock(err.data.closesAt)}.`);
        return;
      }
      message.error(err.message || 'Không thể kiểm tra sẵn sàng.');
    },
  });

  const submit = (values) => {
    const payload = {
      confirmed: true,
      ...(values.bodyTempC != null ? { bodyTempC: values.bodyTempC } : {}),
      ...(values.trackCondition?.trim() ? { trackCondition: values.trackCondition.trim() } : {}),
      ...(values.weather?.trim() ? { weather: values.weather.trim() } : {}),
    };
    lastValues.current = payload;
    mutation.mutate(payload);
  };

  return (
    <Modal
      open={open}
      destroyOnHidden
      title={`Kiểm tra sẵn sàng — ${session?.horse?.name || ''}`}
      okText="Xác nhận sẵn sàng"
      cancelText="Để sau"
      confirmLoading={mutation.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      width={640}
    >
      {session && (
        <>
          <Text type="secondary" className="block mb-3 !text-sm">
            Buổi tập lúc {clock(session.scheduledAt)}. Hệ thống kiểm tra lại tình trạng ngựa cho thời điểm hiện tại; nếu có
            cảnh báo, bạn sẽ được hỏi lý do trước khi tiếp tục.
          </Text>
          {session.status === 'blocked' && session.blockedReason && (
            <Alert className="!mb-3" type="warning" showIcon message="Buổi tập đang bị chặn" description={session.blockedReason} />
          )}
          <ReadinessPanel
            horse={session.horse?._id}
            scheduledAt={now}
            intensity={session.intensity}
            sessionType={session.sessionType}
            objective={session.objective}
            onRequestExam={onRequestExam}
          />
          <Form form={form} layout="vertical" onFinish={submit} className="!mt-3">
            <Row gutter={12}>
              <Col xs={24} sm={8}>
                <Form.Item name="bodyTempC" label="Nhiệt độ cơ thể (°C)" extra="Không bắt buộc">
                  <InputNumber min={30} max={45} step={0.1} className="w-full" placeholder="37.8" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="trackCondition" label="Mặt sân">
                  <Input placeholder="VD: khô, hơi ướt" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="weather" label="Thời tiết">
                  <Input placeholder="VD: nắng nhẹ" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="confirmed"
              valuePropName="checked"
              rules={[{ validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error('Hãy xác nhận bạn đã quan sát ngựa.'))) }]}
            >
              <Checkbox>Tôi đã trực tiếp quan sát ngựa và thấy phù hợp để tập</Checkbox>
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}
