'use strict';
/** The only file that talks to the server. Swap this to change backend; screens never call fetch. */
class ApiError extends Error { constructor(code, message) { super(message); this.code = code; } }

const Api = {
  hasToken: () => !!sessionStorage.getItem('vrts_token'),
  clear: () => sessionStorage.removeItem('vrts_token'),
  async call(action, payload = {}) {
    if (API_URL.startsWith('PASTE')) throw new ApiError('SETUP', 'Set API_URL in config.js first.');
    let res;
    try {
      // A plain-text body avoids the browser's CORS preflight, which Apps Script cannot answer.
      res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action, token: sessionStorage.getItem('vrts_token'), payload }) });
    } catch (e) {
      throw new ApiError('NETWORK', "Can't reach the server. Check your connection and try again.");
    }
    let json;
    try { json = await res.json(); } catch (e) { throw new ApiError('NETWORK', 'The server sent an unreadable reply. Try again.'); }
    if (!json.ok) throw new ApiError(json.code, json.error);
    if (action === 'login') sessionStorage.setItem('vrts_token', json.data.token);
    return json.data;
  }
};
