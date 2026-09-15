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
