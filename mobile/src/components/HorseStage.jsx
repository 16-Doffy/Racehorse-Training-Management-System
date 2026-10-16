import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from './Icon';
import Horse360View from './Horse360View';
import { Card, Row, SectionTitle } from './ui';
import { HORSE_MODEL, hasHorseModel } from '../three/horseModel';
import { INJURY_SEVERITY, RECOVERY_STATUS, activeInjuries, hotspotFor } from '../three/injuryHotspots';
import { colors, font, radius, spacing } from '../theme';

const STAGE_HEIGHT = 320;

/**
 * The horse on its own stage at the top of the horse screen: a 3D model the groom turns 360° with
 * a finger, with the injuries the vet marked glowing where they are on the body — so before going
 * into the stall the groom knows which leg not to touch. The name and the horse's standing
 * (health, how hard it may work, a training lock) sit over it; the full-screen view gives the
 * whole screen to turning and zooming.
 *
 * One model for every horse (three/horseModel.js), painted in the horse's coat (`coat`, from
 * three/horseBreeds.js coatFor). Without a model, or without a connection (the viewer script comes
 * from a CDN), the stage says so and the injury list below still works.
 */
export default function HorseStage({ name, subtitle, badges = [], markers = [], coat = null }) {
  const viewer = useRef(null);
  const fullViewer = useRef(null);
  const [status, setStatus] = useState(hasHorseModel() ? 'loading' : 'none');
  const [progress, setProgress] = useState(0);
  const [spinning, setSpinning] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(null);

  const injuries = useMemo(() => activeInjuries(markers), [markers]);
  const hotspots = useMemo(
    () =>
      injuries.map((m) => ({
        ...hotspotFor(m),
        label: m.bodyPart,
        sub: `${INJURY_SEVERITY[m.severity]?.label || m.severity} · ${RECOVERY_STATUS[m.recoveryStatus] || ''}`,
        color: INJURY_SEVERITY[m.severity]?.color || colors.red,
      })),
    [injuries]
  );
  const showViewer = status === 'loading' || status === 'ready';

  const onEvent = (message) => {
    if (message.type === 'progress') setProgress(message.value);
    if (message.type === 'loaded') setStatus('ready');
    if (message.type === 'error') setStatus('error');
    if (message.type === 'hotspot') setSelected(message.index);
  };

  const toggleSpin = () => {
    const next = !spinning;
    setSpinning(next);
    viewer.current?.send({ type: 'auto-rotate', value: next });
    fullViewer.current?.send({ type: 'auto-rotate', value: next });
  };
  const recenter = (target = viewer) => {
    setSelected(null);
    target.current?.send({ type: 'reset' });
  };
  const focus = (index) => {
    setSelected(index);
    setSpinning(false);
    (fullscreen ? fullViewer : viewer).current?.send({ type: 'focus', index });
  };
  const retry = () => {
    setStatus('loading');
    setProgress(0);
    setAttempt((n) => n + 1);
  };

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.stage}>
        {showViewer ? (
          <Horse360View key={attempt} ref={viewer} hotspots={hotspots} coat={coat} onEvent={onEvent} style={StyleSheet.absoluteFill} />
        ) : (
          <StageEmpty status={status} onRetry={retry} />
        )}

        {/* Who it is and how it stands, over the model without hiding it. */}
        <View style={styles.top} pointerEvents="box-none">
          <View style={{ flex: 1 }} pointerEvents="none">
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
            <Row style={styles.badges}>
              {badges.map((b) => (
                <View key={b.label} style={[styles.glassBadge, { borderColor: b.color }]}>
                  {b.dot ? <View style={[styles.badgeDot, { backgroundColor: b.color }]} /> : null}
                  <Text style={[styles.glassBadgeText, { color: b.color }]}>{b.label}</Text>
                </View>
              ))}
            </Row>
          </View>
          {showViewer ? (
            <View style={styles.controls}>
              <GlassButton icon={spinning ? 'pause' : 'rotate360'} label={spinning ? 'Dừng xoay' : 'Tự xoay 360°'} onPress={toggleSpin} active={spinning} />
              <GlassButton icon="recenter" label="Về góc ban đầu" onPress={() => recenter()} />
              <GlassButton icon="expand" label="Xem toàn màn hình" onPress={() => setFullscreen(true)} />
            </View>
          ) : null}
        </View>

        {showViewer ? (
          <View style={styles.bottom} pointerEvents="none">
            {status === 'loading' ? (
              <Text style={styles.hint}>Đang tải mô hình 3D… {Math.round(progress * 100)}%</Text>
            ) : (
              <Row style={{ gap: 6 }}>
                <Icon name="rotate360" size={14} color="rgba(255,255,255,0.75)" />
                <Text style={styles.hint}>Kéo ngang để xoay · chụm để phóng to</Text>
              </Row>
            )}
            {injuries.length ? (
              <View style={styles.injuryChip}>
                <Text style={styles.injuryChipText}>{injuries.length} vị trí chấn thương</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {HORSE_MODEL.credit && showViewer ? <Text style={styles.credit}>{HORSE_MODEL.credit}</Text> : null}

      {/* The same injuries as a list: tapping one flies the camera to it. */}
      {injuries.length ? (
        <Card>
          <SectionTitle>Vị trí chấn thương</SectionTitle>
          {injuries.map((m, index) => (
            <InjuryRow key={m._id} marker={m} selected={selected === index} onPress={showViewer ? () => focus(index) : undefined} />
          ))}
          <Text style={[font.small, { marginTop: spacing.sm }]}>
            Theo sơ đồ bác sĩ đánh dấu. Tránh chạm mạnh vào vùng này khi tắm, chải và dắt ngựa.
          </Text>
        </Card>
      ) : null}

      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)} statusBarTranslucent>
        <SafeAreaView style={styles.fullscreen}>
          <Horse360View ref={fullViewer} hotspots={hotspots} coat={coat} interactive onEvent={onEvent} style={{ flex: 1 }} />
          <View style={styles.fullTop} pointerEvents="box-none">
            <View style={{ flex: 1 }} pointerEvents="none">
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.hint}>Kéo để xoay 360° · chụm để phóng to · chạm điểm sáng để xem</Text>
            </View>
            <GlassButton icon="close" label="Đóng" onPress={() => setFullscreen(false)} />
          </View>
          <View style={styles.fullBottom}>
            <Row style={{ gap: spacing.sm, justifyContent: 'center' }}>
              <GlassButton icon={spinning ? 'pause' : 'rotate360'} label={spinning ? 'Dừng xoay' : 'Tự xoay 360°'} onPress={toggleSpin} active={spinning} />
              <GlassButton icon="recenter" label="Về góc ban đầu" onPress={() => recenter(fullViewer)} />
            </Row>
            {injuries.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
                {injuries.map((m, index) => {
                  const severity = INJURY_SEVERITY[m.severity] || INJURY_SEVERITY.moderate;
                  return (
                    <Pressable
                      key={m._id}
                      onPress={() => focus(index)}
                      style={[styles.fullChip, { borderColor: severity.color }, selected === index && { backgroundColor: 'rgba(255,255,255,0.12)' }]}
                    >
                      <View style={[styles.badgeDot, { backgroundColor: severity.color }]} />
                      <Text style={styles.fullChipText}>{m.bodyPart}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

/** A round frosted button over the stage. */
function GlassButton({ icon, label, onPress, active }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.glassButton, active && styles.glassButtonActive, pressed && { opacity: 0.7 }]}
    >
      <Icon name={icon} size={18} color={active ? colors.forest : colors.white} />
    </Pressable>
  );
}

/** The stage with no model to show: none installed, or it could not be loaded. */
function StageEmpty({ status, onRetry }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyGlow} />
      <Icon name="stableActive" size={72} color="rgba(234,179,8,0.85)" />
      <Text style={styles.emptyTitle}>{status === 'error' ? 'Chưa tải được mô hình 3D' : 'Mô hình 3D chưa được cài'}</Text>
      <Text style={styles.emptyText}>
        {status === 'error' ? 'Kiểm tra kết nối mạng rồi thử lại.' : 'Danh sách chấn thương bên dưới vẫn theo sơ đồ của bác sĩ.'}
      </Text>
      {status === 'error' ? (
        <Pressable onPress={onRetry} style={styles.retry} hitSlop={6}>
          <Icon name="refresh" size={14} color={colors.forest} />
          <Text style={styles.retryText}>Thử lại</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InjuryRow({ marker, selected, onPress }) {
  const severity = INJURY_SEVERITY[marker.severity] || INJURY_SEVERITY.moderate;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.injuryRow, selected && styles.injuryRowSelected, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.injuryDot, { backgroundColor: severity.color, shadowColor: severity.color }]} />
      <View style={{ flex: 1 }}>
        <Text style={font.h3}>{marker.bodyPart}</Text>
        <Text style={font.small}>
          {severity.label} · {RECOVERY_STATUS[marker.recoveryStatus] || marker.recoveryStatus}
        </Text>
        {marker.notes ? <Text style={font.small}>{marker.notes}</Text> : null}
      </View>
      {onPress ? <Icon name="recenter" size={16} color={colors.forestLight} /> : null}
    </Pressable>
  );
}

const glass = { backgroundColor: 'rgba(1,17,12,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' };

const styles = StyleSheet.create({
  stage: { height: STAGE_HEIGHT, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#01110c' },
  top: { position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md, flexDirection: 'row', gap: spacing.sm },
  name: { color: colors.white, fontSize: 22, fontWeight: '800', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6 },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  badges: { gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' },
  glassBadge: { ...glass, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  glassBadgeText: { fontSize: 11, fontWeight: '700' },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  controls: { gap: spacing.sm },
  glassButton: { ...glass, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  glassButtonActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  bottom: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hint: { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  injuryChip: { backgroundColor: 'rgba(239,68,68,0.18)', borderColor: '#ef4444', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  injuryChipText: { color: '#fecaca', fontSize: 11, fontWeight: '700' },
  credit: { ...font.small, fontSize: 10, textAlign: 'right', marginTop: -spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  emptyGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(16,120,86,0.35)' },
  emptyTitle: { color: colors.white, fontWeight: '700', fontSize: 15, marginTop: spacing.md },
  emptyText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center', marginTop: 4 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  retryText: { color: colors.forest, fontWeight: '700', fontSize: 13 },
  injuryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, marginHorizontal: -spacing.sm, borderRadius: radius.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  injuryRowSelected: { backgroundColor: colors.forestSoft },
  injuryDot: { width: 12, height: 12, borderRadius: 6, shadowOpacity: 0.8, shadowRadius: 6, elevation: 3 },
  fullscreen: { flex: 1, backgroundColor: '#01110c' },
  fullTop: { position: 'absolute', top: spacing.xl, left: spacing.lg, right: spacing.lg, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  fullBottom: { position: 'absolute', left: 0, right: 0, bottom: spacing.xl, gap: spacing.md },
  fullChip: { ...glass, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill },
  fullChipText: { color: colors.white, fontSize: 13, fontWeight: '600' },
});
