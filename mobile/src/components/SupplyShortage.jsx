import { StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { Button, Card, Row } from './ui';
import { colors, font, spacing } from '../theme';

/**
 * Why a piece of work cannot be recorded: the store is short of what it would take out. Shown the
 * same way wherever work is recorded — a chore, a meal, a dose — with the one button that fixes it,
 * an already-filled request to the Manager.
 */
export default function SupplyShortage({ missing = [], onAskSupply, compact = false }) {
  if (!missing.length) return null;

  return (
    <Card style={styles.card}>
      <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
        <Icon name="supplies" size={15} color={colors.red} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Text style={font.tiny}>Thiếu vật tư, chưa ghi nhận được</Text>
          {missing.map((m) => (
            <Text key={m.inventoryItem || m.name} style={[font.body, { color: colors.red }]}>
              {m.name}: cần {m.needed} {m.unit}, còn {m.available} {m.unit}
            </Text>
          ))}
          {onAskSupply ? (
            <Button
              title={compact ? 'Xin bổ sung' : 'Xin bổ sung cho Quản lý'}
              icon="plus"
              variant="danger"
              size="sm"
              style={{ alignSelf: 'flex-start' }}
              onPress={() => onAskSupply(missing[0])}
            />
          ) : null}
        </View>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.redSoft, borderColor: colors.redSoft, padding: spacing.md },
});
