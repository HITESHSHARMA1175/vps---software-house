// Task 59.3: OTP mail paths of POST /api/forgot-password/request-otp (nodemailer mocked; no real SMTP).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';

const mail = vi.hoisted(() => ({
  transports: [],
  sendMail: null,
}));

vi.mock('nodemailer', () => {
  const createTransport = (opts) => {
    mail.transports.push(opts);
    return { sendMail: (...args) => mail.sendMail(...args) };
  };
  return { default: { createTransport }, createTransport };
});

const SAVED = { ...process.env };
const SMTP = {
  SMTP_HOST: 'smtp.test.invalid',
  SMTP_PORT: '2525',
  SMTP_USER: 'sender@test.invalid',
  SMTP_PASS: 'test-smtp-secret-xyz',
};
const GENERIC = {
  success: true,
  message: 'If a matching account exists, a 6-digit security OTP has been dispatched to the registered email.',
};
const STRONG = 'a-long-enough-pass-1';

let logs;
let spies;

async function freshApp(env = SMTP) {
  vi.resetModules();
  for (const k of Object.keys(SMTP)) delete process.env[k];
  Object.assign(process.env, env);
  const { getApp, loginAs } = await import('./helpers/app.js');
  const app = await getApp();
  const { cookie } = await loginAs(app, 'admin');
  return { app, cookie };
}

async function createEmployee(app, cookie, username, email) {
  const body = { name: `Name ${username}`, username, password: STRONG, role: 'EMPLOYEE' };
  if (email !== undefined) body.email = email;
  const res = await request(app).post('/api/employees').set('Cookie', cookie).send(body);
  expect(res.status).toBe(201);
}

const requestOtp = (app, username) => request(app).post('/api/forgot-password/request-otp').send({ username });
const resetWith = (app, username, otpCode) =>
  request(app).post('/api/forgot-password/reset-password').send({ username, otpCode, newPassword: STRONG });

beforeEach(() => {
  mail.transports.length = 0;
  mail.sendMail = vi.fn().mockResolvedValue({ messageId: 'x' });
  logs = [];
  spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) =>
    vi.spyOn(console, m).mockImplementation((...a) => {
      logs.push({ m, text: a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') });
    })
  );
});

afterEach(() => {
  spies.forEach((s) => s.mockRestore());
  for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
  Object.assign(process.env, SAVED);
});

const allLogs = () => logs.map((l) => l.text).join('\n');

describe('request-otp mail paths', () => {
  it('unknown account -> exact generic 200 body, no mail', async () => {
    const { app } = await freshApp();
    const res = await requestOtp(app, 'ghost-user');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(GENERIC);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('account without email -> same body as unknown, no mail, warning logged, reset fails', async () => {
    const { app, cookie } = await freshApp();
    await createEmployee(app, cookie, 'noemail-user');
    const unknown = await requestOtp(app, 'ghost-user');
    const res = await requestOtp(app, 'noemail-user');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(unknown.body);
    expect(mail.sendMail).not.toHaveBeenCalled();
    expect(logs.some((l) => l.m === 'warn' && l.text.includes('noemail-user'))).toBe(true);

    const reset = await resetWith(app, 'noemail-user', '123456');
    expect(reset.status).toBe(400);
    expect(reset.body.success).toBe(false);
  });

  it('SMTP failure -> 502 generic error, OTP not stored, no secrets/OTP in logs', async () => {
    const { app, cookie } = await freshApp();
    await createEmployee(app, cookie, 'smtpfail-user', 'smtpfail@example.com');
    mail.sendMail = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));

    const res = await requestOtp(app, 'smtpfail-user');
    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      success: false,
      error: 'Unable to send the verification email. Please try again later.',
    });
    expect(mail.sendMail).toHaveBeenCalledTimes(1);

    const mailArg = mail.sendMail.mock.calls[0][0];
    const otp = /\b(\d{6})\b/.exec(mailArg.subject)?.[1];
    expect(otp).toMatch(/^\d{6}$/);

    const reset = await resetWith(app, 'smtpfail-user', otp);
    expect(reset.status).toBe(400);
    expect(reset.body.success).toBe(false);

    const text = allLogs();
    expect(text).not.toContain(SMTP.SMTP_PASS);
    expect(text).not.toContain(SMTP.SMTP_USER);
    expect(text).not.toContain(otp);
  });

  it('success -> uses env transport and sender, mails the account email, masks it in response', async () => {
    const { app, cookie } = await freshApp();
    await createEmployee(app, cookie, 'happy-user', 'happy.person@example.com');

    const res = await requestOtp(app, 'happy-user');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.maskedEmail).toBe('ha***@example.com');
    expect(JSON.stringify(res.body)).not.toContain('happy.person');

    expect(mail.transports).toHaveLength(1);
    expect(mail.transports[0]).toMatchObject({
      host: SMTP.SMTP_HOST,
      port: 2525,
      secure: false,
      auth: { user: SMTP.SMTP_USER, pass: SMTP.SMTP_PASS },
    });
    const mailArg = mail.sendMail.mock.calls[0][0];
    expect(mailArg.from).toBe(`"Innovation Web Works Security" <${SMTP.SMTP_USER}>`);
    expect(mailArg.to).toBe('happy.person@example.com');
    expect(JSON.stringify([mail.transports, mailArg])).not.toContain('mannk4811');

    // The mailed OTP is accepted by reset-password.
    const otp = /\b(\d{6})\b/.exec(mailArg.subject)[1];
    const reset = await resetWith(app, 'happy-user', otp);
    expect(reset.status).toBe(200);
  });

  it('port 465 enables secure transport', async () => {
    const { app, cookie } = await freshApp({ ...SMTP, SMTP_PORT: '465' });
    await createEmployee(app, cookie, 'secure-user', 'secure@example.com');
    const res = await requestOtp(app, 'secure-user');
    expect(res.status).toBe(200);
    expect(mail.transports[0]).toMatchObject({ port: 465, secure: true });
  });

  it('missing SMTP_HOST -> 502 and no mail sent', async () => {
    const { SMTP_HOST, ...noHost } = SMTP;
    const { app, cookie } = await freshApp(noHost);
    await createEmployee(app, cookie, 'nohost-user', 'nohost@example.com');
    const res = await requestOtp(app, 'nohost-user');
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});
