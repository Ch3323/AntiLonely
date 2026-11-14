import assert from 'node:assert/strict';
import test from 'node:test';
import {
  googleOnlyAccountEmail,
  RESET_LINK_LIFETIME_SECONDS,
  resetPasswordEmail,
  sendEmail,
} from './email.ts';

const url = 'http://localhost:3000/api/auth/reset-password/abc?callbackURL=%2Freset-password';

test('resetPasswordEmail carries the link and how long it lasts', () => {
  const message = resetPasswordEmail('a@example.com', url);
  assert.equal(message.to, 'a@example.com');
  assert.ok(message.text.includes(url));
  assert.ok(message.text.includes(`${RESET_LINK_LIFETIME_SECONDS / 60} นาที`));
});

test('googleOnlyAccountEmail has no reset link, only the login page', () => {
  const message = googleOnlyAccountEmail('g@example.com', 'http://localhost:3000/login');
  assert.ok(!message.text.includes('reset-password'));
  assert.ok(message.text.includes('http://localhost:3000/login'));
  assert.ok(message.text.includes('Google'));
});

test('sendEmail without a provider logs in development and never calls out', async (t) => {
  const env = { ...process.env };
  t.after(() => {
    process.env = env;
  });
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  (process.env as Record<string, string>).NODE_ENV = 'development';
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response());
  const logs: string[] = [];
  t.mock.method(console, 'log', (line: string) => logs.push(line));
  await sendEmail(resetPasswordEmail('a@example.com', url));
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.ok(logs.join('\n').includes(url));
});

test('sendEmail without a provider in production logs an error without the link', async (t) => {
  const env = { ...process.env };
  t.after(() => {
    process.env = env;
  });
  delete process.env.RESEND_API_KEY;
  (process.env as Record<string, string>).NODE_ENV = 'production';
  const errors: string[] = [];
  t.mock.method(console, 'error', (line: string) => errors.push(line));
  await sendEmail(resetPasswordEmail('a@example.com', url));
  assert.equal(errors.length, 1);
  assert.ok(!errors[0].includes(url));
});

test('sendEmail posts to Resend when configured', async (t) => {
  const env = { ...process.env };
  t.after(() => {
    process.env = env;
  });
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'AntiLonely <no-reply@example.com>';
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 200 }));
  await sendEmail(resetPasswordEmail('a@example.com', url));
  assert.equal(fetchMock.mock.callCount(), 1);
  const [endpoint, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
  assert.equal(endpoint, 'https://api.resend.com/emails');
  assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer test-key');
  const body = JSON.parse(String(init.body));
  assert.deepEqual(body.to, ['a@example.com']);
  assert.ok(body.text.includes(url));
});

test('verifyEmailMessage carries the link and how long it lasts', async () => {
  const { verifyEmailMessage, VERIFY_LINK_LIFETIME_SECONDS } = await import('./email.ts');
  const link = 'http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email';
  const message = verifyEmailMessage('new@example.com', link);
  assert.equal(message.to, 'new@example.com');
  assert.ok(message.text.includes(link));
  assert.ok(message.text.includes(`${VERIFY_LINK_LIFETIME_SECONDS / 3600} ชั่วโมง`));
});

test('sendEmail with EMAIL_LOG_ONLY prints instead of calling the provider', async (t) => {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  t.after(() => {
    process.env = env;
    globalThis.fetch = realFetch;
    console.log = realLog;
  });
  process.env = { ...env, NODE_ENV: 'development', RESEND_API_KEY: 'key', EMAIL_FROM: 'a@b.c', EMAIL_LOG_ONLY: '1' };
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response('{}');
  }) as typeof fetch;
  let printed = '';
  console.log = (text: string) => {
    printed += text;
  };
  await sendEmail({ to: 'x@example.com', subject: 's', text: 'the-link' });
  assert.equal(called, false);
  assert.ok(printed.includes('the-link'));
});
