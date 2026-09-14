import { db } from './db.js';
import { decryptSecret, encryptSecret, maskSecret } from './crypto.js';

/**
 * Each driver declares its own fields. `secret: true` means the value is
 * encrypted at rest and never sent back to a browser — only ever masked.
 */
export const CATALOGUE = {
  email: [
    {
      driver: 'smtp',
      label: 'SMTP',
      identityLabel: 'From address',
      fields: [
        { key: 'host', label: 'Host', required: true, placeholder: 'smtp.provider.com' },
        { key: 'port', label: 'Port', required: true, type: 'number', placeholder: '587' },
        { key: 'username', label: 'Username', required: true },
        { key: 'password', label: 'Password', required: true, secret: true },
        { key: 'secure', label: 'Use TLS', type: 'boolean' },
      ],
    },
    {
      driver: 'sendgrid',
      label: 'SendGrid',
      identityLabel: 'From address',
      fields: [
        { key: 'apiKey', label: 'API key', required: true, secret: true, placeholder: 'SG.•••' },
      ],
    },
    {
      driver: 'ses',
      label: 'Amazon SES',
      identityLabel: 'From address',
      fields: [
        { key: 'region', label: 'Region', required: true, placeholder: 'ap-south-1' },
        { key: 'accessKeyId', label: 'Access key ID', required: true },
        { key: 'secretAccessKey', label: 'Secret access key', required: true, secret: true },
      ],
    },
  ],
  sms: [
    {
      driver: 'msg91',
      label: 'MSG91',
      identityLabel: 'Sender ID',
      fields: [
        { key: 'authKey', label: 'Auth key', required: true, secret: true },
        { key: 'route', label: 'Route', placeholder: '4 (transactional)' },
        { key: 'dltTemplateId', label: 'DLT template ID', placeholder: 'Required by TRAI' },
      ],
    },
    {
      driver: 'twilio',
      label: 'Twilio',
      identityLabel: 'Sender number',
      fields: [
        { key: 'accountSid', label: 'Account SID', required: true },
        { key: 'authToken', label: 'Auth token', required: true, secret: true },
        { key: 'messagingServiceSid', label: 'Messaging service SID' },
      ],
    },
    {
      driver: 'gupshup',
      label: 'Gupshup',
      identityLabel: 'Sender ID',
      fields: [
        { key: 'userId', label: 'User ID', required: true },
        { key: 'password', label: 'Password', required: true, secret: true },
        { key: 'dltTemplateId', label: 'DLT template ID' },
      ],
    },
  ],
  whatsapp: [
    {
      driver: 'meta_cloud',
      label: 'WhatsApp Cloud API (Meta)',
      identityLabel: 'Business phone number',
      fields: [
        { key: 'phoneNumberId', label: 'Phone number ID', required: true, placeholder: 'From Meta dashboard' },
        { key: 'businessAccountId', label: 'WABA ID', required: true },
        { key: 'accessToken', label: 'Access token', required: true, secret: true },
        { key: 'appSecret', label: 'App secret', secret: true, placeholder: 'For webhook signature checks' },
        { key: 'apiVersion', label: 'Graph API version', placeholder: 'v21.0' },
        { key: 'templateName', label: 'Default template name', required: true, placeholder: 'ntd_otp' },
        { key: 'templateLanguage', label: 'Template language', placeholder: 'en' },
      ],
    },
    {
      driver: 'twilio_whatsapp',
      label: 'Twilio for WhatsApp',
      identityLabel: 'WhatsApp sender',
      fields: [
        { key: 'accountSid', label: 'Account SID', required: true },
        { key: 'authToken', label: 'Auth token', required: true, secret: true },
        { key: 'messagingServiceSid', label: 'Messaging service SID' },
        { key: 'templateName', label: 'Content template SID', required: true, placeholder: 'HX…' },
      ],
    },
    {
      driver: 'gupshup_whatsapp',
      label: 'Gupshup for WhatsApp',
      identityLabel: 'Source number',
      fields: [
        { key: 'appName', label: 'App name', required: true },
        { key: 'apiKey', label: 'API key', required: true, secret: true },
        { key: 'templateNamespace', label: 'Template namespace', required: true },
        { key: 'templateName', label: 'Default template name', required: true },
      ],
    },
  ],
};

export const CHANNEL_LABELS = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

export const driverSpec = (channel, driver) =>
  (CATALOGUE[channel] ?? []).find((d) => d.driver === driver);

export const isChannel = (value) => Object.hasOwn(CATALOGUE, value);

/**
 * Splits submitted values into plain settings and the one secret bundle.
 * Unknown keys are dropped rather than stored, so the shape can't be polluted.
 */
export function partitionFields(spec, values) {
  const settings = {};
  const secrets = {};
  const missing = [];

  for (const field of spec.fields) {
    const raw = values?.[field.key];
    const provided = raw !== undefined && raw !== null && String(raw).trim() !== '';

    if (field.secret) {
      if (provided) secrets[field.key] = String(raw);
      continue;
    }
    if (!provided) {
      if (field.required) missing.push(field.label);
      continue;
    }
    settings[field.key] =
      field.type === 'number'
        ? Number(raw)
        : field.type === 'boolean'
          ? raw === true || raw === 'true'
          : String(raw).trim();
  }

  return { settings, secrets, missing };
}

export function requiredSecretsMissing(spec, secrets, existingCipher) {
  const existing = existingCipher ? (JSON.parse(decryptSecret(existingCipher) ?? '{}') ?? {}) : {};
  return spec.fields
    .filter((f) => f.secret && f.required)
    .filter((f) => !secrets[f.key] && !existing[f.key])
    .map((f) => f.label);
}

/** Merges newly supplied secrets over whatever is already stored, then re-encrypts the lot. */
export function mergeSecrets(existingCipher, secrets) {
  const existing = existingCipher ? (JSON.parse(decryptSecret(existingCipher) ?? '{}') ?? {}) : {};
  const merged = { ...existing, ...secrets };
  return Object.keys(merged).length ? encryptSecret(JSON.stringify(merged)) : null;
}

/** Row shaped for the admin UI: settings in the clear, secrets masked, never raw. */
export function presentProvider(row) {
  const spec = driverSpec(row.channel, row.driver);
  const stored = row.secret_cipher ? (JSON.parse(decryptSecret(row.secret_cipher) ?? '{}') ?? {}) : {};

  const secretStatus = {};
  for (const field of spec?.fields.filter((f) => f.secret) ?? []) {
    secretStatus[field.key] = stored[field.key]
      ? maskSecret(encryptSecret(stored[field.key]))
      : null;
  }

  return {
    id: row.id,
    channel: row.channel,
    name: row.name,
    driver: row.driver,
    driverLabel: spec?.label ?? row.driver,
    fromIdentity: row.from_identity,
    settings: JSON.parse(row.settings_json ?? '{}'),
    secrets: secretStatus,
    isActive: !!row.is_active,
    isDefault: !!row.is_default,
    lastTestedAt: row.last_tested_at,
    lastTestOk: row.last_test_ok === null ? null : !!row.last_test_ok,
    lastTestMessage: row.last_test_message,
    updatedAt: row.updated_at,
  };
}

export const listProviders = (channel) =>
  db
    .prepare(
      `SELECT * FROM notification_providers
       ${channel ? 'WHERE channel = ?' : ''}
       ORDER BY channel, is_default DESC, name`,
    )
    .all(...(channel ? [channel] : []))
    .map(presentProvider);

export const audit = (providerId, channel, action, detail, actor) =>
  db
    .prepare(
      `INSERT INTO provider_audit (provider_id, channel, action, detail, actor_id, actor_client_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(providerId ?? null, channel ?? null, action, detail ?? null, actor?.id ?? null, actor?.client_id ?? null);
