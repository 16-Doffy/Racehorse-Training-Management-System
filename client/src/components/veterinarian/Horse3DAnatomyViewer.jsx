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
            {/* BASE ELEGANT THOROUGHBRED RACEHORSE SILHOUETTE           */}
            {/* ======================================================== */}

            {/* Offside (Far Side) Legs for 3D Depth */}
            <g opacity="0.55">
              {/* Offside Front Leg */}
              <path
                d="M 345,340 L 340,450 L 335,465 L 332,565 L 325,585 L 340,585 L 345,565 L 350,465 Z"
                fill={activeLayer === 'muscular' ? '#800a12' : activeLayer === 'skeletal' ? '#004d40' : '#101d24'}
                stroke={activeLayer === 'muscular' ? '#d32f2f' : activeLayer === 'skeletal' ? '#00b0ff' : '#455a64'}
                strokeWidth="1.5"
              />
              {/* Offside Hind Leg */}
              <path
                d="M 720,340 L 705,430 L 725,480 L 715,565 L 708,585 L 725,585 L 730,565 L 738,480 Z"
                fill={activeLayer === 'muscular' ? '#800a12' : activeLayer === 'skeletal' ? '#004d40' : '#101d24'}
                stroke={activeLayer === 'muscular' ? '#d32f2f' : activeLayer === 'skeletal' ? '#00b0ff' : '#455a64'}
                strokeWidth="1.5"
              />
            </g>

            {/* Main Nearside Thoroughbred Body Silhouette */}
            <path
              d="
                M 90,215
                C 85,200 100,185 125,170
                C 145,158 175,145 195,115
                C 202,90 208,65 218,65
                C 225,65 222,82 225,95
                C 230,75 238,70 245,78
                C 242,95 240,110 245,120
                C 270,122 330,135 390,158
                C 415,168 430,182 445,185
                C 480,192 550,196 620,200
                C 660,202 710,198 760,212
                C 795,222 820,248 820,295
                C 820,335 810,380 798,425
                C 792,448 802,465 798,485
                C 792,525 788,565 792,585
                C 792,592 782,594 768,594
                C 760,594 762,582 764,565
                C 768,525 765,482 748,460
                C 730,435 700,418 670,415
                C 610,412 540,422 470,402
                C 445,395 425,420 412,460
                C 405,485 395,530 398,565
                C 398,592 388,594 372,594
                C 365,594 366,582 368,565
                C 372,525 378,480 385,455
                C 392,425 385,392 360,365
                C 335,340 300,310 260,285
                C 220,260 180,242 150,240
                C 125,238 98,235 90,215 Z
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

            {/* Eye & Nostril Details */}
            <circle cx="145" cy="155" r="4.5" fill={activeLayer === 'skeletal' ? '#00e5ff' : '#000'} stroke="#fff" strokeWidth="1" />
            <ellipse cx="102" cy="208" rx="4" ry="7" transform="rotate(-20 102 208)" fill="#000" opacity="0.7" />

            {/* ======================================================== */}
            {/* LAYER 1: ANATOMICAL MUSCULAR SYSTEM                     */}
            {/* ======================================================== */}
            {activeLayer === 'muscular' && (
              <g>
                {/* Head & Jowl Muscles (Masseter & Nasolabial) */}
                <path d="M 120,180 Q 150,205 180,200 Q 165,170 145,160 Z" fill="url(#muscleHighlightGrad)" stroke="#ff7875" strokeWidth="1.5" />
                <circle cx="162" cy="195" r="15" fill="#ff4d4f" fillOpacity="0.45" stroke="#ff7875" strokeWidth="1.2" />

                {/* Splenius & Cervical Rhomboideus (Upper Neck Crest) */}
                <path d="M 195,120 C 250,132 315,148 375,168 C 345,210 285,200 220,170 Z" fill="#d32f2f" fillOpacity="0.65" stroke="#ff9c6e" strokeWidth="1.8" />
                <path d="M 220,135 Q 280,152 350,178" stroke="#ffbb96" strokeWidth="1.2" strokeDasharray="5,3" fill="none" />
                <path d="M 240,148 Q 295,165 360,192" stroke="#ffbb96" strokeWidth="1.2" strokeDasharray="5,3" fill="none" />

                {/* Brachiocephalicus & Sternocephalicus (Lower Neck) */}
                <path d="M 175,210 C 220,240 270,275 305,315 C 270,305 230,265 185,232 Z" fill="#c62828" fillOpacity="0.7" stroke="#ff7875" strokeWidth="1.6" />
                <path d="M 200,225 Q 245,262 285,302" stroke="#ffbb96" strokeWidth="1.2" strokeDasharray="4,4" fill="none" />

                {/* Scapula & Deltoid & Triceps Group (Shoulder) */}
                <ellipse cx="340" cy="245" rx="42" ry="55" transform="rotate(-20 340 245)" fill="#e53935" fillOpacity="0.65" stroke="#ff7875" strokeWidth="2" />
                <ellipse cx="355" cy="275" rx="28" ry="38" transform="rotate(15 355 275)" fill="#b71c1c" fillOpacity="0.8" stroke="#ffa39e" strokeWidth="1.5" />
                <path d="M 320,215 C 345,260 365,300 375,345" stroke="#ffccc7" strokeWidth="2" fill="none" />

                {/* Pectoralis Profundus (Chest) */}
                <path d="M 310,320 C 330,350 360,365 385,360 C 365,335 340,315 310,320 Z" fill="#b71c1c" fillOpacity="0.85" stroke="#ff7875" strokeWidth="1.5" />

                {/* Longissimus Dorsi & Spinalis (Back & Spine Muscle) */}
                <path d="M 390,175 C 460,188 560,195 670,205 C 660,235 550,235 430,220 Z" fill="#e53935" fillOpacity="0.75" stroke="#ffa39e" strokeWidth="2" />
                <path d="M 410,195 Q 535,205 660,215" stroke="#fff1f0" strokeWidth="1.5" strokeDasharray="6,4" fill="none" />
                <path d="M 430,208 Q 545,220 655,228" stroke="#fff1f0" strokeWidth="1.5" strokeDasharray="6,4" fill="none" />

                {/* External Abdominal Oblique & Latissimus (Ribs & Flank) */}
                <path d="M 435,228 C 540,242 630,242 675,268 C 650,345 560,375 450,340 Z" fill="#c62828" fillOpacity="0.6" stroke="#ff7875" strokeWidth="1.8" />
                <path d="M 460,248 C 490,283 510,318 525,348" stroke="#ffccc7" strokeWidth="1.4" fill="none" />
                <path d="M 495,248 C 525,283 545,318 560,348" stroke="#ffccc7" strokeWidth="1.4" fill="none" />
                <path d="M 530,248 C 560,283 580,318 595,343" stroke="#ffccc7" strokeWidth="1.4" fill="none" />
                <path d="M 565,250 C 595,283 615,313 628,333" stroke="#ffccc7" strokeWidth="1.4" fill="none" />

                {/* Gluteus Medius & Superficialis (Croup & Rump) */}
                <ellipse cx="710" cy="235" rx="65" ry="48" transform="rotate(-15 710 235)" fill="#e53935" fillOpacity="0.8" stroke="#ffa39e" strokeWidth="2.2" />
                <path d="M 665,215 C 710,240 750,275 765,325" stroke="#fff1f0" strokeWidth="2" fill="none" />

                {/* Biceps Femoris & Semitendinosus (Thigh & Stifle & Hamstring) */}
                <path d="M 705,270 C 785,295 800,370 780,440 C 750,430 725,380 690,340 Z" fill="#b71c1c" fillOpacity="0.85" stroke="#ff7875" strokeWidth="2" />
                <path d="M 720,295 C 760,345 770,395 770,435" stroke="#ffccc7" strokeWidth="1.6" fill="none" />

                {/* Gastrocnemius & Gaskin Muscle */}
                <ellipse cx="755" cy="435" rx="24" ry="45" transform="rotate(20 755 435)" fill="#d32f2f" fillOpacity="0.75" stroke="#ff9c6e" strokeWidth="1.8" />

                {/* High-Performance Equine Tendons & Ligaments (Glowing Gold) */}
                {/* Forelimb Extensor / Flexor Tendons */}
                <path d="M 380,365 L 392,460 L 388,575" stroke="url(#tendonGrad)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                <path d="M 370,378 L 380,465 L 374,575" stroke="#fff566" strokeWidth="2" strokeDasharray="3,3" fill="none" />

                {/* Hindlimb Common Digital Extensor & Deep Flexor Tendons */}
                <path d="M 760,470 L 784,525 L 780,578" stroke="url(#tendonGrad)" strokeWidth="3.8" strokeLinecap="round" fill="none" />
                <path d="M 740,450 L 768,525 L 764,578" stroke="#fff566" strokeWidth="2" strokeDasharray="3,3" fill="none" />

                {/* Hoof Anchors */}
                <polygon points="365,575 398,575 392,594 362,594" fill="#424242" stroke="#ff4d4f" strokeWidth="1.5" />
                <polygon points="762,575 794,575 790,594 760,594" fill="#424242" stroke="#ff4d4f" strokeWidth="1.5" />
              </g>
            )}

            {/* ======================================================== */}
            {/* LAYER 2: HIGH-TECH SKELETAL X-RAY SYSTEM                 */}
            {/* ======================================================== */}
            {activeLayer === 'skeletal' && (
              <g stroke="#ffffff" fill="none">
                {/* Skull & Mandible */}
                <path d="M 95,210 C 105,185 130,165 160,160 C 185,160 200,180 185,205 C 165,225 125,230 95,210 Z" fill="#00838f" fillOpacity="0.4" stroke="#80deea" strokeWidth="2.5" />
                <circle cx="145" cy="175" r="7" fill="#00e5ff" /> {/* Orbit / Eye Socket */}
                <path d="M 115,220 Q 150,225 175,208" stroke="#ffffff" strokeWidth="2" /> {/* Mandible */}

                {/* Cervical Vertebrae (Neck C1-C7 Spine) */}
                <path d="M 180,170 C 220,185 280,220 330,255" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeDasharray="14,4" />

                {/* Scapula (Shoulder Blade) */}
                <polygon points="350,200 380,220 335,290 315,265" fill="#00acc1" fillOpacity="0.45" stroke="#e0f7fa" strokeWidth="2.5" />

                {/* Humerus & Radius / Ulna (Foreleg Upper Bones) */}
                <line x1="335" y1="285" x2="365" y2="370" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />
                <line x1="365" y1="370" x2="378" y2="460" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />

                {/* Carpal Bones (Front Knee Joint) */}
                <rect x="370" y="460" width="16" height="18" rx="4" fill="#00e5ff" stroke="#ffffff" strokeWidth="2" />

                {/* Metacarpus (Front Cannon Bone & Pastern) */}
                <line x1="378" y1="478" x2="382" y2="550" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" />
                <line x1="382" y1="550" x2="378" y2="580" stroke="#80deea" strokeWidth="4" />
                <polygon points="365,580 392,580 388,594 362,594" fill="#006064" stroke="#00e5ff" strokeWidth="2" />

                {/* Thoracic & Lumbar Spine (T1-T18 & L1-L6) */}
                <path d="M 330,255 Q 510,215 690,255" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeDasharray="16,4" />

                {/* Ribcage Structure (18 Equine Costal Ribs) */}
                <g stroke="#4dd0e1" strokeWidth="2.4" opacity="0.85">
                  <path d="M 380,225 C 395,275 405,325 415,350" />
                  <path d="M 415,225 C 430,280 440,330 450,360" />
                  <path d="M 450,225 C 465,285 475,335 485,365" />
                  <path d="M 485,227 C 500,285 510,335 520,367" />
                  <path d="M 520,230 C 535,285 545,335 555,367" />
                  <path d="M 555,235 C 570,285 580,330 590,360" />
                  <path d="M 590,240 C 605,285 615,325 625,353" />
                  <path d="M 625,247 C 638,285 645,320 655,343" />
                </g>

                {/* Pelvis / Ilium / Sacrum */}
                <polygon points="665,245 720,235 745,285 690,300" fill="#00838f" fillOpacity="0.5" stroke="#ffffff" strokeWidth="3" />

                {/* Femur (Thigh Bone) */}
                <line x1="700" y1="290" x2="675" y2="395" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />

                {/* Stifle Joint & Patella (Glowing Neon Node) */}
                <circle cx="675" cy="395" r="11" fill="url(#jointGlowGrad)" stroke="#00e5ff" strokeWidth="2.5" />

                {/* Tibia & Fibula (Gaskin Bone) */}
                <line x1="675" y1="395" x2="750" y2="480" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />

                {/* Hock / Tarsus Joint (Calcaneus Node) */}
                <rect x="743" y="480" width="18" height="20" rx="4" fill="#00e5ff" stroke="#ffffff" strokeWidth="2" />

                {/* Metatarsus (Hind Cannon Bone & Phalanges) */}
                <line x1="753" y1="500" x2="766" y2="555" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" />
                <line x1="766" y1="555" x2="764" y2="580" stroke="#80deea" strokeWidth="4" />
                <polygon points="750,580 778,580 775,594 745,594" fill="#006064" stroke="#00e5ff" strokeWidth="2" />

                {/* Articular Joint Nodes Glow */}
                <circle cx="335" cy="285" r="8" fill="#00e5ff" />
                <circle cx="365" cy="370" r="9" fill="#00e5ff" />
                <circle cx="370" cy="465" r="7" fill="#00e5ff" />
                <circle cx="382" cy="552" r="6" fill="#00e5ff" />
                <circle cx="700" cy="290" r="9" fill="#00e5ff" />
                <circle cx="750" cy="485" r="8" fill="#00e5ff" />
                <circle cx="766" cy="557" r="6" fill="#00e5ff" />
              </g>
            )}

            {/* ======================================================== */}
            {/* LAYER 3: SURFACE COAT, ATHLETIC CONTOUR & MANE/TAIL      */}
            {/* ======================================================== */}
            {activeLayer === 'surface' && (
              <g>
                {/* Surface Body Gloss Lighting */}
                <path
                  d="M 220,155 C 310,165 440,185 640,200 C 610,255 470,255 320,235 Z"
                  fill="url(#glossGrad)"
                />

                {/* Athletic Muscle Tone Contours */}
                <g stroke="#90a4ae" strokeWidth="1.5" fill="none" opacity="0.65">
                  <path d="M 210,165 Q 250,225 280,280" />
                  <path d="M 320,235 Q 360,285 370,355" />
                  <path d="M 420,235 Q 530,255 640,245" />
                  <path d="M 650,265 Q 710,325 730,405" />
                  <path d="M 670,375 Q 710,435 730,485" />
                </g>

                {/* Racing Mane (Bờm Ngựa Đua Điêu Khắc) */}
                <path
                  d="
                    M 218,65
                    C 230,85 220,105 240,95
                    C 255,115 250,135 275,120
                    C 295,145 290,160 320,140
                    C 340,165 345,175 375,155
                    C 395,170 405,160 420,130
                    C 380,120 310,100 218,65 Z
                  "
                  fill="#ffc107"
                  fillOpacity="0.8"
                  stroke="#ffe082"
                  strokeWidth="1.5"
                />

                {/* Flowing Tail (Đuôi Ngựa Đua Chảy Dài Thanh Thoát) */}
                <path
                  d="
                    M 800,240
                    C 840,265 870,315 880,385
                    C 890,455 875,525 855,585
                    C 845,610 835,625 825,630
                    C 835,585 840,525 830,465
                    C 820,405 805,355 795,305
                    C 790,275 792,255 800,240 Z
                  "
                  fill="#ffc107"
                  fillOpacity="0.75"
                  stroke="#ffe082"
                  strokeWidth="1.8"
                />

                {/* Leather Halter & Bridle Accent */}
                <path d="M 125,170 L 155,245" stroke="#fa8c16" strokeWidth="2.5" fill="none" opacity="0.85" />
                <path d="M 130,205 L 195,195" stroke="#fa8c16" strokeWidth="2" fill="none" opacity="0.85" />
                <circle cx="155" cy="205" r="4" fill="#ffd591" stroke="#d4380d" strokeWidth="1.5" />
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

