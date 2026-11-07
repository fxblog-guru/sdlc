/**
 * env-doctor.mjs, the mail sender and the store change (DEV-CONTRACTS §13.4,
 * dev-planning-deployment/secrets-and-environments.md). Two release-day failures, each made a check
 * that can fail: product mail sent from a free mailbox (the provider says "sent", Gmail drops it on
 * DMARC alignment), and a sender value with a display name that the app refuses at boot. DNS is a
 * fake here: no unit test touches the network.
 *
 *   node --test tests/env-doctor-mail.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const SCRIPT = join(ROOT, 'workspace', 'dev', 'scripts', 'env-doctor.mjs');
const doctor = await import(pathToFileURL(SCRIPT).href);
const bundle = (f) => readFileSync(join(ROOT, f), 'utf8');

const HEAD = '| Key | Purpose | Source | Environments | Holder | Rotation | Format |\n|---|---|---|---|---|---|---|\n';
const keys = doctor.parseKeys(`${HEAD}| BREVO_SMTP_FROM | mail sender | owner | all | owner | never | email |\n| NOTIFY_SENDER | alerts | owner | all | owner | never | email-sender |\n| SMTP_PORT | relay port | provider | all | owner | never | port |\n`);

/** A resolver that knows only the records given; any other name is NXDOMAIN. */
const fakeDns = (records, { fail } = {}) => ({
  asked: [],
  async resolveTxt(name) {
    this.asked.push(name);
    if (fail) throw Object.assign(new Error('timeout'), { code: fail });
    if (records[name]) return records[name].map((r) => [r]);
    throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
  },
});
const OWNED = {
  '_dmarc.fxblog.dev': ['v=DMARC1; p=none; rua=mailto:dmarc@fxblog.dev'],
  'brevo1._domainkey.fxblog.dev': ['k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC'],
};
const one = (v) => ({ BREVO_SMTP_FROM: v });
const only = [keys[0]];

test('the email kind takes a bare address and refuses a display name', () => {
  const email = doctor.formatTest('email');
  assert.equal(email('hello@fxblog.dev'), true);
  assert.equal(email('first.last+tag@mail.example.co.uk'), true);
  for (const v of ['fx-blog <hello@fxblog.dev>', '<hello@fxblog.dev>', '"fx" hello@fxblog.dev', 'fx-blog<hello@fxblog.dev>', 'hello@fxblog', 'hello@-fxblog.dev']) {
    assert.equal(email(v), false, `${v} must not pass as an email`);
  }
  assert.equal(doctor.formatTest('email-sender')('fx-blog <hello@fxblog.dev>'), false);
  assert.equal(doctor.formatTest('email-sender')('hello@fxblog.dev'), true);
  const f = doctor.checkValues(only, 'production', one('fx-blog <hello@fxblog.dev>'));
  assert.deepEqual(f, [{ key: 'BREVO_SMTP_FROM', problem: 'does not match Format email' }]);
});

test('a Format may carry a note on the exact shape; the kind is what is checked', () => {
  const k = doctor.parseKeys(`${HEAD}| MAIL_FROM | sender | owner | all | owner | never | email-sender (bare address, no display name) |\n| TAG | tag | CI | all | CI | never | /^v\\d+$/ (a version tag) |\n`);
  assert.deepEqual(k.map((x) => x.format), ['email-sender', '/^v\\d+$/']);
  assert.deepEqual(doctor.checkValues(k, 'production', { MAIL_FROM: 'fx-blog <hello@fxblog.dev>', TAG: 'v3' }).map((x) => x.problem), ['does not match Format email-sender']);
});

test('sender keys are found by name or by the email-sender Format, not by any key ending in a mail word', () => {
  assert.deepEqual(doctor.senderKeys(keys, 'production').map((k) => k.name), ['BREVO_SMTP_FROM', 'NOTIFY_SENDER']);
  for (const n of ['SMTP_FROM', 'MAIL_FROM', 'EMAIL_FROM', 'APP_MAIL_FROM', 'RESEND_EMAIL_FROM']) {
    assert.equal(doctor.senderKeys([{ name: n, envs: ['all'], format: 'any' }], 'production').length, 1, n);
  }
  for (const n of ['SMTP_PORT', 'MAIL_FROM_NAME', 'SMTP_FROMAGE']) {
    assert.equal(doctor.senderKeys([{ name: n, envs: ['all'], format: 'any' }], 'production').length, 0, n);
  }
});

test('a free-mailbox sender fails, without DNS, and the address is never printed', async () => {
  for (const v of ['fxblog.owner@gmail.com', 'a@googlemail.com', 'a@yahoo.co.uk', 'a@outlook.com', 'a@hotmail.com', 'a@live.com', 'a@icloud.com', 'a@proton.me', 'a@aol.com', 'fx <a@GMAIL.com>']) {
    const r = await doctor.checkMailSender(only, 'production', one(v));
    assert.equal(r.findings.length, 1, v);
    assert.match(r.findings[0].problem, /free-mailbox domain/);
  }
  const r = await doctor.checkMailSender(only, 'production', one('fxblog.owner@gmail.com'), { dns: fakeDns(OWNED) });
  assert.doesNotMatch(JSON.stringify(r), /fxblog\.owner/);
  assert.equal(doctor.isFreeMailbox('fxblog.dev'), false);
  assert.equal(doctor.isFreeMailbox('notgmail.com'), false);
});

test('an owned domain with DMARC and a DKIM key passes', async () => {
  const dns = fakeDns(OWNED);
  const r = await doctor.checkMailSender(only, 'production', one('hello@fxblog.dev'), { dns });
  assert.deepEqual(r, { findings: [], warnings: [] });
  assert.ok(dns.asked.includes('_dmarc.fxblog.dev'));
});

test('an owned domain without DMARC fails; a lookup that errors fails too', async () => {
  const none = await doctor.checkMailSender(only, 'production', one('hello@fxblog.dev'), { dns: fakeDns({}) });
  assert.match(none.findings.map((f) => f.problem).join('\n'), /_dmarc\.fxblog\.dev has no v=DMARC1 record/);
  const spf = await doctor.checkMailSender(only, 'production', one('hello@fxblog.dev'), { dns: fakeDns({ '_dmarc.fxblog.dev': ['v=spf1 include:example.net ~all'] }) });
  assert.equal(spf.findings.length, 1, 'a TXT that is not DMARC is not DMARC');
  const down = await doctor.checkMailSender(only, 'production', one('hello@fxblog.dev'), { dns: fakeDns(OWNED, { fail: 'ETIMEOUT' }) });
  assert.match(down.findings[0].problem, /cannot look up _dmarc\.fxblog\.dev \(ETIMEOUT\)/);
});

test('no rua and no DKIM under the selectors warn; --dkim-selector finds the provider key', async () => {
  const bare = { '_dmarc.fxblog.dev': ['v=DMARC1; p=none'], 'mx7._domainkey.fxblog.dev': ['v=DKIM1; k=rsa; p=MIGf'] };
  const r = await doctor.checkMailSender(only, 'production', one('hello@fxblog.dev'), { dns: fakeDns(bare) });
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.warnings.map((w) => w.problem.split(' ').slice(0, 3).join(' ')), ['_dmarc.fxblog.dev has no', 'no DKIM key']);
  const own = await doctor.checkMailSender(only, 'production', one('hello@fxblog.dev'), { dns: fakeDns(bare), selectors: ['mx7'] });
  assert.equal(own.warnings.length, 1, 'with the right selector only the rua warning is left');
});

test('without dns the lookups are skipped; a missing sender is left to the missing-key check', async () => {
  const dns = fakeDns({});
  const r = await doctor.checkMailSender(only, 'production', one('hello@fxblog.dev'), { dns: null });
  assert.deepEqual(r, { findings: [], warnings: [] });
  assert.deepEqual(dns.asked, []);
  assert.deepEqual(await doctor.checkMailSender(only, 'production', {}), { findings: [], warnings: [] });
});

test('the CLI: a gmail sender fails with --no-dns, an owned one is ready, and the address is not printed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'env-doctor-mail-'));
  writeFileSync(join(dir, 'keys.md'), `${HEAD}| BREVO_SMTP_FROM | mail sender | owner | all | owner | never | email-sender |\n`);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BREVO_SMTP_FROM;
  const run = (value, extra = []) => {
    writeFileSync(join(dir, '.env'), `BREVO_SMTP_FROM=${value}\n`);
    return spawnSync(process.execPath, [SCRIPT, '--env', 'production', '--keys', join(dir, 'keys.md'), '--file', join(dir, '.env'), '--no-db', '--no-dns', ...extra], { encoding: 'utf8', env, cwd: dir });
  };
  const bad = run('fxblog.owner@gmail.com');
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /FAIL BREVO_SMTP_FROM: mail sender is on the free-mailbox domain gmail\.com/);
  assert.doesNotMatch(bad.stdout, /fxblog\.owner/);
  const named = run('"fx-blog <hello@fxblog.dev>"');
  assert.equal(named.status, 1);
  assert.match(named.stdout, /FAIL BREVO_SMTP_FROM: does not match Format email-sender/);
  const ok = run('hello@fxblog.dev');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(run('hello@fxblog.dev', ['--dkim-selector', '']).status, 2);
});

// The rules only hold if the gates ask for them: G0 decides the sender with the host, the plan adds
// and proves the DNS records, G10 fails a store edit that skipped the check and a sender nobody tested.
test('§13.4: a store value change is a deploy, and the mail sender is decided at G0 on an owned domain', () => {
  const c = bundle('DEV-CONTRACTS.md');
  assert.match(c, /\*\*Changing a key's value in any store is a deploy\.\*\*/);
  assert.match(c, /A redeploy that\s+bypasses the check is a G10 finding/);
  assert.match(c, /\*\*The mail sender is decided at G0, with the host\.\*\*/);
  assert.match(c, /A free-mailbox domain\s+\(`gmail\.com`/);
  assert.match(bundle('commands/sdlc-intake.md'), /who deploys, secret store, mail sender\)/);
  assert.match(bundle('skills/dev-framing-problem/SKILL.md'), /the mail sender\s+address on a domain the product owns/);
  assert.match(bundle('skills/dev-reviewing-intake/SKILL.md'), /\| 18 \|[^\n]*its mail sender on a domain it owns/);
});

test('the plan: store changes go through the check, rollback stays promotable, mail DNS is proved by a real inbox', () => {
  const s = bundle('skills/dev-planning-deployment/secrets-and-environments.md');
  assert.match(s, /\n## A value changed in a store is a deploy\n/);
  assert.match(s, /keep the previous deployment promotable/);
  assert.match(s, /\n## Mail from a domain the product owns\n/);
  for (const r of ['DKIM', 'DMARC', 'SPF or return-path', 'verification']) assert.match(s, new RegExp(`\\| ${r}`), `no ${r} row`);
  assert.match(s, /a Gmail and an Outlook inbox/);
  assert.match(s, /"sent" is not "delivered"/);
  const k = bundle('workspace/dev/_templates/skeleton/ops/config/keys.md');
  assert.match(k, /`email-sender`/);
  assert.match(k, /`email` \(bare address, no display name\)/);
});

test('G10: rows 31 and 32 fail an unchecked store edit and an unproved mail sender', () => {
  const r = bundle('skills/dev-reviewing-deployment/SKILL.md');
  assert.match(r, /\| 31 \| A release or runbook step that changes a key's value in a store runs `env-doctor\.mjs` against it first/);
  assert.match(r, /\| 32 \| Mail sender is on an owned, authenticated domain; test delivery to Gmail and Outlook recorded/);
});
