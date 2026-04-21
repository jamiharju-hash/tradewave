'use strict';

const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) sessions.set(userId, {});
  return sessions.get(userId);
}

function clearSession(userId) {
  sessions.set(userId, {});
}

module.exports = { getSession, clearSession };
