'use strict';

class TimeUtil {
  constructor(homey) {
    this.homey = homey;
  }

  // Keep the setting for backwards compatibility, but never fall back to ISO anymore.
  // Users want human-readable times everywhere.
  useLocal() {
    return this.homey.settings.get('use_local_time') !== false;
  }

  parseRaceDateTime(race) {
    if (!race?.date || !race?.time) return null;
    return this.parseUtc(race.date, race.time);
  }

  parseSessionDateTime(sessionObj) {
    if (!sessionObj?.date || !sessionObj?.time) return null;
    return this.parseUtc(sessionObj.date, sessionObj.time);
  }

  parseUtc(dateStr, timeStr) {
    const timeClean = String(timeStr).replace('Z', '');
    const iso = `${dateStr}T${timeClean}Z`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Human-friendly local formatting (24h).
   * NL: "8 maart 2026 om 05:00"
   * EN: "8 March 2026 05:00"
   *
   * We intentionally DO NOT return ISO strings anymore, because those show up in
   * notifications and dashboards and look ugly/confusing.
   */
  formatLocal(date) {
    if (!(date instanceof Date)) return '';

    const lang = this.homey.i18n.getLanguage() || 'en';
    const locale = lang === 'nl' ? 'nl-NL' : lang;

    const nowYear = new Date().getFullYear();
    const includeYear = date.getFullYear() !== nowYear;

    try {
      const parts = new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long',
        ...(includeYear ? { year: 'numeric' } : {}),
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).formatToParts(date);

      const get = (type) => parts.find(p => p.type === type)?.value || '';
      const day = get('day');
      const month = get('month');
      const year = includeYear ? get('year') : '';
      const hour = (get('hour') || '').padStart(2, '0');
      const minute = (get('minute') || '').padStart(2, '0');

      if (lang === 'nl') {
        return includeYear
          ? `${day} ${month} ${year} om ${hour}:${minute}`
          : `${day} ${month} om ${hour}:${minute}`;
      }

      return includeYear
        ? `${day} ${month} ${year} ${hour}:${minute}`
        : `${day} ${month} ${hour}:${minute}`;
    } catch (e) {
      const d = date;
      const dd = d.getDate();
      const mm = d.toLocaleString(locale, { month: 'long' });
      const yy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');

      if (lang === 'nl') {
        return includeYear ? `${dd} ${mm} ${yy} om ${hh}:${mi}` : `${dd} ${mm} om ${hh}:${mi}`;
      }
      return includeYear ? `${dd} ${mm} ${yy} ${hh}:${mi}` : `${dd} ${mm} ${hh}:${mi}`;
    }
  }
}

module.exports = TimeUtil;
