/**
 * BESTA KIOSK - Configuration
 * ==========================================================================
 * Contains public configuration parameters for the frontend application.
 * Note: BACKEND_URL points directly to your Google Apps Script Web App URL.
 * ==========================================================================
 */

window.BESTA_CONFIG = {
  // Replace with your Google Apps Script Web App URL (must end in /exec)
  BACKEND_URL: "https://script.google.com/macros/s/1AkpEgv9ScUBE6uvx8m0POgMjNr3nixDRp6lWu1MJRog/exec",

  // Replace with your Google OAuth 2.0 Web Application Client ID
  GOOGLE_CLIENT_ID: "338464059082-i0gp5ob2h7fettvnlq6h7d5e2bjadda3.apps.googleusercontent.com",

  // Privacy Policy and Terms version timestamp
  POLICY_VERSION: "2026-10-15",

  // Game settings and limits matching backend rules
  GAME_SETTINGS: {
    orderupMinSeconds: 15,
    orderupMaxSeconds: 3600,
    demonMaxScore: 1000000
  }

  // Shown to people and recorded with their consent. Change it whenever the Privacy Policy changes.
  POLICY_VERSION: "2026-10-15",

  CONTACT: {
    name: "Besta — The Indian Kitchen",
    email: "hello@besta.co.in",
    phone: "",   // e.g. "+919876543210" — adds a Call button and a clickable number
    address: "Beside DBS Bank, Kanaka Durga Gazetted Officers Colony, Guru Nanak Colony, Vijayawada"
  },

};