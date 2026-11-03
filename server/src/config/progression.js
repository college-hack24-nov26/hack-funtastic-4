const LOKA_THRESHOLDS = Object.freeze([
  { key: 'bhuloka', name: 'Bhuloka', dharmaRequired: 0 },
  { key: 'bhuvarloka', name: 'Bhuvarloka', dharmaRequired: 100 },
  { key: 'svarloka', name: 'Svarloka', dharmaRequired: 250 },
  { key: 'maharloka', name: 'Maharloka', dharmaRequired: 500 },
  { key: 'janaloka', name: 'Janaloka', dharmaRequired: 850 },
  { key: 'tapoloka', name: 'Tapoloka', dharmaRequired: 1300 },
  { key: 'satyaloka', name: 'Satyaloka', dharmaRequired: 1900 },
  { key: 'atala', name: 'Atala', dharmaRequired: 2600 },
  { key: 'vitala', name: 'Vitala', dharmaRequired: 3400 },
  { key: 'sutala', name: 'Sutala', dharmaRequired: 4300 },
  { key: 'talatala', name: 'Talatala', dharmaRequired: 5300 },
  { key: 'mahatala', name: 'Mahatala', dharmaRequired: 6400 },
  { key: 'rasatala', name: 'Rasatala', dharmaRequired: 7600 },
  { key: 'patala', name: 'Patala', dharmaRequired: 9000 }
]);

const ASHRAM_STAGES = Object.freeze([
  { key: 'forest-hermitage', name: 'Forest Hermitage', dharmaRequired: 0 },
  { key: 'growing-gurukul', name: 'Growing Gurukul', dharmaRequired: 500 },
  { key: 'learning-ashram', name: 'Learning Ashram', dharmaRequired: 1500 },
  { key: 'advanced-gurukul', name: 'Advanced Gurukul', dharmaRequired: 3500 },
  { key: 'great-university', name: 'Great University', dharmaRequired: 6000 }
]);

module.exports = Object.freeze({
  assessmentDharmaPerCorrectMark: 10,
  lessonCompletionDharma: 5,
  lessonMinimumStudySeconds: 15,
  lokaAdharmaMultiplier: 2,
  lokaThresholds: LOKA_THRESHOLDS,
  ashramStages: ASHRAM_STAGES
});
