import json
import logging
import math
import os
import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import dataset_service
from dataset_service import DatasetError, get_dataset, reload_dataset
from learning_intelligence import analyze_learning, canonical_topic, determine_adaptive_difficulty

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / 'mythoverse.db'
logger = logging.getLogger(__name__)


def load_environment(env_path=None):
    dotenv_path = env_path or BASE_DIR / '.env'
    load_dotenv(dotenv_path=dotenv_path, override=False)


load_environment()

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'mythoverse-dev-secret')
app.config['DATABASE'] = os.environ.get('DATABASE_PATH', str(DB_PATH))

AGE_GROUPS = {
    '6-8': 'simple and story-led',
    '9-12': 'clear and practical',
    '13-15': 'thoughtful and reflective',
    '16-18': 'philosophical and analytical',
    '18+': 'deep and nuanced',
}

JUDGE_CRITERIA = ('relevance', 'reasoning', 'evidence', 'clarity', 'rebuttal', 'respect')

SQL_SCHEMA = """
CREATE TABLE IF NOT EXISTS content_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    url TEXT,
    language TEXT DEFAULT 'en',
    UNIQUE(title, category)
);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    title TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT DEFAULT '{}',
    FOREIGN KEY(conversation_id) REFERENCES ai_conversations(id)
);

CREATE TABLE IF NOT EXISTS learning_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    focus_area TEXT,
    score REAL,
    status TEXT,
    activity_type TEXT,
    chapter_name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS learning_question_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    learning_record_id INTEGER NOT NULL REFERENCES learning_records(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    record_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    title TEXT NOT NULL,
    question TEXT NOT NULL,
    given_answer TEXT,
    correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
    difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    age_group TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_learning_question_student
ON learning_question_results(student_id, created_at);

CREATE INDEX IF NOT EXISTS idx_learning_question_topic
ON learning_question_results(student_id, topic, created_at);

CREATE TABLE IF NOT EXISTS debates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    mode TEXT NOT NULL,
    created_by TEXT NOT NULL,
    age_group TEXT,
    difficulty TEXT NOT NULL DEFAULT 'beginner',
    status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    winner TEXT,
    current_round INTEGER NOT NULL DEFAULT 1,
    final_feedback TEXT,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS debate_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debate_id INTEGER NOT NULL,
    student_id TEXT NOT NULL,
    role TEXT NOT NULL,
    position TEXT,
    ready INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debate_arguments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debate_id INTEGER NOT NULL,
    speaker TEXT NOT NULL,
    argument TEXT NOT NULL,
    round_number INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debate_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debate_id INTEGER NOT NULL,
    student_id TEXT NOT NULL,
    relevance REAL,
    reasoning REAL,
    clarity REAL,
    evidence REAL,
    respect REAL,
    total REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debate_rounds (
    debate_id INTEGER NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL CHECK (round_number BETWEEN 1 AND 3),
    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('waiting_ready', 'active', 'awaiting_opponent', 'awaiting_judge', 'judging', 'generating_ai', 'completed', 'not_started')),
    started_at TEXT,
    completed_at TEXT,
    judge_summary TEXT,
    PRIMARY KEY (debate_id, round_number)
);

CREATE TABLE IF NOT EXISTS debate_round_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debate_id INTEGER NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL CHECK (round_number BETWEEN 1 AND 3),
    participant_id INTEGER NOT NULL REFERENCES debate_participants(id),
    argument TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (debate_id, round_number, participant_id),
    FOREIGN KEY (debate_id, round_number) REFERENCES debate_rounds(debate_id, round_number)
);

CREATE TABLE IF NOT EXISTS debate_round_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debate_id INTEGER NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL CHECK (round_number BETWEEN 1 AND 3),
    participant_id INTEGER NOT NULL REFERENCES debate_participants(id),
    relevance REAL NOT NULL CHECK (relevance BETWEEN 0 AND 10),
    reasoning REAL NOT NULL CHECK (reasoning BETWEEN 0 AND 10),
    evidence REAL NOT NULL CHECK (evidence BETWEEN 0 AND 10),
    clarity REAL NOT NULL CHECK (clarity BETWEEN 0 AND 10),
    rebuttal REAL NOT NULL CHECK (rebuttal BETWEEN 0 AND 10),
    respect REAL NOT NULL CHECK (respect BETWEEN 0 AND 10),
    total REAL NOT NULL CHECK (total BETWEEN 0 AND 10),
    explanation TEXT NOT NULL,
    strengths TEXT NOT NULL DEFAULT '[]',
    improvements TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (debate_id, round_number, participant_id),
    FOREIGN KEY (debate_id, round_number) REFERENCES debate_rounds(debate_id, round_number)
);

CREATE TABLE IF NOT EXISTS dharma_reward_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debate_id INTEGER NOT NULL UNIQUE REFERENCES debates(id),
    student_id TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 5 CHECK (points = 5),
    status TEXT NOT NULL DEFAULT 'pending_integration'
        CHECK (status IN ('pending_integration', 'credited')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    credited_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_round_submissions_debate_round
    ON debate_round_submissions(debate_id, round_number);

CREATE INDEX IF NOT EXISTS idx_round_scores_debate_round
    ON debate_round_scores(debate_id, round_number);

CREATE TRIGGER IF NOT EXISTS validate_debate_participant_parent
BEFORE INSERT ON debate_participants
WHEN NOT EXISTS (SELECT 1 FROM debates WHERE id = NEW.debate_id)
BEGIN
    SELECT RAISE(ABORT, 'debate does not exist');
END;

CREATE TRIGGER IF NOT EXISTS validate_debate_argument_parent
BEFORE INSERT ON debate_arguments
WHEN NOT EXISTS (SELECT 1 FROM debates WHERE id = NEW.debate_id)
BEGIN
    SELECT RAISE(ABORT, 'debate does not exist');
END;

CREATE TRIGGER IF NOT EXISTS validate_debate_score_participant
BEFORE INSERT ON debate_scores
WHEN NOT EXISTS (
    SELECT 1 FROM debate_participants
    WHERE debate_id = NEW.debate_id AND student_id = NEW.student_id
)
BEGIN
    SELECT RAISE(ABORT, 'debate participant does not exist');
END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_debate_participant_identity
ON debate_participants(debate_id, student_id);
"""


@contextmanager
def get_db_connection():
    connection = sqlite3.connect(app.config.get('DATABASE', DB_PATH))
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys = ON')
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db():
    with get_db_connection() as connection:
        connection.executescript(SQL_SCHEMA)
        migrate_debate_schema(connection)
        seed_content_catalog(connection)
        seed_debate_rounds(connection)
        connection.commit()


def migrate_debate_schema(connection):
    columns = {
        'debates': {
            'current_round': 'INTEGER NOT NULL DEFAULT 1',
            'final_feedback': 'TEXT',
            'completed_at': 'TEXT',
            'difficulty': "TEXT NOT NULL DEFAULT 'beginner'",
        },
        'debate_participants': {
            'ready': 'INTEGER NOT NULL DEFAULT 0',
        },
    }
    for table, additions in columns.items():
        existing = {row['name'] for row in connection.execute(f'PRAGMA table_info({table})')}
        for column, definition in additions.items():
            if column not in existing:
                connection.execute(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')


def seed_debate_rounds(connection):
    debates = connection.execute('SELECT id, status FROM debates').fetchall()
    for debate in debates:
        for round_number in range(1, 4):
            if round_number == 1:
                status = 'active' if debate['status'] == 'in_progress' else 'waiting_ready'
            else:
                status = 'not_started'
            connection.execute(
                'INSERT OR IGNORE INTO debate_rounds (debate_id, round_number, status) VALUES (?, ?, ?)',
                (debate['id'], round_number, status),
            )
        if debate['status'] == 'in_progress':
            connection.execute(
                'UPDATE debate_participants SET ready = 1 WHERE debate_id = ?',
                (debate['id'],),
            )


def seed_content_catalog(connection):
    rows = [
        ('Ramayana', 'stories', 'The epic journey of Rama, Sita, Lakshmana, and Hanuman.', '/stories/ramayana'),
        ('Mahabharata', 'stories', 'The great epic of the Kurukshetra war and the Pandavas and Kauravas.', '/stories/mahabharata'),
        ('Bhagavad Gita', 'philosophy', 'A foundational teaching on duty, wisdom, and action.', '/learning/gita'),
        ('Lord Krishna', 'characters', 'A guide, teacher, warrior, and embodiment of wisdom.', '/characters/krishna'),
        ('Lord Rama', 'characters', 'The righteous king, protector, and ideal of dharma.', '/characters/rama'),
        ('Hanuman', 'characters', 'Devotion, courage, and service in action.', '/characters/hanuman'),
        ('Dharma and Karma', 'concepts', 'How actions, duty, and moral choices shape life and learning.', '/concepts/dharma-karma'),
        ('Sanskrit word of the day', 'language', 'A daily Sanskrit term with meaning and context.', '/language/sanskrit'),
        ('Ancient Indian astronomy', 'science', 'Observing, measuring, and understanding the sky in traditional knowledge systems.', '/science/astronomy'),
        ('Ancient Indian mathematics', 'science', 'The brilliance of zero, geometry, and numerical systems.', '/science/mathematics'),
        ('The Four Purusharthas', 'philosophy', 'Dharma, artha, kama, and moksha as life goals.', '/concepts/purusharthas'),
        ('Ganesha', 'characters', 'The remover of obstacles and a symbol of wisdom and beginnings.', '/characters/ganesha'),
    ]
    existing = connection.execute('SELECT title, category FROM content_catalog').fetchall()
    existing_keys = {(row['title'], row['category']) for row in existing}
    for title, category, description, url in rows:
        if (title, category) not in existing_keys:
            connection.execute(
                'INSERT INTO content_catalog (title, category, description, url) VALUES (?, ?, ?, ?)',
                (title, category, description, url),
            )


def safe_age_group(value):
    if value in AGE_GROUPS:
        return value
    return '13-15'


def canonical_debate_topic(topic):
    """Return a canonical form of a debate topic for duplicate detection.

    Case, punctuation, quotes, and extra whitespace are normalised so that
    "Was Karna  treated fairly?" and "was karna treated fairly" collapse to
    the same identity while genuinely different questions stay distinct.
    """
    normalized = ' '.join((topic or '').lower().split())
    normalized = re.sub(r"[\s'\"\u2018\u2019\u201c\u201d!.,;:\-\u2014\u2013?]+$", '', normalized)
    normalized = re.sub(r"^[\s'\"\u2018\u2019\u201c\u201d]+", '', normalized)
    normalized = normalized.strip()
    return normalized


class AIProviderError(RuntimeError):
    def __init__(self, message, status_code=502, category='provider_error'):
        super().__init__(message)
        self.status_code = status_code
        self.category = category


class DebateProvider:
    """Small provider boundary shared by practice and optional LLM modes."""

    name = 'unknown'

    def generate_opponent_argument(self, debate, position, round_number, student_argument, history):
        raise NotImplementedError

    def qualitative_judgement(self, topic, arguments, history, age_group):
        return None

    def classify_relevance(self, topic, argument, history=None):
        return None


class DatasetPracticeProvider(DebateProvider):
    name = 'dataset_practice'

    def generate_opponent_argument(self, debate, position, round_number, student_argument, history):
        return generate_debate_opponent_argument(debate, position, round_number, student_argument, history)


class OpenAICompatibleDebateProvider(DebateProvider):
    """Optional provider for OpenAI-compatible chat-completions endpoints.

    It is intentionally dependency-free and inactive unless DEBATE_PROVIDER=llm
    and DEBATE_LLM_ENDPOINT are configured. Keys remain server-side.
    """

    name = 'llm'

    def __init__(self):
        self.endpoint = (os.environ.get('DEBATE_LLM_ENDPOINT') or '').strip()
        self.api_key = (os.environ.get('DEBATE_LLM_API_KEY') or '').strip()
        self.model = (os.environ.get('DEBATE_LLM_MODEL') or '').strip()
        if not self.endpoint or not self.model:
            raise AIProviderError(
                'AI debate provider is not configured. Please configure an AI provider to start an AI debate.',
                503, 'provider_not_configured')

    def _complete(self, system, user):
        payload = json.dumps({
            'model': self.model,
            'temperature': 0.35,
            'messages': [
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': user},
            ],
        }).encode('utf-8')
        headers = {'Content-Type': 'application/json'}
        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'
        try:
            request = Request(self.endpoint, data=payload, headers=headers, method='POST')
            with urlopen(request, timeout=30) as response:
                body = json.loads(response.read().decode('utf-8'))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as error:
            logger.warning('Configured debate provider failed: %s', error)
            raise AIProviderError('The configured AI debate provider could not respond. Please retry.', 502, 'provider_error') from error
        try:
            content = body['choices'][0]['message']['content']
        except (KeyError, IndexError, TypeError) as error:
            raise AIProviderError('The configured AI debate provider returned an invalid response.', 502, 'invalid_provider_response') from error
        if not isinstance(content, str) or not content.strip() or len(content.strip()) > 6000:
            raise AIProviderError('The configured AI debate provider returned unusable debate text.', 502, 'invalid_provider_response')
        return content.strip()

    def generate_opponent_argument(self, debate, position, round_number, student_argument, history):
        evidence = debate_evidence(debate['topic'], student_argument, history)
        side = 'FOR' if position == 'for' else 'AGAINST'
        transcript = '\n'.join(
            f"{item.get('sender', 'participant')}: {item.get('text', '')}"
            for item in (history or [])
        ) or '(no earlier accepted arguments)'
        return self._complete(
            'You are a respectful Indian mythology debate opponent. Defend only your assigned side. '
            'Use the supplied evidence, distinguish tradition from interpretation, never invent quotations, '
            'and directly address the latest argument. Return only the response to the student.',
            f"Proposition: {debate['topic']}\nAssigned side: {side}\nRound: {round_number}\n"
            f"Previous accepted transcript:\n{transcript}\nLatest student argument:\n{student_argument}\n"
            f"Retrieved evidence:\n{evidence}\nAcknowledge the point, present a clear counterargument, and end with a challenge question.",
        )

    def classify_relevance(self, topic, argument, history=None):
        """Ask the configured provider for a relevance classification only.

        The provider is not allowed to save, score, or advance a debate.  A
        malformed response is treated as a provider failure rather than as an
        approval, so an LLM cannot accidentally consume a round.
        """
        raw = self._complete(
            'You classify debate argument relevance. Return JSON only, with exactly '
            'these keys: relevant (boolean), confidence (number from 0 to 1), '
            'reason (short string). Mark an argument relevant only when it directly '
            'addresses the proposition or responds to accepted debate context. Do '
            'not use mythology vocabulary alone as evidence of relevance.',
            f'Proposition: {topic}\nArgument: {argument}\n'
            f'Accepted context: {json.dumps(history or [])}',
        )
        try:
            result = json.loads(raw)
        except json.JSONDecodeError as error:
            raise AIProviderError(
                'The configured AI debate provider returned an invalid relevance classification.',
                502, 'invalid_provider_response') from error
        if not isinstance(result, dict) or not isinstance(result.get('relevant'), bool):
            raise AIProviderError(
                'The configured AI debate provider returned an invalid relevance classification.',
                502, 'invalid_provider_response')
        try:
            confidence = float(result.get('confidence', 0.0))
        except (TypeError, ValueError):
            raise AIProviderError(
                'The configured AI debate provider returned an invalid relevance classification.',
                502, 'invalid_provider_response')
        return {
            'relevant': result['relevant'],
            'confidence': max(0.0, min(1.0, confidence)),
            'reason': str(result.get('reason') or '').strip()[:500],
        }

    def qualitative_judgement(self, topic, arguments, history, age_group):
        return self._complete(
            'You are a debate feedback assistant. Do not assign numerical scores or declare a winner. '
            'Give concise, balanced qualitative feedback based only on the supplied arguments and evidence.',
            f"Topic: {topic}\nAge group: {age_group}\nArguments:\n{json.dumps(arguments)}\n"
            f"Earlier context:\n{json.dumps(history or [])}\nIdentify the strongest point from each side, unsupported claims, unanswered challenges, and two improvements.",
        )


def get_debate_provider(mode):
    if mode == 'student-vs-ai':
        return DatasetPracticeProvider()
    if mode == 'student-vs-llm':
        if (os.environ.get('DEBATE_PROVIDER') or '').strip().lower() != 'llm':
            raise AIProviderError(
                'AI debate provider is not configured. Please configure an AI provider to start an AI debate.',
                503, 'provider_not_configured')
        return OpenAICompatibleDebateProvider()
    return None


def append_optional_llm_feedback(judgement, debate, judge_arguments, prior_arguments):
    """Add qualitative LLM feedback without replacing deterministic scores."""
    if debate['mode'] != 'student-vs-llm':
        return judgement
    try:
        provider = get_debate_provider(debate['mode'])
        feedback = provider.qualitative_judgement(
            debate['topic'], judge_arguments, prior_arguments, debate['age_group'])
    except AIProviderError as error:
        logger.warning('Optional LLM qualitative judge unavailable: %s', error)
        return judgement
    if feedback:
        judgement['summary'] = f"{judgement['summary']} Qualitative feedback: {feedback}"
    return judgement


def debate_evidence(topic, argument='', history=None):
    """Return only closely retrieved, source-labelled evidence for a debate."""
    try:
        dataset = get_dataset()
    except DatasetError:
        return 'No sufficiently relevant supporting material was found in the current MythoVerse knowledge base.'
    query = ' '.join(filter(None, (topic, argument)))
    matches = dataset.search(query, limit=3)
    if not matches:
        return 'I could not find sufficiently relevant supporting material in the current MythoVerse knowledge base.'
    return '\n'.join(
        f'- {record.summary} (Source: {record.source_name}; Reference: {record.source_reference})'
        for _, record in matches
    )


# Tokens that mark everyday, non-debate self-referential or small-talk
# sentences. They are rejected before any overlap scoring so a sentence such
# as "My name is Sahil" can never pass by sharing a generic word with a topic.
_DEBATE_NON_ARGUMENT_MARKERS = (
    'my name', 'i am', "i'm", 'i was', 'i like', 'i love', 'i study', 'i am studying',
    'we are here', 'we are solving', 'our project', 'our team', 'our hackathon',
    'hackathon', 'today is', 'good morning', 'good evening', 'hello', 'hi ',
    'nice day', 'beautiful day', 'nice weather', 'how are you', 'thank you',
    'please ', 'sorry ', 'excuse me', 'let me introduce', 'nice to meet',
)

# Claim/stance vocabulary: words that signal the sentence actually asserts,
# supports, or challenges something rather than merely narrating a fact.
_DEBATE_CLAIM_MARKERS = (
    'because', 'therefore', 'thus', 'hence', 'however', 'but', 'although',
    'since', 'should', 'should not', 'must', 'must not', 'cannot', 'can',
    'depends', 'dependent', 'independent', 'always', 'never', 'right', 'wrong',
    'better', 'worse', 'stronger', 'weaker', 'agree', 'disagree', 'argue',
    'claim', 'contend', 'believe', 'shows', 'show', 'proves', 'prove',
    'explains', 'explain', 'teaches', 'teach', 'suggests', 'suggest', 'implies',
    'justifies', 'justifies that', 'justified', 'unjust', 'matters', 'counts',
    'true', 'false', 'valid', 'invalid', 'contrary', 'instead', 'rather',
    'supports', 'support', 'challenges', 'challenge', 'refutes', 'refute',
    'more important', 'less important', 'greater', 'superior', 'inferior',
)

DEBATE_TOPIC_CONCEPTS = {
    'dharma': {
        'dharma', 'duty', 'duties', 'obligation', 'obligations', 'responsibility',
        'moral', 'morality', 'principle', 'principles', 'right', 'wrong',
        'justice', 'ethics', 'ethical', 'circumstance', 'circumstances',
        'situation', 'situations', 'context', 'contexts', 'conditions',
        'universal', 'depends', 'dependent', 'change', 'changes', 'changing',
        'personal', 'relationship', 'relationships', 'family', 'kin',
        'righteousness', 'righteous', 'virtue', 'virtuous', 'conduct',
        'conditional', 'unconditional', 'absolute', 'relative', 'unchanging',
        'eternal', 'situational', 'situations change', 'circumstances change',
        'action', 'actions', 'act', 'applies', 'apply', 'application',
    },
    'arjuna': {
        'arjuna', 'hesitation', 'hesitate', 'dilemma', 'compassion', 'duty',
        'war', 'battle', 'fight', 'fighting', 'relatives', 'teachers', 'krishna',
        'gita', 'kurukshetra', 'justice', 'action', 'inaction',
    },
    'karna': {
        'karna', 'fair', 'fairness', 'fairly', 'justice', 'birth', 'loyalty',
        'loyal', 'exclusion', 'excluded', 'choice', 'warrior', 'honour', 'honor',
        'duryodhana', 'pandava', 'pandavas', 'kaurava', 'kauravas',
    },
    'forgiveness': {
        'forgive', 'forgiveness', 'forgiving', 'revenge', 'revengeful', 'anger',
        'mercy', 'compassion', 'retaliation', 'punishment', 'strength',
    },
    'devotion': {
        'devotion', 'devoted', 'bhakti', 'knowledge', 'jnana', 'wisdom', 'study',
        'learning', 'faith', 'love', 'practice', 'yoga',
    },
    'relationship': {
        'duty', 'relationship', 'relationships', 'family', 'personal', 'kin',
        'obligation', 'obligations', 'responsibility', 'dharma', 'choice',
    },
}


def _debate_relevance_terms(topic, dataset):
    """Build a small topic profile without treating all mythology terms alike."""
    topic_tokens = set(dataset_service.query_tokens(topic)) - dataset_service.STOPWORDS
    lowered_topic = set(dataset_service.tokenize(topic))
    profile = set(topic_tokens)
    for concept, terms in DEBATE_TOPIC_CONCEPTS.items():
        if concept in lowered_topic or topic_tokens.intersection(terms):
            profile.update(terms)
    # Only the entities of records that closely match the topic itself join the
    # profile, and only when the retrieval score is genuinely high.  This keeps
    # a topic about Dharma from accepting an arbitrary mythology statement:
    # a random Krishna story shares an entity name but not the proposition.
    for score, record in dataset.search(topic, limit=2, min_score=0.35):
        profile.update(dataset_service.query_tokens(' '.join(record.characters)))
        profile.update(dataset_service.query_tokens(' '.join(record.keywords)))
    return profile


def _core_topic_subject(topic):
    """Return the proposition's subject terms: what the argument must address.

    A meaningful argument has to speak about the subject of the proposition
    (for example 'dharma' and 'circumstances'), not merely share a mythology
    entity name with it.
    """
    tokens = set(dataset_service.tokenize(topic)) - dataset_service.STOPWORDS
    # Question framing words are not part of the proposition itself.
    return tokens - {'always', 'right', 'was', 'were', 'should', 'can', 'could', 'does', 'did', 'more', 'important'}


def validate_debate_topic_relevance(topic, argument, history=None, provider=None):
    """Return a conservative relevance decision before any DB mutation.

    Dataset Practice uses a local topic/concept/context classifier.  LLM mode
    may use a configured provider classifier, but local validation remains the
    fallback and provider failures are surfaced to the caller.
    """
    text = (argument or '').strip()
    if provider is not None and provider.name == 'llm':
        classification = provider.classify_relevance(topic, text, history)
        if classification and classification.get('confidence', 0.0) >= 0.60:
            return {'accepted': bool(classification['relevant']), 'method': 'llm', **classification}
        if classification and not classification.get('relevant'):
            return {'accepted': False, 'method': 'llm', **classification}

    try:
        dataset = get_dataset()
        lowered = ' ' + ' '.join(dataset_service.tokenize(text)) + ' '
        # Self-introductions, small talk, and hackathon chatter are never debate
        # arguments, whatever words they happen to contain.
        for marker in _DEBATE_NON_ARGUMENT_MARKERS:
            if marker in lowered:
                return {
                    'accepted': False,
                    'method': 'local_topic_classifier',
                    'confidence': 0.9,
                    'topic_overlap': [], 'concept_overlap': [], 'context_overlap': [],
                    'reason': 'The statement reads as personal or conversational text, not a debate argument.',
                }
        argument_terms = set(dataset_service.query_tokens(text)) - dataset_service.STOPWORDS
        if len(argument_terms) < 3:
            return {
                'accepted': False,
                'method': 'local_topic_classifier',
                'confidence': 0.9,
                'topic_overlap': [], 'concept_overlap': [], 'context_overlap': [],
                'reason': 'The statement is too short to carry a debate argument.',
            }
        profile = _debate_relevance_terms(topic, dataset)
        topic_terms = set(dataset_service.query_tokens(topic)) - dataset_service.STOPWORDS
        subject_terms = _core_topic_subject(topic)
        direct_overlap = argument_terms.intersection(profile)
        topic_overlap = argument_terms.intersection(topic_terms)
        subject_overlap = argument_terms.intersection(subject_terms | profile)
        history_terms = set()
        for item in history or []:
            history_terms.update(dataset_service.query_tokens(item.get('text', '')))
        context_overlap = argument_terms.intersection(history_terms - dataset_service.STOPWORDS)
        has_claim = bool(argument_terms.intersection(_DEBATE_CLAIM_MARKERS))
        # A meaningful debate argument must (a) speak about the proposition's
        # subject or the debate's core concepts, (b) take a stance on it, and
        # (c) assert something.  A mythology fact or an entity name alone does
        # not satisfy this, however famous the entity is.
        stance_overlap = argument_terms.intersection(topic_terms | profile)
        subject_supported = bool(subject_overlap) and (
            has_claim or len(stance_overlap) >= 2
        )
        has_relevant_context = bool(
            context_overlap and history and (has_claim or len(context_overlap) >= 2)
        )
        accepted = bool(subject_supported or has_relevant_context)
        return {
            'accepted': accepted,
            'method': 'local_topic_classifier',
            'confidence': 0.9 if accepted else 0.1,
            'topic_overlap': sorted(topic_overlap),
            'concept_overlap': sorted(direct_overlap)[:12],
            'context_overlap': sorted(context_overlap)[:12],
            'reason': '' if accepted else 'The statement does not take a reasoned position on the debate proposition.',
        }
    except DatasetError:
        return {
            'accepted': False,
            'method': 'local_topic_classifier',
            'reason': 'The local mythology knowledge base is unavailable for argument validation.',
        }


def analyze_debate_argument(topic, argument, history=None, speaker_id=None, provider=None, round_number=1):
    """Validate relevance and repetition before an argument becomes a turn.

    Validation order: empty -> topic relevance -> repetition -> rebuttal.
    Off-topic submissions are rejected before any rebuttal check, so they
    never reach the rebuttal validator. Rebuttal engagement is only required
    from round 2 onward; round 1 opening arguments are not rebuttals.
    Two distinct failure modes produce two distinct messages: an off-topic
    argument gets the topic-relevance message, and a relevant argument that
    ignores the opponent's previous point gets the rebuttal-guidance message.
    """
    text = (argument or '').strip()
    if not text:
        return {'accepted': False, 'reason': 'Write an argument before sending.'}
    relevance = validate_debate_topic_relevance(topic, text, history, provider)
    if not relevance.get('accepted'):
        return {
            'accepted': False,
            'reason': 'This argument does not address the current debate topic. Please submit a point that supports or challenges the proposition.',
            'category': 'off_topic',
            'topic_overlap': relevance.get('topic_overlap', []),
            'relevance': relevance,
        }
    normalized = ' '.join(dataset_service.tokenize(text))
    for prior in history or []:
        if (speaker_id is None or prior.get('speaker') == speaker_id) and normalized and normalized == ' '.join(dataset_service.tokenize(prior.get('text', ''))):
            return {'accepted': False, 'reason': 'This repeats an earlier argument. Add a new point or respond to the opponent.'}
    # Rebuttal quality is checked separately from topic relevance. A relevant
    # argument that ignores the opponent's most recent point is guided, not
    # treated as off-topic.
    current_terms = set(dataset_service.query_tokens(text)) - dataset_service.STOPWORDS
    previous_terms = set()
    if history:
        previous_terms = set(dataset_service.query_tokens(history[-1].get('text', ''))) - dataset_service.STOPWORDS
    addresses_previous = bool(current_terms & previous_terms)
    if round_number > 1 and history and not addresses_previous:
        return {
            'accepted': False,
            'reason': 'Your argument addresses the topic, but it needs to respond more directly to the other side\'s previous point.',
            'category': 'weak_rebuttal',
            'topic_overlap': relevance.get('topic_overlap', []),
            'context_overlap': relevance.get('context_overlap', []),
            'relevance': relevance,
            'addresses_previous': False,
        }
    return {
        'accepted': True,
        'topic_overlap': relevance.get('topic_overlap', []),
        'context_overlap': relevance.get('context_overlap', []),
        'relevance': relevance,
        'has_reasoning': bool(re.search(r'\b(because|therefore|however|but|since|so|therefore)\b', text.lower())),
        'addresses_previous': addresses_previous,
    }


def summarize_history(conversation_id):
    with get_db_connection() as connection:
        rows = connection.execute(
            'SELECT sender, text, created_at, metadata FROM ai_messages WHERE conversation_id = ? ORDER BY id ASC',
            (conversation_id,),
        ).fetchall()
        return [dict(row) for row in rows]


DEBATE_TOPIC_ARGUMENTS = {
    'dharma': {
        'dharma', 'circumstances', 'circumstance', 'context', 'situations',
        'situation', 'duty', 'dependent', 'change', 'changes', 'changing',
        'universal', 'moral', 'right', 'wrong', 'conditional', 'absolute',
    },
    'arjuna': {
        'arjuna', 'hesitate', 'hesitation', 'war', 'duty', 'compassion',
        'krishna', 'fight', 'kurukshetra', 'dilemma', 'gita', 'relatives',
    },
    'karna': {
        'karna', 'fairly', 'fair', 'fairness', 'birth', 'loyalty', 'dignity',
        'exclusion', 'treated', 'honour', 'honor', 'duryodhana', 'caste',
    },
    'forgiveness': {
        'forgiveness', 'forgive', 'revenge', 'stronger', 'anger', 'mercy',
        'retaliation', 'punishment', 'strength', 'justice',
    },
    'devotion': {
        'devotion', 'knowledge', 'important', 'bhakti', 'jnana', 'wisdom',
        'faith', 'love', 'learning', 'study', 'path',
    },
    'relationship': {
        'duty', 'personal', 'relationships', 'relationship', 'family',
        'before', 'obligation', 'responsibility', 'dharma', 'comes',
    },
}

# Concept-specific counter-argument frames. Each frame is written from the
# 'against' viewpoint (the opponent defends the negation of a typical 'for'
# student position) and is flipped automatically when the opponent is 'for'.
DEBATE_TOPIC_COUNTERS = {
    'dharma': {
        'claim': 'dharma changes with circumstances',
        'counter': (
            'But notice what follows from that: if right and wrong shift with every situation, '
            'then no action can be judged at all. Yudhishthira\'s dice game was lawful in form, '
            'yet the epic treats it as a moral catastrophe. That only makes sense if something '
            'in dharma holds firm while circumstances merely change how it is applied.'
        ),
        'evidence_hint': 'dharma',
        'challenge': 'Can you name one action that would be right in every circumstance if dharma were purely situational?',
        'for_frame': (
            'Exactly: the same act is a duty in one situation and a crime in another, '
            'so context is inseparable from right action.'
        ),
    },
    'arjuna': {
        'claim': 'Arjuna was wrong to hesitate before the war',
        'counter': (
            'Yet his hesitation was not cowardice: it was the honest response of a person who '
            'saw that victory would cost him his teachers and kin. A war won by destroying the '
            'very people one is meant to protect deserves at least a moment of doubt.'
        ),
        'evidence_hint': 'gita',
        'challenge': 'If hesitation was wrong, what would you have had Arjuna do the moment he saw his elders across the field?',
        'for_frame': (
            'His despair was the beginning of honest inquiry, not a failure of courage; '
            'the Gita itself treats that moment as worth teaching through.'
        ),
    },
    'karna': {
        'claim': 'Karna was treated fairly',
        'counter': (
            'Fair treatment does not humiliate a man for his parentage. Karna was denied '
            'training and dignity for a birth he did not choose, and only Duryodhana offered '
            'him respect. Generosity from one flawed patron is not the same as fairness from a society.'
        ),
        'evidence_hint': 'karna',
        'challenge': 'Would you call a contest fair if the rules excluded someone before it began?',
        'for_frame': (
            'He was raised, honoured and made a king; the Mahabharata gives him rank, '
            'friendship and a place among the greatest warriors of his age.'
        ),
    },
    'forgiveness': {
        'claim': 'forgiveness is stronger than revenge',
        'counter': (
            'Strength that leaves harm unanswered can invite more harm. The epic ends with '
            'grief precisely because punishment and justice were avoided for too long; '
            'forgiveness without accountability can become surrender.'
        ),
        'evidence_hint': 'ahimsa',
        'challenge': 'Where would you draw the line between forgiving and permitting wrong to continue?',
        'for_frame': (
            'Revenge multiplies harm; it took one wrong and answered it with a war that '
            'consumed a generation. Forgiveness is the harder and rarer discipline.'
        ),
    },
    'devotion': {
        'claim': 'devotion matters more than knowledge',
        'counter': (
            'Devotion without understanding can be led anywhere. Krishna teaches Arjuna '
            'before asking anything of him: discernment comes first, and devotion gains '
            'its direction from that understanding.'
        ),
        'evidence_hint': 'gita',
        'challenge': 'How would you tell devoted action from misguided action without knowledge?',
        'for_frame': (
            'Knowledge that never moves the heart changes nothing; it was devotion, '
            'not argument, that carried Hanuman across the ocean.'
        ),
    },
    'relationship': {
        'claim': 'duty should always come before personal relationships',
        'counter': (
            'But duty itself is defined through relationships: a person owes duty to parents, '
            'teachers, children and guests. A rule that always overrides relationships would '
            'abolish the very obligations it claims to protect.'
        ),
        'evidence_hint': 'dharma',
        'challenge': 'Which duty survives if the relationships that define it are always second?',
        'for_frame': (
            'Rama accepted fourteen years of exile to honour his father\'s word; '
            'duty held even when it broke his family apart.'
        ),
    },
}


def _debate_topic_key(topic):
    """Map a debate topic onto a curated argument frame when one exists."""
    tokens = set(dataset_service.tokenize(topic)) - dataset_service.STOPWORDS
    best_key, best_hits = None, 0
    for key, terms in DEBATE_TOPIC_ARGUMENTS.items():
        hits = len(tokens & terms)
        if hits > best_hits:
            best_key, best_hits = key, hits
    return best_key


def _short_side_label(position):
    return 'FOR' if position == 'for' else 'AGAINST'


def _pick_relevant_evidence(topic, student_argument, opponent_position):
    """Return dataset evidence that actually relates to the debate subject.

    Only records retrieved against the topic's core subject terms are cited.
    A random record retrieved merely because it shares a mythology word with
    the student's sentence is rejected, so the opponent never pastes an
    unrelated paragraph. When the knowledge base has nothing closely relevant,
    an empty list is returned and the opponent argues from reasoning only.
    """
    try:
        dataset = get_dataset()
    except DatasetError:
        return []
    # Query phrasing matters: a question such as "Is Dharma always dependent
    # on circumstances?" retrieves almost nothing on its own, while the
    # proposition's core subject plus its strongest companion concept
    # retrieves the canonical record. Try progressively simpler queries.
    queries = []
    subject_terms = sorted(_core_topic_subject(topic))
    if subject_terms:
        # Single-entity queries ("karna", "dharma") retrieve canonical records
        # reliably; two-term queries add discrimination when the entity is
        # generic. Try the strongest pairing first, then the entity alone,
        # then the raw topic.
        queries.append(' '.join(reversed(subject_terms[:2])))
        queries.append(' '.join(subject_terms[:2]))
        queries.extend(term for term in subject_terms if len(term) >= 4)
        queries.append(topic)
    matches = []
    for query in queries:
        matches = dataset.search(query, limit=3, min_score=0.25)
        if matches:
            break
    picked = []
    for score, record in matches:
        if len(picked) >= 2:
            break
        snippet = record.summary if len(record.summary) <= 200 else record.summary[:197] + '...'
        picked.append((snippet, record.source_name, record.source_reference))
    return picked


def generate_debate_opponent_argument(debate, position, round_number, student_argument, history):
    """Dataset-grounded computer opponent - honest practice sparring partner.

    This is retrieval plus a curated argumentative frame; it is NOT generative
    AI, and the response says so. The opponent:
    1. identifies the main claim in the student's argument,
    2. states where it stands on that claim (it never concedes its side),
    3. presents a counterargument from a topic-specific frame or from the
       retrieved, source-labelled evidence,
    4. explains how the evidence supports its own side,
    5. ends with a challenge question or a concluding point.
    Responses draw on prior rounds so the same point is not repeated.
    """
    topic = debate['topic']
    topic_key = _debate_topic_key(topic)
    frame = DEBATE_TOPIC_COUNTERS.get(topic_key) if topic_key else None
    evidence = _pick_relevant_evidence(topic, student_argument, position)

    # Identify the student's main claim: prefer the clause after a reasoning
    # marker ('because', 'so'), else the first sentence.
    lowered = student_argument.strip()
    first_sentence = re.split(r'(?<=[.!?])\s+', lowered)[0] if lowered else lowered
    claim = first_sentence
    match = re.search(r'\b(?:because|since|so|therefore|as)\b', lowered, re.IGNORECASE)
    if match and match.end() < len(lowered):
        tail = lowered[match.end():].strip().rstrip('.')
        if len(tail) >= 12:
            claim = tail[:1].upper() + tail[1:]
    if claim and claim[-1] not in '.!?':
        claim += '.'
    claim = claim[:180]

    short_claim = (claim or first_sentence[:140])
    agree_line = 'I hear your point that "%s"' % short_claim

    if frame:
        counter = frame['for_frame'] if position == 'for' else frame['counter']
        challenge = frame['challenge']
    else:
        counter = (
            'The proposition, however, is not settled by a single example. My side holds '
            'the opposite view, and the counterargument is that your reasoning must still '
            'survive the strongest case on the other side.'
        )
        challenge = 'Which part of that counterargument would you answer first?'

    # Avoid repeating the same opening formula across rounds.
    prior_own = [
        item.get('text', '') for item in (history or [])
        if item.get('sender') == 'guru' or item.get('speaker') == 'ai-opponent'
    ]
    if any('I hear your point' in text for text in prior_own):
        agree_line = 'Let me take your latest point directly: "%s"' % short_claim

    if round_number == 1:
        opening = '%s %s' % (agree_line, counter)
        if evidence:
            evidence_lines = []
            for snippet, source_name, reference in evidence:
                evidence_lines.append('- %s (Source: %s; Reference: %s)' % (snippet, source_name, reference))
            opening += (
                ' The record that grounds my side of this question: %s '
                'It matters here because it shows the tradition itself weighing the very '
                'tension your claim depends on.' % ' '.join(evidence_lines)
            )
        opening += ' %s' % challenge
    elif round_number == 2:
        opening = (
            '%s My answer is the one I gave last round, and it still stands: %s %s'
            % (agree_line, counter, challenge)
        )
    else:
        opening = (
            'To close my case: across this exchange you have argued that "%s", '
            'and my answer has remained the same. %s %s'
            % (short_claim, counter, challenge)
        )
    opening += '\n\n(Dataset-powered computer opponent - answers drawn from the MythoVerse knowledge base.)'
    if not evidence and not frame:
        raise AIProviderError(
            'No relevant dataset evidence was found for this debate topic. Your argument was not saved; '
            'please choose a supported topic or retry with a more specific argument.',
            422, 'dataset_evidence_unavailable')
    return opening


def _evaluate_pending_debate_round(debate_id, round_number, requester_id):
    with get_db_connection() as connection:
        debate = connection.execute('SELECT * FROM debates WHERE id = ?', (debate_id,)).fetchone()
        if not debate:
            return jsonify({'error': 'Debate not found.'}), 404
        requester = connection.execute(
            "SELECT id FROM debate_participants WHERE debate_id = ? AND student_id = ? AND role = 'student'",
            (debate_id, requester_id),
        ).fetchone()
        if not requester:
            return jsonify({'error': 'Only a debate participant can request evaluation.'}), 403
        if debate['status'] == 'completed' or round_number != debate['current_round']:
            return jsonify({'error': 'Only the current, incomplete round can be evaluated.'}), 409
        round_row = connection.execute(
            'SELECT status FROM debate_rounds WHERE debate_id = ? AND round_number = ?',
            (debate_id, round_number),
        ).fetchone()
        if not round_row or round_row['status'] != 'awaiting_judge':
            return jsonify({'error': 'Both participants must submit before the automated rubric can evaluate this round.'}), 409
        participants = connection.execute(
            "SELECT * FROM debate_participants WHERE debate_id = ? AND role IN ('student','ai') ORDER BY CASE role WHEN 'student' THEN 0 ELSE 1 END, id",
            (debate_id,),
        ).fetchall()
        submissions = connection.execute(
            """
            SELECT s.participant_id, s.argument, p.student_id, p.position, p.role
            FROM debate_round_submissions AS s JOIN debate_participants AS p ON p.id = s.participant_id
            WHERE s.debate_id = ? AND s.round_number = ?
            ORDER BY CASE p.role WHEN 'student' THEN 0 ELSE 1 END, p.id
            """,
            (debate_id, round_number),
        ).fetchall()
        if len(participants) != 2 or len(submissions) != 2:
            return jsonify({'error': 'Exactly two participant submissions are required for evaluation.'}), 409
        cursor = connection.execute(
            "UPDATE debate_rounds SET status = 'judging' WHERE debate_id = ? AND round_number = ? AND status = 'awaiting_judge'",
            (debate_id, round_number),
        )
        if cursor.rowcount != 1:
            return jsonify({'error': 'This round is already being evaluated.'}), 409
        previous = connection.execute(
            """
            SELECT s.round_number, p.student_id, p.role, s.argument
            FROM debate_round_submissions AS s JOIN debate_participants AS p ON p.id = s.participant_id
            WHERE s.debate_id = ? AND s.round_number < ? ORDER BY s.round_number, p.id
            """,
            (debate_id, round_number),
        ).fetchall()
        prior_arguments = [
            {'round': row['round_number'], 'speaker': 'Dataset Computer Opponent' if row['role'] == 'ai' else row['student_id'], 'argument': row['argument']}
            for row in previous
        ]
        judge_arguments = [
            {'participant_key': key, 'position': row['position'], 'argument': row['argument']}
            for key, row in zip(('A', 'B'), submissions)
        ]
        # Map each prior argument to a participant key so rebuttal scoring can
        # distinguish which side made the earlier argument.
        for prior in prior_arguments:
            prior['participant_key'] = next(
                (key for key, row in zip(('A', 'B'), submissions)
                 if row['student_id'] == prior['speaker'] or (row['role'] == 'ai' and prior['speaker'] == 'Dataset Computer Opponent')),
                None,
            )

    try:
        judgement = judge_debate_round(debate['topic'], round_number, judge_arguments, prior_arguments, debate['age_group'])
    except AIProviderError as error:
        with get_db_connection() as connection:
            connection.execute(
                "UPDATE debate_rounds SET status = 'awaiting_judge' WHERE debate_id = ? AND round_number = ? AND status = 'judging'",
                (debate_id, round_number),
            )
        return jsonify({
            'error': str(error),
            'category': error.category,
            'round_number': round_number,
            'round_status': 'awaiting_judge',
            'submissions_saved': True,
            'retry_endpoint': f'/api/debate/{debate_id}/rounds/{round_number}/evaluate',
        }), error.status_code

    with get_db_connection() as connection:
        current_debate = connection.execute('SELECT * FROM debates WHERE id = ?', (debate_id,)).fetchone()
        current_round = connection.execute(
            'SELECT status FROM debate_rounds WHERE debate_id = ? AND round_number = ?',
            (debate_id, round_number),
        ).fetchone()
        if not current_round or current_round['status'] != 'judging':
            return jsonify({'error': 'Round state changed while evaluation was running.'}), 409
        result = _persist_judged_round(connection, current_debate, round_number, participants, judgement)
    return jsonify(result), 200


def _validate_feedback_list(value, field_name):
    if not isinstance(value, list) or len(value) > 5:
        raise AIProviderError(f'Automated judge returned invalid {field_name}. No scores were saved.', 502, 'invalid_judge_scorecard')
    if any(not isinstance(item, str) or not item.strip() or len(item) > 240 for item in value):
        raise AIProviderError(f'Automated judge returned invalid {field_name}. No scores were saved.', 502, 'invalid_judge_scorecard')
    return [item.strip() for item in value]


def _persist_judged_round(connection, debate, round_number, participants, judgement):
    for participant_key, participant in zip(('A', 'B'), participants):
        score = judgement[participant_key]
        connection.execute(
            """
            INSERT INTO debate_round_scores (
                debate_id, round_number, participant_id, relevance, reasoning, evidence,
                clarity, rebuttal, respect, total, explanation, strengths, improvements
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                debate['id'], round_number, participant['id'], score['relevance'], score['reasoning'],
                score['evidence'], score['clarity'], score['rebuttal'], score['respect'], score['total'],
                score['explanation'], json.dumps(score['strengths']), json.dumps(score['improvements']),
            ),
        )
    connection.execute(
        "UPDATE debate_rounds SET status = 'completed', judge_summary = ?, completed_at = CURRENT_TIMESTAMP WHERE debate_id = ? AND round_number = ?",
        (judgement['summary'], debate['id'], round_number),
    )
    result = {
        'round_number': round_number,
        'round_status': 'completed',
        'judge_summary': judgement['summary'],
        'scores': [
            {'participant_id': participant['student_id'], 'role': participant['role'], **judgement[key]}
            for key, participant in zip(('A', 'B'), participants)
        ],
    }
    if round_number < 3:
        next_round = round_number + 1
        connection.execute(
            "UPDATE debate_rounds SET status = 'active', started_at = CURRENT_TIMESTAMP WHERE debate_id = ? AND round_number = ?",
            (debate['id'], next_round),
        )
        connection.execute("UPDATE debates SET current_round = ?, status = 'in_progress' WHERE id = ?", (next_round, debate['id']))
        result.update({'status': 'in_progress', 'current_round': next_round})
        return result

    totals = connection.execute(
        'SELECT participant_id, ROUND(SUM(total), 1) AS total_score FROM debate_round_scores WHERE debate_id = ? GROUP BY participant_id',
        (debate['id'],),
    ).fetchall()
    total_by_participant = {row['participant_id']: row['total_score'] for row in totals}
    first_total = total_by_participant.get(participants[0]['id'], 0)
    second_total = total_by_participant.get(participants[1]['id'], 0)
    reward = None
    if round(first_total, 1) == round(second_total, 1):
        winner = 'draw'
    else:
        winning_participant = participants[0] if first_total > second_total else participants[1]
        winner = winning_participant['student_id']
        if winning_participant['role'] == 'student':
            connection.execute(
                "INSERT OR IGNORE INTO dharma_reward_outbox (debate_id, student_id, points, status) VALUES (?, ?, 5, 'pending_integration')",
                (debate['id'], winning_participant['student_id']),
            )
            reward_row = connection.execute(
                'SELECT student_id, points, status, created_at FROM dharma_reward_outbox WHERE debate_id = ?',
                (debate['id'],),
            ).fetchone()
            reward = dict(reward_row) if reward_row else None
    summaries = connection.execute(
        'SELECT judge_summary FROM debate_rounds WHERE debate_id = ? ORDER BY round_number',
        (debate['id'],),
    ).fetchall()
    final_feedback = '\n\n'.join(row['judge_summary'] for row in summaries if row['judge_summary'])
    connection.execute(
        "UPDATE debates SET status = 'completed', current_round = 3, winner = ?, final_feedback = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        (winner, final_feedback, debate['id']),
    )
    scorecard_rows = connection.execute(
        """
        SELECT s.round_number, p.student_id AS participant_id, p.role, p.position,
               s.relevance, s.reasoning, s.evidence, s.clarity, s.rebuttal, s.respect,
               s.total, s.explanation, s.strengths, s.improvements
        FROM debate_round_scores AS s JOIN debate_participants AS p ON p.id = s.participant_id
        WHERE s.debate_id = ? ORDER BY s.round_number, p.id
        """,
        (debate['id'],),
    ).fetchall()
    scorecard = []
    for row in scorecard_rows:
        item = dict(row)
        item['strengths'] = json.loads(item['strengths'])
        item['improvements'] = json.loads(item['improvements'])
        scorecard.append(item)
    result.update({
        'status': 'completed',
        'winner': winner,
        'total_scores': [
            {'participant_id': participant['student_id'], 'role': participant['role'],
             'score': total_by_participant.get(participant['id'], 0)}
            for participant in participants
        ],
        'scorecard': scorecard,
        'final_feedback': final_feedback,
        'reward': reward,
        'integration_notice': 'Dharma Points service is not connected; the 5-point reward is queued in the integration outbox.' if reward else None,
    })
    return result


def judge_debate_round(topic, round_number, participant_arguments, prior_arguments, age_group):
    """Transparent rubric-based judge - deterministic scoring, no external AI.

    Formula (documented, applied identically to both participants):
      relevance  0-10 : share of topic keywords present in the argument
      reasoning  0-10 : logical connectives plus argument length
      evidence   0-10 : references to named figures/works found in the dataset
      clarity    0-10 : sentence-length and repetition based readability proxy
      rebuttal   0-10 : engagement with the opponent's previous-round points
      respect    0-10 : absence of insulting language
      total      = mean of the six criteria, rounded to 1 decimal
    """
    if len(participant_arguments) != 2:
        raise AIProviderError('Exactly two participant submissions are required for evaluation.', 409, 'round_not_ready')

    topic_tokens = set(dataset_service.tokenize(topic)) - dataset_service.STOPWORDS
    known_terms = set()
    for record in get_dataset().records:
        known_terms.update(dataset_service.tokenize(record.title))
        known_terms.update(dataset_service.tokenize(' '.join(record.characters)))
        known_terms.update(dataset_service.tokenize(' '.join(record.keywords)))
    known_terms -= dataset_service.STOPWORDS

    cards = []
    for key, entry in zip(('A', 'B'), participant_arguments):
        text = str(entry.get('argument', ''))
        tokens = dataset_service.tokenize(text)
        token_set = set(tokens)
        length = max(len(tokens), 1)

        if topic_tokens:
            overlap = len(topic_tokens & token_set) / len(topic_tokens)
        else:
            overlap = 0.5
        relevance = min(10.0, 2.0 + 8.0 * overlap)

        reasoning_markers = ('because', 'therefore', 'thus', 'since', 'hence', 'if', 'then', 'so that', 'as a result', 'consequently')
        marker_hits = sum(1 for marker in reasoning_markers if marker in text.lower())
        reasoning = min(10.0, 2.0 + marker_hits * 1.2 + min(3.0, len(tokens) / 60.0))

        evidence_hits = len(known_terms & token_set)
        evidence = min(10.0, 2.0 + evidence_hits * 1.4)

        sentences = [s for s in re.split(r'[.!?]+', text) if s.strip()]
        avg_sentence = (sum(len(dataset_service.tokenize(s)) for s in sentences) / max(len(sentences), 1)) if sentences else length
        word_freq = {}
        for token in tokens:
            word_freq[token] = word_freq.get(token, 0) + 1
        repeat_ratio = max(word_freq.values()) / length if word_freq else 0.0
        clarity = min(10.0, max(1.0, 11.0 - avg_sentence * 0.35 - repeat_ratio * 8.0))

        opponent_prior = ' '.join(
            prior['argument'] for prior in (prior_arguments or [])
            if isinstance(prior, dict)
            # Accept both mapping styles: 'participant_key' (A/B) and 'speaker'
            # (student id / opponent label from the debate evaluation route).
            and ((prior.get('participant_key') or '') != key)
            and ((prior.get('speaker') or '') not in (entry.get('speaker_id', ''),))
        ).lower()
        prior_tokens = set(dataset_service.tokenize(opponent_prior)) - dataset_service.STOPWORDS if opponent_prior else set()
        rebuttal_overlap = len(prior_tokens & token_set) / len(prior_tokens) if prior_tokens else 0.0
        rebuttal = min(10.0, 2.0 + rebuttal_overlap * 8.0 + (3.0 if round_number == 1 and len(tokens) > 40 else 0.0))

        aggressive_words = ('stupid', 'idiot', 'fool', 'dumb', 'shut up', 'worthless', 'ignorant', 'trash')
        violations = sum(1 for word in aggressive_words if word in text.lower())
        respect = max(0.0, 10.0 - violations * 3.0)

        scores = {
            'relevance': round(relevance, 1),
            'reasoning': round(reasoning, 1),
            'evidence': round(evidence, 1),
            'clarity': round(clarity, 1),
            'rebuttal': round(rebuttal, 1),
            'respect': round(respect, 1),
        }
        total = round(sum(scores.values()) / len(JUDGE_CRITERIA), 1)

        strengths, improvements = [], []
        for criterion, value in scores.items():
            if value >= 7.5:
                strengths.append('%s: strong (%s/10)' % (criterion.title(), value))
            elif value <= 4.0:
                improvements.append('%s: needs work (%s/10)' % (criterion.title(), value))
        if not strengths:
            strengths.append('Overall: balanced, serviceable performance.')
        if not improvements:
            improvements.append('Overall: keep refining expression and depth.')

        cards.append({
            'participant_key': key,
            **scores,
            'total': total,
            'explanation': (
                'Rubric-based evaluation of a %d-word argument: relevance %s/10 (topic-word overlap), '
                'reasoning %s/10 (logical structure), evidence %s/10 (dataset/epic references), '
                'clarity %s/10 (sentence structure), rebuttal %s/10 (engagement with the other side), '
                'respect %s/10 (tone).'
                % (len(tokens), scores['relevance'], scores['reasoning'], scores['evidence'],
                   scores['clarity'], scores['rebuttal'], scores['respect'])
            ),
            'strengths': strengths[:5],
            'improvements': improvements[:5],
        })

    first, second = cards[0], cards[1]
    if first['total'] == second['total']:
        summary = (
            'Automated rubric evaluation for round %d on "%s": both sides scored %.1f - a draw for this round.'
            % (round_number, topic, first['total'])
        )
    else:
        leader = 'A' if first['total'] > second['total'] else 'B'
        summary = (
            'Automated rubric evaluation for round %d on "%s": %s leads %.1f to %.1f. '
            'Scores come from a documented, deterministic rubric formula.'
            % (round_number, topic, leader, first['total'], second['total'])
        )
    return {'A': cards[0], 'B': cards[1], 'summary': summary}


@app.route('/')
def index():
    return render_template('home.html')


@app.route('/ai-mentor')
def ai_mentor():
    return render_template('mentor.html')


@app.route('/learning-intelligence')
def learning_intelligence():
    return render_template('learning.html')


@app.route('/debate-room')
def debate_room():
    return render_template('debate.html')


@app.get('/api/search')
def api_search():
    query = (request.args.get('q') or '').strip()
    if not query:
        return jsonify({'results': [], 'query': query, 'error': 'Please enter a topic to search.'})
    with get_db_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, title, category, description, url
            FROM content_catalog
            WHERE title LIKE ? OR category LIKE ? OR description LIKE ?
            ORDER BY title ASC
            LIMIT 8
            """,
            (f'%{query}%', f'%{query}%', f'%{query}%'),
        ).fetchall()
    results = [dict(row) for row in rows]
    return jsonify({'query': query, 'results': results})


@app.get('/api/mentor/conversations')
def api_conversations():
    student_id = request.args.get('student_id', 'demo-student')
    with get_db_connection() as connection:
        conversations = connection.execute(
            'SELECT id, title, created_at FROM ai_conversations WHERE student_id = ? ORDER BY created_at DESC',
            (student_id,),
        ).fetchall()
        records = []
        for conversation in conversations:
            messages = summarize_history(conversation['id'])
            records.append({
                'id': conversation['id'],
                'title': conversation['title'],
                'created_at': conversation['created_at'],
                'messages': messages,
            })
    return jsonify({'student_id': student_id, 'conversations': records})


def _persist_mentor_exchange(connection, conversation_id, message, age_group, answer_text, provider, model_name):
    if not conversation_id:
        title = message[:60]
        cursor = connection.execute(
            'INSERT INTO ai_conversations (student_id, title) VALUES (?, ?)',
        )
        return cursor.lastrowid
    return conversation_id


def _format_dataset_record_answer(record):
    """Return a direct, grounded answer and include verified verse fields."""
    raw = record.raw
    answer = raw.get('answer_text') or record.detailed_content
    if raw.get('sanskrit_text'):
        answer = (
            f'{record.title}\n\n{answer}\n\n'
            f'Sanskrit text: {raw["sanskrit_text"]}\n'
            f'Transliteration: {raw.get("transliteration", "Not recorded")}\n'
            f'Plain-English meaning: {raw.get("plain_english_meaning", "Not recorded")}'
        )
    return answer


def _compose_dataset_answer(question, age_group, context=''):
    """Build an answer from the local mythology dataset with honest citations.

    Returns None when the dataset has no relevant record, so callers can give an
    honest 'not in scope' response instead of an invented answer.
    """
    try:
        dataset = get_dataset()
    except DatasetError as error:
        logger.error('Local mythology dataset unavailable: %s', error)
        return None
    matches = dataset.search(question, age_group=age_group, limit=4)
    follow_up = bool(re.search(r'\b(his|her|their|they|that|those|what about|and what)\b', question.lower()))
    if context and (follow_up or not matches or matches[0][0] < 0.25):
        matches = dataset.search(
            f'{context} {question}', age_group=age_group, limit=4
        )
    if not matches:
        return None
    best_score, best = matches[0]
    lines = [_format_dataset_record_answer(best)]
    citation = (
        f"\n\nSource: {best.source_name} â€” {best.source_reference}. "
        f"Traditional narrative; regional versions may differ."
    )
    lines.append(citation)
    secondary_matches = matches[1:3]
    for secondary_score, secondary in secondary_matches:
        lines.append(
            f"\nRelated topic: {secondary.title} â€” {secondary.summary} "
            f"(Source: {secondary.source_name})"
        )
    references = [
        {
            'record_id': best.id,
            'title': best.title,
            'category': best.category,
            'source_name': best.source_name,
            'source_reference': best.source_reference,
            'relevance': round(best_score, 3),
        }
    ]
    for secondary_score, secondary in secondary_matches:
        references.append({
            'record_id': secondary.id,
            'title': secondary.title,
            'category': secondary.category,
            'source_name': secondary.source_name,
            'source_reference': secondary.source_reference,
            'relevance': round(secondary_score, 3),
        })
    return {
        'answer': '\n'.join(lines).strip(),
        'provider': 'local_dataset',
        'model': 'mythology-dataset-v1',
        'age_group': safe_age_group(age_group),
        'references': references,
    }


def _compose_out_of_scope_response(question):
    dataset = get_dataset()
    categories = ', '.join(dataset.all_categories())
    return {
        'answer': (
            "I could not find reliable information on that question in the MythoVerse "
            "knowledge base, so I will not guess an answer. "
            f"Try asking about Indian epics, deities, philosophy, history or ethics â€” "
            f"for example: {categories}."
        ),
        'provider': 'local_dataset',
        'model': 'mythology-dataset-v1',
        'age_group': '13-15',
        'references': [],
    }


@app.post('/api/mentor/chat')
def api_mentor_chat():
    payload = request.get_json(silent=True)
    payload = payload if isinstance(payload, dict) else {}
    raw_message = payload.get('message')
    message = raw_message.strip() if isinstance(raw_message, str) else ''
    if not message or len(message) > 2000:
        return jsonify({'error': 'Enter a question of 1 to 2000 characters.'}), 400
    student_id = payload.get('student_id', 'demo-student')
    if not isinstance(student_id, str) or not student_id.strip() or len(student_id) > 80:
        return jsonify({'error': 'A valid student_id is required.'}), 400
    student_id = student_id.strip()
    age_group = safe_age_group(payload.get('age_group', '13-15'))
    conversation_id = payload.get('conversation_id')
    conversation_context = ''
    if conversation_id is not None:
        try:
            conversation_id = int(conversation_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'conversation_id must be a positive integer.'}), 400
        if conversation_id < 1:
            return jsonify({'error': 'conversation_id must be a positive integer.'}), 400

    with get_db_connection() as connection:
        if conversation_id:
            conversation = connection.execute(
                'SELECT id FROM ai_conversations WHERE id = ? AND student_id = ?',
                (conversation_id, student_id),
            ).fetchone()
            if not conversation:
                return jsonify({'error': 'Conversation not found.'}), 404
            prior_message = connection.execute(
                "SELECT text FROM ai_messages WHERE conversation_id = ? AND sender = 'student' "
                'ORDER BY id DESC LIMIT 1',
                (conversation_id,),
            ).fetchone()
            if prior_message:
                conversation_context = prior_message['text']

    try:
        response = _compose_dataset_answer(
            message, age_group, context=conversation_context
        ) or _compose_out_of_scope_response(message)
    except DatasetError as error:
        logger.error('Local dataset lookup failed: %s', error)
        return jsonify({'error': 'The local knowledge base is unavailable. Please try again later.'}), 503

    with get_db_connection() as connection:
        if not conversation_id:
            title = message[:60]
            cursor = connection.execute(
                'INSERT INTO ai_conversations (student_id, title) VALUES (?, ?)',
                (student_id, title),
            )
            conversation_id = cursor.lastrowid
        connection.execute(
            'INSERT INTO ai_messages (conversation_id, sender, text, metadata) VALUES (?, ?, ?, ?)',
            (conversation_id, 'student', message, json.dumps({'age_group': age_group})),
        )
        connection.execute(
            'INSERT INTO ai_messages (conversation_id, sender, text, metadata) VALUES (?, ?, ?, ?)',
            (conversation_id, 'guru', response['answer'], json.dumps({
                'provider': response['provider'],
                'model': response.get('model') or 'mythology-dataset-v1',
                'references': response.get('references', []),
            })),
        )
        connection.commit()
    response['conversation_id'] = conversation_id
    response['student_id'] = student_id
    return jsonify(response)


@app.get('/api/learning/summary')
def api_learning_summary():
    student_id = (request.args.get('student_id') or 'demo-student').strip()
    if not student_id or len(student_id) > 80:
        return jsonify({'error': 'A valid student_id is required.'}), 400
    with get_db_connection() as connection:
        rows = connection.execute(
            'SELECT id, topic, focus_area, score, status, activity_type, chapter_name, created_at FROM learning_records WHERE student_id = ? ORDER BY created_at DESC',
            (student_id,),
        ).fetchall()
        question_rows = connection.execute(
            'SELECT id, learning_record_id, student_id, record_id, topic, title, question, given_answer, correct, difficulty, age_group, created_at '
            'FROM learning_question_results WHERE student_id = ? ORDER BY created_at DESC, id DESC',
            (student_id,),
        ).fetchall()
    record_dicts = [dict(row) for row in rows]
    question_dicts = [dict(row) for row in question_rows]
    if not record_dicts and not question_dicts:
        return jsonify({
            'student_id': student_id,
            'status': 'no-data',
            'message': 'No learning activity has been recorded yet. Complete chapters or quizzes to generate insights.',
            'progress': {
                'completed_topics': 0, 'in_progress': 0, 'total_topics': 0,
                'completion_rate': 0, 'average_score': None,
                'lessons_completed': 0, 'quizzes_attempted': 0,
                'questions_attempted': 0, 'average_quiz_score': None,
                'learning_streak_days': None,
            },
            'strengths': [],
            'improvement_areas': [],
            'recommendations': [],
            'recent_activity': [],
            'topic_performance': {},
            'revision_plan': [],
            'adaptive_difficulty': 'medium',
        })

    dataset = get_dataset()
    analysis = analyze_learning(record_dicts, question_dicts, dataset, request.args.get('age_group'))
    topic_status = {}
    legacy_scores = {}
    for row in record_dicts:
        topic = row['topic']
        topic_status.setdefault(topic, set()).add(row['status'])
        if row['score'] is not None:
            legacy_scores.setdefault(topic, []).append(row['score'])
    completed_topics = sum(1 for statuses in topic_status.values() if 'completed' in statuses)
    in_progress = sum(1 for statuses in topic_status.values() if 'in_progress' in statuses and 'completed' not in statuses)
    strengths = []
    improvement_areas = []
    if question_dicts:
        strengths = [
            {'topic': item['topic'], 'score': item['accuracy'], 'classification': item['classification'], 'trend': item['trend']}
            for item in analysis['topic_performance'].values() if item['classification'] == 'strong'
        ]
        improvement_areas = [
            {'topic': item['topic'], 'score': item['accuracy'], 'classification': item['classification'], 'trend': item['trend'],
             'related_concepts': item['related_concepts']}
            for item in analysis['topic_performance'].values() if item['classification'] == 'weak'
        ]
    else:
        # Preserve the existing manual lesson-record API for older clients.
        for topic, scores in legacy_scores.items():
            avg_topic_score = sum(scores) / len(scores)
            if avg_topic_score >= 75:
                strengths.append({'topic': topic, 'score': round(avg_topic_score, 1)})
            elif avg_topic_score < 60:
                improvement_areas.append({'topic': topic, 'score': round(avg_topic_score, 1)})

    recommendations = analysis['recommendations']
    if not recommendations and improvement_areas and not question_dicts:
        recommendations = [{
            'type': 'revision',
            'title': f'Revisit {item["topic"]}',
            'topic': item['topic'],
            'action': 'lesson',
            'reason': f'Your recorded performance in {item["topic"]} is below the recommended level.',
        } for item in improvement_areas[:3]]
    if not recommendations and strengths and not question_dicts:
        recommendations = [{
            'type': 'extension',
            'title': f'Build on {strengths[0]["topic"]}',
            'topic': strengths[0]['topic'],
            'action': 'lesson',
            'reason': f'Your recorded score in {strengths[0]["topic"]} is a strength. Continue with a related lesson.',
        }]
    if not recommendations and not question_dicts:
        recommendations = [{
            'type': 'start',
            'title': 'Complete a scored activity',
            'action': 'quiz',
            'reason': 'There are not yet enough question-level results to identify reliable strengths or improvement areas.',
        }]

    progress = analysis['progress']
    if not question_dicts:
        legacy_all_scores = [row['score'] for row in record_dicts if row.get('score') is not None]
        progress['average_quiz_score'] = round(sum(legacy_all_scores) / len(legacy_all_scores), 1) if legacy_all_scores else None
    progress.update({
        'completed_topics': completed_topics,
        'in_progress': in_progress,
        'total_topics': len(topic_status),
        'completion_rate': round(completed_topics / len(topic_status) * 100, 1) if topic_status else 0,
        'average_score': progress['average_quiz_score'],
    })
    return jsonify({
        'student_id': student_id,
        'status': 'has-data',
        'progress': progress,
        'strengths': strengths,
        'improvement_areas': improvement_areas,
        'strongest_topic': analysis['strongest_topic'],
        'weakest_topic': analysis['weakest_topic'],
        'topic_performance': analysis['topic_performance'],
        'recommendations': recommendations,
        'revision_plan': analysis['revision_plan'],
        'adaptive_difficulty': analysis['adaptive_difficulty'],
        'recent_activity': record_dicts[:8],
        'learning_history': record_dicts,
    })


@app.get('/api/learning/quiz')
def api_learning_quiz():
    """Dataset-based multiple-choice quiz (questions drawn from dataset records).

    age_group and student_id filter which records are eligible. No scores are
    invented here â€” real scoring happens when the student answers via
    /api/learning/quiz/submit, which uses actual dataset answer keys.
    """
    student_id = (request.args.get('student_id') or 'demo-student').strip()
    if not student_id or len(student_id) > 80:
        return jsonify({'error': 'A valid student_id is required.'}), 400
    age_group = request.args.get('age_group')
    age_group = safe_age_group(age_group) if age_group else None
    count = min(10, max(1, int(request.args.get('count', 5))))
    try:
        dataset = get_dataset()
        with get_db_connection() as connection:
            question_rows = [dict(row) for row in connection.execute(
                'SELECT learning_record_id, topic, record_id, title, question, correct, difficulty, age_group, created_at '
                'FROM learning_question_results WHERE student_id = ? ORDER BY created_at DESC, id DESC',
                (student_id,),
            ).fetchall()]
        difficulty = determine_adaptive_difficulty(question_rows)
        quiz = dataset.build_quiz(
            student_id, age_group=age_group, count=count, difficulty=difficulty
        )
        if len(quiz) < count:
            quiz = dataset.build_quiz(student_id, age_group=age_group, count=count)
    except DatasetError as error:
        logger.error('Local dataset quiz unavailable: %s', error)
        return jsonify({'error': 'The local knowledge base is unavailable. Please try again later.'}), 503
    # Never expose the answer key to the frontend â€” grading is server-side only.
    safe_quiz = [{key: value for key, value in item.items() if key != 'answer'} for item in quiz]
    return jsonify({
        'student_id': student_id,
        'age_group': age_group,
        'difficulty': difficulty,
        'quiz': safe_quiz,
    })


@app.post('/api/learning/quiz/submit')
def api_learning_quiz_submit():
    """Score an answered dataset quiz with the real dataset answer keys.

    Every answered question is graded against the dataset record's canonical
    answer. A frontend-provided 'correct' flag is ignored.
    """
    payload = request.get_json(silent=True)
    payload = payload if isinstance(payload, dict) else {}
    student_id = payload.get('student_id')
    if not isinstance(student_id, str) or not student_id.strip() or len(student_id.strip()) > 80:
        return jsonify({'error': 'A valid student_id is required.'}), 400
    student_id = student_id.strip()
    answers = payload.get('answers')
    if not isinstance(answers, list) or not all(isinstance(item, dict) for item in answers):
        return jsonify({'error': 'answers must be a list of {record_id, answer} items.'}), 400

    try:
        dataset = get_dataset()
    except DatasetError as error:
        logger.error('Local dataset quiz submit unavailable: %s', error)
        return jsonify({'error': 'The local knowledge base is unavailable. Please try again later.'}), 503

    graded = []
    for item in answers:
        record_id = item.get('record_id')
        given = item.get('answer')
        record = dataset.by_id(record_id) if record_id else None
        if not record or not record.questions:
            graded.append({'record_id': record_id, 'correct': None, 'reason': 'unknown record'})
            continue
        correct = record.questions[0]
        graded.append({'record_id': record.id, 'title': record.title,
                       'given': given, 'answer': correct,
                       'correct': isinstance(given, str) and given.strip() == correct})
    scored_items = [item for item in graded if item.get('correct') is not None]
    correct_count = sum(1 for item in scored_items if item['correct'])
    score = round(100.0 * correct_count / len(scored_items), 1) if scored_items else None

    if scored_items:
        wrong = [item for item in scored_items if not item['correct']]
        focus = ', '.join(sorted({item['title'] for item in wrong}))[:150] or 'General mythology'
        status = 'completed' if score is not None and score >= 70 else 'in_progress'
        topics = sorted({dataset.by_id(item['record_id']).category for item in scored_items if dataset.by_id(item['record_id'])})
        activity_topic = topics[0] if len(topics) == 1 else 'Dataset Quiz'
        age_group = safe_age_group(payload.get('age_group', '13-15'))
        with get_db_connection() as connection:
            cursor = connection.execute(
                'INSERT INTO learning_records (student_id, topic, focus_area, score, status, activity_type) VALUES (?, ?, ?, ?, ?, ?)',
                (student_id, activity_topic, focus, score, status, 'quiz'),
            )
            learning_record_id = cursor.lastrowid
            for item in scored_items:
                record = dataset.by_id(item['record_id'])
                connection.execute(
                    'INSERT INTO learning_question_results '
                    '(learning_record_id, student_id, record_id, topic, title, question, given_answer, correct, difficulty, age_group) '
                    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    (learning_record_id, student_id, record.id, record.category, record.title,
                     record.questions[0], item.get('given'), int(item['correct']),
                     dataset_service.infer_record_difficulty(record), age_group),
                )
            record_id = learning_record_id
    else:
        record_id = None

    return jsonify({
        'student_id': student_id,
        'graded': graded,
        'correct_count': correct_count,
        'total': len(scored_items),
        'score': score,
        'record_id': record_id,
        'difficulty': determine_adaptive_difficulty([
            {'learning_record_id': record_id, 'correct': item['correct']}
            for item in scored_items
        ]) if scored_items else 'medium',
    })


@app.post('/api/learning/records')
def api_learning_record_create():
    payload = request.get_json(silent=True)
    payload = payload if isinstance(payload, dict) else {}
    student_id = payload.get('student_id')
    topic = payload.get('topic')
    status = payload.get('status')
    if not isinstance(student_id, str) or not student_id.strip() or len(student_id.strip()) > 80:
        return jsonify({'error': 'A valid student_id is required.'}), 400
    if not isinstance(topic, str) or not topic.strip() or len(topic.strip()) > 160:
        return jsonify({'error': 'Topic must contain 1 to 160 characters.'}), 400
    if status not in ('completed', 'in_progress'):
        return jsonify({'error': 'Status must be completed or in_progress.'}), 400

    score = payload.get('score')
    if score is not None:
        try:
            score = float(score)
        except (TypeError, ValueError):
            return jsonify({'error': 'Score must be a number from 0 to 100.'}), 400
        if not 0 <= score <= 100:
            return jsonify({'error': 'Score must be a number from 0 to 100.'}), 400

    optional_fields = {}
    for field, max_length in (('focus_area', 160), ('activity_type', 80), ('chapter_name', 160)):
        value = payload.get(field)
        if value is not None and (not isinstance(value, str) or len(value) > max_length):
            return jsonify({'error': f'{field} must be no more than {max_length} characters.'}), 400
        optional_fields[field] = value.strip() if isinstance(value, str) else None

    with get_db_connection() as connection:
        cursor = connection.execute(
            'INSERT INTO learning_records (student_id, topic, focus_area, score, status, activity_type, chapter_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (student_id.strip(), topic.strip(), optional_fields['focus_area'], score, status,
             optional_fields['activity_type'], optional_fields['chapter_name']),
        )
        record_id = cursor.lastrowid
    return jsonify({'record_id': record_id, 'student_id': student_id.strip(), 'topic': topic.strip(), 'status': status}), 201


@app.get('/api/debate/list')
def api_debate_list():
    with get_db_connection() as connection:
        debates = connection.execute(
            """
            SELECT d.id, d.topic, d.mode, d.created_by, d.age_group, d.difficulty, d.status, d.current_round, d.created_at,
                   (SELECT COUNT(*) FROM debate_participants p WHERE p.debate_id = d.id AND p.role = 'student') AS student_count
            FROM debates d
            ORDER BY d.created_at DESC
            """
        ).fetchall()
    # Display deduplication: show the newest debate per canonical topic, and
    # never render the same topic twice on the topic-selection screen. Older
    # duplicates stay in the database; no history is deleted.
    seen = set()
    unique_debates = []
    for row in debates:
        key = (canonical_debate_topic(row['topic']), row['created_by'])
        if key in seen:
            continue
        seen.add(key)
        unique_debates.append(dict(row))
    return jsonify({'debates': unique_debates[:50]})


@app.post('/api/debate/create')
def api_debate_create():
    payload = request.get_json(silent=True)
    payload = payload if isinstance(payload, dict) else {}
    topic = payload.get('topic')
    mode = payload.get('mode', 'student-vs-ai')
    created_by = payload.get('created_by', 'demo-student')
    position = payload.get('position', 'for')
    difficulty = payload.get('difficulty', 'beginner')
    if not isinstance(topic, str) or not topic.strip() or len(topic.strip()) > 200:
        return jsonify({'error': 'Topic must contain 1 to 200 characters.'}), 400
    if mode not in ('student-vs-ai', 'student-vs-llm', 'student-vs-student'):
        return jsonify({'error': 'Choose a supported debate mode.'}), 400
    if not isinstance(created_by, str) or not created_by.strip() or len(created_by.strip()) > 80:
        return jsonify({'error': 'A valid created_by student id is required.'}), 400
    if position not in ('for', 'against'):
        return jsonify({'error': 'Position must be for or against.'}), 400
    if difficulty not in ('beginner', 'intermediate', 'advanced'):
        return jsonify({'error': 'Difficulty must be beginner, intermediate, or advanced.'}), 400
    topic = topic.strip()
    created_by = created_by.strip()
    age_group = safe_age_group(payload.get('age_group', '13-15'))
    is_ai_opponent = mode in ('student-vs-ai', 'student-vs-llm')
    status = 'in_progress' if is_ai_opponent else 'open'
    canonical_topic = canonical_debate_topic(topic)
    with get_db_connection() as connection:
        # Duplicate-topic guard: the same student cannot open two debates on
        # the same proposition. Topics differing only in case, punctuation,
        # or whitespace map to the same canonical identity. Existing debate
        # history is never modified or deleted here.
        if canonical_topic:
            duplicates = [
                row['id'] for row in connection.execute(
                    'SELECT id, topic FROM debates WHERE created_by = ?', (created_by,)
                ).fetchall()
                if canonical_debate_topic(row['topic']) == canonical_topic
            ]
            if duplicates:
                existing_id = duplicates[0]
                return jsonify({
                    'error': 'You already have a debate on this topic (debate #%d). Open it from your debate history instead.' % existing_id,
                    'existing_debate_id': existing_id,
                }), 409
        cursor = connection.execute(
            'INSERT INTO debates (topic, mode, created_by, age_group, difficulty, status) VALUES (?, ?, ?, ?, ?, ?)',
            (topic, mode, created_by, age_group, difficulty, status),
        )
        debate_id = cursor.lastrowid
        connection.execute(
            'INSERT INTO debate_participants (debate_id, student_id, role, position, ready) VALUES (?, ?, ?, ?, ?)',
            (debate_id, created_by, 'student', position, 1 if is_ai_opponent else 0),
        )
        if is_ai_opponent:
            ai_position = 'against' if position == 'for' else 'for'
            connection.execute(
                'INSERT INTO debate_participants (debate_id, student_id, role, position, ready) VALUES (?, ?, ?, ?, ?)',
                (debate_id, 'ai-opponent', 'ai', ai_position, 1),
            )
        for round_number in range(1, 4):
            connection.execute(
                'INSERT INTO debate_rounds (debate_id, round_number, status) VALUES (?, ?, ?)',
                (debate_id, round_number, ('active' if is_ai_opponent else 'waiting_ready') if round_number == 1 else 'not_started'),
            )
    return jsonify({'debate': {
        'id': debate_id, 'topic': topic, 'mode': mode, 'created_by': created_by,
        'status': status, 'current_round': 1, 'age_group': age_group,
        'difficulty': difficulty,
    }}), 201


@app.post('/api/debate/<int:debate_id>/join')
def api_debate_join(debate_id):
    payload = request.get_json(silent=True)
    payload = payload if isinstance(payload, dict) else {}
    student_id = payload.get('student_id', 'demo-student')
    if not isinstance(student_id, str) or not student_id.strip() or len(student_id.strip()) > 80:
        return jsonify({'error': 'A valid student_id is required.'}), 400
    student_id = student_id.strip()
    with get_db_connection() as connection:
        debate = connection.execute('SELECT id, status, mode, created_by FROM debates WHERE id = ?', (debate_id,)).fetchone()
        if not debate:
            return jsonify({'error': 'Debate not found.'}), 404
        if debate['status'] != 'open' or debate['mode'] != 'student-vs-student':
            return jsonify({'error': 'This debate is not accepting another student.'}), 400
        existing = connection.execute(
            'SELECT id FROM debate_participants WHERE debate_id = ? AND student_id = ?',
            (debate_id, student_id),
        ).fetchone()
        if existing:
            return jsonify({'error': 'You have already joined this debate.'}), 400
        participant_count = connection.execute(
            'SELECT COUNT(*) AS count FROM debate_participants WHERE debate_id = ? AND role = ?',
            (debate_id, 'student'),
        ).fetchone()['count']
        if participant_count != 1:
            return jsonify({'error': 'This debate cannot accept another student.'}), 400
        if student_id == debate['created_by']:
            return jsonify({'error': 'The debate creator is already a participant.'}), 409
        creator = connection.execute(
            'SELECT position FROM debate_participants WHERE debate_id = ? AND student_id = ?',
            (debate_id, debate['created_by']),
        ).fetchone()
        position = 'against' if creator and creator['position'] == 'for' else 'for'
        connection.execute(
            'INSERT INTO debate_participants (debate_id, student_id, role, position, ready) VALUES (?, ?, ?, ?, ?)',
            (debate_id, student_id, 'student', position, 0),
        )
    return jsonify({'message': 'Joined debate successfully.', 'debate_id': debate_id, 'student_id': student_id})


@app.post('/api/debate/<int:debate_id>/ready')
def api_debate_ready(debate_id):
    payload = request.get_json(silent=True)
    payload = payload if isinstance(payload, dict) else {}
    student_id = payload.get('student_id')
    if not isinstance(student_id, str) or not student_id.strip() or len(student_id.strip()) > 80:
        return jsonify({'error': 'A valid student_id is required.'}), 400
    student_id = student_id.strip()
    with get_db_connection() as connection:
        debate = connection.execute('SELECT mode, status, current_round FROM debates WHERE id = ?', (debate_id,)).fetchone()
        if not debate:
            return jsonify({'error': 'Debate not found.'}), 404
        if debate['status'] == 'completed':
            return jsonify({'error': 'This debate is completed.'}), 409
        participant = connection.execute(
            "SELECT id FROM debate_participants WHERE debate_id = ? AND student_id = ? AND role = 'student'",
            (debate_id, student_id),
        ).fetchone()
        if not participant:
            return jsonify({'error': 'Only a registered debate participant can mark ready.'}), 403
        connection.execute(
            'UPDATE debate_participants SET ready = 1 WHERE debate_id = ? AND student_id = ?',
            (debate_id, student_id),
        )
        expected_count = 2 if debate['mode'] in ('student-vs-ai', 'student-vs-llm', 'student-vs-student') else 0
        ready_count = connection.execute(
            "SELECT COUNT(*) AS count FROM debate_participants WHERE debate_id = ? AND ready = 1 AND role IN ('student','ai')",
            (debate_id,),
        ).fetchone()['count']
        participant_count = connection.execute(
            "SELECT COUNT(*) AS count FROM debate_participants WHERE debate_id = ? AND role IN ('student','ai')",
            (debate_id,),
        ).fetchone()['count']
        started = participant_count == expected_count and ready_count == expected_count
        if started and debate['status'] == 'open':
            connection.execute("UPDATE debates SET status = 'in_progress', current_round = 1 WHERE id = ?", (debate_id,))
            connection.execute(
                "UPDATE debate_rounds SET status = 'active', started_at = CURRENT_TIMESTAMP WHERE debate_id = ? AND round_number = 1",
                (debate_id,),
            )
        elif debate['status'] == 'open':
            connection.execute(
                "UPDATE debate_rounds SET status = 'waiting_ready' WHERE debate_id = ? AND round_number = 1",
                (debate_id,),
            )
    return jsonify({
        'message': 'Debate started.' if started else 'You are ready. Waiting for the other participant.',
        'debate_id': debate_id,
        'status': 'in_progress' if started else 'open',
        'started': started,
    })


@app.post('/api/debate/<int:debate_id>/arguments')
@app.post('/api/debate/<int:debate_id>/rounds/<int:round_number>/arguments')
def api_debate_argument(debate_id, round_number=None):
    payload = request.get_json(silent=True)
    payload = payload if isinstance(payload, dict) else {}
    student_id = payload.get('student_id')
    argument = payload.get('argument')
    if not isinstance(student_id, str) or not student_id.strip() or len(student_id.strip()) > 80:
        return jsonify({'error': 'A valid student_id is required.'}), 400
    if not isinstance(argument, str) or not argument.strip() or len(argument.strip()) > 3000:
        return jsonify({'error': 'Argument must contain 1 to 3000 characters.'}), 400
    student_id = student_id.strip()
    argument = argument.strip()

    submitted_round = round_number if round_number is not None else payload.get('round_number')
    if submitted_round is not None:
        try:
            submitted_round = int(submitted_round)
        except (TypeError, ValueError):
            return jsonify({'error': 'round_number must be 1, 2, or 3.'}), 400
        if submitted_round not in (1, 2, 3):
            return jsonify({'error': 'round_number must be 1, 2, or 3.'}), 400
    current_round = submitted_round

    with get_db_connection() as connection:
        debate = connection.execute('SELECT * FROM debates WHERE id = ?', (debate_id,)).fetchone()
        if not debate:
            return jsonify({'error': 'Debate not found.'}), 404
        participant = connection.execute(
            "SELECT * FROM debate_participants WHERE debate_id = ? AND student_id = ? AND role = 'student'",
            (debate_id, student_id),
        ).fetchone()
        if not participant:
            return jsonify({'error': 'Only a registered debate participant can submit arguments.'}), 403
        if debate['status'] == 'completed':
            return jsonify({'error': 'This debate is completed.'}), 409
        if debate['status'] != 'in_progress' or (current_round and current_round != debate['current_round']):
            return jsonify({'error': 'Arguments are only accepted for the current round of an in-progress debate.'}), 409
        current_round = current_round or debate['current_round']
        round_row = connection.execute(
            'SELECT status FROM debate_rounds WHERE debate_id = ? AND round_number = ?',
            (debate_id, current_round),
        ).fetchone()
        if not round_row:
            return jsonify({'error': 'Round state was not initialized.'}), 500
        existing_submission = connection.execute(
            'SELECT id FROM debate_round_submissions WHERE debate_id = ? AND round_number = ? AND participant_id = ?',
            (debate_id, current_round, participant['id']),
        ).fetchone()
        if existing_submission:
            return jsonify({'error': 'You already submitted an argument for this round.'}), 409

        prior_argument_rows = connection.execute(
            'SELECT speaker, argument FROM debate_arguments WHERE debate_id = ? ORDER BY id',
            (debate_id,),
        ).fetchall()
        accepted_history = [
            {'sender': 'guru' if row['speaker'] == 'ai-opponent' else 'student', 'speaker': row['speaker'], 'text': row['argument']}
            for row in prior_argument_rows
        ]
        ai_mode = debate['mode'] in ('student-vs-ai', 'student-vs-llm')
        debate_provider = None
        if ai_mode:
            try:
                debate_provider = get_debate_provider(debate['mode'])
            except AIProviderError as error:
                return jsonify({
                    'error': str(error),
                    'category': error.category,
                    'argument_saved': False,
                    'round_number': current_round,
                    'round_status': round_row['status'],
                }), error.status_code
        try:
            argument_analysis = analyze_debate_argument(
                debate['topic'], argument, accepted_history, student_id, debate_provider, current_round)
        except AIProviderError as error:
            return jsonify({
                'error': str(error),
                'category': error.category,
                'argument_saved': False,
                'round_number': current_round,
                'round_status': round_row['status'],
            }), error.status_code
        if not argument_analysis.get('accepted'):
            return jsonify({
                'error': argument_analysis['reason'],
                'category': 'invalid_argument',
                'argument_saved': False,
                'round_number': current_round,
                'round_status': round_row['status'],
                'analysis': argument_analysis,
            }), 422

        should_judge = False
        if ai_mode:
            if round_row['status'] != 'active':
                return jsonify({'error': 'The current AI round is already processing or complete.'}), 409
            # Use the long-standing `judging` status as the atomic processing
            # claim. Older production databases predate the optional
            # `generating_ai` CHECK value, so using it here causes a 500 before
            # the argument can be saved. `judging` is already part of the
            # persisted round-state contract and is safe across both schemas.
            claim = connection.execute(
                "UPDATE debate_rounds SET status = 'judging' WHERE debate_id = ? AND round_number = ? AND status = 'active'",
                (debate_id, current_round),
            )
            if claim.rowcount != 1:
                return jsonify({'error': 'The round is already processing.'}), 409
            ai_participant = connection.execute(
                "SELECT * FROM debate_participants WHERE debate_id = ? AND role = 'ai'",
                (debate_id,),
            ).fetchone()
            if not ai_participant:
                connection.execute(
                    "UPDATE debate_rounds SET status = 'active' WHERE debate_id = ? AND round_number = ?",
                    (debate_id, current_round),
                )
                return jsonify({'error': 'This AI debate has no configured AI opponent participant.'}), 500
            prior_rows = connection.execute(
                """
                SELECT s.round_number, s.argument, p.student_id, p.role
                FROM debate_round_submissions AS s JOIN debate_participants AS p ON p.id = s.participant_id
                WHERE s.debate_id = ? AND s.round_number < ? ORDER BY s.round_number, p.id
                """,
                (debate_id, current_round),
            ).fetchall()
            opponent_history = [
                {'sender': 'guru' if row['role'] == 'ai' else 'student', 'text': row['argument']}
                for row in prior_rows
            ]
            prior_judge_history = [
                {'round': row['round_number'], 'speaker': 'Dataset Computer Opponent' if row['role'] == 'ai' else row['student_id'], 'argument': row['argument']}
                for row in prior_rows
            ]
            participant_pair = [participant, ai_participant]
        else:
            if round_row['status'] not in ('active', 'awaiting_opponent'):
                return jsonify({'error': 'The current round is not accepting submissions.'}), 409
            connection.execute(
                'INSERT INTO debate_round_submissions (debate_id, round_number, participant_id, argument) VALUES (?, ?, ?, ?)',
                (debate_id, current_round, participant['id'], argument),
            )
            connection.execute(
                'INSERT INTO debate_arguments (debate_id, speaker, argument, round_number) VALUES (?, ?, ?, ?)',
                (debate_id, student_id, argument, current_round),
            )
            count = connection.execute(
                'SELECT COUNT(*) AS count FROM debate_round_submissions WHERE debate_id = ? AND round_number = ?',
                (debate_id, current_round),
            ).fetchone()['count']
            if count == 2:
                connection.execute(
                    "UPDATE debate_rounds SET status = 'awaiting_judge' WHERE debate_id = ? AND round_number = ?",
                    (debate_id, current_round),
                )
                should_judge = True
            else:
                connection.execute(
                    "UPDATE debate_rounds SET status = 'awaiting_opponent' WHERE debate_id = ? AND round_number = ?",
                    (debate_id, current_round),
                )

    if not ai_mode:
        if not should_judge:
            return jsonify({
                'message': 'Argument saved; waiting for the other participant.',
                'debate_id': debate_id,
                'round_number': current_round,
                'round_status': 'awaiting_opponent',
                'argument_analysis': argument_analysis,
            }), 201
        return _evaluate_pending_debate_round(debate_id, current_round, student_id)

    ai_position = ai_participant['position']
    debate_history = [
        {'sender': 'guru' if row['role'] == 'ai' else 'student', 'text': row['argument']}
        for row in prior_rows
    ]
    try:
        ai_argument = debate_provider.generate_opponent_argument(
            debate, ai_position, current_round, argument, debate_history + [
                {'sender': 'student', 'text': argument},
            ])
        judge_arguments = [
            {'participant_key': 'A', 'position': participant['position'], 'argument': argument},
            {'participant_key': 'B', 'position': ai_position, 'argument': ai_argument},
        ]
        judgement = judge_debate_round(debate['topic'], current_round, judge_arguments, prior_judge_history, debate['age_group'])
        judgement = append_optional_llm_feedback(judgement, debate, judge_arguments, prior_judge_history)
    except AIProviderError as error:
        with get_db_connection() as connection:
            connection.execute(
                "UPDATE debate_rounds SET status = 'active' WHERE debate_id = ? AND round_number = ? AND status = 'judging'",
                (debate_id, current_round),
            )
        return jsonify({
            'error': str(error),
            'category': error.category,
            'round_number': current_round,
            'round_status': 'active',
            'argument_saved': False,
            'message': 'The knowledge base could not support this round. Your argument was not saved; retry safely.',
        }), error.status_code

    with get_db_connection() as connection:
        state = connection.execute(
            'SELECT status FROM debate_rounds WHERE debate_id = ? AND round_number = ?',
            (debate_id, current_round),
        ).fetchone()
        if not state or state['status'] != 'judging':
            return jsonify({'error': 'Round state changed while the opponent was responding.'}), 409
        connection.execute(
            'INSERT INTO debate_round_submissions (debate_id, round_number, participant_id, argument) VALUES (?, ?, ?, ?)',
            (debate_id, current_round, participant['id'], argument),
        )
        connection.execute(
            'INSERT INTO debate_round_submissions (debate_id, round_number, participant_id, argument) VALUES (?, ?, ?, ?)',
            (debate_id, current_round, ai_participant['id'], ai_argument),
        )
        connection.execute(
            'INSERT INTO debate_arguments (debate_id, speaker, argument, round_number) VALUES (?, ?, ?, ?)',
            (debate_id, student_id, argument, current_round),
        )
        connection.execute(
            'INSERT INTO debate_arguments (debate_id, speaker, argument, round_number) VALUES (?, ?, ?, ?)',
            (debate_id, 'ai-opponent', ai_argument, current_round),
        )
        connection.execute(
            "UPDATE debate_rounds SET status = 'judging' WHERE debate_id = ? AND round_number = ?",
            (debate_id, current_round),
        )
        current_debate = connection.execute('SELECT * FROM debates WHERE id = ?', (debate_id,)).fetchone()
        result = _persist_judged_round(connection, current_debate, current_round, participant_pair, judgement)
        result['ai_response'] = ai_argument
        result['ai_participant'] = 'Dataset Computer Opponent' if debate['mode'] == 'student-vs-ai' else 'LLM Debate Opponent'
        result['provider'] = debate_provider.name
        result['argument_analysis'] = argument_analysis
    return jsonify(result), 201


@app.post('/api/debate/<int:debate_id>/rounds/<int:round_number>/evaluate')
def api_debate_round_evaluate(debate_id, round_number):
    payload = request.get_json(silent=True)
    payload = payload if isinstance(payload, dict) else {}
    student_id = payload.get('student_id')
    if not isinstance(student_id, str) or not student_id.strip() or len(student_id.strip()) > 80:
        return jsonify({'error': 'A valid student_id is required.'}), 400
    return _evaluate_pending_debate_round(debate_id, round_number, student_id.strip())


@app.get('/api/debate/<int:debate_id>')
def api_debate_detail(debate_id):
    with get_db_connection() as connection:
        debate = connection.execute(
            'SELECT * FROM debates WHERE id = ?',
            (debate_id,),
        ).fetchone()
        if not debate:
            return jsonify({'error': 'Debate not found.'}), 404
        participants = connection.execute(
            'SELECT student_id, role, position FROM debate_participants WHERE debate_id = ? ORDER BY id ASC',
            (debate_id,),
        ).fetchall()
        arguments = connection.execute(
            'SELECT speaker, argument, round_number, created_at FROM debate_arguments WHERE debate_id = ? ORDER BY id ASC',
            (debate_id,),
        ).fetchall()
        rounds = connection.execute(
            'SELECT round_number, status, judge_summary, started_at, completed_at FROM debate_rounds WHERE debate_id = ? ORDER BY round_number',
            (debate_id,),
        ).fetchall()
        scores = connection.execute(
            """
            SELECT s.round_number, p.student_id AS participant_id, p.role, p.position,
                   s.relevance, s.reasoning, s.evidence, s.clarity, s.rebuttal, s.respect,
                   s.total, s.explanation, s.strengths, s.improvements
            FROM debate_round_scores AS s
            JOIN debate_participants AS p ON p.id = s.participant_id
            WHERE s.debate_id = ? ORDER BY s.round_number, p.id
            """,
            (debate_id,),
        ).fetchall()
    return jsonify({
        'debate': dict(debate),
        'participants': [dict(row) for row in participants],
        'arguments': [dict(row) for row in arguments],
        'rounds': [dict(row) for row in rounds],
        'scores': [
            {**dict(row), 'strengths': json.loads(row['strengths']), 'improvements': json.loads(row['improvements'])}
            for row in scores
        ],
    })


@app.post('/api/debate/<int:debate_id>/complete')
def api_debate_complete(debate_id):
    payload = request.get_json(silent=True)
    payload = payload if isinstance(payload, dict) else {}
    student_id = payload.get('student_id')
    if not isinstance(student_id, str) or not student_id.strip() or len(student_id.strip()) > 80:
        return jsonify({'error': 'A valid student_id is required.'}), 400
    with get_db_connection() as connection:
        debate = connection.execute('SELECT created_by, status FROM debates WHERE id = ?', (debate_id,)).fetchone()
        if not debate:
            return jsonify({'error': 'Debate not found.'}), 404
        if debate['created_by'] != student_id.strip():
            return jsonify({'error': 'Only the debate creator can complete this debate.'}), 403
        if debate['status'] == 'completed':
            return jsonify({'error': 'This debate is already completed.'}), 400
        return jsonify({'error': 'Complete all three debate rounds before finishing.'}), 409


if __name__ == '__main__':
    init_db()
    app.run(host='127.0.0.1', port=5000, debug=os.environ.get('FLASK_DEBUG') == '1')


