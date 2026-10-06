/**
 * Contact details in archive text. The journals and newsletters we quote print
 * members' and officers' addresses and phone numbers; a short quote around a
 * place name sometimes carries one. They are private people's details, and not
 * what the quotes are for, so they are taken out before anything is stored.
 */
const EMAIL = /[A-Za-z0-9._%+-]+\s?@\s?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// (602) 837-0062, 602-837-0062, 602.837.0062, 1-800-555-0100, +1 602 837 0062, and +44 20 7946 0958.
const PHONE_US = /(?:\+?\d{1,2}[\s.-])?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g;
const PHONE_INTL = /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}\b/g;

/** The text with e-mail addresses and phone numbers replaced by a marker. */
export function redactContacts(text) {
  return String(text ?? '')
    .replace(EMAIL, '[email removed]')
    .replace(PHONE_INTL, '[number removed]')
    .replace(PHONE_US, '[number removed]');
}

/** Does the text still hold an address or number? (For tests and checks.) */
export const hasContact = (text) => {
  const s = String(text ?? '');
  return [EMAIL, PHONE_US, PHONE_INTL].some((re) => ((re.lastIndex = 0), re.test(s)));
};
