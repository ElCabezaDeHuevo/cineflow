"use client";

import { useSyncExternalStore } from "react";

export default function UpcomingDeliveryCount({
  deliveryDates,
  total,
  showProgress = false,
}: {
  deliveryDates: string[];
  total: number;
  showProgress?: boolean;
}) {
  const count = useSyncExternalStore(
    () => () => {},
    () => {
      const now = new Date();
      const nextMonth = new Date(now);
      nextMonth.setDate(nextMonth.getDate() + 30);
      return deliveryDates.filter((date) => {
        const delivery = new Date(`${date}T00:00:00`);
        return delivery >= now && delivery <= nextMonth;
      }).length;
    },
    () => null,
  );

  if (!showProgress) return <>{count ?? "—"}</>;

  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-gray-300">Próximas entregas</span>
        <span className="font-semibold text-white">{count ?? "—"}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-sky-400 transition-all"
          style={{
            width: `${total && count !== null ? Math.max(8, (count / total) * 100) : 0}%`,
          }}
        />
      </div>
    </div>
  );
}
