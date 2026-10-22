import { useMemo, useState } from 'react';
import { Input, Segmented } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { Card, EmptyNote, LoadFailed, OwnerPage, PageHead } from './kit';
import HorseTile from './HorseTile';
import { idOf } from './ownerFormat';
import { useMyHorses, useOwnerSummary, useStallsByHorse } from './useOwnerData';

/**
 * The owner's horses, each as a card that opens its page. Counted the way the trainer counts them: a
 * horse is ready to train only with a vet's exam on file, an "eligible" status and no restriction; an
 * unexamined horse is counted apart rather than as healthy.
 */
export default function OwnerHorses() {
  const { horses, isLoading: horsesLoading, isError: horsesError, refetch: refetchHorses } = useMyHorses();
  const { rows, isLoading: rowsLoading, isError: rowsError, refetch: refetchRows } = useOwnerSummary();
  const { byHorse: stallOf, isSuccess: stallsLoaded } = useStallsByHorse();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const horsesById = useMemo(() => new Map(horses.map((h) => [idOf(h), h])), [horses]);
  const groupOf = (r) => {
    if (!r.health.lastExam) return 'unexamined';
    if (r.health.status === 'eligible' && !r.health.restricted) return 'ready';
    return 'watch';
  };
  const counts = rows.reduce((acc, r) => ({ ...acc, [groupOf(r)]: (acc[groupOf(r)] || 0) + 1 }), { ready: 0, watch: 0, unexamined: 0 });
  const term = search.trim().toLowerCase();
  const shown = rows.filter((r) => (filter === 'all' || groupOf(r) === filter) && (!term || r.horse.name.toLowerCase().includes(term)));

  return (
    <OwnerPage>
      <PageHead
        eyebrow="Chủ sở hữu"
        title="Ngựa của tôi"
        sub="Hồ sơ, sức khỏe, lịch tập, giải đua và chuồng của từng chiến mã bạn sở hữu."
        stats={[
          { label: 'Tổng đàn', value: `${rows.length} con` },
          { label: 'Đủ điều kiện tập', value: `${counts.ready} con` },
          { label: 'Cần theo dõi', value: `${counts.watch} con` },
          ...(counts.unexamined ? [{ label: 'Chưa khám', value: `${counts.unexamined} con` }] : []),
        ]}
      />

      <div className="own-toolbar">
        <Input allowClear prefix={<SearchOutlined />} placeholder="Tìm theo tên ngựa…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} aria-label="Tìm ngựa" />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Tất cả (${rows.length})` },
            { value: 'ready', label: `Sẵn sàng (${counts.ready})` },
            { value: 'watch', label: `Theo dõi (${counts.watch})` },
            ...(counts.unexamined ? [{ value: 'unexamined', label: `Chưa khám (${counts.unexamined})` }] : []),
          ]}
        />
      </div>

      {rowsLoading || horsesLoading ? (
        <EmptyNote>Đang tải…</EmptyNote>
      ) : (rowsError || horsesError) && rows.length === 0 ? (
        <Card>
          <LoadFailed
            what="danh sách chiến mã"
            onRetry={() => {
              if (rowsError) refetchRows();
              if (horsesError) refetchHorses();
            }}
          />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyNote>{rows.length ? 'Không có chiến mã nào khớp tìm kiếm.' : 'Bạn chưa có chiến mã nào. Khi CLB ghi nhận ngựa của bạn, chúng sẽ hiện ở đây.'}</EmptyNote>
        </Card>
      ) : (
        <div className="own-horses">
          {shown.map((r) => (
            <HorseTile key={r.horse._id} row={r} horse={horsesById.get(idOf(r.horse))} stall={stallOf.get(idOf(r.horse))} stallsLoaded={stallsLoaded} />
          ))}
        </div>
      )}
    </OwnerPage>
  );
}
