import { useState } from 'react';
import { Button } from 'antd';

/**
 * The first `limit` items of a dashboard list, and the button that opens the rest (and folds them
 * again): a busy day keeps each card short, so the two columns end near each other.
 */
export function useFirst(items, limit) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  const more =
    items.length > limit ? (
      <Button type="link" size="small" className="!mt-1 !px-0 !text-xs" onClick={() => setAll(!all)}>
        {all ? 'Thu gọn' : `Xem tất cả (${items.length})`}
      </Button>
    ) : null;
  return [shown, more];
}
