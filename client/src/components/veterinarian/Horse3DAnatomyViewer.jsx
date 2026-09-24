import React, { useState } from 'react';
import { Card, Button, Badge, ButtonGroup, Row, Col } from 'react-bootstrap';
import { INJURY_SEVERITY_CONFIG, RECOVERY_STATUS_CONFIG } from '../../utils/healthStatus';

export default function Horse3DAnatomyViewer({
  injuries = [],
  selectedPoint = null,
  onPointSelect,
  isInteractive = true,
  height = '420px',
}) {
  const [activeLayer, setActiveLayer] = useState('muscular'); // 'surface' | 'muscular' | 'skeletal'
  const [rotationY, setRotationY] = useState(0);
  const [rotationX, setRotationX] = useState(0);
  const [highlightedInjury, setHighlightedInjury] = useState(null);
  const [hoveredPreset, setHoveredPreset] = useState(null);

  // Anatomical hotspots presets with calibrated coordinates (normalized 0 to 1)
  const anatomicalPresets = [
    { id: 'head_jaw', name: 'Đầu & Xương Hàm (Cranium & Masseter)', x: 0.14, y: 0.24, region: 'Đầu & Hàm' },
    { id: 'poll_cervical', name: 'Gáy & Cơ Cổ Trên (Splenius & Trapezius)', x: 0.26, y: 0.18, region: 'Cổ trên' },
    { id: 'brachiocephalic', name: 'Cơ Cánh Tay Đầu (Brachiocephalicus)', x: 0.28, y: 0.34, region: 'Cổ dưới' },
    { id: 'withers', name: 'Khối Bướu Vai (Withers / T3-T8)', x: 0.40, y: 0.22, region: 'Bướu vai' },
    { id: 'shoulder_deltoid', name: 'Khớp Bả Vai & Cơ Delta (Scapula / Deltoideus)', x: 0.35, y: 0.36, region: 'Khớp Vai' },
    { id: 'foreleg_knee', name: 'Khớp Gối Trước (Carpus / Knee Joint)', x: 0.37, y: 0.62, region: 'Gối trước' },
    { id: 'foreleg_tendon', name: 'Gân Gấp Sâu & Nông (SDFT / DDFT Tendon)', x: 0.38, y: 0.76, region: 'Gân trước' },
    { id: 'foreleg_fetlock', name: 'Khớp Cổ Chân & Móng Trước (Fetlock & Hoof)', x: 0.39, y: 0.90, region: 'Móng trước' },
    { id: 'spine_dorsi', name: 'Cột Sống & Cơ Lưng Dài (Longissimus Dorsi)', x: 0.54, y: 0.25, region: 'Lưng & Sống' },
    { id: 'ribcage_flank', name: 'Lồng Ngực & Cơ Bụng (Costal Ribs & Oblique)', x: 0.53, y: 0.44, region: 'Lồng ngực' },
    { id: 'croup_gluteal', name: 'Khối Cơ Mông & Khớp Hông (Gluteus & Sacrum)', x: 0.74, y: 0.25, region: 'Mông & Hông' },
    { id: 'stifle_patella', name: 'Khớp Bánh Chè / Đầu Gối Sau (Stifle / Patella)', x: 0.68, y: 0.48, region: 'Đầu gối sau' },
    { id: 'gaskin_biceps', name: 'Cơ Bắp Chân & Đùi Sau (Biceps Femoris / Gaskin)', x: 0.76, y: 0.46, region: 'Cơ đùi sau' },
    { id: 'hock_tarsus', name: 'Khớp Khuỷu Chân Sau (Hock / Tarsus Joint)', x: 0.78, y: 0.65, region: 'Khớp Hock' },
    { id: 'hind_tendon', name: 'Gân Gót & Dây Chằng Treo Sau (Hind Suspensory)', x: 0.77, y: 0.78, region: 'Gân sau' },
    { id: 'hind_hoof', name: 'Khớp Cổ Chân & Móng Sau (Hind Fetlock & Hoof)', x: 0.77, y: 0.90, region: 'Móng sau' },
  ];

  const handleDiagramClick = (e) => {
    if (!isInteractive || !onPointSelect) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100) / 100;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100) / 100;

    // Detect closest preset if near
    const nearby = anatomicalPresets.find(
      (p) => Math.abs(p.x - x) < 0.06 && Math.abs(p.y - y) < 0.06
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
        return 'radial-gradient(circle at 50% 45%, #2a080c 0%, #170406 50%, #080102 100%)';
      case 'skeletal':
        return 'radial-gradient(circle at 50% 45%, #051a28 0%, #03101b 50%, #01060a 100%)';
      case 'surface':
      default:
        return 'radial-gradient(circle at 50% 45%, #181d28 0%, #0e1118 50%, #050608 100%)';
    }
  };

  const activeColorTheme =
    activeLayer === 'muscular' ? '#ff4d4f' : activeLayer === 'skeletal' ? '#13c2c2' : '#faad14';

  return (
    <Card className="border-0 shadow-lg overflow-hidden bg-dark text-white rounded-3">
      {/* Top 3D Anatomy Control Bar */}
      <Card.Header className="bg-black bg-opacity-80 py-2 px-3 border-secondary d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div className="d-flex align-items-center gap-2">
          <span className="badge bg-primary-subtle text-primary border border-primary px-2 py-1">
            <i className="bi bi-box-fill me-1"></i> 3D MEDICAL ANATOMY
          </span>
          <span className="fw-bold small text-light">Mô hình Giải phẫu Ngựa Thuần chủng (Equine 3D Viewer)</span>
        </div>

        {/* Layer Toggles */}
        <ButtonGroup size="sm">
          <Button
            variant={activeLayer === 'surface' ? 'warning' : 'outline-secondary'}
            onClick={() => setActiveLayer('surface')}
            className="fw-semibold px-3"
          >
            <i className="bi bi-person-standing me-1"></i> Ngoại Hình (Surface)
          </Button>
          <Button
            variant={activeLayer === 'muscular' ? 'danger' : 'outline-secondary'}
            onClick={() => setActiveLayer('muscular')}
            className="fw-semibold px-3"
          >
            <i className="bi bi-heart-pulse-fill me-1"></i> Hệ Cơ Bắp (Muscular)
          </Button>
          <Button
            variant={activeLayer === 'skeletal' ? 'info' : 'outline-secondary'}
            onClick={() => setActiveLayer('skeletal')}
            className="fw-semibold px-3"
          >
            <i className="bi bi-diagram-3-fill me-1"></i> Khung Xương (Skeletal)
          </Button>
        </ButtonGroup>
      </Card.Header>

      {/* Main 3D Canvas Viewport */}
      <div
        className="position-relative overflow-hidden d-flex align-items-center justify-content-center user-select-none"
        style={{
          height,
          background: getBackgroundGradient(),
          cursor: isInteractive ? 'crosshair' : 'default',
          transition: 'background 0.4s ease',
        }}
        onClick={handleDiagramClick}
      >
        {/* Hologram Sci-Fi Grid Overlay */}
        <div
          className="position-absolute w-100 h-100 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(${activeColorTheme} 1px, transparent 1px), linear-gradient(90deg, ${activeColorTheme} 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        ></div>

        {/* Scan-line Laser Effect */}
        <div
          className="position-absolute w-100 pointer-events-none"
          style={{
            height: '2px',
            background: `linear-gradient(90deg, transparent, ${activeColorTheme}, transparent)`,
            top: '20%',
            opacity: 0.5,
            filter: 'blur(1px)',
            animation: 'scanline 4s linear infinite',
          }}
        ></div>

        {/* HUD Medical Axis Indicators */}
        <div className="position-absolute top-0 start-0 m-3 text-secondary small opacity-85 pointer-events-none">
          <div className="fw-mono" style={{ fontSize: '0.72rem' }}>
            <span className="text-info">EQUINE 3D PROJECTION</span> | LATERAL VIEW
          </div>
          <div className="text-light opacity-75" style={{ fontSize: '0.68rem' }}>
            HỆ THỐNG: <span className="fw-bold" style={{ color: activeColorTheme }}>{activeLayer.toUpperCase()}</span> | GÓC XOAY: Y={rotationY}° X={rotationX}°
          </div>
        </div>

        {/* High-Definition 3D Anatomical Horse Illustration */}
        <div
          className="position-relative d-flex align-items-center justify-content-center"
          style={{
            width: '94%',
            maxWidth: '680px',
            height: '90%',
            transform: `perspective(900px) rotateY(${rotationY}deg) rotateX(${rotationX}deg)`,
            transition: 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
            filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.85))',
          }}
        >
          <svg
            viewBox="0 0 1000 650"
            className="w-100 h-100"
            style={{ overflow: 'visible' }}
          >
            <defs>
              {/* Gradients for Muscular Layer */}
              <radialGradient id="muscleBodyGrad" cx="50%" cy="40%" r="65%">
                <stop offset="0%" stopColor="#e53935" />
                <stop offset="35%" stopColor="#b71c1c" />
                <stop offset="70%" stopColor="#670810" />
                <stop offset="100%" stopColor="#2c0307" />
              </radialGradient>

              <linearGradient id="muscleHighlightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff8a80" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#d32f2f" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#7f0000" stopOpacity="0.1" />
              </linearGradient>

              <linearGradient id="tendonGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffeb3b" />
                <stop offset="50%" stopColor="#ffd600" />
                <stop offset="100%" stopColor="#ff6f00" />
              </linearGradient>

              {/* Gradients for Skeletal Layer */}
              <radialGradient id="skeletalBoneGrad" cx="40%" cy="40%" r="70%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="30%" stopColor="#e0f7fa" />
                <stop offset="70%" stopColor="#00838f" />
                <stop offset="100%" stopColor="#00363a" />
              </radialGradient>

              <radialGradient id="jointGlowGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#00e5ff" stopOpacity="1" />
                <stop offset="60%" stopColor="#00b0ff" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#004d40" stopOpacity="0" />
              </radialGradient>

              {/* Gradients for Surface Layer */}
              <radialGradient id="surfaceBodyGrad" cx="45%" cy="35%" r="75%">
                <stop offset="0%" stopColor="#455a64" />
                <stop offset="40%" stopColor="#263238" />
                <stop offset="75%" stopColor="#102027" />
                <stop offset="100%" stopColor="#050b0e" />
              </radialGradient>

              <linearGradient id="glossGrad" x1="0%" y1="0%" x2="100%" y2="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
                <stop offset="40%" stopColor="#90a4ae" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </linearGradient>

              {/* Glow Filter */}
              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* ======================================================== */}
            {/* REALISTIC EQUINE SILHOUETTE & ANATOMY                    */}
            {/* ======================================================== */}

            {/* Offside (Far Side) Legs for Realistic 3D Depth */}
            <g opacity="0.45">
              {/* Offside Front Leg */}
              <path
                d="M 335,360 L 330,450 L 325,470 L 322,545 L 315,580 L 338,580 L 342,545 L 345,470 L 350,450 Z"
                fill={activeLayer === 'muscular' ? '#60060d' : activeLayer === 'skeletal' ? '#00363a' : '#0a1218'}
                stroke={activeLayer === 'muscular' ? '#b71c1c' : activeLayer === 'skeletal' ? '#00838f' : '#37474f'}
                strokeWidth="1.5"
              />
              {/* Offside Hind Leg */}
              <path
                d="M 710,360 L 690,430 L 715,480 L 705,545 L 698,580 L 720,580 L 725,545 L 732,480 Z"
                fill={activeLayer === 'muscular' ? '#60060d' : activeLayer === 'skeletal' ? '#00363a' : '#0a1218'}
                stroke={activeLayer === 'muscular' ? '#b71c1c' : activeLayer === 'skeletal' ? '#00838f' : '#37474f'}
                strokeWidth="1.5"
              />
            </g>

            {/* Main Nearside Thoroughbred Horse Body Silhouette */}
            <path
              d="
                M 110,190
                C 105,175 120,155 145,140
                C 160,130 175,115 185,90
                C 188,75 192,60 200,60
                C 205,60 202,75 205,88
                C 210,70 218,65 225,75
                C 220,90 218,105 222,118
                C 245,120 300,135 360,160
                C 380,170 390,195 405,200
                C 440,208 480,218 530,220
                C 590,222 650,210 710,200
                C 750,195 780,210 800,235
                C 820,260 825,290 815,325
                C 805,360 790,400 775,435
                C 770,450 778,465 775,480
                L 765,545
                L 772,555
                L 768,580
                L 738,580
                L 745,555
                L 742,545
                L 745,470
                C 735,450 710,420 680,400
                C 670,390 650,395 630,390
                C 560,385 490,395 440,370
                C 425,365 405,385 395,420
                C 388,445 382,460 385,475
                L 385,545
                L 392,555
                L 388,580
                L 358,580
                L 365,555
                L 362,545
                L 362,475
                C 355,455 355,420 340,385
                C 320,360 280,325 245,295
                C 215,270 180,245 155,240
                C 130,235 115,220 110,190 Z
              "
              fill={
                activeLayer === 'muscular'
                  ? 'url(#muscleBodyGrad)'
                  : activeLayer === 'skeletal'
                  ? 'url(#skeletalBoneGrad)'
                  : 'url(#surfaceBodyGrad)'
              }
              stroke={
                activeLayer === 'muscular'
                  ? '#ff4d4f'
                  : activeLayer === 'skeletal'
                  ? '#00e5ff'
                  : '#78909c'
              }
              strokeWidth="2.5"
              filter="url(#neonGlow)"
            />

            {/* Horse Facial Features (Eye, Nostril, Jawline) */}
            <circle cx="152" cy="148" r="4.5" fill={activeLayer === 'skeletal' ? '#00e5ff' : '#000'} stroke="#fff" strokeWidth="1" />
            <ellipse cx="118" cy="182" rx="3.5" ry="6" transform="rotate(-25 118 182)" fill="#000" opacity="0.75" />
            <path d="M 140,205 Q 165,225 190,215" stroke="#ffffff" strokeWidth="1" strokeDasharray="3,3" fill="none" opacity="0.5" />

            {/* ======================================================== */}
            {/* LAYER 1: ANATOMICAL MUSCULAR SYSTEM                     */}
            {/* ======================================================== */}
            {activeLayer === 'muscular' && (
              <g>
                {/* Head & Jowl Muscles (Masseter & Nasolabial) */}
                <path d="M 130,165 Q 158,195 185,188 Q 170,160 150,150 Z" fill="url(#muscleHighlightGrad)" stroke="#ff7875" strokeWidth="1.5" />
                <circle cx="168" cy="182" r="14" fill="#ff4d4f" fillOpacity="0.45" stroke="#ff7875" strokeWidth="1.2" />

                {/* Splenius & Cervical Rhomboideus (Upper Neck Crest) */}
                <path d="M 215,100 C 265,115 325,135 375,160 C 345,200 285,190 230,155 Z" fill="#d32f2f" fillOpacity="0.65" stroke="#ff9c6e" strokeWidth="1.8" />
                <path d="M 235,115 Q 290,132 355,158" stroke="#ffbb96" strokeWidth="1.2" strokeDasharray="5,3" fill="none" />

                {/* Brachiocephalicus & Sternocephalicus (Lower Neck) */}
                <path d="M 195,190 C 235,220 280,255 315,295 C 280,285 240,245 195,212 Z" fill="#c62828" fillOpacity="0.7" stroke="#ff7875" strokeWidth="1.6" />

                {/* Scapula & Deltoid & Triceps Group (Shoulder) */}
                <ellipse cx="340" cy="245" rx="42" ry="55" transform="rotate(-20 340 245)" fill="#e53935" fillOpacity="0.65" stroke="#ff7875" strokeWidth="2" />
                <ellipse cx="355" cy="275" rx="28" ry="38" transform="rotate(15 355 275)" fill="#b71c1c" fillOpacity="0.8" stroke="#ffa39e" strokeWidth="1.5" />

                {/* Longissimus Dorsi & Spinalis (Back & Spine Muscle) */}
                <path d="M 390,185 C 460,198 560,205 670,215 C 660,245 550,245 430,230 Z" fill="#e53935" fillOpacity="0.75" stroke="#ffa39e" strokeWidth="2" />

                {/* External Abdominal Oblique & Latissimus (Ribs & Flank) */}
                <path d="M 435,238 C 540,252 630,252 675,278 C 650,355 560,385 450,350 Z" fill="#c62828" fillOpacity="0.6" stroke="#ff7875" strokeWidth="1.8" />

                {/* Gluteus Medius & Superficialis (Croup & Rump) */}
                <ellipse cx="730" cy="240" rx="60" ry="45" transform="rotate(-15 730 240)" fill="#e53935" fillOpacity="0.8" stroke="#ffa39e" strokeWidth="2.2" />

                {/* Biceps Femoris & Semitendinosus (Thigh & Stifle & Hamstring) */}
                <path d="M 715,275 C 795,300 805,375 785,445 C 755,435 730,385 695,345 Z" fill="#b71c1c" fillOpacity="0.85" stroke="#ff7875" strokeWidth="2" />

                {/* Gastrocnemius & Gaskin Muscle */}
                <ellipse cx="760" cy="440" rx="22" ry="42" transform="rotate(20 760 440)" fill="#d32f2f" fillOpacity="0.75" stroke="#ff9c6e" strokeWidth="1.8" />

                {/* High-Performance Equine Tendons & Ligaments (Glowing Gold) */}
                <path d="M 380,365 L 390,460 L 388,565" stroke="url(#tendonGrad)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                <path d="M 760,470 L 780,525 L 775,568" stroke="url(#tendonGrad)" strokeWidth="3.8" strokeLinecap="round" fill="none" />

                {/* Hoof Anchors */}
                <polygon points="358,565 390,565 385,580 355,580" fill="#424242" stroke="#ff4d4f" strokeWidth="1.5" />
                <polygon points="738,565 770,565 765,580 735,580" fill="#424242" stroke="#ff4d4f" strokeWidth="1.5" />
              </g>
            )}

            {/* ======================================================== */}
            {/* LAYER 2: HIGH-TECH SKELETAL X-RAY SYSTEM                 */}
            {/* ======================================================== */}
            {activeLayer === 'skeletal' && (
              <g stroke="#ffffff" fill="none">
                {/* Skull & Mandible */}
                <path d="M 115,185 C 122,165 145,145 170,140 C 190,140 205,160 190,185 C 170,205 135,210 115,185 Z" fill="#00838f" fillOpacity="0.4" stroke="#80deea" strokeWidth="2.5" />
                <circle cx="152" cy="152" r="7" fill="#00e5ff" />
                <path d="M 130,200 Q 160,205 182,190" stroke="#ffffff" strokeWidth="2" />

                {/* Cervical Vertebrae (Neck C1-C7 Spine) */}
                <path d="M 185,150 C 225,165 285,200 335,235" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeDasharray="14,4" />

                {/* Scapula & Foreleg Bones */}
                <polygon points="350,180 380,200 335,270 315,245" fill="#00acc1" fillOpacity="0.45" stroke="#e0f7fa" strokeWidth="2.5" />
                <line x1="335" y1="265" x2="365" y2="350" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />
                <line x1="365" y1="350" x2="378" y2="440" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
                <rect x="370" y="440" width="16" height="18" rx="4" fill="#00e5ff" stroke="#ffffff" strokeWidth="2" />
                <line x1="378" y1="458" x2="380" y2="530" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" />
                <polygon points="358,565 390,565 385,580 355,580" fill="#006064" stroke="#00e5ff" strokeWidth="2" />

                {/* Spine & Ribs */}
                <path d="M 335,235 Q 515,195 695,235" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeDasharray="16,4" />
                <g stroke="#4dd0e1" strokeWidth="2.4" opacity="0.85">
                  <path d="M 380,205 C 395,255 405,305 415,330" />
                  <path d="M 415,205 C 430,260 440,310 450,340" />
                  <path d="M 450,205 C 465,265 475,315 485,345" />
                  <path d="M 485,207 C 500,265 510,315 520,347" />
                  <path d="M 520,210 C 535,265 545,315 555,347" />
                  <path d="M 555,215 C 570,265 580,310 590,340" />
                  <path d="M 590,220 C 605,265 615,305 625,333" />
                </g>

                {/* Pelvis, Femur, Tibia & Hindleg Bones */}
                <polygon points="670,225 725,215 750,265 695,280" fill="#00838f" fillOpacity="0.5" stroke="#ffffff" strokeWidth="3" />
                <line x1="705" y1="270" x2="680" y2="375" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
                <circle cx="680" cy="375" r="11" fill="url(#jointGlowGrad)" stroke="#00e5ff" strokeWidth="2.5" />
                <line x1="680" y1="375" x2="755" y2="460" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />
                <rect x="748" y="460" width="18" height="20" rx="4" fill="#00e5ff" stroke="#ffffff" strokeWidth="2" />
                <line x1="758" y1="480" x2="764" y2="535" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" />
                <polygon points="738,565 770,565 765,580 735,580" fill="#006064" stroke="#00e5ff" strokeWidth="2" />

                {/* Articular Joint Nodes Glow */}
                <circle cx="335" cy="265" r="8" fill="#00e5ff" />
                <circle cx="365" cy="350" r="9" fill="#00e5ff" />
                <circle cx="370" cy="445" r="7" fill="#00e5ff" />
                <circle cx="705" cy="270" r="9" fill="#00e5ff" />
                <circle cx="755" cy="465" r="8" fill="#00e5ff" />
              </g>
            )}

            {/* ======================================================== */}
            {/* LAYER 3: SURFACE COAT, ATHLETIC CONTOUR & MANE/TAIL      */}
            {/* ======================================================== */}
            {activeLayer === 'surface' && (
              <g>
                {/* Surface Body Gloss Lighting */}
                <path
                  d="M 220,135 C 310,145 440,165 640,180 C 610,235 470,235 320,215 Z"
                  fill="url(#glossGrad)"
                />

                {/* Athletic Muscle Tone Contours */}
                <g stroke="#90a4ae" strokeWidth="1.5" fill="none" opacity="0.65">
                  <path d="M 210,145 Q 250,205 280,260" />
                  <path d="M 320,215 Q 360,265 370,335" />
                  <path d="M 420,215 Q 530,235 640,225" />
                  <path d="M 650,245 Q 710,305 730,385" />
                </g>

                {/* Racing Mane (Bờm Ngựa Đua) */}
                <path
                  d="
                    M 200,60
                    C 215,80 205,100 225,90
                    C 240,110 235,130 260,115
                    C 280,140 275,155 305,135
                    C 325,160 330,170 360,150
                    C 380,165 390,155 405,125
                    C 365,115 295,95 200,60 Z
                  "
                  fill="#ffc107"
                  fillOpacity="0.85"
                  stroke="#ffe082"
                  strokeWidth="1.5"
                />

                {/* Flowing Tail (Đuôi Ngựa) */}
                <path
                  d="
                    M 800,235
                    C 840,260 875,310 885,380
                    C 895,450 880,520 860,580
                    C 850,605 840,620 830,625
                    C 840,580 845,520 835,460
                    C 825,400 810,350 800,300
                    C 795,270 797,250 800,235 Z
                  "
                  fill="#ffc107"
                  fillOpacity="0.8"
                  stroke="#ffe082"
                  strokeWidth="1.8"
                />

                {/* Leather Halter & Bridle Accent */}
                <path d="M 120,150 L 148,220" stroke="#fa8c16" strokeWidth="2.5" fill="none" opacity="0.85" />
                <path d="M 125,180 L 190,170" stroke="#fa8c16" strokeWidth="2" fill="none" opacity="0.85" />
                <circle cx="148" cy="180" r="4" fill="#ffd591" stroke="#d4380d" strokeWidth="1.5" />
              </g>
            )}

            {/* ======================================================== */}
            {/* ANATOMICAL PRESET HOTSPOT NODES                          */}
            {/* ======================================================== */}
            {isInteractive &&
              anatomicalPresets.map((preset) => {
                const isHovered = hoveredPreset?.id === preset.id;
                return (
                  <g
                    key={preset.id}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPreset(preset)}
                    onMouseLeave={() => setHoveredPreset(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectPreset(preset);
                    }}
                  >
                    {/* Pulsing Target Halo on Hover */}
                    {isHovered && (
                      <circle
                        cx={preset.x * 1000}
                        cy={preset.y * 650}
                        r={20}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="1.8"
                        strokeDasharray="4,3"
                      />
                    )}
                    {/* Center Pin Node */}
                    <circle
                      cx={preset.x * 1000}
                      cy={preset.y * 650}
                      r={isHovered ? 10 : 5.5}
                      fill={isHovered ? '#ffffff' : activeColorTheme}
                      fillOpacity={isHovered ? 1 : 0.75}
                      stroke="#ffffff"
                      strokeWidth={isHovered ? 2.5 : 1.2}
                      style={{ transition: 'all 0.2s ease' }}
                    />
                  </g>
                );
              })}
          </svg>

          {/* PULSATING INJURY MARKERS ON 3D MODEL */}
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
                    boxShadow: `0 0 16px ${markerBg}`,
                  }}
                  title={`${injury.bodyPart} (${injury.severity}) - ${injury.recoveryStatus}`}
                >
                  <i className="bi bi-exclamation-lg"></i>
                </div>
              </div>
            );
          })}

          {/* USER'S SELECTED TARGET PIN */}
          {selectedPoint && (
            <div
              className="position-absolute translate-middle"
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
                  boxShadow: '0 0 22px #ff4d4f',
                }}
              >
                <i className="bi bi-crosshair fs-5"></i>
              </div>
            </div>
          )}
        </div>

        {/* 3D Rotation Controls Floating Panel */}
        <div
          className="position-absolute bottom-0 end-0 m-3 bg-black bg-opacity-80 p-2 rounded-3 border border-secondary d-flex align-items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <small className="text-secondary fw-semibold me-1" style={{ fontSize: '0.75rem' }}>
            <i className="bi bi-arrow-repeat me-1"></i>Xoay 3D:
          </small>
          <Button
            variant="outline-light"
            size="sm"
            className="py-0 px-2"
            onClick={() => setRotationY((r) => r - 25)}
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
            onClick={() => setRotationY((r) => r + 25)}
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
              <i className="bi bi-pin-map me-1 text-primary"></i> Vị trí giải phẫu nhanh:
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

