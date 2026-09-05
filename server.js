const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cookieSession = require('cookie-session');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(cookieSession({
  name: 'sf_session',
  keys: [process.env.SESSION_SECRET],
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: isProduction ? 'none' : 'lax',
  secure: isProduction
}));

// Helper PKCE functions
function base64URLEncode(str) {
  return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

// 5 to 7 fields per object
const OBJECT_FIELDS = {
  Account: ['Name', 'Type', 'Phone', 'Industry', 'AnnualRevenue', 'BillingCity'],
  Contact: ['FirstName', 'LastName', 'Email', 'Phone', 'Title', 'Department'],
  Opportunity: ['Name', 'StageName', 'Amount', 'CloseDate', 'Type'],
  Lead: ['FirstName', 'LastName', 'Company', 'Email', 'Status', 'Phone'],
  Case: ['CaseNumber', 'Subject', 'Status', 'Priority', 'Origin']
};

// Check if user is logged in
app.get('/api/auth/status', (req, res) => {
  if (req.session && req.session.accessToken) {
    return res.json({ authenticated: true });
  }
  res.json({ authenticated: false });
});

// 1. OAuth Login (with PKCE)
app.get('/api/auth/login', (req, res) => {
  const verifier = base64URLEncode(crypto.randomBytes(32));
  const challenge = base64URLEncode(sha256(verifier));
  req.session.codeVerifier = verifier;

  const authUrl = `${process.env.SALESFORCE_LOGIN_URL}/services/oauth2/authorize?` +
    new URLSearchParams({
      response_type: 'code',
      client_id: process.env.SALESFORCE_CLIENT_ID,
      redirect_uri: process.env.SALESFORCE_REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    }).toString();

  res.redirect(authUrl);
});

// 2. OAuth Callback
app.get('/api/auth/callback', async (req, res) => {
  const { code } = req.query;
  const verifier = req.session.codeVerifier;

  if (!code) return res.status(400).send('Authorization code missing.');

  try {
    const tokenResponse = await axios.post(
      `${process.env.SALESFORCE_LOGIN_URL}/services/oauth2/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: process.env.SALESFORCE_CLIENT_ID,
        client_secret: process.env.SALESFORCE_CLIENT_SECRET,
        redirect_uri: process.env.SALESFORCE_REDIRECT_URI,
        code_verifier: verifier
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    req.session.accessToken = tokenResponse.data.access_token;
    req.session.instanceUrl = tokenResponse.data.instance_url;

    res.redirect(`${process.env.FRONTEND_URL}?login=success`);
  } catch (error) {
    console.error('OAuth Callback Error:', error.response?.data || error.message);
    res.redirect(`${process.env.FRONTEND_URL}?login=failed`);
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

const requireAuth = (req, res, next) => {
  if (!req.session?.accessToken) {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }
  next();
};

// READ with 20 records pagination
app.get('/api/sobjects/:objectName', requireAuth, async (req, res) => {
  const { objectName } = req.params;
  const offset = parseInt(req.query.offset) || 0;
  const fields = OBJECT_FIELDS[objectName];

  if (!fields) return res.status(400).json({ error: 'Unsupported object' });

  const query = `SELECT Id, ${fields.join(', ')} FROM ${objectName} ORDER BY CreatedDate DESC LIMIT 20 OFFSET ${offset}`;

  try {
    const response = await axios.get(
      `${req.session.instanceUrl}/services/data/v58.0/query?q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${req.session.accessToken}` } }
    );
    res.json({ records: response.data.records, fields, totalSize: response.data.totalSize });
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// CREATE
app.post('/api/sobjects/:objectName', requireAuth, async (req, res) => {
  try {
    const response = await axios.post(
      `${req.session.instanceUrl}/services/data/v58.0/sobjects/${req.params.objectName}`,
      req.body,
      { headers: { Authorization: `Bearer ${req.session.accessToken}` } }
    );
    res.status(201).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// UPDATE
app.patch('/api/sobjects/:objectName/:id', requireAuth, async (req, res) => {
  try {
    await axios.patch(
      `${req.session.instanceUrl}/services/data/v58.0/sobjects/${req.params.objectName}/${req.params.id}`,
      req.body,
      { headers: { Authorization: `Bearer ${req.session.accessToken}` } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

// DELETE
app.delete('/api/sobjects/:objectName/:id', requireAuth, async (req, res) => {
  try {
    await axios.delete(
      `${req.session.instanceUrl}/services/data/v58.0/sobjects/${req.params.objectName}/${req.params.id}`,
      { headers: { Authorization: `Bearer ${req.session.accessToken}` } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));