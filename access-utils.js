(function (root) {
  const adminOnlyPages = new Set(['fees', 'kitchen']);
  const isAdminOnlyPage = page => adminOnlyPages.has(page);
  const canAccessPage = (page, authenticatedRole) => !isAdminOnlyPage(page) || authenticatedRole === 'admin';
  const api = { isAdminOnlyPage, canAccessPage };
  root.PillarAccessUtils = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
