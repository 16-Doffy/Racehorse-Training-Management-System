import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { Badge, Button, Card, DataRow, HorseAvatar, Row, Sheet } from './ui';
import SupplyShortage from './SupplyShortage';
import {
  MEDICATION_ROUTE,
  canCompleteTask,
  canRecordLate,
  formatDate,
  formatDateTime,
  missingSupplies,
  stockFor,
  taskState,
} from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

/**
 * One medicine of a prescription in full: the vet's order as written (dose, times, dates,
 * instructions), the stock item it is given from, and each of today's doses with its own record
 * and actions. The vet's order is read-only here: the groom records what was given, nothing more.
 *
 * `dose` is { medication, treatment, slots, focus, inventory, ctx } for a medicine, or
 * { isCare, title, task, treatment, inventory, ctx } for care instructions / an unplaced order.
 */
export default function DoseDetailSheet({ dose, visible, onClose, onComplete, onRecordLate, onNotDone, onAskSupply }) {
  if (!dose) return <Sheet visible={visible} onClose={onClose} title="Chi tiết y lệnh" />;

  const { medication, treatment, inventory = [], ctx, isCare } = dose;
  const slots = isCare || !medication ? [{ time: dose.task?.dueTime || null, task: dose.task }] : dose.slots || [];
  const shown = dose.focus ? slots.filter((slot) => slot.time === dose.focus) : slots;
  const stock = medication ? stockFor({ inventoryItem: medication.inventoryItem, name: medication.name }, inventory, 'medicine') : null;
  const perDose = medication?.amount && stock?.unit ? `${medication.amount} ${stock.unit}` : null;
  const daily = medication?.amount ? medication.amount * Math.max((medication.times || []).length, 1) : null;
  const firstShort = shown.map((slot) => slot.task).find((task) => missingSupplies(task).length);

  return (
    <Sheet visible={visible} onClose={onClose} title={isCare ? 'Hướng dẫn chăm sóc' : 'Chi tiết thuốc'}>
      <ScrollView contentContainerStyle={styles.body}>
        <Row style={{ gap: spacing.md }}>
          <View style={[styles.icon, { backgroundColor: isCare ? colors.purpleSoft : colors.redSoft }]}>
            <Icon name={isCare ? 'monitoring' : 'medication'} size={22} color={isCare ? colors.purple : colors.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font.h2}>{medication?.name || dose.title}</Text>
            <Row style={{ gap: spacing.sm, marginTop: 4, flexWrap: 'wrap' }}>
              {medication?.dosage ? <Badge label={`Liều ${medication.dosage}`} color={colors.forest} bg={colors.forestSoft} /> : null}
              {MEDICATION_ROUTE[medication?.route] ? (
                <Badge label={`Đường dùng: ${MEDICATION_ROUTE[medication.route]}`} color={colors.forest} bg={colors.forestSoft} />
              ) : null}
              {medication?.frequency ? <Badge label={medication.frequency} /> : null}
            </Row>
          </View>
        </Row>

        {medication?.instructions ? (
          <Card style={styles.note}>
            <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
              <Icon name="vet" size={15} color={colors.red} />
              <View style={{ flex: 1 }}>
                <Text style={font.tiny}>Bác sĩ dặn</Text>
                <Text style={font.body}>{medication.instructions}</Text>
              </View>
            </Row>
          </Card>
        ) : null}

        {/* The stock item this medicine is given from (linked by the vet), not a guess by name. */}
        {!isCare && medication ? (
          <Card>
            <Text style={[font.tiny, { marginBottom: spacing.sm }]}>Thuốc này trong kho</Text>
            {stock ? (
              <>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={[font.body, { flex: 1 }]}>{stock.items[0]?.name}</Text>
                  <Text style={[font.h3, { color: stock.level.color }]}>
                    {stock.quantity} {stock.unit}
                  </Text>
                </Row>
                <Badge label={stock.level.label} color={stock.level.color} bg={stock.level.bg} style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }} />
                {perDose ? <DataRow label="Mỗi liều lấy ra" value={perDose} /> : null}
                {daily && stock.unit ? <DataRow label="Cần mỗi ngày" value={`${daily} ${stock.unit}`} /> : null}
                {!stock.linked ? (
                  <Text style={[font.small, { marginTop: spacing.sm }]}>
                    Toa chưa gắn mặt hàng trong kho — liều không tự trừ kho; số trên là món cùng tên.
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={font.small}>Chưa có thuốc này trong danh mục kho.</Text>
            )}
            {stock && stock.level.short && onAskSupply ? (
              <Button
                title="Xin bổ sung thuốc"
                icon="plus"
                variant="danger"
                size="sm"
                style={{ marginTop: spacing.md }}
                onPress={() =>
                  onAskSupply(
                    { inventoryItem: stock.items[0]?._id, name: stock.items[0]?.name, unit: stock.unit, available: stock.quantity },
                    firstShort || null
                  )
                }
              />
            ) : null}
          </Card>
        ) : null}

        <Card>
          {treatment ? (
            <Row style={{ gap: spacing.md, marginBottom: spacing.sm }}>
              <HorseAvatar name={treatment.horse?.name} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{treatment.horse?.name}</Text>
                <Text style={font.small}>BS {treatment.prescribedBy?.name || '—'}</Text>
              </View>
            </Row>
          ) : null}
          {treatment ? <DataRow label="Đợt điều trị" value={`${formatDate(treatment.startDate)}${treatment.endDate ? ` → ${formatDate(treatment.endDate)}` : ''}`} /> : null}
          {medication?.startDate || medication?.endDate ? (
            <DataRow
              label="Thuốc này dùng"
              value={`${medication.startDate ? formatDate(medication.startDate) : '…'} → ${medication.endDate ? formatDate(medication.endDate) : '…'}`}
            />
          ) : null}
          {treatment?.isTrainingLocked ? <DataRow label="Huấn luyện" value="Đang bị khóa" valueStyle={{ color: colors.red }} /> : null}
        </Card>

        <Text style={font.tiny}>{isCare ? 'Hôm nay' : dose.focus ? `Liều ${dose.focus} hôm nay` : 'Các liều hôm nay'}</Text>
        {shown.map((slot, index) => (
          <DoseCard
            key={slot.time || `once-${index}`}
            slot={slot}
            ctx={ctx}
            isCare={isCare}
            onComplete={() => onComplete(slot.task)}
            onRecordLate={onRecordLate ? () => onRecordLate(slot.task) : null}
            onNotDone={(reason) => onNotDone(slot.task, reason)}
            onAskSupply={(entry) => onAskSupply?.(entry, slot.task)}
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}

/** One dose today: its state, its record, and what can be done with it now. */
function DoseCard({ slot, ctx, isCare, onComplete, onRecordLate, onNotDone, onAskSupply }) {
  const { task } = slot;
  const state = taskState(task, ctx);
  const canComplete = canCompleteTask(task, ctx);
  const expired = state?.blockers?.some((b) => b.code === 'EXPIRED_SUPPLY');

  return (
    <Card style={{ gap: spacing.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: spacing.sm }}>
          <Icon name="clock" size={15} color={colors.forestLight} />
          <Text style={font.h3}>{slot.time || 'Trong ngày'}</Text>
        </Row>
        {state ? <Badge label={state.label} color={state.color} bg={state.bg} /> : null}
      </Row>

      {!task ? <Text style={font.small}>{slot.reason || 'Hôm nay chưa có việc cho liều này.'}</Text> : null}
      {task?.completedAt ? (
        <DataRow
          label={isCare ? 'Đã làm lúc' : 'Đã cho dùng lúc'}
          value={`${formatDateTime(task.completedAt)}${task.recordedLate ? ' (ghi muộn)' : ''}`}
        />
      ) : null}
      {task?.skipReason ? <DataRow label="Không thực hiện" value={task.skipReason} valueStyle={{ color: colors.orange, flex: 1, textAlign: 'right' }} /> : null}
      {task?.status === 'pending' && state?.reason && state.key !== 'blocked' ? (
        <Text style={[font.small, { color: state.key === 'missed' ? colors.red : colors.orange }]}>{state.reason}</Text>
      ) : null}
      {task?.status === 'pending' && state?.key === 'blocked'
        ? state.blockers
            .filter((b) => b.code !== 'SHORT_OF_STOCK')
            .map((b) => (
              <Text key={b.code} style={[font.small, { color: colors.red }]}>
                {b.message}
              </Text>
            ))
        : null}

      <SupplyShortage missing={missingSupplies(task)} onAskSupply={onAskSupply} compact />

      {/* A dose past its window is still reported: given but not ticked (at its real time), or not given. */}
      {task?.status === 'pending' ? (
        <Row style={{ gap: spacing.sm, flexWrap: 'wrap' }}>
          {canComplete ? <Button title={isCare ? 'Đã làm' : 'Đã cho dùng'} icon="check" size="sm" style={{ flex: 3 }} onPress={onComplete} /> : null}
          {state?.key === 'missed' && canRecordLate(task, ctx) && onRecordLate ? (
            <Button
              title={isCare ? 'Đã làm, quên ghi' : 'Đã cho dùng, quên ghi'}
              icon="clock"
              variant="subtle"
              size="sm"
              style={{ flex: 3 }}
              onPress={onRecordLate}
            />
          ) : null}
          <Button
            title="Không làm được"
            icon="block"
            variant="ghost"
            size="sm"
            style={{ flex: 2 }}
            onPress={() => onNotDone(expired ? 'Thuốc/vật tư đã hết hạn' : '')}
          />
        </Row>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
  icon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  note: { padding: spacing.md, backgroundColor: colors.redSoft, borderColor: colors.redSoft },
});
