import { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import { ProposeItemModal, RestockModal } from '../../components/veterinarian/SupplyModals';
import { Callout, EmptyNote, LoadingBlock, Pill, SearchBox, VetCard } from '../../components/veterinarian/ui';
import { ago } from '../../components/veterinarian/vetFormat';
import { useExamTools, useVetRefresh } from '../../hooks/useVetData';

// Where the stock stands against the item's own minimum (5 when the Manager set none).
function stockState(item) {
  const min = item.reorderLevel ?? 5;
  if (item.isProposed) return { key: 'proposed', rank: 3 };
  if ((item.quantity || 0) <= 0) return { key: 'out', rank: 0, label: 'Hết', tone: 'bad' };
  if (item.quantity <= min) return { key: 'low', rank: 1, label: 'Sắp hết', tone: 'watch' };
  return { key: 'ok', rank: 2 };
}

/** The latest request on an item that is still open: waiting for approval, or approved and on its way. */
function openRequest(item) {
  const requests = [...(item.restockRequests || [])].reverse();
  const pending = requests.find((r) => r.status === 'pending');
  if (pending) return { tone: 'info', text: `Chờ duyệt +${pending.quantity} ${item.unit}`, at: pending.requestedAt };
  const coming = requests.find((r) => r.status === 'approved' && r.awaitingDelivery);
  if (coming) return { tone: 'good', text: `Đã duyệt, chờ hàng +${coming.approvedQuantity ?? coming.quantity} ${item.unit}`, at: coming.reviewedAt };
  return null;
}

/**
 * The examination tools the vet keeps — stethoscope, thermometer, needles. Medicines are not here:
 * they are the groom's stock, given and taken out of stock by the groom; the vet only prescribes them.
 */
export default function MedicalInventoryPage() {
  const refresh = useVetRefresh();
  const toolsQ = useExamTools();
  const [lowOnly, setLowOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);

  const tools = useMemo(() => toolsQ.data || [], [toolsQ.data]);
  const isLow = (i) => ['out', 'low'].includes(stockState(i).key);
  const q = query.trim().toLowerCase();
  const shown = tools
    .filter((i) => (!lowOnly || isLow(i)) && (!q || i.name?.toLowerCase().includes(q) || i.stableBlock?.toLowerCase().includes(q)))
    .sort((a, b) => stockState(a).rank - stockState(b).rank || a.name.localeCompare(b.name));
  const lowCount = tools.filter(isLow).length;

  return (
    <div className="vet-ui">
      <PageHeroBanner
        eyebrow="TEAM 8 • Y TẾ & THÚ Y"
        roleLabel="Bác sĩ Thú y"
        title="Dụng cụ khám bệnh"
        subtitle="Ống nghe, nhiệt kế, kim tiêm… bác sĩ dùng khi khám. Thuốc thuộc kho của nhân viên chăm sóc — bác sĩ chỉ kê đơn."
        stats={tools.length ? [{ label: 'Dụng cụ', value: tools.length }, { label: 'Hết / sắp hết', value: lowCount }] : []}
        actionButton={
          <Button variant="vet-hero" onClick={() => setDialog({ type: 'propose' })}>
            <i className="bi bi-plus-lg" aria-hidden="true" /> Đề xuất dụng cụ mới
          </Button>
        }
      />

      <div className="vet-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Tìm dụng cụ, khu vực…" />
        <button type="button" className={`vet-chip${lowOnly ? ' is-active' : ''}`} onClick={() => setLowOnly((v) => !v)} aria-pressed={lowOnly}>
          <span className="vet-dot vet-text-watch" aria-hidden="true" />
          Chỉ dụng cụ sắp hết
          <span className="vet-chip-count">{lowCount}</span>
        </button>
      </div>

      {toolsQ.isError && (
        <Callout tone="bad" icon="bi-wifi-off" className="mb-3">
          {toolsQ.error?.message || 'Không tải được danh sách dụng cụ.'}
        </Callout>
      )}

      <VetCard flush>
        {toolsQ.isLoading ? (
          <LoadingBlock rows={4} />
        ) : shown.length === 0 ? (
          <EmptyNote icon="bi-tools" title={lowOnly ? 'Không có dụng cụ nào sắp hết' : tools.length ? 'Không có dụng cụ phù hợp' : 'Chưa có dụng cụ khám nào trong kho'}>
            {!tools.length && 'Đề xuất dụng cụ mới để Quản lý duyệt và nhập.'}
          </EmptyNote>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="vet-table">
              <thead>
                <tr>
                  <th>Dụng cụ</th>
                  <th>Số lượng</th>
                  <th className="vet-hide-md">Đề xuất đang mở</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => {
                  const state = stockState(item);
                  const request = openRequest(item);
                  return (
                    <tr key={item._id}>
                      <td style={{ minWidth: 220 }}>
                        <div className="fw-semibold">{item.name}</div>
                        <div className="vet-small vet-muted">{[item.description, item.stableBlock].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td>
                        {item.isProposed ? (
                          <Pill tone="info">Món mới · chờ duyệt</Pill>
                        ) : (
                          <div className="d-flex flex-wrap align-items-center gap-2">
                            <span className={`fw-semibold vet-tnum ${state.tone ? `vet-text-${state.tone}` : ''}`}>
                              {item.quantity} {item.unit}
                            </span>
                            {state.label && <Pill tone={state.tone}>{state.label}</Pill>}
                          </div>
                        )}
                      </td>
                      <td className="vet-hide-md">
                        {request ? (
                          <>
                            <Pill tone={request.tone}>{request.text}</Pill>
                            {request.at && <div className="vet-small vet-faint mt-1">{ago(request.at)}</div>}
                          </>
                        ) : (
                          <span className="vet-faint">—</span>
                        )}
                      </td>
                      <td className="text-end" style={{ width: 1 }}>
                        {!item.isProposed && (
                          <Button size="sm" variant={state.tone ? 'vet' : 'vet-outline'} onClick={() => setDialog({ type: 'restock', item })}>
                            Đề xuất bổ sung
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </VetCard>

      {dialog?.type === 'restock' && <RestockModal item={dialog.item} onHide={() => setDialog(null)} onDone={refresh} />}
      {dialog?.type === 'propose' && <ProposeItemModal onHide={() => setDialog(null)} onDone={refresh} />}
    </div>
  );
}
