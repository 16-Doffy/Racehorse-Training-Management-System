import React, { useState, useRef } from 'react';
import { Card, Button, Badge, ButtonGroup } from 'react-bootstrap';
import horse3DImg from '../../assets/horse-3d-anatomy-transparent.png';

export default function Horse3DAnatomyViewer({
  injuries = [],
  selectedPoint = null,
  onPointSelect,
  isInteractive = true,
  height = '480px',
}) {
  const [activeLayer, setActiveLayer] = useState('surface'); // 'surface' | 'muscular' | 'skeletal'
  const [rotationY, setRotationY] = useState(0);
  const [rotationX, setRotationX] = useState(0);
  const [highlightedInjury, setHighlightedInjury] = useState(null);
  const [hoveredPreset, setHoveredPreset] = useState(null);
  const imageFrameRef = useRef(null);

  // Anatomical hotspots presets calibrated 100% precisely onto the 1376x768 3D Horse Image Canvas
  const anatomicalPresets = [
    { id: 'head_jaw', name: 'Đầu & Xương Hàm (Cranium & Masseter)', x: 0.233, y: 0.228, region: 'Đầu & Hàm' },
    { id: 'poll_cervical', name: 'Gáy & Đốt Sống Cổ (Cervical Spine)', x: 0.320, y: 0.208, region: 'Đốt sống cổ' },
    { id: 'withers_scapula', name: 'Xương Bả Vai & Bướu Vai (Scapula & Withers)', x: 0.418, y: 0.319, region: 'Bả vai' },
    { id: 'spine_dorsi', name: 'Xương Cột Sống (Vertebral Column)', x: 0.538, y: 0.280, region: 'Cột sống' },
    { id: 'nerves_lumbar', name: 'Hệ Thần Kinh & Hông (Nerves & Lumbar)', x: 0.650, y: 0.300, region: 'Thần kinh hông' },
    { id: 'heart_lungs', name: 'Tim & Phổi (Heart & Lungs)', x: 0.436, y: 0.436, region: 'Tim & Phổi' },
    { id: 'digestive', name: 'Hệ Tiêu Hóa (Digestive System)', x: 0.538, y: 0.456, region: 'Hệ tiêu hóa' },
    { id: 'musculature_thigh', name: 'Khối Cơ Bắp Đùi Sau (Musculature)', x: 0.679, y: 0.540, region: 'Cơ đùi sau' },
    { id: 'foreleg_knee', name: 'Khớp Gối Trước (Knee Joint)', x: 0.407, y: 0.696, region: 'Khớp gối trước' },
    { id: 'foreleg_fetlock', name: 'Khớp Bàn Chân & Móng (Fetlock Joint & Hoof)', x: 0.396, y: 0.879, region: 'Móng trước' },
    { id: 'hind_nerves', name: 'Thần Kinh Chân Sau (Hind Nerves)', x: 0.698, y: 0.755, region: 'Thần kinh sau' },
    { id: 'hind_fetlock', name: 'Khớp Bàn Chân Sau (Hind Fetlock & Hoof)', x: 0.698, y: 0.879, region: 'Móng sau' },
  ];

  const handleDiagramClick = (e) => {
    if (!isInteractive || !onPointSelect) return;
    const target = imageFrameRef.current || e.currentTarget;
    const rect = target.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / rect.width;
    const rawY = (e.clientY - rect.top) / rect.height;
    const x = Math.round(Math.max(0, Math.min(1, rawX)) * 1000) / 1000;
    const y = Math.round(Math.max(0, Math.min(1, rawY)) * 1000) / 1000;

    // Detect closest preset if near
    const nearby = anatomicalPresets.find(
      (p) => Math.abs(p.x - x) < 0.05 && Math.abs(p.y - y) < 0.05
    );

    onPointSelect({
      x,
      y,
      presetName: nearby?.name || `Vùng giải phẫu (${Math.round(x * 100)}%, ${Math.round(y * 100)}%)`,
      layer: activeLayer,
    });
  };

  const handleSelectPreset = (preset) => {
    if (!isInteractive || !onPointSelect) return;
    onPointSelect({
      x: preset.x,
      y: preset.y,
      presetName: preset.name,
      layer: activeLayer,
    });
  };

  const getBackgroundGradient = () => {
    switch (activeLayer) {
      case 'muscular':
        return 'radial-gradient(circle at 50% 45%, #2a0a0d 0%, #120406 50%, #09090b 100%)';
      case 'skeletal':
        return 'radial-gradient(circle at 50% 45%, #07202d 0%, #031018 50%, #09090b 100%)';
      case 'surface':
      default:
        return 'radial-gradient(circle at 50% 45%, #161e2b 0%, #0e141d 50%, #09090b 100%)';
    }
  };

  const activeColorTheme =
    activeLayer === 'muscular' ? '#ff4d4f' : activeLayer === 'skeletal' ? '#13c2c2' : '#faad14';

  const getImageFilter = () => {
    switch (activeLayer) {
      case 'muscular':
        return 'saturate(1.35) contrast(1.15) hue-rotate(-10deg) drop-shadow(0 15px 25px rgba(255, 77, 79, 0.4))';
      case 'skeletal':
        return 'contrast(1.25) brightness(1.08) hue-rotate(160deg) drop-shadow(0 15px 25px rgba(0, 229, 255, 0.45))';
      case 'surface':
      default:
        return 'brightness(1.04) contrast(1.06) drop-shadow(0 20px 30px rgba(0,0,0,0.9))';
    }
  };

  return (
    <Card className="border-0 shadow-lg overflow-hidden text-white rounded-3" style={{ background: '#09090b' }}>
      {/* Top 3D Anatomy Control Bar */}
      <Card.Header className="bg-black bg-opacity-90 py-2 px-3 border-secondary d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div className="d-flex align-items-center gap-2">
          <span className="badge bg-primary-subtle text-primary border border-primary px-2 py-1">
            <i className="bi bi-box-fill me-1"></i> 3D MEDICAL ANATOMY
          </span>
          <span className="fw-bold small text-light">Kiểm tra Y tế Thú y 3D (Phân tích Anatomy Cơ thể Ngựa)</span>
        </div>

        {/* Layer Toggles */}
        <ButtonGroup size="sm">
          <Button
            variant={activeLayer === 'surface' ? 'warning' : 'outline-secondary'}
            onClick={() => setActiveLayer('surface')}
            className="fw-semibold px-3"
          >
            <i className="bi bi-person-standing me-1"></i> 3D Toàn Cảnh (Full View)
          </Button>
          <Button
            variant={activeLayer === 'muscular' ? 'danger' : 'outline-secondary'}
            onClick={() => setActiveLayer('muscular')}
            className="fw-semibold px-3"
          >
            <i className="bi bi-heart-pulse-fill me-1"></i> Cơ Bắp & Cơ Quan (Muscular)
          </Button>
          <Button
            variant={activeLayer === 'skeletal' ? 'info' : 'outline-secondary'}
            onClick={() => setActiveLayer('skeletal')}
            className="fw-semibold px-3"
          >
            <i className="bi bi-diagram-3-fill me-1"></i> Cột Sống & Xương (Skeletal)
          </Button>
        </ButtonGroup>
      </Card.Header>

      {/* Main 3D Canvas Viewport Container */}
      <div
        className="position-relative overflow-hidden d-flex align-items-center justify-content-center user-select-none py-3 px-2"
        style={{
          height,
          background: getBackgroundGradient(),
          cursor: isInteractive ? 'crosshair' : 'default',
          transition: 'background 0.4s ease',
        }}
      >
        {/* Hologram Sci-Fi Grid Overlay */}
        <div
          className="position-absolute w-100 h-100 opacity-15 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(${activeColorTheme} 1px, transparent 1px), linear-gradient(90deg, ${activeColorTheme} 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        ></div>

        {/* 3D Hologram Glow Spotlight Stage underneath the Horse */}
        <div
          className="position-absolute translate-middle pointer-events-none"
          style={{
            left: '50%',
            top: '55%',
            width: '65%',
            height: '45%',
            background: activeColorTheme,
            borderRadius: '50%',
            filter: 'blur(75px)',
            opacity: 0.22,
            transition: 'background 0.4s ease',
          }}
        ></div>

        {/* Scan-line Laser Effect */}
        <div
          className="position-absolute w-100 pointer-events-none"
          style={{
            height: '2px',
            background: `linear-gradient(90deg, transparent, ${activeColorTheme}, transparent)`,
            top: '25%',
            opacity: 0.45,
            filter: 'blur(1px)',
            animation: 'scanline 4s linear infinite',
          }}
        ></div>

        {/* HUD Medical Axis Indicators */}
        <div className="position-absolute top-0 start-0 m-3 text-secondary small opacity-85 pointer-events-none z-3">
          <div className="fw-mono" style={{ fontSize: '0.72rem' }}>
            <span className="text-info">EQUINE 3D MEDICAL SCANNER</span> | LATERAL VIEW
          </div>
          <div className="text-light opacity-75" style={{ fontSize: '0.68rem' }}>
            HỆ THỐNG: <span className="fw-bold" style={{ color: activeColorTheme }}>{activeLayer.toUpperCase()}</span> | GÓC XOAY: Y={rotationY}° X={rotationX}°
          </div>
        </div>

        {/* Inner Frame with EXACT Image Aspect Ratio (1376 / 768) - All Hotspots scale perfectly with Image */}
        <div
          ref={imageFrameRef}
          className="position-relative d-flex align-items-center justify-content-center"
          style={{
            aspectRatio: '1376 / 768',
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: '100%',
            transform: `perspective(900px) rotateY(${rotationY}deg) rotateX(${rotationX}deg)`,
            transformOrigin: '50% 50%',
            transition: 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
          onClick={handleDiagramClick}
        >
          {/* Main Pure Transparent 3D Horse Image */}
          <img
            src={horse3DImg}
            alt="Horse 3D Anatomy Model"
            className="w-100 h-100 object-fit-contain pointer-events-none select-none"
            style={{
              filter: getImageFilter(),
              transition: 'filter 0.4s ease',
            }}
          />

          {/* ANATOMICAL PRESET HOTSPOT NODES OVERLAY (Accurately Pinned on Image Bounds) */}
          {isInteractive &&
            anatomicalPresets.map((preset) => {
              const isHovered = hoveredPreset?.id === preset.id;
              return (
                <div
                  key={preset.id}
                  className="position-absolute translate-middle cursor-pointer"
                  style={{
                    left: `${preset.x * 100}%`,
                    top: `${preset.y * 100}%`,
                    zIndex: 25,
                  }}
                  onMouseEnter={() => setHoveredPreset(preset)}
                  onMouseLeave={() => setHoveredPreset(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectPreset(preset);
                  }}
                >
                  {/* Pulsing Outer Target Halo */}
                  {isHovered && (
                    <div
                      className="position-absolute translate-middle rounded-circle border border-white"
                      style={{
                        width: '32px',
                        height: '32px',
                        left: '50%',
                        top: '50%',
                        boxShadow: `0 0 12px ${activeColorTheme}`,
                        animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
                      }}
                    ></div>
                  )}

                  {/* Pinpoint Indicator Node */}
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center shadow-sm"
                    style={{
                      width: isHovered ? '16px' : '11px',
                      height: isHovered ? '16px' : '11px',
                      backgroundColor: isHovered ? '#ffffff' : activeColorTheme,
                      border: '2px solid #ffffff',
                      boxShadow: `0 0 10px ${activeColorTheme}`,
                      transition: 'all 0.2s ease',
                    }}
                    title={preset.name}
                  ></div>

                  {/* Floating Tag Label on Hover */}
                  {isHovered && (
                    <div
                      className="position-absolute bg-black bg-opacity-90 text-white rounded px-2 py-1 small fw-semibold shadow border border-secondary text-nowrap pointer-events-none"
                      style={{
                        bottom: '120%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: '0.73rem',
                        zIndex: 35,
                      }}
                    >
                      {preset.name}
                    </div>
                  )}
                </div>
              );
            })}

          {/* PULSATING INJURY MARKERS ON THE 3D MODEL */}
          {injuries.map((injury, idx) => {
            const x = injury.coordinates?.x ?? 0.5;
            const y = injury.coordinates?.y ?? 0.5;
            const isSevere = injury.severity === 'severe';
            const isModerate = injury.severity === 'moderate';
            const markerBg = isSevere ? '#dc3545' : isModerate ? '#ffc107' : '#0dcaf0';

            return (
              <div
                key={injury._id || idx}
                className="position-absolute translate-middle"
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  zIndex: 30,
                  cursor: 'pointer',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setHighlightedInjury(injury);
                }}
              >
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center shadow-lg"
                  style={{
                    width: isSevere ? '32px' : '26px',
                    height: isSevere ? '32px' : '26px',
                    backgroundColor: markerBg,
                    border: '3px solid #ffffff',
                    color: isModerate ? '#000' : '#fff',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    boxShadow: `0 0 18px ${markerBg}`,
                  }}
                  title={`${injury.bodyPart} (${injury.severity}) - ${injury.recoveryStatus}`}
                >
                  <i className="bi bi-exclamation-lg"></i>
                </div>
              </div>
            );
          })}

          {/* USER'S CURRENT SELECTED TARGET PIN */}
          {selectedPoint && (
            <div
              className="position-absolute translate-middle pointer-events-none"
              style={{
                left: `${selectedPoint.x * 100}%`,
                top: `${selectedPoint.y * 100}%`,
                zIndex: 40,
              }}
            >
              <div
                className="bg-danger text-white rounded-circle shadow-lg d-flex align-items-center justify-content-center"
                style={{
                  width: '36px',
                  height: '36px',
                  border: '3px solid #ffffff',
                  boxShadow: '0 0 24px #ff4d4f',
                }}
              >
                <i className="bi bi-crosshair fs-5"></i>
              </div>
            </div>
          )}
        </div>

        {/* 3D Rotation Controls Floating Panel */}
        <div
          className="position-absolute bottom-0 end-0 m-3 bg-black bg-opacity-80 p-2 rounded-3 border border-secondary d-flex align-items-center gap-2 z-3"
          onClick={(e) => e.stopPropagation()}
        >
          <small className="text-secondary fw-semibold me-1" style={{ fontSize: '0.75rem' }}>
            <i className="bi bi-arrow-repeat me-1"></i>Góc 3D:
          </small>
          <Button
            variant="outline-light"
            size="sm"
            className="py-0 px-2"
            onClick={() => setRotationY((r) => r - 20)}
            title="Xoay Trái"
          >
            <i className="bi bi-chevron-left"></i>
          </Button>
          <Button
            variant="outline-warning"
            size="sm"
            className="py-0 px-2 fw-semibold"
            style={{ fontSize: '0.75rem' }}
            onClick={() => {
              setRotationY(0);
              setRotationX(0);
            }}
            title="Góc nhìn chuẩn Lateral"
          >
            Mặc Định
          </Button>
          <Button
            variant="outline-light"
            size="sm"
            className="py-0 px-2"
            onClick={() => setRotationY((r) => r + 20)}
            title="Xoay Phải"
          >
            <i className="bi bi-chevron-right"></i>
          </Button>
        </div>
      </div>

      {/* Preset Anatomical Hotspots Selection Bar (for 1-click pinpointing) */}
      {isInteractive && (
        <Card.Body className="bg-black bg-opacity-90 py-2 px-3 border-top border-secondary">
          <div className="d-flex flex-wrap align-items-center gap-1">
            <span className="small text-secondary me-2">
              <i className="bi bi-pin-map me-1 text-primary"></i> Đánh dấu nhanh theo vị trí:
            </span>
            {anatomicalPresets.map((preset) => (
              <Button
                key={preset.id}
                variant="outline-secondary"
                size="sm"
                className="py-0 px-2 border-dark text-light"
                style={{ fontSize: '0.73rem' }}
                onClick={() => handleSelectPreset(preset)}
              >
                {preset.region}
              </Button>
            ))}
          </div>
        </Card.Body>
      )}

      {/* Selected Injury Detail Footer */}
      {highlightedInjury && (
        <Card.Footer className="bg-black bg-opacity-90 py-2 px-3 border-secondary text-white small">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <strong>
                <i className="bi bi-bandaid-fill text-danger me-1"></i> {highlightedInjury.bodyPart}
              </strong>{' '}
              — Mức độ: <Badge bg={highlightedInjury.severity === 'severe' ? 'danger' : 'warning'}>{highlightedInjury.severity}</Badge> | Tiến độ: <Badge bg="info">{highlightedInjury.recoveryStatus}</Badge>
            </div>
            <Button variant="link" size="sm" className="text-secondary p-0" onClick={() => setHighlightedInjury(null)}>
              <i className="bi bi-x-lg"></i>
            </Button>
          </div>
          {highlightedInjury.notes && <div className="text-secondary mt-1">{highlightedInjury.notes}</div>}
        </Card.Footer>
      )}
    </Card>
  );
}
