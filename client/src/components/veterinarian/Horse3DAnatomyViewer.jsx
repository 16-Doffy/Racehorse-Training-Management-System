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
            {/* BASE ELEGANT THOROUGHBRED SILHOUETTE                     */}
            {/* ======================================================== */}
            <path
              d="
                M 120,200
                C 110,185 115,160 135,150
                C 145,145 155,130 155,110
                C 155,100 165,95 170,105
                C 172,118 175,130 185,120
                C 192,102 200,95 208,105
                C 210,118 215,135 230,135
                C 270,130 330,140 375,150
                C 390,154 405,142 420,150
                C 440,160 480,168 530,172
                C 600,178 660,170 710,175
                C 750,180 770,200 780,225
                C 790,250 785,280 780,310
                C 775,340 765,370 780,410
                C 790,435 800,470 800,500
                C 798,530 790,560 785,580
                C 783,590 770,592 760,590
                C 752,588 750,578 752,560
                C 756,530 755,490 740,460
                C 730,440 720,400 705,370
                C 670,385 620,395 560,390
                C 510,385 460,370 430,350
                C 415,380 405,420 395,470
                C 390,495 388,530 390,560
                C 391,585 385,592 375,592
                C 365,592 360,585 362,565
                C 365,530 365,490 355,450
                C 345,410 330,370 315,340
                C 285,345 260,325 240,295
                C 215,260 195,245 165,240
                C 140,235 125,225 120,200 Z
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

            {/* ======================================================== */}
            {/* LAYER 1: ANATOMICAL MUSCULAR SYSTEM                     */}
            {/* ======================================================== */}
            {activeLayer === 'muscular' && (
              <g>
                {/* Head & Jowl Muscles */}
                <path d="M 135,160 Q 155,185 185,185 Q 170,160 150,150 Z" fill="url(#muscleHighlightGrad)" stroke="#ff7875" strokeWidth="1.5" />
                <circle cx="170" cy="180" r="16" fill="#ff4d4f" fillOpacity="0.4" stroke="#ff7875" strokeWidth="1.2" />

                {/* Splenius & Cervical Rhomboideus (Upper Neck) */}
                <path d="M 205,120 C 260,130 320,140 370,155 C 340,195 290,190 230,165 Z" fill="#d32f2f" fillOpacity="0.6" stroke="#ff9c6e" strokeWidth="1.8" />
                <path d="M 230,135 Q 290,150 345,170" stroke="#ffbb96" strokeWidth="1.2" strokeDasharray="5,3" fill="none" />
                <path d="M 250,145 Q 305,160 355,182" stroke="#ffbb96" strokeWidth="1.2" strokeDasharray="5,3" fill="none" />

                {/* Brachiocephalicus & Sternocephalicus (Lower Neck) */}
                <path d="M 185,200 C 230,230 280,270 310,310 C 275,305 240,260 195,225 Z" fill="#c62828" fillOpacity="0.7" stroke="#ff7875" strokeWidth="1.6" />
                <path d="M 210,215 Q 255,255 290,295" stroke="#ffbb96" strokeWidth="1.2" strokeDasharray="4,4" fill="none" />

                {/* Scapula & Deltoid & Triceps Group (Shoulder) */}
                <ellipse cx="340" cy="245" rx="42" ry="55" transform="rotate(-20 340 245)" fill="#e53935" fillOpacity="0.65" stroke="#ff7875" strokeWidth="2" />
                <ellipse cx="355" cy="275" rx="28" ry="38" transform="rotate(15 355 275)" fill="#b71c1c" fillOpacity="0.8" stroke="#ffa39e" strokeWidth="1.5" />
                <path d="M 320,215 C 345,260 365,300 375,345" stroke="#ffccc7" strokeWidth="2" fill="none" />

                {/* Pectoralis Profundus (Chest) */}
                <path d="M 310,320 C 330,350 360,365 385,360 C 365,335 340,315 310,320 Z" fill="#b71c1c" fillOpacity="0.85" stroke="#ff7875" strokeWidth="1.5" />

                {/* Longissimus Dorsi & Spinalis (Back & Spine Muscle) */}
                <path d="M 380,165 C 450,175 560,180 670,195 C 660,225 550,225 430,210 Z" fill="#e53935" fillOpacity="0.75" stroke="#ffa39e" strokeWidth="2" />
                <path d="M 400,185 Q 525,195 650,205" stroke="#fff1f0" strokeWidth="1.5" strokeDasharray="6,4" fill="none" />
                <path d="M 420,198 Q 535,210 645,218" stroke="#fff1f0" strokeWidth="1.5" strokeDasharray="6,4" fill="none" />

                {/* External Abdominal Oblique & Latissimus (Ribs & Flank) */}
                <path d="M 425,220 C 530,235 620,235 665,260 C 640,335 550,365 440,330 Z" fill="#c62828" fillOpacity="0.6" stroke="#ff7875" strokeWidth="1.8" />
                <path d="M 450,240 C 480,275 500,310 515,340" stroke="#ffccc7" strokeWidth="1.4" fill="none" />
                <path d="M 485,240 C 515,275 535,310 550,340" stroke="#ffccc7" strokeWidth="1.4" fill="none" />
                <path d="M 520,240 C 550,275 570,310 585,335" stroke="#ffccc7" strokeWidth="1.4" fill="none" />
                <path d="M 555,242 C 585,275 605,305 618,325" stroke="#ffccc7" strokeWidth="1.4" fill="none" />

                {/* Gluteus Medius & Superficialis (Croup & Rump) */}
                <ellipse cx="690" cy="225" rx="65" ry="48" transform="rotate(-15 690 225)" fill="#e53935" fillOpacity="0.8" stroke="#ffa39e" strokeWidth="2.2" />
                <path d="M 645,205 C 690,230 730,265 745,315" stroke="#fff1f0" strokeWidth="2" fill="none" />

                {/* Biceps Femoris & Semitendinosus (Thigh & Stifle & Hamstring) */}
                <path d="M 685,260 C 765,285 780,360 760,430 C 730,420 705,370 670,330 Z" fill="#b71c1c" fillOpacity="0.85" stroke="#ff7875" strokeWidth="2" />
                <path d="M 700,285 C 740,335 750,385 750,425" stroke="#ffccc7" strokeWidth="1.6" fill="none" />

                {/* Gastrocnemius & Gaskin Muscle */}
                <ellipse cx="735" cy="425" rx="24" ry="45" transform="rotate(20 735 425)" fill="#d32f2f" fillOpacity="0.75" stroke="#ff9c6e" strokeWidth="1.8" />

                {/* High-Performance Equine Tendons & Ligaments (Glowing Gold) */}
                {/* Forelimb Extensor / Flexor Tendons */}
                <path d="M 365,345 L 380,455 L 382,570" stroke="url(#tendonGrad)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                <path d="M 355,360 L 368,460 L 368,570" stroke="#fff566" strokeWidth="2" strokeDasharray="3,3" fill="none" />

                {/* Hindlimb Common Digital Extensor & Deep Flexor Tendons */}
                <path d="M 740,460 L 768,520 L 766,575" stroke="url(#tendonGrad)" strokeWidth="3.8" strokeLinecap="round" fill="none" />
                <path d="M 720,440 L 752,520 L 750,575" stroke="#fff566" strokeWidth="2" strokeDasharray="3,3" fill="none" />

                {/* Hoof Anchors */}
                <polygon points="360,572 388,572 385,592 355,592" fill="#424242" stroke="#ff4d4f" strokeWidth="1.5" />
                <polygon points="748,572 778,572 775,590 745,590" fill="#424242" stroke="#ff4d4f" strokeWidth="1.5" />
              </g>
            )}

            {/* ======================================================== */}
            {/* LAYER 2: HIGH-TECH SKELETAL X-RAY SYSTEM                 */}
            {/* ======================================================== */}
            {activeLayer === 'skeletal' && (
              <g stroke="#ffffff" fill="none">
                {/* Skull & Mandible */}
                <path d="M 125,185 C 130,160 150,140 180,140 C 205,140 215,160 200,185 C 180,205 145,210 125,185 Z" fill="#00838f" fillOpacity="0.4" stroke="#80deea" strokeWidth="2.5" />
                <circle cx="165" cy="155" r="7" fill="#00e5ff" /> {/* Orbit / Eye Socket */}
                <path d="M 140,195 Q 175,200 195,185" stroke="#ffffff" strokeWidth="2" /> {/* Mandible */}

                {/* Cervical Vertebrae (Neck C1-C7 Spine) */}
                <path d="M 195,150 C 235,165 295,200 340,240" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeDasharray="14,4" />

                {/* Scapula (Shoulder Blade) */}
                <polygon points="360,185 390,205 345,275 325,250" fill="#00acc1" fillOpacity="0.45" stroke="#e0f7fa" strokeWidth="2.5" />

                {/* Humerus & Radius / Ulna (Foreleg Upper Bones) */}
                <line x1="345" y1="270" x2="375" y2="355" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />
                <line x1="375" y1="355" x2="380" y2="455" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />

                {/* Carpal Bones (Front Knee Joint) */}
                <rect x="372" y="455" width="16" height="18" rx="4" fill="#00e5ff" stroke="#ffffff" strokeWidth="2" />

                {/* Metacarpus (Front Cannon Bone & Pastern) */}
                <line x1="380" y1="473" x2="382" y2="545" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" />
                <line x1="382" y1="545" x2="378" y2="575" stroke="#80deea" strokeWidth="4" />
                <polygon points="365,575 390,575 385,592 360,592" fill="#006064" stroke="#00e5ff" strokeWidth="2" />

                {/* Thoracic & Lumbar Spine (T1-T18 & L1-L6) */}
                <path d="M 340,240 Q 520,200 700,245" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeDasharray="16,4" />

                {/* Ribcage Structure (18 Equine Costal Ribs) */}
                <g stroke="#4dd0e1" strokeWidth="2.4" opacity="0.85">
                  <path d="M 390,210 C 405,260 415,310 425,335" />
                  <path d="M 425,210 C 440,265 450,315 460,345" />
                  <path d="M 460,210 C 475,270 485,320 495,350" />
                  <path d="M 495,212 C 510,270 520,320 530,352" />
                  <path d="M 530,215 C 545,270 555,320 565,352" />
                  <path d="M 565,220 C 580,270 590,315 600,345" />
                  <path d="M 600,225 C 615,270 625,310 635,338" />
                  <path d="M 635,232 C 648,270 655,305 665,328" />
                </g>

                {/* Pelvis / Ilium / Sacrum */}
                <polygon points="675,230 730,220 755,270 700,285" fill="#00838f" fillOpacity="0.5" stroke="#ffffff" strokeWidth="3" />

                {/* Femur (Thigh Bone) */}
                <line x1="710" y1="275" x2="685" y2="380" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />

                {/* Stifle Joint & Patella (Glowing Neon Node) */}
                <circle cx="685" cy="380" r="11" fill="url(#jointGlowGrad)" stroke="#00e5ff" strokeWidth="2.5" />

                {/* Tibia & Fibula (Gaskin Bone) */}
                <line x1="685" y1="380" x2="755" y2="470" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />

                {/* Hock / Tarsus Joint (Calcaneus Node) */}
                <rect x="748" y="470" width="18" height="20" rx="4" fill="#00e5ff" stroke="#ffffff" strokeWidth="2" />

                {/* Metatarsus (Hind Cannon Bone & Phalanges) */}
                <line x1="758" y1="490" x2="766" y2="550" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" />
                <line x1="766" y1="550" x2="764" y2="575" stroke="#80deea" strokeWidth="4" />
                <polygon points="750,575 778,575 775,590 745,590" fill="#006064" stroke="#00e5ff" strokeWidth="2" />

                {/* Articular Joint Nodes Glow */}
                <circle cx="345" cy="270" r="8" fill="#00e5ff" />
                <circle cx="375" cy="355" r="9" fill="#00e5ff" />
                <circle cx="380" cy="460" r="7" fill="#00e5ff" />
                <circle cx="382" cy="548" r="6" fill="#00e5ff" />
                <circle cx="710" cy="275" r="9" fill="#00e5ff" />
                <circle cx="755" cy="475" r="8" fill="#00e5ff" />
                <circle cx="766" cy="552" r="6" fill="#00e5ff" />
              </g>
            )}

            {/* ======================================================== */}
            {/* LAYER 3: SURFACE COAT, ATHLETIC CONTOUR & MANE/TAIL      */}
            {/* ======================================================== */}
            {activeLayer === 'surface' && (
              <g>
                {/* Surface Body Gloss Lighting */}
                <path
                  d="M 230,140 C 320,150 450,170 650,185 C 620,240 480,240 330,220 Z"
                  fill="url(#glossGrad)"
                />

                {/* Athletic Muscle Tone Contours */}
                <g stroke="#90a4ae" strokeWidth="1.5" fill="none" opacity="0.65">
                  <path d="M 220,150 Q 260,210 290,265" />
                  <path d="M 330,220 Q 370,270 380,340" />
                  <path d="M 430,220 Q 540,240 650,230" />
                  <path d="M 660,250 Q 720,310 740,390" />
                  <path d="M 680,360 Q 720,420 740,470" />
                </g>

                {/* Racing Mane (Bờm Ngựa Đua Điêu Khắc) */}
                <path
                  d="
                    M 208,105
                    C 220,125 210,145 230,135
                    C 245,155 240,175 265,160
                    C 285,185 280,200 310,180
                    C 330,205 335,215 365,195
                    C 385,210 395,200 410,170
                    C 370,160 300,140 208,105 Z
                  "
                  fill="#ffc107"
                  fillOpacity="0.75"
                  stroke="#ffe082"
                  strokeWidth="1.5"
                />

                {/* Flowing Tail (Đuôi Ngựa Chảy Dài Thanh Thoát) */}
                <path
                  d="
                    M 780,225
                    C 820,250 850,300 860,370
                    C 870,440 855,510 835,570
                    C 825,595 815,610 805,615
                    C 815,570 820,510 810,450
                    C 800,390 785,340 775,290
                    C 770,260 772,240 780,225 Z
                  "
                  fill="#ffc107"
                  fillOpacity="0.7"
                  stroke="#ffe082"
                  strokeWidth="1.8"
                />

                {/* Halter & Bridle Line Accents */}
                <path d="M 135,150 L 165,225" stroke="#fa8c16" strokeWidth="2.5" fill="none" opacity="0.85" />
                <path d="M 140,185 L 205,175" stroke="#fa8c16" strokeWidth="2" fill="none" opacity="0.85" />
                <circle cx="165" cy="185" r="4" fill="#ffd591" stroke="#d4380d" strokeWidth="1.5" />
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

