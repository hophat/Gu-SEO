// Email rules for sign-up.
//
// One place, because the checks were previously copy-pasted into
// public/register.js, public/send-otp.js and admin/users.js — the same shape of
// duplication that let the provider dispatch drift three times. A rule about
// who may create an account has to be identical at every door.

// Deliberately loose. Full RFC 5322 is not worth implementing, and being
// stricter than the mail server rejects real addresses.
const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 254 is the SMTP limit on a forward-path; longer is not deliverable.
export const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value) {
  const s = String(value || '');
  return s.length > 0 && s.length <= MAX_EMAIL_LENGTH && EMAIL_RX.test(s);
}

// Plus-addressing: `local+tag@domain`.
//
// Rejected at sign-up. Every major provider delivers `you+anything@` to the
// same inbox, so it is the cheapest way to turn one mailbox into unlimited free
// accounts. The address is still perfectly valid — it just is not a new person.
export function isSubaddressed(value) {
  const s = String(value || '');
  const at = s.lastIndexOf('@');
  if (at < 1) return false;
  return s.slice(0, at).includes('+');
}

// Returns null when the address is acceptable, or a ready-to-send error body.
export function emailPolicyError(value) {
  const email = normalizeEmail(value);
  if (!isValidEmail(email)) {
    return { error: 'invalid_email', detail: 'Email không đúng định dạng.' };
  }
  if (isSubaddressed(email)) {
    return {
      error: 'subaddress_not_allowed',
      detail: 'Không chấp nhận địa chỉ dạng tên+phụ (ví dụ ten+abc@gmail.com). '
        + 'Mọi địa chỉ như vậy đều gửi về cùng một hộp thư, nên hãy dùng email chính của bạn.',
    };
  }
  return null;
}

// ── canonical form, for DUPLICATE CHECKING ONLY ─────────────────────
//
// Gmail ignores dots in the local part and treats `+tag` as a subaddress, so
// `g.u.l.a.g.i@gmail.com`, `gulagi+shop@gmail.com` and `gulagi@gmail.com` are
// all one mailbox. Storing a collapsed form lets the "email already exists"
// check see that, without rejecting anyone who legitimately uses dots.
//
// TWO RULES THAT MATTER:
//
//   1. This is a comparison key, never an address. It is never mailed to and
//      never shown. Collapsing is lossy — `g.u.l.a.g.i@gmail.com` cannot be
//      recovered from `gulagi@gmail.com` — so the real address stays in
//      `users.email` and is what everything else uses.
//
//   2. Only Google domains are collapsed. Outlook, Fastmail and most others
//      treat dots as significant, so `a.b@outlook.com` really is a different
//      mailbox from `ab@outlook.com`. Applying Gmail's rule to them would
//      merge two people's accounts, which is far worse than missing a
//      duplicate.
//
// Known gap: a Google Workspace domain (`you@yourcompany.com` hosted on
// Google) also ignores dots, but nothing in the address says it is Google —
// that needs an MX lookup, which is not worth a network round-trip on the
// sign-up path.

const GOOGLE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export function canonicalEmail(value) {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf('@');
  if (at < 1) return email;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!GOOGLE_DOMAINS.has(domain)) return email;

  // googlemail.com and gmail.com are the same mailbox, so collapse the domain
  // too — otherwise the same person could register twice by switching domains.
  return `${local.split('+')[0].replace(/\./g, '')}@gmail.com`;
}
