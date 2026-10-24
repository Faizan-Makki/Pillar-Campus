(function (root) {
  const isActiveToday = (record, today) => !record.actualReturn && !record.returned && record.startDate <= today && record.endDate >= today;
  const activeStudentIds = (records, today) => new Set(records.filter(record => isActiveToday(record, today)).map(record => record.studentId));
  const status = (record, today) => record.actualReturn || record.returned ? 'Returned' : record.startDate > today ? 'Scheduled' : record.endDate < today ? 'Overdue' : 'Active';
  const validIsoDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  const api = { isActiveToday, activeStudentIds, status, validIsoDate };
  root.PillarLeaveUtils = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
