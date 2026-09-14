export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'unknown', data.message ?? 'Something went wrong.');
  }
  return data as T;
}

async function send<T>(
  method: 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'unknown', data.message ?? 'Something went wrong.');
  }
  return data as T;
}

async function get<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(path, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'unknown', data.message ?? 'Something went wrong.');
  }
  return data as T;
}

export type SessionUser = {
  clientId: string;
  name: string;
  email: string;
  role: 'user' | 'team' | 'admin';
  permissions: string[];
  initials: string;
  lastLoginAt: string | null;
};

export type PermissionDefinition = {
  key: string;
  module: string;
  label: string;
  path: string;
};

export type TeamUser = {
  id: number;
  clientId: string;
  name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'disabled';
  permissions: string[];
  lastLoginAt: string | null;
  createdAt: string;
};

export const canAccess = (user: SessionUser | null, permission: string) =>
  user?.role === 'admin' || user?.permissions.includes('*') || user?.permissions.includes(permission) || false;

const PERMISSION_PATHS: Record<string, string> = {
  'admin.market_data': '/admin/market-data',
  'admin.payment_integrations': '/admin/payment-integrations',
  'admin.notification_providers': '/admin/providers',
  'admin.transactions': '/admin/transactions',
};

export const firstAllowedPath = (user: SessionUser | null) => {
  if (user?.role === 'admin') return '/admin/access';
  return user?.permissions.map((permission) => PERMISSION_PATHS[permission]).find(Boolean) ?? '/no-access';
};

export type Channel = 'email' | 'sms' | 'whatsapp';

export type DriverField = {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  type?: 'number' | 'boolean';
  placeholder?: string;
};

export type DriverSpec = {
  driver: string;
  label: string;
  identityLabel: string;
  fields: DriverField[];
};

export type Provider = {
  id: number;
  channel: Channel;
  name: string;
  driver: string;
  driverLabel: string;
  fromIdentity: string | null;
  settings: Record<string, string | number | boolean>;
  /** Masked stand-ins — the real credentials never leave the server. */
  secrets: Record<string, string | null>;
  isActive: boolean;
  isDefault: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  updatedAt: string;
};

export type PaymentIntegrationKind = 'bank' | 'upi';

export type PaymentIntegration = {
  id: number;
  kind: PaymentIntegrationKind;
  name: string;
  driver: string;
  driverLabel: string;
  accountIdentity: string;
  settings: Record<string, string | number | boolean>;
  /** Masked stand-ins; payment credentials never leave the server. */
  secrets: Record<string, string | null>;
  isActive: boolean;
  isDefault: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  updatedAt: string;
};

export type MarketUpload = {
  id: number;
  filename: string;
  fileType: 'csv' | 'xlsx';
  totalRows: number;
  importedRows: number;
  activeRows: number;
  duplicateRows: number;
  rejectedRows: number;
  uploadedBy: string;
  uploadedAt: string;
};

export type MarketUploadDay = {
  tradingDate: string;
  rowCount: number;
  uploadCount: number;
};

export type GitHubMinuteFile = {
  name: string;
  path: string;
  symbol: string;
  size: number;
  supported: boolean;
};

export type GitHubMinuteImport = {
  id: number;
  repository: string;
  branch: string;
  path: string;
  filename: string;
  symbol: string;
  totalRows: number;
  importedMinuteRows: number;
  duplicateMinuteRows: number;
  importedDailyRows: number;
  rejectedRows: number;
  importedBy: string;
  importedAt: string;
};

export type GitHubMinuteDiscovery = {
  source: { url: string; repository: string; branch: string; path: string };
  files: GitHubMinuteFile[];
  maximumFileBytes: number;
};

export type RecoveryMethod = 'clientId' | 'email' | 'mobile';

export type LoginResult = {
  stage: 'totp';
  challengeId: string;
  expiresInSeconds: number;
  secondsIntoStep: number;
  user: { clientId: string; initials: string };
  /** Dev only — lets you complete 2FA without an authenticator app. Absent in production. */
  devCode?: string;
};

export const api = {
  login: (clientId: string, password: string) =>
    post<LoginResult>('/api/auth/login', { clientId, password }),

  verifyTotp: (challengeId: string, code: string) =>
    post<{ token: string; user: SessionUser }>('/api/auth/totp', { challengeId, code }),

  me: (token: string) => get<{ user: SessionUser }>('/api/auth/me', token),

  updateProfile: (token: string, profile: { name: string; email: string }) =>
    send<{ user: SessionUser }>('PATCH', '/api/auth/profile', profile, token),

  logout: (token: string) => post<{ ok: true }>('/api/auth/logout', {}, token),

  forgotUserId: (identifier: string, method: Extract<RecoveryMethod, 'email' | 'mobile'>) =>
    post<{
      ok: true;
      method: RecoveryMethod;
      message: string;
      devClientId?: string;
      devHint?: string;
      devSentTo?: string;
    }>('/api/auth/forgot-userid', { identifier, method }),

  forgotPassword: (identifier: string, method: RecoveryMethod) =>
    post<{
      ok: true;
      method: RecoveryMethod;
      message: string;
      expiresInMinutes: number;
      devToken?: string;
      devSentTo?: string;
    }>('/api/auth/forgot-password', { identifier, method }),

  resetPassword: (token: string, password: string) =>
    post<{ ok: true; message: string }>('/api/auth/reset-password', { token, password }),
};

export type FundsSegment = {
  segment: 'equity' | 'commodity';
  openingBalance: number;
  payin: number;
  payout: number;
  span: number;
  deliveryMargin: number;
  exposure: number;
  optionsPremium: number;
  collateralLiquid: number;
  collateralEquity: number;
  /** Derived server-side from the components above, never stored. */
  usedMargin: number;
  totalCollateral: number;
  availableMargin: number;
  availableCash: number;
  withdrawableBalance: number;
  updatedAt: string;
};

export type Funds = { equity: FundsSegment | null; commodity: FundsSegment | null };
export type FundTransferMethod = 'UPI' | 'NETBANKING' | 'IMPS' | 'NEFT' | 'RTGS' | 'BANK';

export type FundStatement = {
  id: number;
  date: string;
  segment: FundsSegment['segment'];
  kind: 'OPENING' | 'PAYIN' | 'PAYOUT';
  description: string;
  reference: string;
  debit: number;
  credit: number;
  method: FundTransferMethod;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  fee: number;
  expectedAt: string | null;
};

export const fundsApi = {
  get: (token: string) => get<{ funds: Funds }>('/api/funds', token),
  statements: (token: string) => get<{ statements: FundStatement[] }>('/api/funds/statements', token),
  transfer: (
    token: string,
    transfer: { direction: 'add' | 'withdraw'; segment: FundsSegment['segment']; amount: number; method: FundTransferMethod },
  ) => post<{ funds: Funds }>('/api/funds/transfer', transfer, token),
};

export type PositionRecord = {
  instrument: string;
  exchange: string;
  product: string;
  /** Negative is a short. */
  qty: number;
  avg: number;
  conversionBlocked: boolean;
};

export const positionsApi = {
  get: (token: string) => get<{ positions: PositionRecord[] }>('/api/positions', token),
  exit: (token: string, positions: Pick<PositionRecord, 'instrument' | 'product'>[]) =>
    post<{ orders: OrderRecord[] }>('/api/positions/exit', { positions }, token),
  convert: (token: string, position: Pick<PositionRecord, 'instrument' | 'product'>, toProduct: string) =>
    post<{ position: PositionRecord }>('/api/positions/convert', { instrument: position.instrument, fromProduct: position.product, toProduct }, token),
};

export type OrderRecord = {
  id: number;
  createdAt?: string;
  modifiedAt?: string | null;
  time: string;
  side: 'BUY' | 'SELL';
  instrument: string;
  exchange: string;
  product: 'CNC' | 'MIS' | 'NRML';
  variety: 'REGULAR' | 'CO';
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  triggerPrice: number | null;
  limitPrice: number | null;
  isAmo: boolean;
  icebergLegs: number | null;
  validity: 'DAY' | 'IOC' | 'MINUTES';
  expiresAt: string | null;
  filled: number;
  qty: number;
  avgPrice: number;
  status: 'COMPLETE' | 'OPEN' | 'TRIGGER PENDING' | 'AMO PENDING' | 'CANCELLED';
};

export type PlaceOrder = {
  instrument: string;
  side: 'BUY' | 'SELL';
  product: OrderRecord['product'];
  qty: number;
  variety: OrderRecord['variety'];
  orderType: OrderRecord['orderType'];
  triggerPrice?: number;
  limitPrice?: number;
  isAmo: boolean;
  icebergLegs?: number;
  validity: OrderRecord['validity'];
  validityMinutes?: number;
};

export type ModifyOrder = {
  qty: number;
  limitPrice?: number;
  triggerPrice?: number;
  validity: 'DAY' | 'MINUTES';
  validityMinutes?: number;
};

export type TradeRecord = {
  id: number;
  orderId: number;
  time: string;
  side: 'BUY' | 'SELL';
  instrument: string;
  exchange: string;
  product: OrderRecord['product'];
  quantity: number;
  price: number;
  value: number;
};

export const ordersApi = {
  list: (token: string) => get<{ orders: OrderRecord[] }>('/api/orders', token),
  place: (token: string, order: PlaceOrder) => post<{ order: OrderRecord }>('/api/orders', order, token),
  modify: (token: string, id: number, order: ModifyOrder) => send<{ order: OrderRecord }>('PATCH', `/api/orders/${id}`, order, token),
  cancel: (token: string, id: number) => send<{ order: OrderRecord }>('DELETE', `/api/orders/${id}`, undefined, token),
  trades: (token: string) => get<{ trades: TradeRecord[] }>('/api/trades', token),
};

export type OrderToolKind = 'gtt' | 'basket' | 'sip' | 'alert';
export type OrderTool = {
  id: number;
  kind: OrderToolKind;
  name: string;
  config: Record<string, unknown>;
  status: 'ACTIVE' | 'PAUSED';
  createdAt: string;
  updatedAt: string;
};

export type BasketMargin = {
  legs: Array<{ symbol: string; side: string; product: string; qty: number; margin: number | null }>;
  required: number;
  model: 'DEVELOPMENT_ESTIMATE';
};

export const orderToolsApi = {
  list: (token: string, kind: OrderToolKind) => get<{ tools: OrderTool[] }>(`/api/order-tools/${kind}`, token),
  create: (token: string, kind: OrderToolKind, config: Record<string, unknown>) => post<{ tool: OrderTool }>(`/api/order-tools/${kind}`, config, token),
  setStatus: (token: string, id: number, status: OrderTool['status']) => send<{ ok: true }>('PATCH', `/api/order-tools/${id}`, { status }, token),
  remove: (token: string, id: number) => send<{ ok: true }>('DELETE', `/api/order-tools/${id}`, undefined, token),
  margin: (token: string, id: number) => get<{ margin: BasketMargin }>(`/api/order-tools/${id}/margin`, token),
  execute: (token: string, id: number, onlyRejected = false) => post<{ tool: OrderTool; results: Array<{ symbol: string; status: string; orderId?: number; message?: string }> }>(`/api/order-tools/${id}/execute`, { onlyRejected }, token),
  clone: (token: string, id: number) => post<{ tool: OrderTool }>(`/api/order-tools/${id}/clone`, {}, token),
};

export type HoldingRecord = {
  symbol: string;
  exchange: string;
  qty: number;
  avgCost: number;
  pledgedQty: number;
};

export type UnsettledHoldingRecord = {
  symbol: string;
  exchange: string;
  qty: number;
  avgCost: number;
  openedAt: string;
  settlementStatus: 'TODAY' | 'T1';
};

export const holdingsApi = {
  get: (token: string) => get<{ holdings: HoldingRecord[]; unsettled: UnsettledHoldingRecord[] }>('/api/holdings', token),
  exit: (token: string, symbol: string, quantity: number) =>
    post<{ order: OrderRecord; holdings: HoldingRecord[] }>(`/api/holdings/${encodeURIComponent(symbol)}/exit`, { quantity }, token),
};

export type MutualFundRecord = {
  schemeCode: string;
  name: string;
  category: string;
  folio: string;
  units: number;
  avgNav: number;
  currentNav: number;
  dayChangePct: number;
  navAsOf: string;
};

export const mutualFundsApi = {
  get: (token: string) => get<{ mutualFunds: MutualFundRecord[] }>('/api/mutual-funds', token),
};

export type BidIssue = {
  id: number;
  name: string;
  code: string;
  exchange: string;
  status: 'open' | 'upcoming' | 'announced';
  openDate: string | null;
  closeDate: string | null;
  priceLow: number | null;
  priceHigh: number | null;
  lotSize: number | null;
};

export type BidApplication = {
  id: number;
  issueId: number;
  code: string;
  name: string;
  exchange: string;
  lots: number;
  quantity: number;
  price: number;
  isCutoff: boolean;
  amount: number;
  status: 'SUBMITTED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
};

export const bidsApi = {
  get: (token: string) => get<{ issues: BidIssue[]; bids: BidApplication[] }>('/api/bids', token),
  place: (token: string, bid: { issueId: number; lots: number; price: number; isCutoff: boolean }) =>
    post<{ bid: BidApplication }>('/api/bids', bid, token),
  cancel: (token: string, id: number) => send<{ ok: true }>('DELETE', `/api/bids/${id}`, undefined, token),
};

export const signupApi = {
  start: (mobile: string) =>
    post<{ reference: string; expiresInMinutes: number; devOtp?: string }>('/api/signup/start', {
      mobile,
    }),

  resendOtp: (reference: string) =>
    post<{ ok: true; expiresInMinutes: number; devOtp?: string }>('/api/signup/resend-otp', {
      reference,
    }),

  verifyOtp: (reference: string, code: string) =>
    post<{ ok: true; alreadyRegistered: boolean; message: string }>('/api/signup/verify-otp', {
      reference,
      code,
    }),

  details: (
    reference: string,
    body: { fullName: string; email: string; pan: string; dob: string },
  ) => post<{ ok: true }>('/api/signup/details', { reference, ...body }),

  complete: (reference: string, password: string) =>
    post<{ clientId: string; totpSecret: string; otpauthUri: string }>('/api/signup/complete', {
      reference,
      password,
    }),
};

export const adminApi = {
  catalogue: (token: string) =>
    get<{ catalogue: Record<Channel, DriverSpec[]> }>('/api/admin/providers/catalogue', token),

  list: (token: string) =>
    get<{ providers: Provider[]; keyIsEphemeral: boolean }>('/api/admin/providers', token),

  create: (
    token: string,
    body: {
      channel: Channel;
      driver: string;
      name: string;
      fromIdentity: string;
      values: Record<string, unknown>;
    },
  ) => post<{ provider: Provider }>('/api/admin/providers', body, token),

  update: (
    token: string,
    id: number,
    body: {
      name?: string;
      fromIdentity?: string;
      values?: Record<string, unknown>;
      isActive?: boolean;
    },
  ) => send<{ provider: Provider }>('PATCH', `/api/admin/providers/${id}`, body, token),

  setDefault: (token: string, id: number) =>
    post<{ providers: Provider[] }>(`/api/admin/providers/${id}/default`, {}, token),

  test: (token: string, id: number) =>
    post<{ ok: boolean; message: string; provider: Provider }>(
      `/api/admin/providers/${id}/test`,
      {},
      token,
    ),

  remove: (token: string, id: number) =>
    send<{ ok: true }>('DELETE', `/api/admin/providers/${id}`, undefined, token),

  auditLog: (token: string) =>
    get<{
      entries: {
        id: number;
        channel: string;
        action: string;
        detail: string | null;
        actor: string;
        at: string;
      }[];
    }>('/api/admin/providers/audit', token),
};

export const adminPaymentApi = {
  catalogue: (token: string) =>
    get<{ catalogue: Record<PaymentIntegrationKind, DriverSpec[]> }>(
      '/api/admin/payment-integrations/catalogue',
      token,
    ),

  list: (token: string) =>
    get<{ integrations: PaymentIntegration[]; keyIsEphemeral: boolean }>(
      '/api/admin/payment-integrations',
      token,
    ),

  create: (
    token: string,
    body: {
      kind: PaymentIntegrationKind;
      driver: string;
      name: string;
      accountIdentity: string;
      values: Record<string, unknown>;
    },
  ) => post<{ integration: PaymentIntegration }>('/api/admin/payment-integrations', body, token),

  update: (
    token: string,
    id: number,
    body: {
      name?: string;
      accountIdentity?: string;
      values?: Record<string, unknown>;
      isActive?: boolean;
    },
  ) => send<{ integration: PaymentIntegration }>(
    'PATCH',
    `/api/admin/payment-integrations/${id}`,
    body,
    token,
  ),

  setDefault: (token: string, id: number) =>
    post<{ integrations: PaymentIntegration[] }>(
      `/api/admin/payment-integrations/${id}/default`,
      {},
      token,
    ),

  test: (token: string, id: number) =>
    post<{ ok: boolean; message: string; integration: PaymentIntegration }>(
      `/api/admin/payment-integrations/${id}/test`,
      {},
      token,
    ),

  remove: (token: string, id: number) =>
    send<{ ok: true }>('DELETE', `/api/admin/payment-integrations/${id}`, undefined, token),

  auditLog: (token: string) =>
    get<{
      entries: Array<{
        id: number;
        kind: string;
        action: string;
        detail: string | null;
        actor: string;
        at: string;
      }>;
    }>('/api/admin/payment-integrations/audit', token),
};

export const adminAccessApi = {
  permissions: (token: string) =>
    get<{ permissions: PermissionDefinition[] }>('/api/admin/access/permissions', token),
  users: (token: string) => get<{ users: TeamUser[] }>('/api/admin/access/users', token),
  create: (
    token: string,
    body: {
      clientId: string;
      name: string;
      email: string;
      phone: string;
      password: string;
      permissions: string[];
    },
  ) => post<{ user: TeamUser; totpSecret: string }>('/api/admin/access/users', body, token),
  update: (
    token: string,
    id: number,
    body: Partial<Pick<TeamUser, 'name' | 'email' | 'phone' | 'status' | 'permissions'>>,
  ) => send<{ user: TeamUser }>('PATCH', `/api/admin/access/users/${id}`, body, token),
  resetPassword: (token: string, id: number, password: string) =>
    post<{ ok: true }>(`/api/admin/access/users/${id}/reset-password`, { password }, token),
  audit: (token: string) => get<{
    entries: Array<{
      id: number;
      subject: string;
      subjectName: string | null;
      action: string;
      detail: string | null;
      actor: string;
      at: string;
    }>;
  }>('/api/admin/access/audit', token),
};

export type AdminTransaction = {
  id: number;
  clientId: string;
  userName: string;
  date: string;
  segment: string;
  kind: string;
  amount: number;
  reference: string;
  description: string;
  method: string;
  status: string;
  fee: number;
  expectedAt: string | null;
};

export const adminTransactionsApi = {
  list: (token: string) =>
    get<{ transactions: AdminTransaction[] }>('/api/admin/transactions', token),
};

export const adminMarketDataApi = {
  list: (token: string) =>
    get<{ uploads: MarketUpload[]; days: MarketUploadDay[]; githubImports: GitHubMinuteImport[] }>('/api/admin/market-data', token),

  discoverGitHub: (token: string, folderUrl: string) =>
    post<GitHubMinuteDiscovery>('/api/admin/market-data/github/discover', { folderUrl }, token),

  importGitHubFile: (token: string, folderUrl: string, filePath: string) =>
    post<{ import: GitHubMinuteImport }>(
      '/api/admin/market-data/github/import',
      { folderUrl, filePath },
      token,
    ),

  upload: async (token: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/admin/market-data/uploads', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(response.status, data.error ?? 'unknown', data.message ?? 'Upload failed.');
    }
    return data as { upload: MarketUpload; warnings: string[] };
  },

  deleteDay: (token: string, tradingDate: string) =>
    send<{ ok: true; deletedRows: number }>(
      'DELETE',
      `/api/admin/market-data/days/${encodeURIComponent(tradingDate)}`,
      undefined,
      token,
    ),
};
