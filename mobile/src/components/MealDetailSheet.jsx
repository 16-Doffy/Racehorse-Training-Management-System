import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { Badge, Button, Card, DataRow, HorseAvatar, Row, Sheet } from './ui';
import SupplyShortage from './SupplyShortage';
import {
  EATEN_OPTIONS,
  MEAL_CONFIG,
  OBSERVATION_LABELS,
  canCompleteTask,
  canRecordLate,
  describeSupplies,
  formatTime,
  missingSupplies,
  formatDateTime,
  mealTimeOf,
  rationLine,
  stockFor,
  taskState,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

/**
 * One meal for one horse: exactly what goes in the bucket, how much of each feed the store has
 * for it, and the button that records it as given.
 */
export default function MealDetailSheet({ meal, visible, onClose, onComplete, onRecordLate, onNotDone, onAskSupply }) {
  if (!meal) return <Sheet visible={visible} onClose={onClose} title="Chi tiết bữa ăn" />;

  const { horse, slot, schedules, task, inventory, allSchedules, ctx } = meal;
  const config = MEAL_CONFIG[slot];
  const state = taskState(task, ctx);
  const fed = task?.status === 'completed';
  const canFeed = canCompleteTask(task, ctx);
  const noRation = state?.blockers?.some((b) => b.code === 'NO_APPROVED_RATION');
  // What the store is actually short of for this meal, as the server counted it.
  const missing = missingSupplies(task);
  const items = schedules.flatMap((s) => s.items || []);
  const approver = schedules.find((s) => s.approvedBy)?.approvedBy;
  // Each ration line's own stock item (linked by id); older unlinked lines are matched by name.
  const stockOf = (item) => stockFor({ inventoryItem: item.inventoryItem, name: item.type }, inventory, 'feed');
  // Feeds that are merely running low: worth a warning, not a block.
  const lowStock = items.map(stockOf).filter((stock) => stock && stock.level.short);
  const issued = describeSupplies(task?.supplies);
  const observation = task?.observation || {};
  const eaten = EATEN_OPTIONS.find((o) => o.value === observation.amountEatenPercent);

  return (
    <Sheet visible={visible} onClose={onClose} title={`${config?.label || 'Bữa ăn'} · ${horse?.name || ''}`}>
      <ScrollView contentContainerStyle={styles.body}>
        <Row style={{ gap: spacing.md }}>
          <View style={[styles.icon, { backgroundColor: colors.goldSoft }]}>
            <Icon name={config?.icon || 'rations'} size={22} color={colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font.h2}>{task?.makeUpOf ? `Cho ăn bù — ${config?.label?.toLowerCase()}` : config?.label}</Text>
            <Row style={{ gap: spacing.sm, marginTop: 4, flexWrap: 'wrap' }}>
              <Badge
                label={task?.makeUpOf ? formatTime(task.scheduledDate) : mealTimeOf(slot, allSchedules) || config?.defaultTime}
                color={colors.forest}
                bg={colors.goldSoft}
              />
              {fed ? (
                <Badge label="Đã cho ăn" color={colors.green} bg={colors.greenSoft} />
              ) : state ? (
                <Badge label={state.label} color={state.color} bg={state.bg} />
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
              const line = rationLine(item);
              const stock = stockOf(item);
              return (
                <View key={index} style={styles.feedRow}>
                  <Row style={{ gap: spacing.sm }}>
                    <View style={[styles.feedIcon, { backgroundColor: colors.forestSoft }]}>
                      <Icon name={line.icon} size={15} color={colors.forestLight} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={font.h3}>{line.label}</Text>
                      <Text style={[font.small, { color: stock ? stock.level.color : colors.textFaint }]}>
                        {stock ? `Kho còn ${stock.quantity} ${stock.unit} · ${stock.level.label}` : 'Chưa có trong kho'}
                        {stock && !line.linked ? ' (món cùng tên — khẩu phần chưa gắn kho, không tự trừ)' : ''}
                      </Text>
                    </View>
                    <Text style={styles.qty}>{line.amount}</Text>
                  </Row>
                </View>
              );
            })
          )}
        </Card>

        <Card>
          <DataRow label="Người duyệt" value={approver?.name || 'Chưa duyệt'} />
          {/* Issued (taken out of stock) and eaten are not the same thing; both are kept. */}
          {issued ? <DataRow label={fed ? 'Đã xuất kho' : 'Xuất kho khi ghi nhận'} value={issued} valueStyle={styles.wrapValue} /> : null}
          {task?.makeUpOf && task.note ? <DataRow label="Cho ăn bù" value={task.note} valueStyle={styles.wrapValue} /> : null}
          {task?.completedAt ? (
            <DataRow label="Đã cho ăn lúc" value={`${formatDateTime(task.completedAt)}${task.recordedLate ? ' (ghi muộn)' : ''}`} />
          ) : null}
          {fed && eaten ? <DataRow label="Ngựa ăn được" value={eaten.label} /> : null}
          {fed && observation.manure ? <DataRow label="Phân" value={OBSERVATION_LABELS.manure[observation.manure]} /> : null}
          {fed && observation.waterIntake ? <DataRow label="Uống nước" value={OBSERVATION_LABELS.waterIntake[observation.waterIntake]} /> : null}
          {task?.skipReason ? <DataRow label="Không cho ăn" value={task.skipReason} valueStyle={{ color: colors.orange }} /> : null}
          {state?.reason && task?.status === 'pending' ? (
            <DataRow
              label="Ghi nhận"
              value={state.reason}
              valueStyle={{ color: state.key === 'blocked' || state.key === 'missed' ? colors.red : colors.orange, flex: 1, textAlign: 'right' }}
            />
          ) : null}
        </Card>

        <SupplyShortage missing={missing} onAskSupply={onAskSupply} />

        {!missing.length && lowStock.length > 0 ? (
          <Button
            title="Xin bổ sung thức ăn"
            icon="plus"
            variant="danger"
            onPress={() => onAskSupply(stockEntry(lowStock[0]))}
          />
        ) : null}
      </ScrollView>

      {task?.status === 'pending' ? (
        <View style={styles.actions}>
          <Row style={{ gap: spacing.sm }}>
            {canFeed ? <Button title="Đã cho ăn" icon="check" style={{ flex: 3 }} onPress={onComplete} /> : null}
            {state?.key === 'missed' && canRecordLate(task, ctx) && onRecordLate ? (
              <Button title="Đã cho ăn, quên ghi" icon="clock" variant="subtle" style={{ flex: 3 }} onPress={onRecordLate} />
            ) : null}
            <Button
              title={noRation ? 'Báo HLV chưa có khẩu phần' : 'Không cho ăn'}
              icon="block"
              variant="ghost"
              style={{ flex: 2 }}
              onPress={() => onNotDone(noRation ? 'Chưa có khẩu phần được duyệt' : '')}
            />
          </Row>
        </View>
      ) : null}
    </Sheet>
  );
}

/** Describes a low stock line the way a shortage line looks, so one restock sheet serves both. */
const stockEntry = (stock) => ({
  inventoryItem: stock.items[0]?._id,
  name: stock.items[0]?.name,
  unit: stock.unit,
  available: stock.quantity,
});

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
  icon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  feedRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  feedIcon: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  qty: { ...font.h3, color: colors.forest },
  wrapValue: { flex: 1, textAlign: 'right' },
  actions: { padding: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: colors.white },
});
