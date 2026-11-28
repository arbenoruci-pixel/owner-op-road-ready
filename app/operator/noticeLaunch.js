export function noticeDestination(noticeId, operatorId) {
  const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
  if (typeof noticeId !== 'string' || typeof operatorId !== 'string' || !uuid.test(noticeId) || !uuid.test(operatorId)) return null;
  return {noticeId:noticeId.toLowerCase(), operatorId:operatorId.toLowerCase()};
}

export function noticeFromUrl(url) {
  if (url.searchParams.getAll('notice').length !== 1 || url.searchParams.getAll('noticeOperator').length !== 1) return null;
  return noticeDestination(url.searchParams.get('notice'), url.searchParams.get('noticeOperator'));
}


const loginKey = 'rr-pending-driver-notice-signin';
const lifetime = 15 * 60 * 1000;

// Email sign-in can return in a fresh tab. Restore only a recent target for
// the mailbox that requested the link; the workspace still verifies access.
export function rememberNoticeForEmail(email) {
  try {
    const target = noticeFromUrl(new URL(window.location.href));
    if (target) {
      window.localStorage.setItem(loginKey,JSON.stringify({...target,email:email.trim().toLowerCase(),created:Date.now()}));
    } else {
      takeNoticeForEmail(email);
    }
  } catch { /* Storage is optional for sign-in. */ }
}

export function takeNoticeForEmail(email) {
  try {
    const intent = JSON.parse(window.localStorage.getItem(loginKey));
    if (!intent) return null;
    const age = Date.now()-intent.created;
    const target = noticeDestination(intent.noticeId,intent.operatorId);
    if (!target || !Number.isFinite(age) || age<0 || age>=lifetime) {
      window.localStorage.removeItem(loginKey);
      return null;
    }
    if (!email || email.trim().toLowerCase()!==intent.email) return null;
    window.localStorage.removeItem(loginKey);
    return target;
  } catch { return null; }
}
