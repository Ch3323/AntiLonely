import assert from 'node:assert/strict';
import test from 'node:test';
import {
  banSanctionEmail,
  googleOnlyAccountEmail,
  liftSanctionEmail,
  RESET_LINK_LIFETIME_SECONDS,
  resetPasswordEmail,
  sendEmail,
  suspensionSanctionEmail,
  warningSanctionEmail,
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
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
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
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
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
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
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

test('warningSanctionEmail includes recipient, warning subject, and reason', () => {
  const message = warningSanctionEmail('user@example.com', '  ใช้คำไม่สุภาพ  ');
  assert.equal(message.to, 'user@example.com');
  assert.equal(message.subject, 'คำเตือนจากทีมผู้ดูแล AntiLonely');
  assert.ok(message.text.includes('เหตุผล: ใช้คำไม่สุภาพ'));
});

test('suspensionSanctionEmail includes formatted Thai end date and optional reason', () => {
  const endAt = new Date('2026-12-22T00:00:00+07:00');
  const withReason = suspensionSanctionEmail('user@example.com', endAt, 'สแปมซ้ำหลายครั้ง');
  assert.equal(withReason.to, 'user@example.com');
  assert.equal(withReason.subject, 'บัญชี AntiLonely ของคุณถูกระงับชั่วคราว');
  assert.ok(withReason.text.includes('22 ธ.ค. 2569'));
  assert.ok(withReason.text.includes('เหตุผล: สแปมซ้ำหลายครั้ง'));

  const withoutReason = suspensionSanctionEmail('user@example.com', endAt, '   ');
  assert.ok(withoutReason.text.includes('22 ธ.ค. 2569'));
  assert.ok(!withoutReason.text.includes('เหตุผล:'));
});

test('banSanctionEmail includes recipient, ban subject, and reason', () => {
  const message = banSanctionEmail('user@example.com', 'คุกคามผู้อื่นซ้ำ');
  assert.equal(message.to, 'user@example.com');
  assert.equal(message.subject, 'บัญชี AntiLonely ของคุณถูกแบนถาวร');
  assert.ok(message.text.includes('เหตุผล: คุกคามผู้อื่นซ้ำ'));
});

test('liftSanctionEmail informs user their account is restored', () => {
  const message = liftSanctionEmail('user@example.com');
  assert.equal(message.to, 'user@example.com');
  assert.equal(message.subject, 'บัญชี AntiLonely ของคุณกลับมาใช้งานได้ตามปกติแล้ว');
  assert.ok(message.text.includes('ปลดการระงับการใช้งานบัญชีของคุณแล้ว'));
});

test('sendEmail sends via Gmail SMTP when SMTP_USER and SMTP_PASS are configured', async (t) => {
  const nodemailer = (await import('nodemailer')).default;
  const env = { ...process.env };
  t.after(() => {
    process.env = env;
  });
  process.env.SMTP_USER = 'sender@gmail.com';
  process.env.SMTP_PASS = 'abcd efgh ijkl mnop';
  delete process.env.EMAIL_FROM;
  delete process.env.EMAIL_LOG_ONLY;

  let capturedAuth: unknown = null;
  const capturedMails: Record<string, unknown>[] = [];

  t.mock.method(nodemailer, 'createTransport', (opts: unknown) => {
    capturedAuth = opts;
    return {
      sendMail: async (mail: Record<string, unknown>) => {
        capturedMails.push(mail);
        return { messageId: '123' };
      },
    } as unknown as ReturnType<typeof nodemailer.createTransport>;
  });

  await sendEmail(warningSanctionEmail('target@example.com', 'ทดสอบระบบเมล'));
  assert.deepEqual(capturedAuth, {
    service: 'gmail',
    auth: { user: 'sender@gmail.com', pass: 'abcdefghijklmnop' },
  });
  assert.equal(capturedMails.length, 1);
  assert.equal(capturedMails[0].from, 'AntiLonely <sender@gmail.com>');
  assert.equal(capturedMails[0].to, 'target@example.com');
  assert.equal(capturedMails[0].subject, 'คำเตือนจากทีมผู้ดูแล AntiLonely');
});
