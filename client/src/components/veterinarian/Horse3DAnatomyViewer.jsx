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
  const [zoom, setZoom] = useState(1);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [highlightedInjury, setHighlightedInjury] = useState(null);
  const [hoveredPreset, setHoveredPreset] = useState(null);

  const containerRef = useRef(null);
  const imageFrameRef = useRef(null);

  // Anatomical presets calibrated precisely on the anatomical horse body (861x1024)
  const anatomicalPresets = [
    { id: 'head_skull', name: 'Đầu & Xương Sọ (Cranium & Skull)', x: 0.12, y: 0.09, region: 'Đầu & Sọ' },
    { id: 'head_jaw', name: 'Xương Hàm & Má (Mandible & Masseter)', x: 0.15, y: 0.15, region: 'Xương hàm' },
    { id: 'poll_cervical', name: 'Gáy & Đốt Sống Cổ (Cervical Vertebrae)', x: 0.28, y: 0.19, region: 'Đốt sống cổ' },
    { id: 'withers_scapula', name: 'Bướu Vai & Bả Vai (Scapula & Withers)', x: 0.44, y: 0.29, region: 'Bả vai' },
    { id: 'spine_dorsi', name: 'Xương Cột Sống (Vertebral Column)', x: 0.58, y: 0.26, region: 'Cột sống' },
    { id: 'heart_lungs', name: 'Khoang Ngực (Tim & Phổi - Thoracic Cavity)', x: 0.53, y: 0.40, region: 'Tim & Phổi' },
    { id: 'digestive', name: 'Bụng & Hệ Tiêu Hóa (Abdominal & Digestive)', x: 0.66, y: 0.47, region: 'Hệ tiêu hóa' },
    { id: 'pelvis_hip', name: 'Xương Chậu & Khớp Hông (Pelvis & Sacrum)', x: 0.77, y: 0.31, region: 'Hông & Khớp chậu' },
    { id: 'musculature_thigh', name: 'Khối Cơ Đùi Sau (Biceps Femoris)', x: 0.84, y: 0.43, region: 'Cơ đùi sau' },
    { id: 'foreleg_knee', name: 'Khớp Gối Trước (Carpus / Knee Joint)', x: 0.40, y: 0.65, region: 'Khớp gối trước' },
    { id: 'foreleg_hoof', name: 'Khớp Bàn & Móng Trước (Hoof & Fetlock)', x: 0.39, y: 0.88, region: 'Móng trước' },
    { id: 'hind_hock', name: 'Khớp Khuỷu Sau (Tarsus / Hock Joint)', x: 0.80, y: 0.67, region: 'Khớp khuỷu sau' },
    { id: 'hind_hoof', name: 'Khớp Bàn & Móng Sau (Hind Hoof)', x: 0.89, y: 0.88, region: 'Móng sau' },
  ];

  // Subtle 2.5D holographic parallax tilt (max ±5 degrees) on mouse move
  const handleMouseMove = (e) => {
    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({
      x: Math.round(-ny * 6 * 10) / 10,
      y: Math.round(nx * 6 * 10) / 10,
    });
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setTilt({ x: 0, y: 0 });
  };

  const handleMouseDown = (e) => {
    if (zoom > 1 && e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDiagramClick = (e) => {
    if (!isInteractive || !onPointSelect || isDragging) return;
    const target = imageFrameRef.current;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / rect.width;
    const rawY = (e.clientY - rect.top) / rect.height;
    const x = Math.round(Math.max(0, Math.min(1, rawX)) * 1000) / 1000;
    const y = Math.round(Math.max(0, Math.min(1, rawY)) * 1000) / 1000;

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

  const resetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setTilt({ x: 0, y: 0 });
  };

  const getBackgroundGradient = () => {
    switch (activeLayer) {
      case 'muscular':
        return 'radial-gradient(circle at 50% 50%, #2a0a0d 0%, #120406 50%, #09090b 100%)';
      case 'skeletal':
        return 'radial-gradient(circle at 50% 50%, #07202d 0%, #031018 50%, #09090b 100%)';
      case 'surface':
      default:
        return 'radial-gradient(circle at 50% 50%, #161e2b 0%, #0e141d 50%, #09090b 100%)';
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
      {/* Top Anatomical Control Bar */}
      <Card.Header className="bg-black bg-opacity-90 py-2 px-3 border-secondary d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div className="d-flex align-items-center gap-2">
          <span className="badge bg-primary-subtle text-primary border border-primary px-2 py-1">
            <i className="bi bi-diagram-3-fill me-1"></i> EQUINE ANATOMY
          </span>
          <span className="fw-bold small text-light">Sơ đồ Giải Phẫu Cơ Thể Ngựa (Lateral View)</span>
        </div>

        {/* Layer Toggles */}
        <ButtonGroup size="sm">
          <Button
            variant={activeLayer === 'surface' ? 'warning' : 'outline-secondary'}
            onClick={() => setActiveLayer('surface')}
            className="fw-semibold px-3"
          >
            <i className="bi bi-eye-fill me-1"></i> Toàn Cảnh
          </Button>
          <Button
            variant={activeLayer === 'muscular' ? 'danger' : 'outline-secondary'}
            onClick={() => setActiveLayer('muscular')}
            className="fw-semibold px-3"
          >
            <i className="bi bi-heart-pulse-fill me-1"></i> Cơ Bắp & Cơ Quan
          </Button>
          <Button
            variant={activeLayer === 'skeletal' ? 'info' : 'outline-secondary'}
            onClick={() => setActiveLayer('skeletal')}
            className="fw-semibold px-3"
          >
            <i className="bi bi-diagram-2-fill me-1"></i> Cột Sống & Xương
          </Button>
        </ButtonGroup>
      </Card.Header>

      {/* Main Medical Canvas Viewport Container */}
      <div
        ref={containerRef}
        className="position-relative overflow-hidden d-flex align-items-center justify-content-center user-select-none"
        style={{
          height,
          background: getBackgroundGradient(),
          cursor: isDragging ? 'grabbing' : isInteractive ? 'crosshair' : 'default',
          transition: 'background 0.4s ease',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {/* Hologram Sci-Fi Grid Overlay */}
        <div
          className="position-absolute w-100 h-100 opacity-15 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(${activeColorTheme} 1px, transparent 1px), linear-gradient(90deg, ${activeColorTheme} 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        ></div>

        {/* Hologram Glow Spotlight Stage underneath the Horse */}
        <div
          className="position-absolute translate-middle pointer-events-none"
          style={{
            left: '50%',
            top: '52%',
            width: '55%',
            height: '42%',
            background: activeColorTheme,
            borderRadius: '50%',
            filter: 'blur(70px)',
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
            opacity: 0.4,
            filter: 'blur(1px)',
            animation: 'scanline 4s linear infinite',
          }}
        ></div>

        {/* HUD Medical Axis Indicators (Floating with Glassmorphic Pill) */}
        <div
          className="position-absolute top-0 start-0 m-3 px-2 py-1 rounded bg-black bg-opacity-75 border border-secondary border-opacity-50 text-secondary small opacity-90 pointer-events-none z-3"
          style={{ backdropFilter: 'blur(6px)' }}
        >
          <div className="fw-mono" style={{ fontSize: '0.72rem' }}>
            <span className="text-info">EQUINE ANATOMY SCANNER</span> | GÓC NHÌN NGHIÊNG
          </div>
          <div className="text-light opacity-85" style={{ fontSize: '0.68rem' }}>
            HỆ THỐNG: <span className="fw-bold" style={{ color: activeColorTheme }}>{activeLayer.toUpperCase()}</span> | THU PHÓNG: <span className="text-warning fw-bold">{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        {/* Inner Frame with 76% Max Bounds - Perfectly Proportional, Well-Framed with Breathing Room */}
        <div
          ref={imageFrameRef}
          className="position-relative d-flex align-items-center justify-content-center"
          style={{
            aspectRatio: '861 / 1024',
            maxWidth: '76%',
            maxHeight: '76%',
            width: 'auto',
            height: '76%',
            transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
            transformOrigin: '50% 50%',
            transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
          onClick={handleDiagramClick}
        >
          {/* Main Pure Transparent Anatomical Horse Image */}
          <img
            src={horse3DImg}
            alt="Horse Anatomy Model"
            className="w-100 h-100 object-fit-contain pointer-events-none select-none"
            style={{
              filter: getImageFilter(),
              transition: 'filter 0.4s ease',
            }}
          />

          {/* ANATOMICAL PRESET HOTSPOT NODES OVERLAY */}
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
                        width: '26px',
                        height: '26px',
                        left: '50%',
                        top: '50%',
                        boxShadow: `0 0 10px ${activeColorTheme}`,
                        animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
                      }}
                    ></div>
                  )}

                  {/* Pinpoint Indicator Node */}
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center shadow-sm"
                    style={{
                      width: isHovered ? '13px' : '9px',
                      height: isHovered ? '13px' : '9px',
                      backgroundColor: isHovered ? '#ffffff' : activeColorTheme,
                      border: '2px solid #ffffff',
                      boxShadow: `0 0 8px ${activeColorTheme}`,
                      transition: 'all 0.15s ease',
                    }}
                    title={preset.name}
                  ></div>

                  {/* Floating Tag Label on Hover */}
                  {isHovered && (
                    <div
                      className="position-absolute bg-black bg-opacity-95 text-white rounded px-2 py-1 small fw-semibold shadow border border-secondary text-nowrap pointer-events-none"
                      style={{
                        bottom: '130%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: '0.73rem',
                        zIndex: 35,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.8)',
                      }}
                    >
                      {preset.name}
                    </div>
                  )}
                </div>
              );
            })}

          {/* PULSATING INJURY MARKERS ON THE MODEL */}
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
                    width: isSevere ? '26px' : '22px',
                    height: isSevere ? '26px' : '22px',
                    backgroundColor: markerBg,
                    border: '2px solid #ffffff',
                    color: isModerate ? '#000' : '#fff',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    boxShadow: `0 0 14px ${markerBg}`,
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
                  width: '28px',
                  height: '28px',
                  border: '2.5px solid #ffffff',
                  boxShadow: '0 0 18px #ff4d4f',
                }}
              >
                <i className="bi bi-crosshair" style={{ fontSize: '14px' }}></i>
              </div>
            </div>
          )}
        </div>

        {/* Medical Zoom & View Controls Floating Panel */}
        <div
          className="position-absolute bottom-0 end-0 m-3 bg-black bg-opacity-80 p-2 rounded-3 border border-secondary d-flex align-items-center gap-2 z-3"
          style={{ backdropFilter: 'blur(6px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <small className="text-secondary fw-semibold me-1" style={{ fontSize: '0.75rem' }}>
            <i className="bi bi-search me-1"></i>Thu phóng:
          </small>
          <Button
            variant="outline-light"
            size="sm"
            className="py-0 px-2"
            disabled={zoom <= 1}
            onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
            title="Thu nhỏ"
          >
            <i className="bi bi-dash"></i>
          </Button>
          <span className="badge bg-dark border border-secondary px-2 py-1 text-light fw-mono" style={{ fontSize: '0.75rem' }}>
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline-light"
            size="sm"
            className="py-0 px-2"
            disabled={zoom >= 2.5}
            onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
            title="Phóng to"
          >
            <i className="bi bi-plus"></i>
          </Button>
          <Button
            variant="outline-warning"
            size="sm"
            className="py-0 px-2 fw-semibold"
            style={{ fontSize: '0.75rem' }}
            onClick={resetView}
            title="Đặt lại khung nhìn"
          >
            <i className="bi bi-arrow-counterclockwise me-1"></i>Đặt lại
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
