import assert from 'node:assert/strict';
import test from 'node:test';
import { sendPilotCode, project } from '../../supabase/functions/_shared/operator-outlook.js';

function setup({ enabled = true, grant = true, sentStatus = 202, wrongMailbox = false } = {}) {
  const email = 'pilot@example.invalid',
    requests = [];
  const deps = {
    getEnv: (key) =>
      ({
        SUPABASE_SERVICE_ROLE_KEY: 'fixture',
        SUPABASE_URL: project,
        RR_OPERATOR_MAIL_CLIENT_SECRET: enabled ? 'fixture' : null,
      })[key],
    request: async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith('rr_operator_mail_token'))
        return Response.json(
          grant
            ? { refresh: 'fixture-refresh', subject: 'self', sender: 'sender@example.invalid', revision: 'a' }
            : null
        );
      if (url.endsWith('/token'))
        return Response.json({
          access_token: 'fixture-access',
          scope: 'User.Read Mail.Send',
          refresh_token: 'fixture-refresh2',
        });
      if (url.endsWith('rr_operator_mail_save')) return Response.json(true);
      if (url.includes('/admin/generate_link'))
        return Response.json({
          email: wrongMailbox ? 'other@example.invalid' : email,
          email_otp: '123456',
          hashed_token: 'x'.repeat(64),
        });
      assert.equal(url, 'https://graph.microsoft.com/v1.0/me/sendMail');
      assert.equal(init.headers.Authorization, 'Bearer fixture-access');
      const message = JSON.parse(init.body).message;
      assert.deepEqual(message.toRecipients, [{ emailAddress: { address: email } }]);
      assert.match(message.body.content, /123456/);
      assert.match(message.body.content, /\/operator\/confirm#token_hash=x{64}/);
      return new Response(null, { status: sentStatus });
    },
  };
  return { email, deps, requests };
}
test('no sender configured or no active grant preserves the original delivery path', async () => {
  for (const o of [{ enabled: false }, { grant: false }]) {
    const { email, deps, requests } = setup(o);
    assert.equal(await sendPilotCode(email, deps), false);
    assert.ok(requests.every((r) => r.url.endsWith('rr_operator_mail_token')));
  }
});
test('a connected pilot receives one message and the rotated grant is saved', async () => {
  const { email, deps, requests } = setup();
  assert.equal(await sendPilotCode(email, deps), true);
  assert.equal(requests.filter((r) => r.url.endsWith('/me/sendMail')).length, 1);
  assert.ok(requests.some((r) => r.url.endsWith('rr_operator_mail_save')));
});
test('a mismatched auth identity cannot receive the message', async () => {
  const { email, deps, requests } = setup({ wrongMailbox: true });
  await assert.rejects(sendPilotCode(email, deps), /code_generation/);
  assert.ok(!requests.some((r) => r.url.endsWith('/me/sendMail')));
});
test('a provider rejection is recorded without sending a replacement code', async () => {
  const { email, deps, requests } = setup({ sentStatus: 429 });
  await assert.rejects(sendPilotCode(email, deps), /mail_delivery/);
  assert.equal(requests.filter((r) => r.url.includes('/admin/generate_link')).length, 1);
});
