'use strict';
const crypto = require('crypto');

const DEFAULT_SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 10 * 60 * 1000);
const sessions = new Map();

function now() {
  return Date.now();
}

function createEmptySession() {
  return {
    flowId: crypto.randomUUID(),
    step: null,
    executing: false,
    createdAt: now(),
    updatedAt: now(),
    expiresAt: now() + DEFAULT_SESSION_TTL_MS,
  };
}

function isExpired(session) {
  return !session || !session.expiresAt || session.expiresAt <= now();
}

function getSession(userId) {
  const key = String(userId);
  const existing = sessions.get(key);

  if (!existing || isExpired(existing)) {
    const fresh = createEmptySession();
    sessions.set(key, fresh);
    return fresh;
  }

  existing.updatedAt = now();
  existing.expiresAt = now() + DEFAULT_SESSION_TTL_MS;
  return existing;
}

function resetSession(userId, initial = {}) {
  const key = String(userId);
  const session = { ...createEmptySession(), ...initial };
  sessions.set(key, session);
  return session;
}

function clearSession(userId) {
  sessions.set(String(userId), createEmptySession());
}

function assertStep(session, expectedStep) {
  return !!session && !isExpired(session) && session.step === expectedStep;
}

function assertFlow(session, flowId) {
  return !!session && !isExpired(session) && session.flowId === flowId;
}

module.exports = {
  getSession,
  resetSession,
  clearSession,
  assertStep,
  assertFlow,
};
