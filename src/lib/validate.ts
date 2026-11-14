/**
 * Shape checks the client can make before a round trip. The server validates
 * again — this only exists so a typo is answered on the same keystroke.
 */

/**
 * Deliberately loose: one `@`, one dotted suffix, no whitespace. Anything
 * stricter rejects addresses that are legal (quoted local parts, new TLDs),
 * and the server is the authority either way.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
