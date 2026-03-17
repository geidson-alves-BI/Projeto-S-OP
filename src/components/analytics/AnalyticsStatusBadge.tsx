import { cn } from "@/lib/utils";
import {
  ANALYTICS_V2_STATUS_BADGE_CLASS,
  ANALYTICS_V2_STATUS_LABEL,
} from "@/lib/analytics-v2-presenters";
import type { AnalyticsV2Status } from "@/types/analytics";

type AnalyticsStatusBadgeProps = {
  status: AnalyticsV2Status;
  className?: string;
};

export function AnalyticsStatusBadge({ status, className }: AnalyticsStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-3 py-1 text-[11px] font-mono uppercase tracking-[0.24em]",
        ANALYTICS_V2_STATUS_BADGE_CLASS[status],
        className,
      )}
    >
      {ANALYTICS_V2_STATUS_LABEL[status]}
    </span>
  );
}
