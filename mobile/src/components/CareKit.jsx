import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from './Icon';
import AppHeader from './AppHeader';
import { Badge, Button, ProgressBar, Row } from './ui';
import { expiryDaysText, expiryOf, formatDate, lotsOf, takeFromLots } from '../utils/groom';
import { colors, radius, shadow, spacing } from '../theme';

/**
 * The parts the three care tabs (Cho ăn, Thuốc, Việc chuồng) are built from, so they read alike:
 * the same header, the same summary card, the same filter tabs, notices, groups and rows. What each
 * job needs of its own (a meal's bucket, a dose's hour and route, a chore's day) goes into them.
 */

/**
 * A care tab: the header and the switch between the three stay put; under them the summary scrolls
 * away and the filter tabs stay on top while the list scrolls. `overlays`: the tab's sheets and modals.
 */
export function CareFrame({ subtitle, right, segments, summary, filters, refreshing, onRefresh, children, overlays }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="Chăm sóc" subtitle={subtitle} right={right} />
      {segments}
      <ScrollView
        stickyHeaderIndices={filters ? [1] : undefined}
        contentContainerStyle={styles.scroll}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.forest} /> : undefined}
      >
        <View style={styles.summaryWrap}>{summary}</View>
        {filters ? <View style={styles.filtersWrap}>{filters}</View> : <View />}
        <View style={styles.content}>{children}</View>
      </ScrollView>
      {overlays}
    </SafeAreaView>
  );
}

/**
 * Where the job stands, in one card: "3/8" big with what it counts, a line under it, something on the
 * right (the meal's hour, the next dose, the day), and how far along the job is.
 */
export function SummaryCard({ done, total, label, note, right, progress, alert = false }) {
  return (
    <View style={[styles.summary, shadow.card]}>
      <Row style={{ gap: spacing.md, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Row style={{ gap: 2, alignItems: 'flex-end' }}>
            <Text style={[styles.big, alert && { color: colors.red }]}>{done}</Text>
            {total != null ? <Text style={styles.bigTotal}>/{total}</Text> : null}
          </Row>
          <Text style={styles.summaryLabel} numberOfLines={1}>
            {label}
          </Text>
          {note ? (
            <Text style={styles.summaryNote} numberOfLines={2}>
              {note}
            </Text>
          ) : null}
        </View>
        {right}
      </Row>
      {progress != null ? <ProgressBar percent={progress} tint={colors.green} track={colors.graySoft} height={6} /> : null}
    </View>
  );
}

/** A small rounded chip for the summary's right side: an icon and a short text ("17:30", "Tiếp theo 14:00"). */
export function MetaChip({ icon = 'clock', text, tone = colors.forest, bg = colors.forestSoft }) {
  return (
    <View style={[styles.metaChip, { backgroundColor: bg }]}>
      <Icon name={icon} size={14} color={tone} />
      <Text style={[styles.metaText, { color: tone }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/**
 * The tabs that narrow the list (the day's meals, the doses now / later / done, the chores to do).
 * Lighter than the switch above them: that one changes the job, these the part of it shown.
 * `options`: { value, label, sub?, alert? }.
 */
export function FilterTabs({ options, value, onChange }) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${o.label}${o.sub ? `, ${o.sub}` : ''}`}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && { opacity: 0.8 }]}
          >
            <Row style={{ gap: 4 }}>
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]} numberOfLines={1}>
                {o.label}
              </Text>
              {o.alert ? <View style={styles.tabAlert} /> : null}
            </Row>
            {o.sub ? (
              <Text style={[styles.tabSub, on && { color: colors.forestLight }]} numberOfLines={1}>
                {o.sub}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** One line that needs a look (stock running out, work left from earlier days), with its one action. */
export function Notice({ tone = 'warning', icon = 'warning', title, text, action, onAction }) {
  const palette = {
    warning: { fg: colors.orange, bg: '#fff7ed', border: '#fed7aa' },
    danger: { fg: colors.red, bg: '#fef2f2', border: '#fecaca' },
    success: { fg: colors.green, bg: '#f0fdf4', border: '#bbf7d0' },
    info: { fg: colors.blue, bg: '#eff6ff', border: '#bfdbfe' },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Icon name={icon} size={17} color={palette.fg} />
      <Text style={styles.noticeText} numberOfLines={3}>
        {title ? <Text style={{ fontWeight: '800' }}>{title} </Text> : null}
        {text}
      </Text>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} hitSlop={8} style={({ pressed }) => [styles.noticeAction, { borderColor: palette.fg }, pressed && { opacity: 0.7 }]}>
          <Text style={[styles.noticeActionText, { color: palette.fg }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A card of rows under one head. `variant`: 'label' — a small caps heading ("CẦN CHO ĂN · 6"); 'horse'
 * — a horse with its stall plate (`lead`) and how much of its work is done (`meta`). `foldable` folds it.
 */
export function WorkGroup({ title, lead, meta, variant = 'label', foldable = false, open = true, onToggle, children }) {
  const head = title ? (
    <Pressable
      accessibilityRole={foldable ? 'button' : undefined}
      disabled={!foldable}
      onPress={onToggle}
      style={[styles.groupHead, variant === 'horse' && styles.groupHeadHorse]}
    >
      {lead}
      <Text style={variant === 'horse' ? styles.groupHorse : styles.groupLabel} numberOfLines={1}>
        {title}
      </Text>
      {meta ? <Text style={styles.groupMeta}>{meta}</Text> : null}
      {foldable ? <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} color={colors.textMuted} /> : null}
    </Pressable>
  ) : null;
  return (
    <View style={styles.group}>
      {head}
      {!foldable || open ? children : null}
    </View>
  );
}

/**
 * One piece of work: what leads the line (a stall plate, an hour, the job's icon), its title with small
 * tags, one line of detail, one line of where it stands, and on the right its one button — or a tick
 * when done, an hour when not yet. The line opens the detail; the button sits beside it, never inside.
 */
export function WorkRow({ lead, title, tags, detail, detailLines = 1, body, footer, status, statusTone, action, trailing, done = false, accent, onPress, label }) {
  return (
    <View style={[styles.rowWrap, done && styles.rowDone, accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null]}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={label || title} onPress={onPress} style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}>
        {lead}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Row style={{ gap: 6 }}>
            <Text style={[styles.rowTitle, done && styles.rowTitleDone]} numberOfLines={1}>
              {title}
            </Text>
            {tags}
          </Row>
          {detail ? (
            <Text style={styles.rowDetail} numberOfLines={detailLines}>
              {detail}
            </Text>
          ) : null}
          {body}
          {status ? (
            <Text style={[styles.rowStatus, { color: statusTone || colors.textMuted }]} numberOfLines={2}>
              {status}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {action ? <Button title={action.title} icon={action.icon} variant={action.variant} size="sm" style={styles.rowAction} onPress={action.onPress} /> : trailing}
    </View>
      {footer ? (
        <Pressable accessible={false} onPress={onPress} style={[styles.rowFooter, lead ? null : { paddingLeft: spacing.md }]}>
          {footer}
        </Pressable>
      ) : null}
    </View>
  );
}

/** The leads and ends of a row. */
export const DoneMark = () => <Icon name="checkCircle" size={24} color={colors.green} />;
export const MoreMark = () => <Icon name="chevronRight" size={16} color={colors.textFaint} />;
export function TimeChip({ time }) {
  return (
    <View style={styles.timeChip}>
      <Text style={styles.timeChipText}>{time}</Text>
    </View>
  );
}
/** An hour as the line's lead (a dose at 08:00), or an icon when it has none. */
export function TimeLead({ time, icon = 'clock', tone = colors.forest, bg = colors.forestSoft }) {
  return (
    <View style={[styles.lead, { backgroundColor: bg }]}>
      {time ? <Text style={[styles.leadTime, { color: tone }]}>{time}</Text> : <Icon name={icon} size={18} color={tone} />}
    </View>
  );
}
/** The job's icon as the line's lead (mucking out, icing, …). */
export function IconLead({ icon, color, bg }) {
  return (
    <View style={[styles.lead, { backgroundColor: bg }]}>
      <Icon name={icon} size={18} color={color} />
    </View>
  );
}

/** A day picker for the summary card: ‹ Hôm nay · T2 16/11 ›, tapping the middle comes back to today. */
export function DayPicker({ label, hint, onPrev, onNext, onToday }) {
  return (
    <Row style={{ gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Ngày trước" onPress={onPrev} hitSlop={8} style={styles.dayNav}>
        <Icon name="chevronLeft" size={16} color={colors.forest} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Về hôm nay" onPress={onToday} style={{ alignItems: 'center', minWidth: 74 }}>
        <Text style={styles.dayLabel} numberOfLines={1}>
          {label}
        </Text>
        {hint ? <Text style={styles.dayHint}>{hint}</Text> : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Ngày sau" onPress={onNext} hitSlop={8} style={styles.dayNav}>
        <Icon name="chevronRight" size={16} color={colors.forest} />
      </Pressable>
    </Row>
  );
}

/** A small round toggle beside the filters ("Của tôi", "Theo ngựa"). */
export function ToggleChip({ icon, label, on = false, onPress, a11y }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y || label} onPress={onPress} style={({ pressed }) => [styles.toggle, on && styles.toggleOn, pressed && { opacity: 0.7 }]}>
      {icon ? <Icon name={icon} size={14} color={on ? colors.white : colors.forest} /> : null}
      <Text style={[styles.toggleText, on && { color: colors.white }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The colours of an expiry: red when it is days away, amber within the use-first window. */
export const EXPIRY_TONE = {
  urgent: { fg: colors.red, bg: '#fef2f2', border: '#fecaca' },
  soon: { fg: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  ok: { fg: colors.textMuted, bg: colors.graySoft, border: colors.borderSoft },
};

/**
 * A stall's code as a light tag ("A-01") leading a line — the stable's order without a dark block on
 * every row. A horse not on the stable map yet shows its initial.
 */
export function StallTag({ code, name }) {
  return (
    <View style={styles.stallTag}>
      <Text style={styles.stallTagText} numberOfLines={1} adjustsFontSizeToFit>
        {code || name?.[0]?.toUpperCase() || '?'}
      </Text>
    </View>
  );
}

/**
 * One thing that goes in the bucket or the syringe: its icon, name and amount, and under them the
 * expiry of the lot to take ("HSD 20/11"), in amber or red when it is close.
 */
export function ItemChip({ icon = 'feed', label, amount, expiry }) {
  const tone = expiry ? EXPIRY_TONE[expiry.tone] : null;
  const close = tone && expiry.tone !== 'ok';
  return (
    <View style={[styles.itemChip, close ? { borderColor: tone.border, backgroundColor: tone.bg } : null]}>
      <Icon name={icon} size={14} color={colors.forestLight} />
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.itemChipText} numberOfLines={1}>
          {label}
          {amount ? <Text style={styles.itemChipAmount}> {amount}</Text> : null}
        </Text>
        {expiry ? (
          <Text style={[styles.itemChipExpiry, { color: tone.fg }]} numberOfLines={1}>
            {expiry.label}
            {close ? ` · ${expiry.days <= 0 ? 'hết hạn hôm nay' : `còn ${expiry.days} ngày`}` : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * "Dùng trước — sắp hết hạn": the stock of this job whose next lot expires soon. What today's work
 * uses comes first, with the reassurance that recording takes that lot first; what nothing uses yet is
 * listed for the trainer (feed) or the vet (medicine) to put to use. `entries`: useFirstItems().
 */
export function UseFirstCard({ entries, kind = 'feed', onOpenStore }) {
  if (!entries.length) return null;
  const used = entries.filter((e) => e.inUse);
  const idle = entries.filter((e) => !e.inUse);
  const line = ({ item, expiry }) => (
    <Row key={item._id} style={styles.useFirstLine}>
      <View style={[styles.useFirstDot, { backgroundColor: EXPIRY_TONE[expiry.tone].fg }]} />
      <Text style={styles.useFirstName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={[styles.useFirstWhen, { color: EXPIRY_TONE[expiry.tone].fg }]} numberOfLines={1}>
        {expiry.label} · {expiry.days <= 0 ? 'hôm nay' : `${expiry.days} ngày`}
      </Text>
      <Text style={styles.useFirstQty} numberOfLines={1}>
        {expiry.qty} {item.unit}
      </Text>
    </Row>
  );
  return (
    <View style={styles.useFirst}>
      <Row style={{ gap: spacing.sm }}>
        <Icon name="clock" size={16} color="#b45309" />
        <Text style={styles.useFirstTitle}>Dùng trước — sắp hết hạn</Text>
        {onOpenStore ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Mở kho" onPress={onOpenStore} hitSlop={10} style={styles.useFirstLink}>
            <Text style={styles.useFirstLinkText}>Kho</Text>
            <Icon name="chevronRight" size={13} color={colors.forest} />
          </Pressable>
        ) : null}
      </Row>
      {used.length ? (
        <>
          {used.map(line)}
          <Text style={styles.useFirstHint}>Lấy lô có hạn gần nhất trước — khi ghi nhận, kho cũng trừ lô đó trước.</Text>
        </>
      ) : null}
      {idle.length ? (
        <>
          <Text style={[styles.useFirstSub, used.length ? { marginTop: spacing.sm } : null]}>
            {kind === 'medicine' ? 'Chưa có trong toa — báo bác sĩ để dùng trước khi hết hạn' : 'Chưa có trong khẩu phần — báo HLV để dùng trước khi hết hạn'}
          </Text>
          {idle.map(line)}
        </>
      ) : null}
    </View>
  );
}

/**
 * What a horse eats when not as planned (GET /horses feedingDiet): the sick diet the vet ordered — what to
 * mind and the vet's own words — or the week back to its training ration. Nothing when it eats as planned.
 * DietTag: the badge for a row; DietNote: the block for the meal's sheet.
 */
export function DietTag({ diet }) {
  if (!diet) return null;
  return diet.diet === 'ramp' ? <Badge label={`Tập ăn lại ${diet.percent}%`} color={colors.blue} bg={colors.blueSoft} /> : <Badge label="Chế độ bệnh" color={colors.orange} bg={colors.orangeSoft} />;
}

/** The diet's line for a row: the vet's words first, else what to mind. */
export const dietLine = (diet) => (diet?.diet === 'sick' ? diet.note || diet.care : null);

export function DietNote({ diet }) {
  if (!diet) return null;
  const sick = diet.diet === 'sick';
  const fg = sick ? colors.orange : colors.blue;
  return (
    <View style={[styles.diet, { backgroundColor: sick ? '#fff7ed' : '#eff6ff', borderColor: sick ? '#fed7aa' : '#bfdbfe' }]}>
      <Row style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
        <Icon name={sick ? 'vet' : 'info'} size={18} color={fg} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={[styles.dietTitle, { color: fg }]}>{sick ? `Chế độ bệnh · ${diet.label}` : diet.label}</Text>
          {diet.care ? <Text style={styles.dietText}>{diet.care}</Text> : null}
          {diet.note ? (
            <Text style={styles.dietText}>
              <Text style={{ fontWeight: '700' }}>Bác sĩ dặn: </Text>
              {diet.note}
            </Text>
          ) : null}
        </View>
      </Row>
    </View>
  );
}

/** A line under the list that leads elsewhere ("Kho thức ăn: 10 loại · 1 sắp hết · 2 sắp hết hạn"). */
export function LinkLine({ icon, title, text, tone = colors.textMuted, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title} ${text}`} onPress={onPress} style={({ pressed }) => [styles.linkLine, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={16} color={tone} />
      <Text style={styles.linkLineText} numberOfLines={2}>
        <Text style={{ fontWeight: '800', color: colors.text }}>{title} </Text>
        {text}
      </Text>
      <Icon name="chevronRight" size={14} color={colors.textFaint} />
    </Pressable>
  );
}

/**
 * Which lots to take for an amount, in the order the store gives them out (the one expiring first
 * first): "Lấy 1,5 kg lô HSD 20/11 + 2 kg lô HSD 30/11 · còn 3 ngày". Nothing when the item has no lot.
 */
export function LotsLine({ item, amount, unit, prefix }) {
  if (!item) return null;
  const { plan } = takeFromLots(item, amount || 0);
  const lots = amount ? plan : lotsOf(item).usable.slice(0, 1).map((l) => ({ ...l, take: null }));
  if (!lots.length) return null;
  const first = expiryOf(item);
  const close = first && first.tone !== 'ok';
  const text = lots.map((l) => `${l.take ? `${l.take} ${unit || item.unit} ` : ''}lô ${l.expiryDate ? `HSD ${formatDate(l.expiryDate).slice(0, 5)}` : 'không ghi hạn'}`).join(' + ');
  return (
    <Text style={[styles.lots, { color: close ? EXPIRY_TONE[first.tone].fg : colors.forestLight }]}>
      {prefix ? `${prefix}: ` : 'Lấy '}
      {text}
      {close ? ` · ${expiryDaysText(first.days)}` : ''}
    </Text>
  );
}

/** Every lot of an item on the shelf: its expiry and how much is left, the one to use first marked, expired ones apart. */
export function LotsList({ item }) {
  if (!item) return null;
  const { usable, expired } = lotsOf(item);
  if (!usable.length && !expired.length) return null;
  return (
    <View style={styles.lotsList}>
      {usable.map((l, i) => (
        <Row key={`u${i}`} style={styles.lotRow}>
          <Text style={styles.lotDate}>{l.expiryDate ? `HSD ${formatDate(l.expiryDate)}` : 'Không ghi hạn'}</Text>
          <Text style={styles.lotQty}>
            {l.qty} {item.unit}
          </Text>
          {i === 0 ? <Badge label="Dùng trước" color={colors.forest} bg={colors.forestSoft} /> : <View style={{ width: 70 }} />}
        </Row>
      ))}
      {expired.map((l, i) => (
        <Row key={`x${i}`} style={styles.lotRow}>
          <Text style={[styles.lotDate, { color: colors.red }]}>HSD {formatDate(l.expiryDate)}</Text>
          <Text style={[styles.lotQty, { color: colors.red }]}>
            {l.qty} {item.unit}
          </Text>
          <Badge label="Hết hạn" color={colors.red} bg={colors.redSoft} />
        </Row>
      ))}
    </View>
  );
}

/**
 * What goes in the bucket, a line each: the feed's icon and name, the amount, and the expiry of the lot
 * to take — red or amber when it is close. `items`: [{ icon, label, amount, expiry }].
 */
export function ItemLines({ items }) {
  return (
    <View style={{ gap: 3 }}>
      {items.map((it, i) => {
        const close = it.expiry && it.expiry.tone !== 'ok';
        const tone = it.expiry ? EXPIRY_TONE[it.expiry.tone] : null;
        return (
          <Row key={i} style={styles.itemLine}>
            <Icon name={it.icon || 'feed'} size={14} color={colors.forestLight} />
            <Text style={styles.itemLineName} numberOfLines={1}>
              {it.label}
            </Text>
            <Text style={styles.itemLineAmount}>{it.amount}</Text>
            {it.expiry ? (
              <View style={[styles.itemLineExpiry, close ? { backgroundColor: tone.bg, borderColor: tone.border } : null]}>
                <Text style={[styles.itemLineExpiryText, { color: tone.fg }]} numberOfLines={1}>
                  {it.expiry.label.replace('HSD ', '')}
                  {close ? ` · ${it.expiry.days <= 0 ? 'hôm nay' : `${it.expiry.days}n`}` : ''}
                </Text>
              </View>
            ) : (
              <View style={styles.itemLineExpiryEmpty} />
            )}
          </Row>
        );
      })}
    </View>
  );
}

/** Chips in a row that wrap: the bucket of a meal. */
export const ChipWrap = ({ children }) => <View style={styles.chips}>{children}</View>;

/** The buttons a row's state calls for, in each job's own words (`words`: { complete, notDone? }). */
export function rowAction(actionKey, words = {}) {
  const base = {
    complete: { title: words.complete || 'Xong', icon: 'check', variant: 'primary' },
    late: { title: 'Quên ghi', icon: 'clock', variant: 'subtle' },
    restock: { title: 'Xin kho', icon: 'plus', variant: 'danger' },
    notDone: { title: words.notDone || 'Báo lỡ', icon: 'block', variant: 'ghost' },
  };
  return base[actionKey] || null;
}

const styles = StyleSheet.create({
  diet: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  dietTitle: { fontSize: 14, fontWeight: '700' },
  dietText: { fontSize: 13, lineHeight: 19, color: colors.text },
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { paddingBottom: spacing.xxl },
  summaryWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  filtersWrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm, backgroundColor: colors.cream },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },

  summary: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSoft, padding: spacing.lg, gap: spacing.md },
  big: { fontSize: 30, fontWeight: '800', color: colors.forest, lineHeight: 34, fontVariant: ['tabular-nums'] },
  bigTotal: { fontSize: 18, fontWeight: '700', color: colors.textFaint, paddingBottom: 3, fontVariant: ['tabular-nums'] },
  summaryLabel: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  summaryNote: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  metaText: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },

  tabs: { flexDirection: 'row', gap: 6 },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', gap: 1, paddingVertical: 7, paddingHorizontal: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  tabOn: { borderColor: colors.forest, backgroundColor: colors.forestSoft },
  tabLabel: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  tabLabelOn: { color: colors.forest, fontWeight: '800' },
  tabSub: { fontSize: 11, fontWeight: '600', color: colors.textFaint, fontVariant: ['tabular-nums'] },
  tabAlert: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.red },

  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  noticeText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: colors.text },
  noticeAction: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  noticeActionText: { fontSize: 12, fontWeight: '800' },

  group: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 6 },
  groupHeadHorse: { paddingTop: 8, paddingBottom: 8, backgroundColor: '#fbfaf6' },
  groupLabel: { flex: 1, fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  groupHorse: { flex: 1, fontSize: 14.5, fontWeight: '800', color: colors.forest },
  groupMeta: { fontSize: 12, fontWeight: '700', color: colors.textMuted, fontVariant: ['tabular-nums'] },

  rowWrap: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 10 },
  rowFooter: { paddingLeft: spacing.md + 46 + spacing.md, paddingRight: spacing.md, paddingBottom: 10, marginTop: -4, gap: 3 },
  rowDone: { backgroundColor: '#f8fbf9' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  rowTitle: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  rowTitleDone: { color: colors.textMuted },
  rowDetail: { fontSize: 12.5, color: colors.text },
  rowStatus: { fontSize: 12, fontWeight: '600' },
  rowAction: { minWidth: 84, paddingHorizontal: 10 },
  lead: { width: 46, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  leadTime: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.graySoft },
  timeChipText: { fontSize: 12.5, fontWeight: '800', color: colors.textMuted, fontVariant: ['tabular-nums'] },

  stallTag: { minWidth: 46, height: 34, paddingHorizontal: 6, borderRadius: radius.sm, backgroundColor: colors.forestSoft, borderWidth: 1, borderColor: '#cdeedd', alignItems: 'center', justifyContent: 'center' },
  stallTagText: { fontSize: 12.5, fontWeight: '800', color: colors.forest, letterSpacing: 0.2 },
  itemChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: '#fbfaf6', maxWidth: '100%' },
  itemChipText: { fontSize: 12.5, fontWeight: '600', color: colors.text },
  itemChipAmount: { fontWeight: '800', color: colors.forest },
  itemChipExpiry: { fontSize: 10.5, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  useFirst: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: radius.md, padding: spacing.md, gap: 6 },
  useFirstTitle: { flex: 1, fontSize: 13.5, fontWeight: '800', color: '#92400e' },
  useFirstLink: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32, paddingHorizontal: 4 },
  useFirstLinkText: { fontSize: 12.5, fontWeight: '800', color: colors.forest },
  useFirstLine: { gap: spacing.sm, paddingVertical: 3 },
  useFirstDot: { width: 7, height: 7, borderRadius: 4 },
  useFirstName: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  useFirstWhen: { fontSize: 12, fontWeight: '800' },
  useFirstQty: { minWidth: 54, textAlign: 'right', fontSize: 12, fontWeight: '600', color: colors.textMuted },
  useFirstHint: { fontSize: 11.5, color: '#92400e' },
  useFirstSub: { fontSize: 11.5, fontWeight: '700', color: colors.textMuted },
  linkLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.white },
  linkLineText: { flex: 1, fontSize: 12.5, color: colors.textMuted },
  itemLine: { gap: 6, minHeight: 22 },
  itemLineName: { flex: 1, fontSize: 13, color: colors.text },
  itemLineAmount: { fontSize: 13, fontWeight: '800', color: colors.forest, fontVariant: ['tabular-nums'] },
  itemLineExpiry: { minWidth: 70, alignItems: 'center', paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.graySoft },
  itemLineExpiryText: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  itemLineExpiryEmpty: { minWidth: 70 },
  lots: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  lotsList: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 6, gap: 2 },
  lotRow: { gap: spacing.sm, minHeight: 30 },
  lotDate: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  lotQty: { fontSize: 12.5, fontWeight: '600', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  dayNav: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: colors.graySoft, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { fontSize: 13, fontWeight: '800', color: colors.forest },
  dayHint: { fontSize: 10.5, color: colors.textMuted },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  toggleOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  toggleText: { fontSize: 12.5, fontWeight: '700', color: colors.forest },
});
