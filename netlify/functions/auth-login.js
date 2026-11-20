/**
 * Netlify Serverless Function: /api/auth-login
 * Authenticates Admin and User logins using Netlify environment variables.
 *
 * Supported environment variables:
 * - ADMIN_USERNAME (default: Keerthan Tunkoju)
 * - ADMIN_PASSWORD (default: 2001)
 * - USER_USERNAME  (default: user)
 * - USER_PASSWORD  (default: user123)
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Method Not Allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const inputUser = (body.username || '').trim().toLowerCase();
    const inputPass = body.password || '';

    const envAdminUser = (process.env.ADMIN_USERNAME || 'Keerthan Tunkoju').trim().toLowerCase();
    const envAdminPass = process.env.ADMIN_PASSWORD || '2001';

    const envUserUser = (process.env.USER_USERNAME || 'user').trim().toLowerCase();
    const envUserPass = process.env.USER_PASSWORD || 'user123';

    // 1. Verify Admin Credentials against Netlify Environment Variables
    if (inputUser === envAdminUser && inputPass === envAdminPass) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          ok: true,
          authenticated: true,
          user: {
            username: process.env.ADMIN_USERNAME || 'Keerthan Tunkoju',
            role: 'admin',
            authMethod: 'netlify-env'
          }
        })
      };
    }

    // 2. Verify Standard User Credentials against Netlify Environment Variables
    if ((inputUser === envUserUser || inputUser === 'officer' || inputUser === 'viewer') && inputPass === envUserPass) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          ok: true,
          authenticated: true,
          user: {
            username: process.env.USER_USERNAME || 'User',
            role: 'user',
            authMethod: 'netlify-env'
          }
        })
      };
    }

    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: false,
        authenticated: false,
        error: 'Invalid credentials'
      })
    };
  } catch (err) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
