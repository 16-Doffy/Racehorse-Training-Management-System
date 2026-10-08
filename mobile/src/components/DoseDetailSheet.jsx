import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import Icon from './Icon';
import { Badge, Button, Card, DataRow, HorseAvatar, Row, Sheet } from './ui';
import { TIMING_STATE, findStock, formatDate, formatDateTime } from '../utils/groom';
import { colors, font, radius, spacing } from '../theme';

/**
 * One line of a prescription in full: the medicine, its dose, how much of it the store has, and
 * the record of giving it today. The list behind this sheet only shows the name and its state.
 */
export default function DoseDetailSheet({ dose, visible, onClose, onComplete, onNotDone, onAskSupply }) {
  if (!dose) return <Sheet visible={visible} onClose={onClose} title="Chi tiết y lệnh" />;

  const { title, dosage, frequency, task, treatment, inventory, isCare } = dose;
  const stock = isCare ? null : findStock(title, inventory, 'medicine');
  const timing = task?.timing || {};
  const timingCfg = TIMING_STATE[timing.state];
  const done = task?.status === 'completed';
  const canComplete = task?.status === 'pending' && timing.canComplete !== false;

  return (
    <Sheet visible={visible} onClose={onClose} title={isCare ? 'Hướng dẫn chăm sóc' : 'Chi tiết thuốc'}>
      <ScrollView contentContainerStyle={styles.body}>
        <Row style={{ gap: spacing.md }}>
          <View style={[styles.icon, { backgroundColor: isCare ? colors.purpleSoft : colors.redSoft }]}>
            <Icon name={isCare ? 'monitoring' : 'medication'} size={22} color={isCare ? colors.purple : colors.red} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={font.h2}>{title}</Text>
            <Row style={{ gap: spacing.sm, marginTop: 4, flexWrap: 'wrap' }}>
              {dosage ? <Badge label={`Liều ${dosage}`} color={colors.forest} bg={colors.forestSoft} /> : null}
              {frequency ? <Badge label={frequency} /> : null}
              {done ? (
                <Badge label="Đã cho dùng" color={colors.green} bg={colors.greenSoft} />
              ) : timingCfg && task ? (
                <Badge label={timingCfg.label} color={timingCfg.color} bg={timingCfg.bg} />
              ) : null}
            </Row>
          </View>
        </Row>

        {/* Stock for this exact medicine — the overview lists the whole store, this is just one. */}
        {!isCare ? (
          <Card>
            <Text style={[font.tiny, { marginBottom: spacing.sm }]}>Thuốc này trong kho</Text>
            {stock ? (
              <>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={font.body}>{stock.items[0]?.name}</Text>
                  <Text style={[font.h3, { color: stock.level.color }]}>
                    {stock.quantity} {stock.unit}
                  </Text>
                </Row>
                <Badge label={stock.level.label} color={stock.level.color} bg={stock.level.bg} style={{ marginTop: spacing.sm }} />
              </>
            ) : (
              <Text style={font.small}>Chưa có thuốc này trong danh mục kho.</Text>
            )}
            {(!stock || stock.level.key !== 'ok') && onAskSupply ? (
              <Button
                title="Xin bổ sung thuốc"
                icon="plus"
                variant="danger"
                size="sm"
                style={{ marginTop: spacing.md }}
                onPress={onAskSupply}
              />
            ) : null}
          </Card>
        ) : null}

        <Card>
          <Row style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <HorseAvatar name={treatment?.horse?.name} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={font.h3}>{treatment?.horse?.name}</Text>
              <Text style={font.small}>BS {treatment?.prescribedBy?.name || '—'}</Text>
            </View>
          </Row>
          <DataRow label="Bắt đầu" value={formatDate(treatment?.startDate)} />
          {treatment?.endDate ? <DataRow label="Kết thúc" value={formatDate(treatment.endDate)} /> : null}
          {treatment?.isTrainingLocked ? <DataRow label="Huấn luyện" value="Đang bị khóa" valueStyle={{ color: colors.red }} /> : null}
          {task?.completedAt ? <DataRow label="Đã cho dùng" value={formatDateTime(task.completedAt)} /> : null}
          {task?.skipReason ? <DataRow label="Không thực hiện" value={task.skipReason} valueStyle={{ color: colors.orange }} /> : null}
          {!task ? <DataRow label="Hôm nay" value="Chưa có việc cho liều này" /> : null}
        </Card>

        {timing.reason && task?.status === 'pending' ? (
          <Card style={{ backgroundColor: colors.orangeSoft, borderColor: colors.orangeSoft }}>
            <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
              <Icon name="clock" size={15} color={colors.orange} />
              <Text style={[font.small, { flex: 1, color: colors.orange }]}>{timing.reason}</Text>
            </Row>
          </Card>
        ) : null}
      </ScrollView>

      {task?.status === 'pending' ? (
        <View style={styles.actions}>
          <Row style={{ gap: spacing.sm }}>
            {canComplete ? <Button title="Đã cho dùng" icon="check" style={{ flex: 3 }} onPress={onComplete} /> : null}
            <Button title="Không làm được" icon="block" variant="ghost" style={{ flex: 2 }} onPress={onNotDone} />
          </Row>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
  icon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actions: { padding: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: colors.white },
});
