export const PERMISSIONS = [
  { key: 'admin.market_data', module: 'Operations', label: 'Market data', path: '/admin/market-data' },
  { key: 'admin.payment_integrations', module: 'Integrations', label: 'Payment integrations', path: '/admin/payment-integrations' },
  { key: 'admin.notification_providers', module: 'Integrations', label: 'Notification providers', path: '/admin/providers' },
  { key: 'admin.transactions', module: 'Oversight', label: 'Transaction review', path: '/admin/transactions' },
];

const KEYS = new Set(PERMISSIONS.map((permission) => permission.key));

export function parsePermissions(value) {
  try {
    const entries = Array.isArray(value) ? value : JSON.parse(value ?? '[]');
    return [...new Set(entries.filter((entry) => KEYS.has(entry)))];
  } catch {
    return [];
  }
}

export const hasPermission = (user, permission) =>
  user?.role === 'admin' || (user?.role === 'team' && parsePermissions(user.permissions_json).includes(permission));