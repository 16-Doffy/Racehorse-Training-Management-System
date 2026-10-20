import { useState } from 'react';
import { EmptyNote, HealthPill, HorseCell, SearchBox, VetModal } from './ui';

/** Picks a horse to act on (start an exam, write a prescription) from anywhere. Mounted when opened. */
export default function HorsePickerModal({ title, horses = [], onPick, onHide }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = horses.filter((h) => !q || h.name?.toLowerCase().includes(q) || h.breed?.toLowerCase().includes(q));

  return (
    <VetModal show onHide={onHide} title={title} icon="bi-search">
      <SearchBox value={query} onChange={setQuery} placeholder="Tìm tên ngựa…" />
      <div className="vet-list mt-3" style={{ maxHeight: 420, overflowY: 'auto', margin: '0 -20px' }}>
        {shown.map((h) => (
          <div
            key={h._id}
            className="vet-row is-clickable"
            role="button"
            tabIndex={0}
            onClick={() => onPick(h)}
            onKeyDown={(e) => e.key === 'Enter' && onPick(h)}
          >
            <div className="vet-row-main">
              <HorseCell horse={h} size={36} />
            </div>
            <HealthPill status={h.healthStatus} />
          </div>
        ))}
        {shown.length === 0 && <EmptyNote icon="bi-search" title="Không có ngựa phù hợp" />}
      </div>
    </VetModal>
  );
}
