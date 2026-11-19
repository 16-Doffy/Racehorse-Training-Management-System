import { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import { ProposeItemModal, RestockModal } from '../../components/veterinarian/SupplyModals';
import { Callout, EmptyNote, LoadingBlock, PageHead, SearchBox, StatTiles } from '../../components/veterinarian/ui';
import { ago } from '../../components/veterinarian/vetFormat';
import { useExamTools, useVetRefresh } from '../../hooks/useVetData';

const DEFAULT_MIN = 5;

// Where the stock stands against the item's own minimum (5 when the Manager set none).
function stockState(item) {
  const min = item.reorderLevel ?? DEFAULT_MIN;
  if (item.isProposed) return { key: 'proposed', rank: 3, label: 'Món mới · chờ duyệt', tone: 'info', icon: 'bi-hourglass-split' };
  if ((item.quantity || 0) <= 0) return { key: 'out', rank: 0, label: 'Hết hàng', tone: 'bad', icon: 'bi-x-octagon-fill' };
  if (item.quantity <= min) return { key: 'low', rank: 1, label: 'Sắp hết', tone: 'watch', icon: 'bi-exclamation-triangle-fill' };
  return { key: 'ok', rank: 2, label: 'Đủ dùng', tone: 'good', icon: 'bi-check-circle-fill' };
}

/** The latest request on an item that is still open: waiting for approval, or approved and on its way. */
function openRequest(item) {
  const requests = [...(item.restockRequests || [])].reverse();
  const pending = requests.find((r) => r.status === 'pending');
  if (pending) return { tone: 'info', icon: 'bi-send', text: `Đã đề xuất +${pending.quantity} ${item.unit}, chờ Quản lý duyệt`, at: pending.requestedAt };
  const coming = requests.find((r) => r.status === 'approved' && r.awaitingDelivery);
  if (coming) return { tone: 'good', icon: 'bi-truck', text: `Đã duyệt +${coming.approvedQuantity ?? coming.quantity} ${item.unit}, đang chờ hàng về`, at: coming.reviewedAt };
  return null;
}

// A tool's picture, from its name (Vietnamese or English).
const ICONS = [
  [/kim|tiêm|needle|syringe/i, 'bi-eyedropper'],
  [/nhiệt kế|thermometer/i, 'bi-thermometer-half'],
  [/ống nghe|stethoscope/i, 'bi-heart-pulse'],
  [/găng|glove/i, 'bi-hand-index-thumb'],
  [/băng|gạc|bandage|gauze/i, 'bi-bandaid'],
  [/kéo|scissor/i, 'bi-scissors'],
  [/đèn|light|torch/i, 'bi-lightbulb'],
  [/cồn|sát khuẩn|alcohol|antiseptic/i, 'bi-droplet'],
  [/cân|scale/i, 'bi-speedometer'],
];
const iconOf = (name) => ICONS.find(([re]) => re.test(name || ''))?.[1] || 'bi-tools';
/** "Kim tiêm thú y (Veterinary Needles)" → the Vietnamese name, and the English one under it. */
function namesOf(name) {
  const m = String(name || '').match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { vi: m[1], en: m[2] } : { vi: name, en: '' };
}

/**
 * One tool as a card: its picture and names, how many are left in large type with a bar against the minimum,
 * where it is kept, an open request if any, and the one action — ask for more (filled when it runs low).
 */
function ToolCard({ item, onRestock }) {
  const state = stockState(item);
  const request = openRequest(item);
  const { vi, en } = namesOf(item.name);
  const min = item.reorderLevel ?? DEFAULT_MIN;
  // The bar: full at three times the minimum, so "low" sits in its first third.
  const pct = item.isProposed ? 0 : Math.max(item.quantity > 0 ? 4 : 0, Math.min(100, Math.round(((item.quantity || 0) / Math.max(min * 3, 1)) * 100)));
  return (
    <article className={`vet-tool vet-tool-${state.tone}`}>
      <div className="vet-tool-top">
        <span className={`vet-tool-icon vet-tone-${state.tone}`} aria-hidden="true">
          <i className={`bi ${iconOf(item.name)}`} />
        </span>
        <span className={`vet-tool-state vet-text-${state.tone}`}>
          <i className={`bi ${state.icon}`} aria-hidden="true" /> {state.label}
        </span>
      </div>
      <div className="vet-tool-names">
        <h3 className="vet-tool-name">{vi}</h3>
        {en && <div className="vet-tool-en">{en}</div>}
        {item.description && <div className="vet-tool-desc">{item.description}</div>}
      </div>

      {item.isProposed ? (
        <div className="vet-tool-proposed">Quản lý duyệt xong thì món này vào kho.</div>
      ) : (
        <div className="vet-tool-stock">
          <div className="d-flex align-items-baseline justify-content-between gap-2">
            <span>
              <span className={`vet-tool-qty vet-text-${state.tone === 'good' ? 'neutral' : state.tone}`}>{item.quantity}</span> <span className="vet-tool-unit">{item.unit}</span>
            </span>
            <span className="vet-small vet-faint">tối thiểu {min}</span>
          </div>
          <div className="vet-tool-bar" role="meter" aria-valuemin={0} aria-valuemax={min * 3} aria-valuenow={item.quantity} aria-label={`Còn ${item.quantity} ${item.unit}`}>
            <span className={`vet-tone-${state.tone}`} style={{ width: `${pct}%` }} />
            <i style={{ left: '33.3%' }} title={`Mức tối thiểu: ${min} ${item.unit}`} />
          </div>
        </div>
      )}

      <div className="vet-tool-meta">
        {item.stableBlock && (
          <span>
            <i className="bi bi-geo-alt" aria-hidden="true" /> {item.stableBlock}
          </span>
        )}
        {request && (
          <span className={`vet-text-${request.tone}`}>
            <i className={`bi ${request.icon}`} aria-hidden="true" /> {request.text}
            {request.at ? ` · ${ago(request.at)}` : ''}
          </span>
        )}
      </div>

      {!item.isProposed && (
        <Button size="sm" variant={state.key === 'ok' ? 'vet-outline' : 'vet'} className="vet-tool-action" onClick={() => onRestock(item)}>
          <i className="bi bi-box-arrow-in-down" aria-hidden="true" /> {request ? 'Đề xuất thêm' : 'Đề xuất bổ sung'}
        </Button>
      )}
    </article>
  );
}

/**
 * The examination tools the vet keeps — stethoscope, thermometer, needles — as cards. Medicines are not here:
 * they are the groom's stock, given and taken out of stock by the groom; the vet only prescribes them.
 */
export default function MedicalInventoryPage() {
  const refresh = useVetRefresh();
  const toolsQ = useExamTools();
  const [tile, setTile] = useState(null);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);

  const tools = useMemo(() => toolsQ.data || [], [toolsQ.data]);
  const countOf = (keys) => tools.filter((i) => keys.includes(stockState(i).key)).length;
  const waiting = tools.filter((i) => openRequest(i) || i.isProposed).length;
  const TILE_MATCH = {
    ok: (i) => stockState(i).key === 'ok',
    low: (i) => ['low', 'out'].includes(stockState(i).key),
    waiting: (i) => Boolean(openRequest(i) || i.isProposed),
  };
  const q = query.trim().toLowerCase();
  const shown = tools
    .filter((i) => (!tile || !TILE_MATCH[tile] || TILE_MATCH[tile](i)) && (!q || i.name?.toLowerCase().includes(q) || i.stableBlock?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)))
    .sort((a, b) => stockState(a).rank - stockState(b).rank || a.name.localeCompare(b.name));

  return (
    <div className="vet-ui">
      <PageHead
        title="Dụng cụ khám bệnh"
        subtitle="Ống nghe, nhiệt kế, kim tiêm… bác sĩ dùng khi khám. Sắp hết thì đề xuất bổ sung, Quản lý duyệt và nhập. Thuốc thuộc kho của nhân viên chăm sóc — bác sĩ chỉ kê đơn."
        actions={
          <Button variant="vet" onClick={() => setDialog({ type: 'propose' })}>
            <i className="bi bi-plus-lg" aria-hidden="true" /> Đề xuất dụng cụ mới
          </Button>
        }
      />

      {!toolsQ.isLoading && (
        <StatTiles
          value={tile}
          onChange={setTile}
          items={[
            { key: 'all', static: true, label: 'Tổng dụng cụ', value: tools.length, icon: 'bi-tools', tone: 'info', hint: 'Đang có trong kho' },
            { key: 'ok', label: 'Đủ dùng', value: countOf(['ok']), icon: 'bi-check-circle', tone: 'good', hint: 'Trên mức tối thiểu' },
            { key: 'low', label: 'Sắp hết / hết', value: countOf(['low', 'out']), icon: 'bi-exclamation-triangle', tone: countOf(['low', 'out']) ? 'bad' : 'neutral', hint: 'Cần đề xuất bổ sung' },
            { key: 'waiting', label: 'Đang chờ', value: waiting, icon: 'bi-hourglass-split', tone: waiting ? 'watch' : 'neutral', hint: 'Đề xuất chờ duyệt / chờ hàng' },
          ]}
        />
      )}

      <div className="vet-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Tìm dụng cụ, công dụng, khu vực…" />
        {tile && (
          <Button size="sm" variant="vet-ghost" onClick={() => setTile(null)}>
            Bỏ lọc
          </Button>
        )}
        <Button size="sm" variant="vet-ghost" className="vet-icon-btn ms-auto" onClick={refresh} title="Làm mới" aria-label="Làm mới">
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
        </Button>
      </div>

      {toolsQ.isError && (
        <Callout tone="bad" icon="bi-wifi-off" className="mb-3">
          {toolsQ.error?.message || 'Không tải được danh sách dụng cụ.'}
        </Callout>
      )}

      {toolsQ.isLoading ? (
        <LoadingBlock rows={2} height={180} />
      ) : shown.length === 0 && tools.length > 0 ? (
        <div className="vet-card">
          <EmptyNote icon="bi-tools" title="Không có dụng cụ phù hợp" />
        </div>
      ) : (
        <div className="vet-tool-grid">
          {shown.map((item) => (
            <ToolCard key={item._id} item={item} onRestock={(it) => setDialog({ type: 'restock', item: it })} />
          ))}
          {/* Something the stable does not stock yet: proposed from here too. */}
          {!tile && (
            <button type="button" className="vet-tool vet-tool-new" onClick={() => setDialog({ type: 'propose' })}>
              <span className="vet-tool-icon" aria-hidden="true">
                <i className="bi bi-plus-lg" />
              </span>
              <span className="vet-tool-name">Đề xuất dụng cụ mới</span>
              <span className="vet-tool-desc">Kho chưa có món bác sĩ cần? Gửi đề xuất để Quản lý duyệt và nhập.</span>
            </button>
          )}
        </div>
      )}

      {dialog?.type === 'restock' && <RestockModal item={dialog.item} onHide={() => setDialog(null)} onDone={refresh} />}
      {dialog?.type === 'propose' && <ProposeItemModal onHide={() => setDialog(null)} onDone={refresh} />}
    </div>
  );
}
