'use strict';

class TimeUtil {
  constructor(homey) {
    this.homey = homey;
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
   * Human-friendly local formatting (24h) in the user's configured timezone.
   * NL: "8 maart 2026 om 05:00"
   * EN: "8 March 2026 05:00"
   */
  formatLocal(date) {
    if (!(date instanceof Date)) return '';

    const lang = this.homey.i18n.getLanguage() || 'en';
    const locale = lang === 'nl' ? 'nl-NL' : lang;
    const timeZone = this.homey.clock.getTimezone() || 'UTC';

    const nowYear = new Date().getFullYear();
    const includeYear = date.getFullYear() !== nowYear;

    try {
      const parts = new Intl.DateTimeFormat(locale, {
        timeZone,
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
      const dd = d.toLocaleString(locale, { timeZone, day: 'numeric' });
      const mm = d.toLocaleString(locale, { timeZone, month: 'long' });
      const yy = d.toLocaleString(locale, { timeZone, year: 'numeric' });
      const hh = d.toLocaleString(locale, { timeZone, hour: '2-digit', hour12: false }).padStart(2, '0');
      const mi = d.toLocaleString(locale, { timeZone, minute: '2-digit' }).padStart(2, '0');

      if (lang === 'nl') {
        return includeYear ? `${dd} ${mm} ${yy} om ${hh}:${mi}` : `${dd} ${mm} om ${hh}:${mi}`;
      }
      return includeYear ? `${dd} ${mm} ${yy} ${hh}:${mi}` : `${dd} ${mm} ${hh}:${mi}`;
    }
  }

  /**
   * Compact date range in the user's timezone, e.g. "6 - 8 nov" or "30 okt - 1 nov".
   */
  formatDateRange(start, end) {
    const lang = this.homey.i18n.getLanguage() || 'en';
    const locale = lang === 'nl' ? 'nl-NL' : 'en-GB';
    const timeZone = this.homey.clock.getTimezone() || 'UTC';
    const fmt = (d, opts) => new Intl.DateTimeFormat(locale, { timeZone, ...opts }).format(d);
    const endStr = fmt(end, { day: 'numeric', month: 'short' });
    const sameMonth = fmt(start, { month: 'numeric' }) === fmt(end, { month: 'numeric' });
    const startStr = sameMonth ? fmt(start, { day: 'numeric' }) : fmt(start, { day: 'numeric', month: 'short' });
    return `${startStr} - ${endStr}`;
  }

  /**
   * Returns a human-readable countdown string.
   * NL: "2 dagen, 3 uur en 45 minuten"
   * EN: "2 days, 3 hours and 45 minutes"
   */
  formatCountdown(totalSeconds) {
    const lang = this.homey.i18n.getLanguage() || 'en';
    const sec = Math.max(0, Math.floor(totalSeconds));
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);

    const parts = [];
    if (lang === 'nl') {
      if (d > 0) parts.push(`${d} dag${d !== 1 ? 'en' : ''}`);
      if (h > 0) parts.push(`${h} uur`);
      if (m > 0 || parts.length === 0) parts.push(`${m} ${m !== 1 ? 'minuten' : 'minuut'}`);
    } else {
      if (d > 0) parts.push(`${d} day${d !== 1 ? 's' : ''}`);
      if (h > 0) parts.push(`${h} hour${h !== 1 ? 's' : ''}`);
      if (m > 0 || parts.length === 0) parts.push(`${m} minute${m !== 1 ? 's' : ''}`);
    }

    if (parts.length === 1) return parts[0];
    const last = parts.pop();
    const joiner = lang === 'nl' ? ' en ' : ' and ';
    return parts.join(', ') + joiner + last;
  }
}

module.exports = TimeUtil;
