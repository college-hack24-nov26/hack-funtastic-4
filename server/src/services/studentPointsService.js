const User = require('../models/user');
const progressionService = require('./progressionService');

async function applyChoice(studentId, { eventKey, dharmaChange = 0, adharmaChange = 0 }) {
  if (typeof eventKey !== 'string' || eventKey.length < 3 || eventKey.length > 180) {
    throw new Error('A valid point event key is required.');
  }
  if (!Number.isInteger(dharmaChange) || !Number.isInteger(adharmaChange) || adharmaChange < 0) {
    throw new Error('Point changes must be whole numbers and Adharma changes cannot be negative.');
  }
  const dateKey = new Date().toISOString().slice(0, 10);
  const earnedAt = new Date();
  const dailyRecords = { $ifNull: ['$dailyDharmaRecords', []] };
  const recordKeys = { $map: { input: dailyRecords, as: 'record', in: '$$record.dateKey' } };
  const dailyUpdate = dharmaChange > 0 ? {
    $cond: [
      { $in: [dateKey, recordKeys] },
      { $map: {
        input: dailyRecords,
        as: 'record',
        in: { $cond: [
          { $eq: ['$$record.dateKey', dateKey] },
          { $mergeObjects: ['$$record', { dharmaEarned: { $add: ['$$record.dharmaEarned', dharmaChange] } }] },
          '$$record'
        ] }
      } },
      { $concatArrays: [dailyRecords, [{ dateKey, dharmaEarned: dharmaChange }]] }
    ]
  } : { $ifNull: ['$dailyDharmaRecords', []] };
  const user = await User.findOneAndUpdate(
    { _id: studentId, role: 'student', isActive: true, pointEventKeys: { $ne: eventKey } },
    [{ $set: {
      dharmaPoints: { $max: [0, { $add: [{ $ifNull: ['$dharmaPoints', 0] }, dharmaChange] }] },
      maxDharmaPoints: { $max: [{ $ifNull: ['$maxDharmaPoints', 0] }, { $max: [0, { $add: [{ $ifNull: ['$dharmaPoints', 0] }, dharmaChange] }] }] },
      adharmaPoints: { $add: [{ $ifNull: ['$adharmaPoints', 0] }, adharmaChange] },
      pointEventKeys: { $concatArrays: [{ $ifNull: ['$pointEventKeys', []] }, [eventKey]] },
      dailyDharmaRecords: dailyUpdate,
      dharmaEarnedEvents: dharmaChange > 0
        ? { $concatArrays: [{ $ifNull: ['$dharmaEarnedEvents', []] }, [{ eventKey, points: dharmaChange, earnedAt }]] }
        : { $ifNull: ['$dharmaEarnedEvents', []] }
    } }],
    { new: true, projection: { dharmaPoints: 1, adharmaPoints: 1 } }
  );
  if (user) {
    const progression = await progressionService.recalculate(studentId);
    return { applied: true, pointsApplied: Math.max(0, dharmaChange), dharmaPoints: user.dharmaPoints, adharmaPoints: user.adharmaPoints, progression };
  }
  const existing = await User.findOne({ _id: studentId, role: 'student', isActive: true })
    .select('dharmaPoints adharmaPoints pointEventKeys dharmaEarnedEvents').lean();
  if (!existing) throw new Error('Student account is unavailable.');
  const progression = await progressionService.recalculate(studentId);
  const priorEvent = (existing.dharmaEarnedEvents || []).find((event) => event.eventKey === eventKey);
  return {
    applied: false,
    pointsApplied: priorEvent?.points || 0,
    dharmaPoints: existing.dharmaPoints || 0,
    adharmaPoints: existing.adharmaPoints || 0,
    progression
  };
}

module.exports = { applyChoice };
