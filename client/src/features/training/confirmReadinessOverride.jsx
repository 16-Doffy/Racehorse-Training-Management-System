import { Typography, Input } from 'antd';
import { modal } from '../../lib/antdStatic';

const { Text } = Typography;

/**
 * Shows the amber readiness gates the server returned with a 409 `requiresOverride`, and asks the
 * trainer for the reason they are going ahead anyway. Used both when booking a session and when
 * starting one — the same decision, taken at two moments.
 *
 * `onConfirm(reason)` is called only once a non-empty reason has been entered: the confirm button
 * stays disabled until then.
 */
export default function confirmReadinessOverride({ readiness, okText, onConfirm }) {
  const gates = (readiness?.gates || []).filter((g) => g.status === 'caution');
  let reason = '';
  let dialog = null;

  dialog = modal.confirm({
    title: 'Có cảnh báo cần bạn xác nhận',
    width: 560,
    okText,
    cancelText: 'Để tôi xem lại',
    okButtonProps: { disabled: true },
    content: (
      <div>
        <div className="flex flex-col gap-2 my-3">
          {gates.map((g) => (
            <div key={g.key} className="bg-amber-50 rounded px-3 py-2">
              <Text strong className="!text-sm">
                {g.label}
              </Text>
              <Text className="block !text-xs text-gray-700">{g.detail}</Text>
            </div>
          ))}
        </div>
        <Text className="!text-sm">
          Bạn là người quyết định cuối cùng. Nhập lý do để lưu vào hồ sơ buổi tập — Quản lý CLB sẽ
          nhận được thông báo.
        </Text>
        <Input.TextArea
          rows={2}
          aria-label="Lý do"
          onChange={(e) => {
            reason = e.target.value.trim();
            dialog?.update({ okButtonProps: { disabled: !reason } });
          }}
          className="!mt-2"
          placeholder="VD: Ngựa sẽ được cho ăn trước giờ tập, tôi trực tiếp giám sát."
        />
      </div>
    ),
    onOk: () => onConfirm(reason),
  });
}

/** True when an API error is the "needs a reason to proceed" 409, not a hard refusal. */
export const needsOverride = (err) => err?.status === 409 && err?.data?.requiresOverride;
