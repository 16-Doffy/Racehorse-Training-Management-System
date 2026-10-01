import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { Badge, Button, Card, DataRow, HorseAvatar, Row, Sheet } from './ui';
import {
  MEAL_CONFIG,
  TIMING_STATE,
  findStock,
  formatDateTime,
  getFeedTypeLabel,
  mealTimeOf,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

/**
 * One meal for one horse: exactly what goes in the bucket, how much of each feed the store has
 * for it, and the button that records it as given.
 */
export default function MealDetailSheet({ meal, visible, onClose, onComplete, onNotDone, onAskSupply }) {
  if (!meal) return <Sheet visible={visible} onClose={onClose} title="Chi tiết bữa ăn" />;

  const { horse, slot, schedules, task, inventory, allSchedules } = meal;
  const config = MEAL_CONFIG[slot];
  const timing = task?.timing || {};
  const timingCfg = TIMING_STATE[timing.state];
  const fed = task?.status === 'completed';
  const canFeed = task?.status === 'pending' && timing.canComplete !== false;
  const items = schedules.flatMap((s) => s.items || []);
  const approver = schedules.find((s) => s.approvedBy)?.approvedBy;
  const shortages = items.filter((item) => {
    const stock = findStock(item.type, inventory, 'feed');
    return !stock || stock.level.key !== 'ok';
  });

  return (
    <Sheet visible={visible} onClose={onClose} title={`${config?.label || 'Bữa ăn'} · ${horse?.name || ''}`}>
      <ScrollView contentContainerStyle={styles.body}>
        <Row style={{ gap: spacing.md }}>
          <View style={[styles.icon, { backgroundColor: colors.goldSoft }]}>
            <Icon name={config?.icon || 'rations'} size={22} color={colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font.h2}>{config?.label}</Text>
            <Row style={{ gap: spacing.sm, marginTop: 4, flexWrap: 'wrap' }}>
              <Badge label={mealTimeOf(slot, allSchedules) || config?.defaultTime} color={colors.forest} bg={colors.goldSoft} />
              {fed ? (
                <Badge label="Đã cho ăn" color={colors.green} bg={colors.greenSoft} />
              ) : timingCfg && task ? (
                <Badge label={timingCfg.label} color={timingCfg.color} bg={timingCfg.bg} />
              ) : null}
            </Row>
          </View>
          <HorseAvatar name={horse?.name} size={40} />
        </Row>

        {/* The ration itself, each line with what the store has of that feed. */}
        <Card>
          <Text style={[font.tiny, { marginBottom: spacing.sm }]}>Khẩu phần cho bữa này</Text>
          {items.length === 0 ? (
            <Text style={font.small}>Chưa thiết lập khẩu phần cho bữa này.</Text>
          ) : (
            items.map((item, index) => {
              const feed = getFeedTypeLabel(item.type);
              const stock = findStock(item.type, inventory, 'feed');
              return (
                <View key={index} style={styles.feedRow}>
                  <Row style={{ gap: spacing.sm }}>
                    <View style={[styles.feedIcon, { backgroundColor: colors.forestSoft }]}>
                      <Icon name={feed.icon} size={15} color={colors.forestLight} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={font.h3}>{feed.label}</Text>
                      <Text style={[font.small, { color: stock ? stock.level.color : colors.textFaint }]}>
                        {stock ? `Kho còn ${stock.quantity} ${stock.unit} · ${stock.level.label}` : 'Chưa có trong kho'}
                      </Text>
                    </View>
                    <Text style={styles.qty}>{item.quantity}</Text>
                  </Row>
                </View>
              );
            })
          )}
        </Card>

        <Card>
          <DataRow label="Người duyệt" value={approver?.name || 'Chưa duyệt'} />
          {task?.completedAt ? <DataRow label="Đã cho ăn lúc" value={formatDateTime(task.completedAt)} /> : null}
          {task?.skipReason ? <DataRow label="Không cho ăn" value={task.skipReason} valueStyle={{ color: colors.orange }} /> : null}
          {timing.reason && task?.status === 'pending' ? (
            <DataRow label="Ghi nhận" value={timing.reason} valueStyle={{ color: colors.orange, flex: 1, textAlign: 'right' }} />
          ) : null}
        </Card>

        {shortages.length > 0 ? (
          <Button title="Xin bổ sung thức ăn" icon="plus" variant="danger" onPress={onAskSupply} />
        ) : null}
      </ScrollView>

      {task?.status === 'pending' ? (
        <View style={styles.actions}>
          <Row style={{ gap: spacing.sm }}>
            {canFeed ? <Button title="Đã cho ăn" icon="check" style={{ flex: 3 }} onPress={onComplete} /> : null}
            <Button title="Không cho ăn" icon="block" variant="ghost" style={{ flex: 2 }} onPress={onNotDone} />
          </Row>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
  icon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  feedRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  feedIcon: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  qty: { ...font.h3, color: colors.forest },
  actions: { padding: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: colors.white },
});
