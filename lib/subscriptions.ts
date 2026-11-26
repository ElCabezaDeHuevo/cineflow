type Subscription = { status: string; current_period_end?: string | null; trial_end?: string | null };

export function subscriptionIsActive(subscription: Subscription | null | undefined, now = new Date()) {
  if (!subscription || !["active", "trialing"].includes(subscription.status)) return false;
  const expiry = subscription.status === "trialing"
    ? subscription.trial_end
    : subscription.current_period_end ?? subscription.trial_end;
  return !!expiry && Date.parse(expiry) > now.getTime();
}
