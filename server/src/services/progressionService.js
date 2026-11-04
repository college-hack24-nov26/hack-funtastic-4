const User = require('../models/user');
const rules = require('../config/progression');

function nextMilestone(items, currentName) {
  const index = items.findIndex((item) => item.name === currentName);
  return items[index + 1] || null;
}

function milestoneProgress(currentPoints, current, next) {
  if (!next) return 100;
  const start = current?.dharmaRequired || 0;
  return Math.max(0, Math.min(100, Math.round(((currentPoints - start) / (next.dharmaRequired - start)) * 100)));
}

async function recalculate(studentId) {
  const user = await User.findOne({ _id: studentId, role: 'student', isActive: true })
    .select('dharmaPoints adharmaPoints unlockedLokaKeys unlockedAshramStageKeys').lean();
  if (!user) {
    const error = new Error('Student account is unavailable.'); error.statusCode = 404; throw error;
  }
  const dharmaPoints = user.dharmaPoints || 0;
  const adharmaPoints = user.adharmaPoints || 0;
  const effectiveDharma = Math.max(0, dharmaPoints - adharmaPoints * rules.lokaAdharmaMultiplier);
  const unlockedLokaKeys = new Set(user.unlockedLokaKeys || ['bhuloka']);
  const unlockedAshramStageKeys = new Set(user.unlockedAshramStageKeys || ['forest-hermitage']);
  for (const loka of rules.lokaThresholds) if (effectiveDharma >= loka.dharmaRequired) unlockedLokaKeys.add(loka.key);
  for (const stage of rules.ashramStages) if (dharmaPoints >= stage.dharmaRequired) unlockedAshramStageKeys.add(stage.key);
  await User.updateOne({ _id: user._id, role: 'student' }, {
    $max: { maxDharmaPoints: dharmaPoints },
    $addToSet: {
      unlockedLokaKeys: { $each: [...unlockedLokaKeys] },
      unlockedAshramStageKeys: { $each: [...unlockedAshramStageKeys] }
    }
  });
  const unlockedLokas = rules.lokaThresholds.filter((item) => unlockedLokaKeys.has(item.key));
  const unlockedStages = rules.ashramStages.filter((item) => unlockedAshramStageKeys.has(item.key));
  const currentLoka = unlockedLokas.at(-1) || rules.lokaThresholds[0];
  const currentAshramStage = unlockedStages.at(-1) || rules.ashramStages[0];
  const nextLoka = nextMilestone(rules.lokaThresholds, currentLoka.name);
  const nextAshramStage = nextMilestone(rules.ashramStages, currentAshramStage.name);
  return {
    dharmaPoints,
    adharmaPoints,
    effectiveDharma,
    currentLoka: currentLoka.name,
    nextLoka,
    lokas: rules.lokaThresholds.map((item) => ({ ...item, unlocked: unlockedLokaKeys.has(item.key) })),
    ashram: {
      currentStage: currentAshramStage.name,
      nextStage: nextAshramStage,
      progressPercent: milestoneProgress(dharmaPoints, currentAshramStage, nextAshramStage),
      unlockedStages: rules.ashramStages.map((item) => ({ ...item, unlocked: unlockedAshramStageKeys.has(item.key) }))
    }
  };
}

module.exports = { recalculate };
