(function () {
  const UTM_VALUE = /^[A-Za-z0-9가-힣 ._-]{1,80}$/;
  const PHONE_DIGIT_CANDIDATE = /(?:^|\D)(?:01[016789]\d{7,8}|02\d{7,8}|0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4])\d{7,8}|050\d{8,9}|0(?:60|70|80)\d{7,8}|1(?:5|6|8)\d{6})(?:$|\D)/;
  const CTA_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const CASE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const NAVER_HOSTS = new Set(['booking.naver.com', 'm.booking.naver.com']);

  function isPhoneLike(text) {
    return PHONE_DIGIT_CANDIDATE.test(text.replace(/[ ._-]/g, ''));
  }

  function sanitizeUtmValue(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return UTM_VALUE.test(text) && !isPhoneLike(text) ? text : null;
  }

  function validateNaverBookingUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
    try {
      const url = new URL(rawUrl.trim());
      if (url.protocol !== 'https:' || url.username || url.password || url.port ||
          !NAVER_HOSTS.has(url.hostname) || !url.pathname || url.pathname === '/') return null;
      url.hash = '';
      return url.href;
    } catch (_) {
      return null;
    }
  }

  function resolvePublishedLeakCase(caseSlug, caseIndex) {
    if (!CASE_SLUG.test(typeof caseSlug === 'string' ? caseSlug : '') || !caseIndex ||
        caseIndex.version !== 1 || !Array.isArray(caseIndex.cases)) return null;
    const matches = caseIndex.cases.filter(function (item) {
      return item && item.slug === caseSlug && item.published === true && item.service === 'leak' &&
        typeof item.title === 'string' && item.title.trim();
    });
    return matches.length === 1
      ? { slug: matches[0].slug, title: matches[0].title.trim() }
      : null;
  }

  function captureLeadMetadata(locationLike, ctaId, publishedReferenceCase) {
    const pathname = typeof (locationLike && locationLike.pathname) === 'string' &&
      locationLike.pathname.startsWith('/') ? locationLike.pathname : '/';
    const result = {
      sourcePage: pathname,
      ctaId: CTA_ID.test(ctaId) ? ctaId : 'unknown-cta'
    };
    const query = new URLSearchParams(
      typeof (locationLike && locationLike.search) === 'string' ? locationLike.search : ''
    );
    for (const [param, key] of [
      ['utm_source', 'utmSource'],
      ['utm_medium', 'utmMedium'],
      ['utm_campaign', 'utmCampaign']
    ]) {
      const value = sanitizeUtmValue(query.get(param));
      if (value) result[key] = value;
    }
    if (publishedReferenceCase && CASE_SLUG.test(publishedReferenceCase.slug) &&
        typeof publishedReferenceCase.title === 'string' && publishedReferenceCase.title.trim()) {
      result.referenceCase = publishedReferenceCase.slug;
    }
    return result;
  }

  window.ManmulRevenue = {
    captureLeadMetadata,
    resolvePublishedLeakCase,
    sanitizeUtmValue,
    validateNaverBookingUrl
  };
})();
