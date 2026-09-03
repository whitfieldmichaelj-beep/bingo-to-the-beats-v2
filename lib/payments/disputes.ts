export const NON_BLOCKING_DISPUTE_STATUSES = [
  "won",
  "prevented",
  "warning_closed",
];

export function isBlockingDisputeStatus(
  status: string
) {
  return !NON_BLOCKING_DISPUTE_STATUSES.includes(
    status
  );
}

export function hasBlockingDispute(
  disputes: readonly { status: string }[]
) {
  return disputes.some((dispute) =>
    isBlockingDisputeStatus(dispute.status)
  );
}

export function isDisputeFinanciallyUnavailable(
  dispute: {
    status: string;
    fundsWithdrawn: boolean;
  }
) {
  return (
    dispute.fundsWithdrawn ||
    isBlockingDisputeStatus(dispute.status)
  );
}


export function hasUnavailableDispute(
  disputes: readonly {
    status: string;
    fundsWithdrawn: boolean;
  }[]
) {
  return disputes.some((dispute) =>
    isDisputeFinanciallyUnavailable(dispute)
  );
}
