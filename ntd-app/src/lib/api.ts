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
  role: 'user' | 'admin';
  initials: string;
  lastLoginAt: string | null;
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
  updatedAt: string;
};

export type Funds = { equity: FundsSegment | null; commodity: FundsSegment | null };

export type FundStatement = {
  id: number;
  date: string;
  segment: FundsSegment['segment'];
  kind: 'OPENING' | 'PAYIN' | 'PAYOUT';
  description: string;
  reference: string;
  debit: number;
  credit: number;
};

export const fundsApi = {
  get: (token: string) => get<{ funds: Funds }>('/api/funds', token),
  statements: (token: string) => get<{ statements: FundStatement[] }>('/api/funds/statements', token),
  transfer: (
    token: string,
    transfer: { direction: 'add' | 'withdraw'; segment: FundsSegment['segment']; amount: number },
  ) => post<{ funds: Funds }>('/api/funds/transfer', transfer, token),
};

export type PositionRecord = {
  instrument: string;
  exchange: string;
  product: string;
  /** Negative is a short. */
  qty: number;
  avg: number;
};

export const positionsApi = {
  get: (token: string) => get<{ positions: PositionRecord[] }>('/api/positions', token),
};

export type OrderRecord = {
  id: number;
  createdAt?: string;
  time: string;
  side: 'BUY' | 'SELL';
  instrument: string;
  exchange: string;
  product: 'CNC' | 'MIS' | 'NRML';
  filled: number;
  qty: number;
  avgPrice: number;
  status: 'COMPLETE';
};

export const ordersApi = {
  list: (token: string) => get<{ orders: OrderRecord[] }>('/api/orders', token),
  place: (
    token: string,
    order: { instrument: string; side: 'BUY' | 'SELL'; product: OrderRecord['product']; qty: number },
  ) => post<{ order: OrderRecord }>('/api/orders', order, token),
};

export type OrderToolKind = 'gtt' | 'basket' | 'sip' | 'alert';
export type OrderTool = {
  id: number;
  kind: OrderToolKind;
  name: string;
  config: Record<string, string | number | string[]>;
  status: 'ACTIVE' | 'PAUSED';
  createdAt: string;
  updatedAt: string;
};

export const orderToolsApi = {
  list: (token: string, kind: OrderToolKind) => get<{ tools: OrderTool[] }>(`/api/order-tools/${kind}`, token),
  create: (token: string, kind: OrderToolKind, config: Record<string, unknown>) => post<{ tool: OrderTool }>(`/api/order-tools/${kind}`, config, token),
  setStatus: (token: string, id: number, status: OrderTool['status']) => send<{ ok: true }>('PATCH', `/api/order-tools/${id}`, { status }, token),
  remove: (token: string, id: number) => send<{ ok: true }>('DELETE', `/api/order-tools/${id}`, undefined, token),
};

export type HoldingRecord = {
  symbol: string;
  exchange: string;
  qty: number;
  avgCost: number;
  pledgedQty: number;
};

export const holdingsApi = {
  get: (token: string) => get<{ holdings: HoldingRecord[] }>('/api/holdings', token),
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
  amount: number;
  status: 'SUBMITTED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
};

export const bidsApi = {
  get: (token: string) => get<{ issues: BidIssue[]; bids: BidApplication[] }>('/api/bids', token),
  place: (token: string, bid: { issueId: number; lots: number; price: number }) =>
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
