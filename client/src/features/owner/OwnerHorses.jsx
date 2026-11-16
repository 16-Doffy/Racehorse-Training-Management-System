import { useMemo, useState } from 'react';
import { Input, Segmented } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { Card, EmptyNote, LoadFailed, OwnerPage, PageHead } from './kit';
import HorseList from './HorseList';
import { idOf } from './ownerFormat';
import { useMyHorses, useOwnerSummary, useStallsByHorse } from './useOwnerData';

// "Sao Mai" is found by "sao mai" and by "Sáo Mãi".
const fold = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');

/**
 * The owner's horses as a list, a row each that opens the horse's page. Counted the way the trainer
 * counts them: ready to train only with a vet's exam on file, "eligible" and no restriction; a horse no
 * vet has examined is counted apart rather than as healthy.
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
  const term = fold(search.trim());
  const shown = rows
    .filter((r) => (filter === 'all' || groupOf(r) === filter) && (!term || fold(r.horse.name).includes(term)))
    // The ones that need a look first, then by name.
    .sort((a, b) => ({ watch: 0, unexamined: 1, ready: 2 })[groupOf(a)] - ({ watch: 0, unexamined: 1, ready: 2 })[groupOf(b)] || a.horse.name.localeCompare(b.horse.name, 'vi'));

  return (
    <OwnerPage>
      <PageHead eyebrow="Chủ sở hữu" title="Ngựa của tôi" sub={`${rows.length} chiến mã · bấm vào một con để xem hồ sơ, sức khỏe, lịch tập và giải đua.`} />

      <div className="own-toolbar">
        <Input allowClear prefix={<SearchOutlined />} placeholder="Tìm theo tên ngựa…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} aria-label="Tìm ngựa" />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Tất cả (${rows.length})` },
            { value: 'ready', label: `Sẵn sàng (${counts.ready})` },
            { value: 'watch', label: `Cần theo dõi (${counts.watch})` },
            ...(counts.unexamined ? [{ value: 'unexamined', label: `Chưa khám (${counts.unexamined})` }] : []),
          ]}
        />
      </div>

      <Card flush>
        {rowsLoading || horsesLoading ? (
          <EmptyNote>Đang tải…</EmptyNote>
        ) : (rowsError || horsesError) && rows.length === 0 ? (
          <LoadFailed
            what="danh sách chiến mã"
            onRetry={() => {
              if (rowsError) refetchRows();
              if (horsesError) refetchHorses();
            }}
          />
        ) : shown.length === 0 ? (
          <EmptyNote>{rows.length ? 'Không có chiến mã nào khớp tìm kiếm.' : 'Bạn chưa có chiến mã nào. Khi CLB ghi nhận ngựa của bạn, chúng sẽ hiện ở đây.'}</EmptyNote>
        ) : (
          <HorseList rows={shown} horsesById={horsesById} stallOf={stallOf} stallsLoaded={stallsLoaded} />
        )}
      </Card>
    </OwnerPage>
  );
}
