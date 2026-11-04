"""Deterministic, database-backed Learning Intelligence analysis.

This module deliberately contains no Flask or external-AI code. It turns
question-level results and learning activity rows into explainable metrics,
recommendations, revision items, and adaptive quiz settings.
"""
from collections import defaultdict
from datetime import datetime

MIN_TOPIC_QUESTIONS = 2
STRONG_ACCURACY = 80.0
WEAK_ACCURACY = 60.0

TOPIC_LABELS = {
    'Sages and Rishis': 'Sages and Ancient Wisdom',
}


def canonical_topic(topic):
    """Return the display topic without changing the stored source category."""
    return TOPIC_LABELS.get(topic, topic or 'Other')


def _number(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _timestamp(value):
    if not value:
        return datetime.min
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00')).replace(tzinfo=None)
    except ValueError:
        return datetime.min


def _classification(accuracy, attempted):
    if attempted < MIN_TOPIC_QUESTIONS:
        return 'insufficient-data'
    if accuracy >= STRONG_ACCURACY:
        return 'strong'
    if accuracy < WEAK_ACCURACY:
        return 'weak'
    return 'average'


def calculate_topic_performance(question_rows):
    """Calculate topic accuracy from actual question-level result rows.

    A topic is strong or weak only after at least two answered questions. A
    trend is reported only when at least two distinct quiz attempts exist.
    """
    grouped = defaultdict(list)
    for row in question_rows:
        grouped[canonical_topic(row.get('topic'))].append(row)

    analysis = {}
    for topic, rows in sorted(grouped.items()):
        rows = sorted(rows, key=lambda item: (_timestamp(item.get('created_at')), item.get('id', 0)))
        attempted = len(rows)
        correct = sum(1 for row in rows if row.get('correct'))
        incorrect = attempted - correct
        accuracy = round(100.0 * correct / attempted, 1) if attempted else None
        attempts = {row.get('learning_record_id') for row in rows if row.get('learning_record_id')}
        attempt_count = len(attempts) or (1 if rows else 0)

        attempt_scores = []
        for attempt_id in attempts:
            attempt_rows = [row for row in rows if row.get('learning_record_id') == attempt_id]
            if attempt_rows:
                attempt_scores.append(sum(bool(row.get('correct')) for row in attempt_rows) * 100.0 / len(attempt_rows))
        trend = 'not-enough-history'
        previous_accuracy = None
        recent_accuracy = accuracy
        if len(attempt_scores) >= 2:
            midpoint = max(1, len(attempt_scores) // 2)
            previous_accuracy = round(sum(attempt_scores[:midpoint]) / len(attempt_scores[:midpoint]), 1)
            recent_accuracy = round(sum(attempt_scores[midpoint:]) / len(attempt_scores[midpoint:]), 1)
            difference = recent_accuracy - previous_accuracy
            trend = 'improving' if difference >= 5 else 'declining' if difference <= -5 else 'stable'

        concepts = sorted({str(row.get('focus_area') or row.get('title') or '').strip()
                           for row in rows if row.get('focus_area') or row.get('title')})[:5]
        analysis[topic] = {
            'topic': topic,
            'questions_attempted': attempted,
            'correct_answers': correct,
            'incorrect_answers': incorrect,
            'accuracy': accuracy,
            'attempts': attempt_count,
            'classification': _classification(accuracy or 0.0, attempted),
            'trend': trend,
            'previous_accuracy': previous_accuracy,
            'recent_accuracy': recent_accuracy,
            'related_concepts': concepts,
            'record_ids': sorted({row.get('record_id') for row in rows if row.get('record_id')}),
        }
    return analysis


def calculate_progress(learning_records, question_rows):
    """Calculate dashboard totals using saved learning and question records."""
    quiz_ids = {row.get('learning_record_id') for row in question_rows if row.get('learning_record_id')}
    quiz_records = [row for row in learning_records if row.get('activity_type') == 'quiz']
    quizzes_attempted = len(quiz_ids) or len(quiz_records)
    lessons_completed = sum(
        1 for row in learning_records
        if row.get('activity_type') in ('lesson', 'chapter') and row.get('status') == 'completed'
    )
    answered = len(question_rows)
    correct = sum(1 for row in question_rows if row.get('correct'))
    if answered:
        average_score = round(correct * 100.0 / answered, 1)
    else:
        scores = [_number(row.get('score')) for row in quiz_records if row.get('score') is not None]
        average_score = round(sum(scores) / len(scores), 1) if scores else None

    dates = sorted({_timestamp(row.get('created_at')).date() for row in learning_records + question_rows
                    if _timestamp(row.get('created_at')) != datetime.min}, reverse=True)
    streak = 0
    if dates:
        streak = 1
        for previous, current in zip(dates, dates[1:]):
            if (previous - current).days != 1:
                break
            streak += 1
    return {
        'lessons_completed': lessons_completed,
        'quizzes_attempted': quizzes_attempted,
        'questions_attempted': answered,
        'average_quiz_score': average_score,
        'learning_streak_days': streak if dates else None,
        'activity_count': len(learning_records),
    }


def determine_adaptive_difficulty(question_rows):
    """Choose easy/medium/hard from the student's three latest quiz attempts."""
    attempts = defaultdict(list)
    for row in question_rows:
        attempts[row.get('learning_record_id')].append(row)
    ordered = sorted(
        attempts.values(),
        key=lambda rows: max((_timestamp(row.get('created_at')) for row in rows), default=datetime.min),
        reverse=True,
    )[:3]
    if not ordered:
        return 'medium'
    scores = [sum(bool(row.get('correct')) for row in rows) * 100.0 / len(rows) for rows in ordered if rows]
    recent_score = sum(scores) / len(scores)
    if recent_score >= 80:
        return 'hard'
    if recent_score < 60:
        return 'easy'
    return 'medium'


def _eligible_records(dataset, age_group):
    return [record for record in dataset.records
            if not age_group or age_group in record.age_group]


def _lesson_for_topic(dataset, topic, age_group):
    records = [record for record in _eligible_records(dataset, age_group)
               if canonical_topic(record.category) == topic]
    return records[0] if records else None


def generate_recommendations(topic_stats, dataset, age_group=None):
    """Generate actions whose lesson/record IDs exist in the local dataset."""
    recommendations = []
    weak = [item for item in topic_stats.values() if item['classification'] == 'weak']
    weak.sort(key=lambda item: (item['accuracy'], -item['questions_attempted']))
    for item in weak[:3]:
        record = _lesson_for_topic(dataset, item['topic'], age_group)
        if not record:
            continue
        recommendations.append({
            'type': 'revision',
            'title': f'Revise {record.title}',
            'topic': item['topic'],
            'record_id': record.id,
            'action': 'lesson',
            'reason': f'{item["topic"]} accuracy is {item["accuracy"]}% across {item["questions_attempted"]} questions. Review this lesson, then attempt a practice quiz.',
        })
        recommendations.append({
            'type': 'practice-quiz',
            'title': f'Practice {item["topic"]}',
            'topic': item['topic'],
            'record_id': record.id,
            'action': 'quiz',
            'reason': 'A focused quiz will check whether the revised concepts are becoming more reliable.',
        })
    if not recommendations:
        strong = [item for item in topic_stats.values() if item['classification'] == 'strong']
        strong.sort(key=lambda item: item['accuracy'], reverse=True)
        if strong:
            record = _lesson_for_topic(dataset, strong[0]['topic'], age_group)
            if record:
                recommendations.append({
                    'type': 'extension',
                    'title': f'Extend {record.title}',
                    'topic': strong[0]['topic'],
                    'record_id': record.id,
                    'action': 'lesson',
                    'reason': f'{strong[0]["topic"]} is a current strength at {strong[0]["accuracy"]}%. Explore a related record at the next difficulty level.',
                })
    return recommendations[:5]


def build_revision_plan(question_rows, dataset, age_group=None, limit=8):
    """Return actual previously incorrect questions, prioritising repetition."""
    incorrect = [row for row in question_rows if not row.get('correct')]
    counts = defaultdict(int)
    for row in incorrect:
        counts[row.get('record_id')] += 1
    incorrect.sort(key=lambda row: (-counts[row.get('record_id')], _timestamp(row.get('created_at'))))
    plan = []
    seen = set()
    for row in incorrect:
        key = (row.get('record_id'), row.get('question'))
        if key in seen:
            continue
        seen.add(key)
        record = dataset.by_id(row.get('record_id'))
        if not record or (age_group and age_group not in record.age_group):
            continue
        plan.append({
            'record_id': record.id,
            'title': record.title,
            'topic': canonical_topic(record.category),
            'question': row.get('question'),
            'incorrect_count': counts[row.get('record_id')],
            'suggestion': f'Revisit {record.title}, then retry this question.',
        })
        if len(plan) >= limit:
            break
    return plan


def analyze_learning(learning_records, question_rows, dataset, age_group=None):
    topic_stats = calculate_topic_performance(question_rows)
    progress = calculate_progress(learning_records, question_rows)
    reliable = [item for item in topic_stats.values() if item['classification'] in ('strong', 'average', 'weak')]
    strongest = max((item for item in reliable if item['classification'] == 'strong'),
                    key=lambda item: item['accuracy'], default=None)
    weakest = min((item for item in reliable if item['classification'] == 'weak'),
                  key=lambda item: item['accuracy'], default=None)
    return {
        'progress': progress,
        'topic_performance': topic_stats,
        'strongest_topic': strongest,
        'weakest_topic': weakest,
        'adaptive_difficulty': determine_adaptive_difficulty(question_rows),
        'recommendations': generate_recommendations(topic_stats, dataset, age_group),
        'revision_plan': build_revision_plan(question_rows, dataset, age_group),
    }
