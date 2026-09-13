export const ORDER_TABS = ['Orders', 'GTT', 'Baskets', 'SIP', 'Alerts'] as const;
export type OrderTab = typeof ORDER_TABS[number];
export const ORDER_PATHS: Record<OrderTab, string> = {
  Orders: '/orders',
  GTT: '/orders/gtt',
  Baskets: '/orders/baskets',
  SIP: '/orders/sip',
  Alerts: '/orders/alerts',
};