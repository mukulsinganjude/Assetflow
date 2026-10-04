'use strict';
/** JWT signing + auth/role middleware. */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Resolve the JWT signing secret without ever shipping a known hardcoded value:
//  - JWT_SECRET env var wins (set this in production).
//  - In production a missing secret is fatal — refuse to start rather than sign
//    tokens anyone could forge with a public default.
//  - In dev, persist a random secret to server/.jwt-secret so tokens survive
//    restarts, falling back to an ephemeral in-memory secret if the FS is
//    read-only. (Add server/.jwt-secret to .gitignore.)
function resolveSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production. Refusing to start with a default secret.');
  }
  const secretFile = path.join(__dirname, '.jwt-secret');
  try {
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf8').trim();
      if (existing) return existing;
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    console.warn('[auth] JWT_SECRET not set; generated a random dev secret at server/.jwt-secret. Set JWT_SECRET in production.');
    return generated;
  } catch {
    console.warn('[auth] Could not persist a dev JWT secret; using an ephemeral one (tokens reset on restart).');
    return crypto.randomBytes(48).toString('hex');
  }
}

const SECRET = resolveSecret();
const EXPIRES_IN = '8h';

function signToken(user) {
  return jwt.sign({ username: user.username, role: user.role }, SECRET, { expiresIn: EXPIRES_IN });
}

/** Requires a valid Bearer token; attaches req.user = { username, role }. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

/** Requires the authenticated user to hold one of the given roles. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.user?.permissionOverrideAllowed) return next();
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action.' });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole, SECRET };
