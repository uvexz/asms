/**
 * Temporary mailboxes are valid for one hour from creation. Mail received
 * during that window keeps the mailbox permanently; the window itself is not
 * configurable so the product rule stays the same on every deployment.
 */
export const TEMP_MAILBOX_TTL_MINUTES = 60
