import { db } from './db.js';
import { decryptSecret, encryptSecret, maskSecret } from './crypto.js';

export const PAYMENT_CATALOGUE = {
  bank: [
    {
      driver: 'bank_account',
      label: 'Settlement bank account',
      identityLabel: 'Account holder',
      fields: [
        { key: 'bankName', label: 'Bank name', required: true, placeholder: 'Bank name' },
        { key: 'accountNumber', label: 'Account number', required: true, secret: true },
        { key: 'ifsc', label: 'IFSC', required: true, placeholder: 'HDFC0001234' },
        { key: 'branch', label: 'Branch' },
        { key: 'accountType', label: 'Account type', required: true, placeholder: 'CURRENT' },
      ],
    },
  ],
  upi: [
    {
      driver: 'razorpay',
      label: 'Razorpay (UPI and apps)',
      identityLabel: 'Merchant account ID',
      fields: [
        { key: 'keyId', label: 'Key ID', required: true },
        { key: 'keySecret', label: 'Key secret', required: true, secret: true },
        { key: 'webhookSecret', label: 'Webhook secret', required: true, secret: true },
        { key: 'testMode', label: 'Test mode', type: 'boolean' },
      ],
    },
    {
      driver: 'cashfree',
      label: 'Cashfree Payments (UPI and apps)',
      identityLabel: 'Merchant ID',
      fields: [
        { key: 'appId', label: 'App ID', required: true },
        { key: 'secretKey', label: 'Secret key', required: true, secret: true },
        { key: 'apiVersion', label: 'API version', placeholder: '2025-01-01' },
        { key: 'testMode', label: 'Test mode', type: 'boolean' },
      ],
    },
    {
      driver: 'phonepe_pg',
      label: 'PhonePe Payment Gateway',
      identityLabel: 'Merchant ID',
      fields: [
        { key: 'clientId', label: 'Client ID', required: true },
        { key: 'clientSecret', label: 'Client secret', required: true, secret: true },
        { key: 'clientVersion', label: 'Client version', placeholder: '1' },
        { key: 'testMode', label: 'Test mode', type: 'boolean' },
      ],
    },
    {
      driver: 'payu',
      label: 'PayU (UPI and apps)',
      identityLabel: 'Merchant key',
      fields: [
        { key: 'merchantKey', label: 'Merchant key', required: true },
        { key: 'merchantSalt', label: 'Merchant salt', required: true, secret: true },
        { key: 'testMode', label: 'Test mode', type: 'boolean' },
      ],
    },
    {
      driver: 'generic_upi',
      label: 'Other UPI gateway',
      identityLabel: 'Merchant ID or VPA',
      fields: [
        { key: 'baseUrl', label: 'API base URL', required: true, placeholder: 'https://api.gateway.example' },
        { key: 'apiKey', label: 'API key', required: true, secret: true },
        { key: 'webhookSecret', label: 'Webhook secret', required: true, secret: true },
        { key: 'testMode', label: 'Test mode', type: 'boolean' },
      ],
    },
  ],
};

export const isPaymentKind = (value) => Object.hasOwn(PAYMENT_CATALOGUE, value);

export const paymentDriverSpec = (kind, driver) =>
  (PAYMENT_CATALOGUE[kind] ?? []).find((entry) => entry.driver === driver);

export function presentPaymentIntegration(row) {
  const spec = paymentDriverSpec(row.kind, row.driver);
  const stored = row.secret_cipher ? (JSON.parse(decryptSecret(row.secret_cipher) ?? '{}') ?? {}) : {};
  const secrets = {};
  for (const field of spec?.fields.filter((entry) => entry.secret) ?? []) {
    secrets[field.key] = stored[field.key] ? maskSecret(encryptSecret(stored[field.key])) : null;
  }

  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    driver: row.driver,
    driverLabel: spec?.label ?? row.driver,
    accountIdentity: row.account_identity,
    settings: JSON.parse(row.settings_json ?? '{}'),
    secrets,
    isActive: !!row.is_active,
    isDefault: !!row.is_default,
    lastTestedAt: row.last_tested_at,
    lastTestOk: row.last_test_ok === null ? null : !!row.last_test_ok,
    lastTestMessage: row.last_test_message,
    updatedAt: row.updated_at,
  };
}

export const listPaymentIntegrations = (kind) =>
  db.prepare(
    `SELECT * FROM payment_integrations
     ${kind ? 'WHERE kind = ?' : ''}
     ORDER BY kind, is_default DESC, name`,
  ).all(...(kind ? [kind] : [])).map(presentPaymentIntegration);

export const auditPaymentIntegration = (integrationId, kind, action, detail, actor) =>
  db.prepare(
    `INSERT INTO payment_integration_audit
       (integration_id, kind, action, detail, actor_id, actor_client_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    integrationId ?? null,
    kind ?? null,
    action,
    detail ?? null,
    actor?.id ?? null,
    actor?.client_id ?? null,
  );