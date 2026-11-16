import { Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

const GLASS = { background: 'rgba(1,17,12,.62)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(6px)' };

/**
 * Where a 3D scene's models come from, behind a small "i" in a corner of the viewer instead of a
 * line of text under it: out of the way, and still one hover or tap away, as the models' CC BY /
 * CC BY-NC licences ask for. `lines` are the credits; `style` moves it (bottom-right, 8px in, by
 * default). The viewer around it must be positioned.
 */
export default function ModelCredit({ lines, style }) {
  const shown = lines.filter(Boolean);
  return (
    <Tooltip
      trigger={['hover', 'focus', 'click']}
      placement="topRight"
      title={
        <div className="text-xs leading-snug">
          {shown.map((line, i) => (
            <div key={line} className={i ? 'mt-1' : undefined}>
              {line}
            </div>
          ))}
        </div>
      }
    >
      <button
        type="button"
        aria-label="Nguồn mô hình 3D"
        style={{
          position: 'absolute',
          right: 8,
          bottom: 8,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          padding: 0,
          borderRadius: 999,
          color: '#fff',
          fontSize: 12,
          cursor: 'pointer',
          ...GLASS,
          ...style,
        }}
      >
        <InfoCircleOutlined />
      </button>
    </Tooltip>
  );
}
