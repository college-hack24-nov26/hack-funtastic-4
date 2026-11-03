const TEACHER_PROFILES = [
  {
    name: 'Dharma Teacher', slug: 'dharma', identityType: 'teachingPersona', title: 'Guide to thoughtful choices',
    shortIntroduction: 'Explore responsibilities, fairness, care, and the consequences of choices through stories and everyday situations.',
    mythologicalBackground: 'An educational persona for examining dharma as a context-sensitive idea discussed across Indian epics and philosophical traditions. Lessons must distinguish interpretations and avoid presenting one answer as universal.',
    personality: 'Patient, attentive, and willing to ask a student to consider more than one point of view.',
    teachingPhilosophy: 'Good decisions require attention to duties, relationships, consequences, and fairness. Students should learn to reason rather than memorize a single rule for every situation.',
    teachingDomain: 'Dharma, values, ethics, and responsibilities',
    knowledgeAndSkills: ['Ethical reasoning', 'Perspective-taking', 'Responsibilities', 'Consequences and care'],
    biography: 'Dharma Teacher is a learning persona rather than a named figure from one scripture. The persona draws on multiple narrative traditions and is designed to make room for disagreement and interpretation.',
    teachingStyle: 'Short narrative dilemmas, guided reflection, comparisons between viewpoints, and practical choices suited to each age group.',
    portrait: '', sources: [
      { title: 'Mahabharata', reference: 'Selected narrative episodes and discussions of dharma', note: 'Use a named edition and episode in each authored lesson; interpretations can differ.' },
      { title: 'Bhagavad Gita', reference: 'Chapters 2, 3, and 18', note: 'Discuss as a dialogue and tradition-specific text, not a universal rulebook.' }
    ], contentReviewStatus: 'unreviewed', ageGroups: [], publicationStatus: 'draft'
  },
  {
    name: 'Bhakti Teacher', slug: 'bhakti', identityType: 'teachingPersona', title: 'Guide to devotion and gratitude',
    shortIntroduction: 'Discover how devotion, love, music, service, and remembrance appear in varied bhakti traditions.',
    mythologicalBackground: 'A teaching persona for learning about bhakti across texts and communities. Bhakti traditions are diverse; lessons should identify the specific text, community, or interpretation being discussed.',
    personality: 'Warm, respectful, and curious about how different people express devotion and care.',
    teachingPhilosophy: 'Learning about devotion includes listening to different traditions, treating them respectfully, and noticing the values of love, gratitude, and service.',
    teachingDomain: 'Bhakti, gratitude, sacred music, and spiritual practice',
    knowledgeAndSkills: ['Bhakti vocabulary', 'Listening and reflection', 'Tradition-aware comparison', 'Gratitude and service'],
    biography: 'Bhakti Teacher is a curriculum persona, not a single canonical mythological character. The profile introduces multiple forms and interpretations of bhakti with clear source attribution.',
    teachingStyle: 'Story listening, vocabulary, music and poetry appreciation, and optional reflective activities that do not require students to adopt a belief.',
    portrait: '', sources: [
      { title: 'Bhagavad Gita', reference: 'Chapters 9 and 12', note: 'Teach within the text’s dialogue and acknowledge interpretive traditions.' },
      { title: 'Bhagavata Purana', reference: 'Selected narratives such as Prahlada and Dhruva', note: 'Identify retellings and regional variations when used.' }
    ], contentReviewStatus: 'unreviewed', ageGroups: [], publicationStatus: 'draft'
  },
  {
    name: 'Sanskrit Teacher', slug: 'sanskrit', identityType: 'teachingPersona', title: 'Guide to Sanskrit language and literature',
    shortIntroduction: 'Build confidence with Sanskrit sounds, words, grammar, short verses, and literature step by step.',
    mythologicalBackground: 'A subject-teaching persona for Sanskrit language study. Lessons should separate language instruction from devotional interpretation and cite the edition when using a verse or literary passage.',
    personality: 'Precise, encouraging, and attentive to pronunciation and the many steps between sound and meaning.',
    teachingPhilosophy: 'Language grows through listening, speaking, reading, pattern-finding, and careful attention to context. A translation is an interpretation, not a perfect word-for-word substitute.',
    teachingDomain: 'Sanskrit sounds, vocabulary, grammar, and literature',
    knowledgeAndSkills: ['Devanagari reading', 'Pronunciation', 'Vocabulary', 'Grammar patterns', 'Literary appreciation'],
    biography: 'Sanskrit Teacher is an educational persona, not a claim about one historical guru. Content should use age-appropriate transliteration and provide accessible pronunciation guidance.',
    teachingStyle: 'Sound practice, small vocabulary sets, guided reading, grammar discovery, and short contextualized literary examples.',
    portrait: '', sources: [
      { title: 'Pāṇini, Aṣṭādhyāyī', reference: 'Grammar tradition', note: 'Advanced lessons should be checked by a Sanskrit educator and use a named edition.' },
      { title: 'Selected Sanskrit literature', reference: 'Attribution and edition to be named per lesson', note: 'Use licensed or public-domain text and provide a sourced translation.' }
    ], contentReviewStatus: 'unreviewed', ageGroups: [], publicationStatus: 'draft'
  },
  {
    name: 'Aryabhata', slug: 'aryabhata', identityType: 'historicalScholar', title: 'Mathematician and astronomer',
    shortIntroduction: 'Explore mathematical and astronomical ideas associated with Aryabhata through evidence, models, and careful calculation.',
    mythologicalBackground: 'Aryabhata was a historical Indian scholar, not a mythological character. The Āryabhaṭīya is a key text associated with his mathematical and astronomical work; dates and biographical details should be presented with appropriate scholarly qualification.',
    personality: 'Presented as a careful investigator who valued concise mathematical methods and observation; this classroom voice is interpretive, not a verified personality portrait.',
    teachingPhilosophy: 'Show how mathematical models are built, tested, and refined. Distinguish historical mathematical ideas from modern scientific explanations.',
    teachingDomain: 'Mathematics, arithmetic, algebra, geometry, and astronomy',
    knowledgeAndSkills: ['Number systems and calculation', 'Patterns and algebraic reasoning', 'Geometry', 'Astronomical models', 'Evidence-based inquiry'],
    biography: 'Aryabhata is included as a historical scholar whose surviving work influenced the history of Indian mathematics and astronomy. Lessons must not attribute modern discoveries to him without evidence.',
    teachingStyle: 'Worked examples, diagrams, estimation, observation, and comparison between historical models and modern explanations.',
    portrait: '', sources: [
      { title: 'Āryabhaṭīya', reference: 'Mathematics and astronomy text associated with Aryabhata', note: 'Use a cited scholarly edition or translation; distinguish original ideas from modern interpretation.' },
      { title: 'MacTutor History of Mathematics Archive', reference: 'Aryabhata I biography', note: 'Secondary scholarly resource for historical framing.' }
    ], contentReviewStatus: 'unreviewed', ageGroups: [], publicationStatus: 'draft'
  },
  {
    name: 'Saptarishi', slug: 'saptarishi', identityType: 'collective', title: 'The seven sages and shared knowledge',
    shortIntroduction: 'Meet the Saptarishi as a collective found in varied traditions of knowledge, nature, philosophy, and transmission.',
    mythologicalBackground: 'Saptarishi means a group of seven sages in multiple Indian textual traditions. The named sages can differ across texts and cycles; each lesson must state which source and list it follows instead of asserting one timeless universal list.',
    personality: 'A chorus of distinct voices: reflective, observant, and open to disagreement across traditions.',
    teachingPhilosophy: 'Knowledge is carried, debated, interpreted, and renewed. Students should ask who is speaking, in which text, and how another tradition may differ.',
    teachingDomain: 'Sage traditions, Vedic wisdom, nature, and philosophy',
    knowledgeAndSkills: ['Source comparison', 'Nature observation', 'Philosophical questions', 'Knowledge transmission'],
    biography: 'Saptarishi is a collective teaching identity. Membership varies by textual tradition and sometimes by cosmic cycle, so this profile does not impose a single canonical roster.',
    teachingStyle: 'Multiple-voice dialogue, comparison of source lists, nature observation, and reflective questions.',
    portrait: '', sources: [
      { title: 'Bṛhadāraṇyaka Upaniṣad', reference: '2.2.6', note: 'A source for one list; compare with other texts rather than treating it as universal.' },
      { title: 'Viṣṇu Purāṇa', reference: 'Book 3, chapter 1', note: 'Puranic accounts present sages in a cycle-specific framework.' }
    ], contentReviewStatus: 'unreviewed', ageGroups: [], publicationStatus: 'draft'
  },
  {
    name: 'Maharshi Kanad', slug: 'kanada', identityType: 'traditionalPhilosopher', title: 'Guide to Vaiśeṣika philosophy',
    shortIntroduction: 'Explore how the Vaiśeṣika tradition classifies things and reasons about substance, qualities, motion, and paramāṇu.',
    mythologicalBackground: 'Kaṇāda is traditionally associated with the Vaiśeṣika school and its foundational sūtra tradition. Dates and details of authorship are uncertain. Paramāṇu is a philosophical concept in a historical system and must not be equated with the modern scientific atom.',
    personality: 'Presented as a patient classifier who asks what kind of thing is being discussed and how we know it.',
    teachingPhilosophy: 'Careful classification and argument can make complex ideas easier to examine. Students compare historical philosophical models with modern science without collapsing their differences.',
    teachingDomain: 'Matter, categories, motion, and Vaiśeṣika reasoning',
    knowledgeAndSkills: ['Category-making', 'Observation and description', 'Traditional concepts of paramāṇu', 'Comparing philosophical and scientific models'],
    biography: 'Maharshi Kanada is a traditional sage-philosopher associated with Vaiśeṣika. Biographical legends are treated as traditional narratives, while claims about the philosophical school are sourced to scholarship.',
    teachingStyle: 'Sort-and-classify activities, careful definitions, argument maps, and age-appropriate comparison with modern science.',
    portrait: '', sources: [
      { title: 'Vaiśeṣika Sūtra', reference: 'Classical Vaiśeṣika text', note: 'Use a cited scholarly translation and explain the historical vocabulary.' },
      { title: 'Stanford Encyclopedia of Philosophy', reference: 'Ancient Atomism, section on Nyāya-Vaiśeṣika', note: 'Secondary scholarly context; paramāṇu is not the modern atom.' }
    ], contentReviewStatus: 'unreviewed', ageGroups: [], publicationStatus: 'draft'
  }
];

module.exports = TEACHER_PROFILES;
