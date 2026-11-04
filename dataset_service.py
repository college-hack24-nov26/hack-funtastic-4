"""Local Indian Mythology dataset service.

Loads data/mythology_dataset.json and provides TF-IDF retrieval plus a small
rule-based quiz builder. No external AI APIs are used anywhere in this module.
"""
import json
import math
import re
import threading
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / 'data' / 'mythology_dataset.json'
DATASET_EXPANSION_PATH = BASE_DIR / 'data' / 'mythology_dataset_expansion.json'

SUPPORTED_AGE_GROUPS = ('6-8', '9-12', '13-15', '16-18', '18+')
SUPPORTED_DIFFICULTIES = ('easy', 'medium', 'hard')
REQUIRED_FIELDS = (
    'id', 'title', 'category', 'topic', 'summary', 'detailed_content',
    'characters', 'keywords', 'questions', 'source_name', 'source_reference',
    'language', 'age_group',
)

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_STOPWORDS = frozenset("""
a an and are as at be by for from has have in is it its of on or that the this to was were what
who why how which when where with will can does did about tell me give explain describe into over
under between during their there these those then than them they he she his her him you your i we
us our not no yes do so if but all any some more most other another each every both few many much
lord shri sri ji qualities quality person figure
""".split())

# Query aliases are normalized to the canonical terms used by dataset records.
# Keeping this separate from document indexing lets short names match without
# making broad, unrelated records look relevant.
QUERY_ALIASES = {
    'ram': 'rama',
    'raghu': 'rama',
    'raghava': 'rama',
    'raghuvir': 'rama',
    'ramachandra': 'rama',
    'ramchandra': 'rama',
    'dwaraka': 'dwarka',
    'gokul': 'gokula',
    'adhyaya': 'chapter',
}

# Small, transparent intent lexicon. These are query expansions, not answers:
# they help a lexical index connect natural questions with structured records.
# The original query terms remain in the query so unrelated questions still
# have to clear the overlap and cosine relevance checks.
QUERY_EXPANSIONS = {
    'chariot': ('charioteer', 'krishna', 'arjuna'),
    'charioteer': ('chariot', 'krishna', 'arjuna'),
    'sitting': ('chariot', 'charioteer'),
    'birth': ('born', 'birthplace'),
    'born': ('birth', 'birthplace'),
    'birthplace': ('birth', 'born'),
    'childhood': ('child', 'gokula', 'vrindavan'),
    'child': ('childhood', 'gokula', 'vrindavan'),
    'parents': ('parent', 'mother', 'father'),
    'parent': ('parents', 'mother', 'father'),
    'father': ('parent', 'parents'),
    'mother': ('parent', 'parents'),
    'teacher': ('guru', 'taught', 'archery', 'drona'),
    'guru': ('teacher', 'taught'),
    'archery': ('teacher', 'drona'),
    'taught': ('teacher', 'guru'),
    'killed': ('death', 'slayer'),
    'killing': ('death', 'slayer'),
    'bridge': ('setu', 'causeway', 'nala', 'nila'),
    'causeway': ('bridge', 'setu'),
    'refused': ('despair', 'crisis', 'vishada'),
    'hesitate': ('despair', 'crisis', 'vishada'),
    'hesitated': ('despair', 'crisis', 'vishada'),
    'teachings': ('teaching', 'philosophy', 'yoga'),
    'teaches': ('teaching', 'philosophy', 'yoga'),
    'relationship': ('friend', 'cousin', 'charioteer'),
    'fought': ('war', 'battle', 'battlefield', 'kurukshetra'),
    'fight': ('war', 'battle', 'battlefield'),
    'live': ('lived', 'reside', 'dwarka', 'gokula', 'mathura', 'vrindavan'),
    'lived': ('live', 'reside', 'dwarka', 'gokula', 'mathura', 'vrindavan'),
    'wrote': ('write', 'writer', 'author', 'composer', 'authorship'),
    'written': ('write', 'writer', 'author', 'composer', 'authorship'),
    'author': ('wrote', 'writer', 'composer', 'authorship'),
    'composer': ('wrote', 'writer', 'author', 'authorship'),
}


class DatasetError(RuntimeError):
    """Raised when the dataset file is missing or structurally invalid."""


class DatasetRecord:
    __slots__ = ('raw', 'id', 'title', 'category', 'topic', 'summary',
                 'detailed_content', 'characters', 'keywords', 'questions',
                 'source_name', 'source_reference', 'language', 'age_group')

    def __init__(self, raw):
        self.raw = raw
        self.id = raw['id']
        self.title = raw['title']
        self.category = raw['category']
        self.topic = raw['topic']
        self.summary = raw['summary']
        self.detailed_content = raw['detailed_content']
        self.characters = raw['characters']
        self.keywords = raw['keywords']
        self.questions = raw['questions']
        self.source_name = raw['source_name']
        self.source_reference = raw['source_reference']
        self.language = raw['language']
        self.age_group = raw['age_group']


def tokenize(text):
    return _TOKEN_RE.findall((text or '').lower())


def query_tokens(text):
    """Tokenize a query and normalize recognized names to dataset terms."""
    base = [QUERY_ALIASES.get(token, token) for token in tokenize(text)]
    expanded = list(base)
    for token in base:
        expanded.extend(QUERY_EXPANSIONS.get(token, ()))
    # Preserve term frequency for the original query, but avoid making an
    # expansion dominate ranking merely because several rules mention it.
    return list(dict.fromkeys(expanded))


# Public alias used by app.py's judge and retrieval helpers.
STOPWORDS = _STOPWORDS


def content_tokens(record):
    parts = [
        record.title, record.title,   # title weighted x2
        record.topic, record.topic,
        record.category,
        record.summary,
        record.detailed_content,
        ' '.join(record.keywords),
        ' '.join(record.characters),
    ]
    structured_fields = (
        'relationships', 'locations', 'main_teachings',
        'important_conversations', 'practical_examples', 'related_chapters',
        'verse_references', 'entity_aliases', 'sanskrit_name', 'english_meaning',
        'sanskrit_text', 'transliteration', 'plain_english_meaning',
    )
    for field in structured_fields:
        value = record.raw.get(field, [])
        if isinstance(value, list):
            parts.append(' '.join(str(item) for item in value))
        elif value:
            parts.append(str(value))
    return tokenize(' '.join(parts))


class Dataset:
    def __init__(self, records):
        valid = []
        self.invalid_records = []
        for raw in records:
            missing = [field for field in REQUIRED_FIELDS if field not in raw]
            if missing or not isinstance(raw.get('age_group'), list) or not raw.get('id'):
                self.invalid_records.append({'id': raw.get('id', '<missing>'), 'missing': missing})
                continue
            valid.append(DatasetRecord(raw))
        self.records = valid
        self._build_index()

    # ---------- loading ----------
    @classmethod
    def load(cls, path=DATASET_PATH):
        paths = [Path(path)]
        # Keep the original file stable while allowing the knowledge base to
        # grow in curated domain packs. Explicitly loading another file (as in
        # tests for malformed input) still loads only that file.
        if paths[0].resolve() == DATASET_PATH.resolve() and DATASET_EXPANSION_PATH.exists():
            paths.append(DATASET_EXPANSION_PATH)
        records = []
        for dataset_path in paths:
            try:
                with open(dataset_path, encoding='utf-8') as handle:
                    data = json.load(handle)
            except FileNotFoundError as error:
                raise DatasetError(f'Dataset file not found: {dataset_path}') from error
            except json.JSONDecodeError as error:
                raise DatasetError(f'Dataset file is not valid JSON: {error}') from error
            if not isinstance(data, list):
                raise DatasetError(f'Dataset root must be a JSON array of records: {dataset_path}')
            records.extend(data)
        return cls(records)

    # ---------- TF-IDF index ----------
    def _build_index(self):
        doc_tokens = [content_tokens(record) for record in self.records]
        self.doc_lengths = [len(tokens) or 1 for tokens in doc_tokens]
        df = {}
        for tokens in doc_tokens:
            for term in set(tokens):
                df[term] = df.get(term, 0) + 1
        total = len(self.records) or 1
        self.idf = {term: math.log((total + 1) / (count + 1)) + 1.0 for term, count in df.items()}
        self.tfidf = []
        for tokens, length in zip(doc_tokens, self.doc_lengths):
            tf = {}
            for term in tokens:
                tf[term] = tf.get(term, 0) + 1
            weights = {term: (count / length) * self.idf.get(term, 0.0) for term, count in tf.items()}
            self.tfidf.append(weights)

    def _query_vector(self, query):
        tokens = [t for t in query_tokens(query) if t not in _STOPWORDS]
        if not tokens:
            tokens = query_tokens(query)
        tf = {}
        for term in tokens:
            tf[term] = tf.get(term, 0) + 1
        length = len(tokens) or 1
        return {term: (count / length) * self.idf.get(term, 0.0) for term, count in tf.items()}

    @staticmethod
    def _cosine(a, b):
        if not a or not b:
            return 0.0
        dot = sum(weight * b.get(term, 0.0) for term, weight in a.items())
        norm_a = math.sqrt(sum(w * w for w in a.values()))
        norm_b = math.sqrt(sum(w * w for w in b.values()))
        if not norm_a or not norm_b:
            return 0.0
        return dot / (norm_a * norm_b)

    # ---------- retrieval ----------
    def search(self, query, age_group=None, limit=5, min_score=0.08):
        """Return relevant records above a relevance floor.

        A record must share at least TWO meaningful (non-stopword) query terms
        AND clear a cosine floor of 0.08. A single shared word is not reliable
        evidence of relevance: an unrelated query such as 'income tax return'
        shares only the generic word 'return' with the Diwali record (Rama's
        return to Ayodhya) and must not surface it.
        """
        query_vector = self._query_vector(query)
        expanded_query_tokens = query_tokens(query)
        meaningful_query_terms = set(t for t in expanded_query_tokens if t not in _STOPWORDS)
        original_query_terms = set(t for t in tokenize(query) if t not in _STOPWORDS)
        scored = []
        for index, record in enumerate(self.records):
            if age_group and age_group in SUPPORTED_AGE_GROUPS and age_group not in record.age_group:
                continue
            document_terms = set(self.tfidf[index])
            overlap = meaningful_query_terms & document_terms
            if len(meaningful_query_terms) >= 2 and len(overlap) < 2:
                continue
            if len(meaningful_query_terms) == 1 and not overlap.intersection(
                set(query_tokens(' '.join((record.title, record.topic, ' '.join(record.keywords), ' '.join(record.characters)))))
            ):
                continue
            score = self._cosine(query_vector, self.tfidf[index])
            title_terms = set(query_tokens(record.title))
            topic_terms = set(query_tokens(record.topic))
            score += min(0.20, 0.10 * len(meaningful_query_terms & title_terms))
            score += min(0.06, 0.03 * len(meaningful_query_terms & topic_terms))
            question_terms = set()
            normalized_question = set()
            for question in record.questions:
                question_terms.update(query_tokens(question))
                normalized_question.update(t for t in tokenize(question) if t not in _STOPWORDS)
            if original_query_terms and original_query_terms.issubset(question_terms):
                score += 0.16
            # Prefer a record whose curated question expresses the same intent
            # as the user's wording. This is still lexical/transparent, but it
            # prevents a broad entity record from outranking a direct answer.
            if original_query_terms and original_query_terms.issubset(normalized_question):
                score += 0.30
            structured_terms = set()
            for field in ('relationships', 'locations', 'main_teachings', 'verse_references', 'keywords', 'characters'):
                value = record.raw.get(field, [])
                if isinstance(value, list):
                    structured_terms.update(query_tokens(' '.join(str(item) for item in value)))
            score += min(0.12, 0.04 * len(meaningful_query_terms & structured_terms))
            if score >= min_score:
                scored.append((score, record))
        scored.sort(key=lambda item: item[0], reverse=True)
        return scored[:limit]

    def by_id(self, record_id):
        for record in self.records:
            if record.id == record_id:
                return record
        return None

    def by_category(self, category, age_group=None, limit=10):
        results = []
        for record in self.records:
            if record.category.lower() != (category or '').lower():
                continue
            if age_group and age_group in SUPPORTED_AGE_GROUPS and age_group not in record.age_group:
                continue
            results.append(record)
        return results[:limit]

    def all_categories(self):
        return sorted({record.category for record in self.records})

    def validation_report(self):
        """Return non-mutating quality checks for the loaded knowledge base."""
        ids = [record.id for record in self.records]
        missing_sources = [record.id for record in self.records
                           if not record.source_name or not record.source_reference]
        return {
            'record_count': len(self.records),
            'valid_count': len(self.records),
            'invalid_records': list(self.invalid_records),
            'duplicate_ids': sorted({record_id for record_id in ids if ids.count(record_id) > 1}),
            'missing_sources': missing_sources,
            'categories': self.all_categories(),
        }

    # ---------- quiz building ----------
    def build_quiz(self, student_id, age_group=None, count=5, exclude_ids=None, difficulty=None):
        """Build a multiple-choice quiz from dataset 'questions'.

        Distractors are real quiz questions from other records in the same or
        any category — no fabricated answers.
        """
        exclude_ids = set(exclude_ids or [])
        pool = [record for record in self.records
                if record.questions and record.id not in exclude_ids
                and (not age_group or age_group not in SUPPORTED_AGE_GROUPS
                     or age_group in record.age_group)
                and (not difficulty or infer_record_difficulty(record) == difficulty)]
        # Prefer questions the student has not seen well: simple round-robin over categories
        pool.sort(key=lambda record: record.id)
        picked = []
        seen_categories = {}
        for record in pool:
            picked.append(record)
            seen_categories[record.category] = seen_categories.get(record.category, 0) + 1
            if len(picked) >= count:
                break
        if not picked:
            return []
        all_questions = [question for record in pool for question in record.questions]
        quiz = []
        for record in picked:
            correct = record.questions[0]
            distractors = [question for question in all_questions if question != correct]
            step = max(1, len(distractors) // 3)
            options = [distractors[i] for i in range(0, len(distractors), step)][:3]
            options.append(correct)
            # stable pseudo-shuffle so the correct answer is not always last
            position = len(quiz) % (len(options))
            options.insert(0, options.pop(position))
            quiz.append({
                'record_id': record.id,
                'title': record.title,
                'category': record.category,
                'question': correct,
                'options': options,
                'answer': correct,
                'difficulty': infer_record_difficulty(record),
            })
        return quiz


def infer_record_difficulty(record):
    """Infer a transparent quiz difficulty when a record has no explicit level."""
    explicit = record.raw.get('difficulty')
    if explicit in SUPPORTED_DIFFICULTIES:
        return explicit
    if record.raw.get('sanskrit_text') or record.raw.get('verse_references'):
        return 'hard'
    if record.raw.get('chapter_number'):
        return 'medium' if record.raw['chapter_number'] <= 6 else 'hard'
    if len(record.detailed_content) > 720 or len(record.questions) >= 4:
        return 'hard'
    if '6-8' in record.age_group and len(record.detailed_content) < 500:
        return 'easy'
    return 'medium'


_dataset_lock = threading.Lock()
_dataset_instance = None


def get_dataset():
    """Process-wide cached dataset, loaded once and reloaded only on demand."""
    global _dataset_instance
    if _dataset_instance is None:
        with _dataset_lock:
            if _dataset_instance is None:
                _dataset_instance = Dataset.load()
    return _dataset_instance


def reload_dataset():
    global _dataset_instance
    with _dataset_lock:
        _dataset_instance = Dataset.load()
    return _dataset_instance
