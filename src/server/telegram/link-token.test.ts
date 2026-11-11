import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createLinkToken,
  hashLinkToken,
  isLinkToken,
  LINK_TOKEN_TTL_MS,
} from './link-token'

test('link tokens are 32-char base64url values with a 10 minute TTL', () => {
  const { token, hash } = createLinkToken()
  assert.equal(token.length, 32)
  assert.match(token, /^[A-Za-z0-9_-]{32}$/)
  assert.equal(hash.length, 64)
  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.equal(hashLinkToken(token), hash)
  assert.equal(LINK_TOKEN_TTL_MS, 10 * 60_000)
})

test('link tokens are random and the format check rejects junk', () => {
  const first = createLinkToken()
  const second = createLinkToken()
  assert.notEqual(first.token, second.token)
  assert.notEqual(first.hash, second.hash)
  assert.equal(isLinkToken(first.token), true)
  assert.equal(isLinkToken(''), false)
  assert.equal(isLinkToken('x'.repeat(31)), false)
  assert.equal(isLinkToken('x'.repeat(32)), true)
  assert.equal(isLinkToken('x'.repeat(33)), false)
})
