import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app
from dataset_service import Dataset, DatasetError, get_dataset


BASE_DIR = Path(__file__).resolve().parents[1]
DATASET_PATH = BASE_DIR / 'data' / 'mythology_dataset.json'


class IsolatedAppTest(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory()
        self.previous_database = app.app.config.get('DATABASE')
        app.app.config.update(TESTING=True, DATABASE=str(Path(self.temp_directory.name) / 'test.db'))
        app.init_db()
        self.client = app.app.test_client()

    def tearDown(self):
        app.app.config['DATABASE'] = self.previous_database
        self.temp_directory.cleanup()


class DatasetServiceTest(unittest.TestCase):
    def test_dataset_loads_with_valid_schema_and_sources(self):
        dataset = Dataset.load(DATASET_PATH)
        self.assertEqual(len(dataset.records), 102)
        self.assertEqual(dataset.invalid_records, [])
        self.assertEqual(len(dataset.all_categories()), 20)
        self.assertTrue(all(record.source_name and record.source_reference for record in dataset.records))
        report = dataset.validation_report()
        self.assertEqual(report['record_count'], 102)
        self.assertEqual(report['invalid_records'], [])
        self.assertEqual(report['duplicate_ids'], [])

    def test_missing_and_malformed_dataset_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / 'missing.json'
            with self.assertRaises(DatasetError):
                Dataset.load(missing)

            malformed = Path(directory) / 'malformed.json'
            malformed.write_text('{not valid json', encoding='utf-8')
            with self.assertRaises(DatasetError):
                Dataset.load(malformed)

            wrong_root = Path(directory) / 'wrong-root.json'
            wrong_root.write_text(json.dumps({'records': []}), encoding='utf-8')
            with self.assertRaises(DatasetError):
                Dataset.load(wrong_root)

    def test_retrieval_rejects_unrelated_queries_and_has_sources(self):
        dataset = Dataset.load(DATASET_PATH)
        for question in (
            'Who is Ram?',
            'Who is Lord Rama?',
            'Tell me about Shri Ram.',
            'Who is Rama in Ramayana?',
            'What are the qualities of Lord Rama?',
        ):
            with self.subTest(question=question):
                results = dataset.search(question)
                self.assertTrue(results)
                self.assertEqual(results[0][1].id, 'gods-006')
                self.assertTrue(results[0][1].source_name)
                self.assertTrue(results[0][1].source_reference)
        krishna_results = dataset.search('Why did Krishna guide Arjuna?')
        self.assertTrue(krishna_results)
        self.assertEqual(krishna_results[0][1].id, 'mah-005')
        self.assertEqual(dataset.search('How do I file an income tax return?'), [])
        self.assertEqual(dataset.search('What is the capital of France?'), [])

    def test_retrieval_filters_by_age_group(self):
        dataset = Dataset.load(DATASET_PATH)
        results = dataset.search('Why did Krishna guide Arjuna?', age_group='6-8')
        self.assertTrue(results)
        self.assertTrue(all('6-8' in record.age_group for _, record in results))

    def test_indirect_relationship_location_and_event_questions(self):
        dataset = Dataset.load(DATASET_PATH)
        expected = {
            "Who was sitting on Arjuna's chariot?": 'mah-005',
            "Where was Lord Krishna born?": 'krishna-001',
            "Where did Krishna spend his childhood?": 'krishna-001',
            "Who were Krishna's parents?": 'krishna-001',
            "Who taught Arjuna archery?": 'mah-006',
            "Who was Karna's father?": 'mah-007',
            "Who killed Dronacharya?": 'mah-006',
            "Who built the bridge to Lanka?": 'ram-006',
            "What happened when Arjuna refused to fight?": 'gita-ch-01',
            "What is the relationship between Krishna and Arjuna?": 'mah-005',
        }
        for question, record_id in expected.items():
            with self.subTest(question=question):
                results = dataset.search(question, limit=3)
                self.assertTrue(results)
                self.assertEqual(results[0][1].id, record_id)
                self.assertTrue(results[0][1].source_reference)

    def test_expanded_mythology_questions_use_curated_records(self):
        dataset = Dataset.load(DATASET_PATH)
        expected = {
            'Where was the Mahabharata fought?': 'mah-008',
            'Who wrote the Ramayana?': 'sages-003',
            'Where did Lord Krishna live?': 'place-002',
            'What is the difference between Ramayana and Mahabharata?': 'texts-003',
            'What are examples of ancient Indian knowledge?': 'science-006',
        }
        for question, record_id in expected.items():
            with self.subTest(question=question):
                results = dataset.search(question, limit=3)
                self.assertTrue(results)
                self.assertEqual(results[0][1].id, record_id)
                self.assertTrue(results[0][1].source_name)
                self.assertTrue(results[0][1].source_reference)

    def test_all_gita_chapters_and_verified_verse_lookup(self):
        dataset = Dataset.load(DATASET_PATH)
        for chapter in range(1, 19):
            with self.subTest(chapter=chapter):
                results = dataset.search(f'Explain Bhagavad Gita Chapter {chapter}', limit=1)
                self.assertEqual(results[0][1].id, f'gita-ch-{chapter:02d}')
                self.assertEqual(results[0][1].raw['chapter_number'], chapter)
                self.assertGreater(results[0][1].raw['shloka_count'], 0)
        verse = dataset.search('What is the meaning of Bhagavad Gita 2.47?', limit=1)
        self.assertEqual(verse[0][1].id, 'gita-v-02-47')
        self.assertIn('sanskrit_text', verse[0][1].raw)
        self.assertIn('plain_english_meaning', verse[0][1].raw)

    def test_quiz_uses_dataset_questions_and_canonical_answers(self):
        dataset = Dataset.load(DATASET_PATH)
        quiz = dataset.build_quiz('student-a', age_group='9-12', count=5)
        self.assertEqual(len(quiz), 5)
        records = {record.id: record for record in dataset.records}
        for item in quiz:
            self.assertIn(item['question'], records[item['record_id']].questions)
            self.assertIn(item['answer'], records[item['record_id']].questions)
            self.assertIn(item['answer'], item['options'])


class MentorRouteTest(IsolatedAppTest):
    def test_home_and_mentor_have_distinct_page_layouts(self):
        home = self.client.get('/')
        mentor = self.client.get('/ai-mentor')
        self.assertEqual(home.status_code, 200)
        self.assertEqual(mentor.status_code, 200)
        home_html = home.get_data(as_text=True)
        mentor_html = mentor.get_data(as_text=True)
        self.assertIn('home-page', home_html)
        self.assertIn('home-hero', home_html)
        self.assertIn('home-module-card', home_html)
        self.assertIn('home-featured-section', home_html)
        self.assertIn('home.css', home_html)
        self.assertNotIn('mentor-question', home_html)
        self.assertNotIn('chat-log', home_html)
        self.assertNotIn('mentor-composer', home_html)
        self.assertIn('mentor-page', mentor_html)
        self.assertIn('mentor-question', mentor_html)
        self.assertIn('chat-log', mentor_html)
        self.assertIn('mentor.css', mentor_html)
        self.assertIn('mentor-context-panel', mentor_html)
        self.assertIn('mentor-composer', mentor_html)
        self.assertNotIn('home-hero', mentor_html)
        self.assertNotIn('home-featured-section', mentor_html)
        self.assertNotIn('home-module-grid', mentor_html)

    def test_pages_render_and_mentor_works_without_external_credentials(self):
        for path in ('/', '/ai-mentor', '/learning-intelligence', '/debate-room'):
            response = self.client.get(path)
            self.assertIn(response.status_code, (200, 302))
        with patch.dict(os.environ, {}, clear=False):
            response = self.client.post('/api/mentor/chat', json={
                'student_id': 'mentor-student',
                'age_group': '9-12',
                'message': 'Why did Krishna guide Arjuna?',
            })
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body['provider'], 'local_dataset')
        self.assertEqual(body['model'], 'mythology-dataset-v1')
        self.assertTrue(body['references'])
        self.assertIn('Source:', body['answer'])
        self.assertEqual(body['references'][0]['record_id'], 'mah-005')
        history = self.client.get('/api/mentor/conversations?student_id=mentor-student').get_json()
        saved_metadata = json.loads(history['conversations'][0]['messages'][1]['metadata'])
        self.assertTrue(saved_metadata['references'])

    def test_mentor_answers_ram_aliases_from_dataset(self):
        questions = (
            'Who is Ram?',
            'Who is Lord Rama?',
            'Tell me about Shri Ram.',
            'Who is Rama in Ramayana?',
            'What are the qualities of Lord Rama?',
        )
        for question in questions:
            with self.subTest(question=question), patch.dict(os.environ, {}, clear=False):
                response = self.client.post('/api/mentor/chat', json={
                    'student_id': 'ram-alias-student',
                    'age_group': '13-15',
                    'message': question,
                })
            self.assertEqual(response.status_code, 200)
            body = response.get_json()
            self.assertEqual(body['provider'], 'local_dataset')
            self.assertTrue(body['references'])
            self.assertEqual(body['references'][0]['record_id'], 'gods-006')
            self.assertIn('rama', body['answer'].lower())

    def test_mentor_answers_indirect_questions_and_gita_verse(self):
        questions = {
            "Who was sitting on Arjuna's chariot?": ('mah-005', 'Krishna'),
            "Where was Lord Krishna born?": ('krishna-001', 'Mathura'),
            "Who taught Arjuna archery?": ('mah-006', 'Drona'),
            "Who was Karna's father?": ('mah-007', 'Surya'),
            "Who built the bridge to Lanka?": ('ram-006', 'Nala'),
            "What is the meaning of Bhagavad Gita 2.47?": ('gita-v-02-47', 'Sanskrit text:'),
        }
        for question, (record_id, expected_text) in questions.items():
            with self.subTest(question=question):
                response = self.client.post('/api/mentor/chat', json={
                    'student_id': 'expanded-mentor-student',
                    'age_group': '13-15',
                    'message': question,
                })
            self.assertEqual(response.status_code, 200)
            body = response.get_json()
            self.assertEqual(body['references'][0]['record_id'], record_id)
            self.assertIn(expected_text.lower(), body['answer'].lower())

    def test_mentor_uses_previous_question_for_follow_up_context(self):
        first = self.client.post('/api/mentor/chat', json={
            'student_id': 'follow-up-student',
            'age_group': '13-15',
            'message': 'Where was Lord Krishna born?',
        }).get_json()
        second = self.client.post('/api/mentor/chat', json={
            'student_id': 'follow-up-student',
            'conversation_id': first['conversation_id'],
            'age_group': '13-15',
            'message': 'What about his parents?',
        })
        self.assertEqual(second.status_code, 200)
        body = second.get_json()
        self.assertEqual(body['references'][0]['record_id'], 'krishna-001')
        self.assertIn('Devaki', body['answer'])

    def test_mentor_returns_honest_out_of_scope_answer_and_saves_history(self):
        payload = {'student_id': 'out-of-scope', 'message': 'How do I file an income tax return?'}
        response = self.client.post('/api/mentor/chat', json=payload)
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body['references'], [])
        self.assertIn('could not find reliable information', body['answer'].lower())

        history = self.client.get('/api/mentor/conversations?student_id=out-of-scope').get_json()
        self.assertEqual(len(history['conversations']), 1)
        self.assertEqual(len(history['conversations'][0]['messages']), 2)
        self.assertEqual(history['conversations'][0]['messages'][0]['sender'], 'student')
        self.assertEqual(history['conversations'][0]['messages'][1]['sender'], 'guru')

    def test_mentor_does_not_use_external_provider_symbols(self):
        source = (BASE_DIR / 'app.py').read_text(encoding='utf-8')
        forbidden = ('google' + '.genai', 'genai' + '.Client', 'generate_' + 'gemini_content')
        self.assertTrue(all(symbol not in source for symbol in forbidden))


class LearningRouteTest(IsolatedAppTest):
    def test_personalized_learning_empty_state_and_question_level_analysis(self):
        empty = self.client.get('/api/learning/summary?student_id=new-learner').get_json()
        self.assertEqual(empty['status'], 'no-data')
        self.assertEqual(empty['progress']['lessons_completed'], 0)
        self.assertEqual(empty['progress']['quizzes_attempted'], 0)
        self.assertEqual(empty['recommendations'], [])

        quiz = self.client.get('/api/learning/quiz?student_id=new-learner&age_group=13-15&count=2').get_json()
        self.assertEqual(quiz['difficulty'], 'medium')
        self.assertTrue(all('answer' not in item for item in quiz['quiz']))

        dataset = Dataset.load(DATASET_PATH)
        mah = dataset.by_id('mah-004')
        rama = dataset.by_id('ram-001')
        for _ in range(2):
            wrong = self.client.post('/api/learning/quiz/submit', json={
                'student_id': 'new-learner',
                'age_group': '13-15',
                'answers': [{'record_id': mah.id, 'answer': 'client claims this is correct', 'correct': True}],
            })
            self.assertEqual(wrong.status_code, 200)
            self.assertEqual(wrong.get_json()['correct_count'], 0)
        for _ in range(2):
            correct = self.client.post('/api/learning/quiz/submit', json={
                'student_id': 'new-learner',
                'age_group': '13-15',
                'answers': [{'record_id': rama.id, 'answer': rama.questions[0], 'correct': False}],
            })
            self.assertEqual(correct.status_code, 200)
            self.assertEqual(correct.get_json()['correct_count'], 1)

        summary = self.client.get('/api/learning/summary?student_id=new-learner&age_group=13-15').get_json()
        self.assertEqual(summary['progress']['quizzes_attempted'], 4)
        self.assertEqual(summary['progress']['questions_attempted'], 4)
        self.assertEqual(summary['progress']['lessons_completed'], 0)
        self.assertEqual(summary['topic_performance']['Mahabharata']['classification'], 'weak')
        self.assertEqual(summary['topic_performance']['Mahabharata']['incorrect_answers'], 2)
        self.assertEqual(summary['topic_performance']['Ramayana']['classification'], 'strong')
        self.assertEqual(summary['weakest_topic']['topic'], 'Mahabharata')
        self.assertEqual(summary['strongest_topic']['topic'], 'Ramayana')
        self.assertTrue(summary['revision_plan'])
        self.assertTrue(any(item['record_id'] == mah.id for item in summary['revision_plan']))
        recommendation_ids = {item.get('record_id') for item in summary['recommendations']}
        self.assertTrue(any(dataset.by_id(record_id).category == 'Mahabharata' for record_id in recommendation_ids if record_id))

        other = self.client.get('/api/learning/summary?student_id=other-learner').get_json()
        self.assertEqual(other['status'], 'no-data')

    def test_adaptive_difficulty_uses_recent_question_results_and_age_filter(self):
        dataset = Dataset.load(DATASET_PATH)
        mah = dataset.by_id('mah-004')
        for _ in range(2):
            self.client.post('/api/learning/quiz/submit', json={
                'student_id': 'adaptive-learner',
                'age_group': '6-8',
                'answers': [{'record_id': mah.id, 'answer': 'wrong'}],
            })
        easy_quiz = self.client.get('/api/learning/quiz?student_id=adaptive-learner&age_group=6-8&count=2').get_json()
        self.assertEqual(easy_quiz['difficulty'], 'easy')
        self.assertTrue(all('6-8' in dataset.by_id(item['record_id']).age_group for item in easy_quiz['quiz']))

        rama = dataset.by_id('ram-001')
        for _ in range(3):
            self.client.post('/api/learning/quiz/submit', json={
                'student_id': 'adaptive-learner',
                'age_group': '13-15',
                'answers': [{'record_id': rama.id, 'answer': rama.questions[0]}],
            })
        hard_quiz = self.client.get('/api/learning/quiz?student_id=adaptive-learner&age_group=13-15&count=2').get_json()
        self.assertEqual(hard_quiz['difficulty'], 'hard')

    def test_quiz_questions_are_dataset_records_and_answers_are_server_graded(self):
        response = self.client.get('/api/learning/quiz?student_id=quiz-student&age_group=9-12&count=3')
        self.assertEqual(response.status_code, 200)
        quiz = response.get_json()['quiz']
        self.assertEqual(len(quiz), 3)
        self.assertTrue(all('answer' not in item for item in quiz))

        first = quiz[0]
        submission = self.client.post('/api/learning/quiz/submit', json={
            'student_id': 'quiz-student',
            'answers': [{
                'record_id': first['record_id'],
                'answer': 'incorrect client answer',
                'correct': True,
            }],
        })
        self.assertEqual(submission.status_code, 200)
        body = submission.get_json()
        self.assertEqual(body['correct_count'], 0)
        self.assertFalse(body['graded'][0]['correct'])

        correct = Dataset.load(DATASET_PATH).by_id(first['record_id']).questions[0]
        submission = self.client.post('/api/learning/quiz/submit', json={
            'student_id': 'quiz-student',
            'answers': [{'record_id': first['record_id'], 'answer': correct, 'correct': False}],
        })
        self.assertEqual(submission.get_json()['correct_count'], 1)

    def test_learning_records_summary_recommendations_and_empty_state_use_database(self):
        empty = self.client.get('/api/learning/summary?student_id=no-history').get_json()
        self.assertEqual(empty['status'], 'no-data')
        self.assertEqual(empty['progress']['completed_topics'], 0)
        self.assertEqual(empty['recommendations'], [])

        for record in (
            {'topic': 'Bhagavad Gita', 'score': 90, 'status': 'completed', 'activity_type': 'quiz'},
            {'topic': 'Dharma', 'score': 40, 'status': 'in_progress', 'focus_area': 'Duty'},
        ):
            response = self.client.post('/api/learning/records', json={
                'student_id': 'saved-student', **record,
            })
            self.assertEqual(response.status_code, 201)

        summary = self.client.get('/api/learning/summary?student_id=saved-student').get_json()
        self.assertEqual(summary['progress']['completed_topics'], 1)
        self.assertEqual(summary['progress']['in_progress'], 1)
        self.assertEqual(summary['progress']['total_topics'], 2)
        self.assertEqual(summary['progress']['average_score'], 65.0)
        self.assertEqual(summary['improvement_areas'], [{'topic': 'Dharma', 'score': 40.0}])
        self.assertEqual(summary['recommendations'][0]['title'], 'Revisit Dharma')


class DebateRouteTest(IsolatedAppTest):
    def test_debate_room_renders_sabha_entry_and_live_workspace_hooks(self):
        response = self.client.get('/debate-room')
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        for marker in ('debate-sabha-page', 'debate-topic-grid', 'debate-topic-card',
                        'debate-position-options', 'debate-workspace', 'debate.css'):
            self.assertIn(marker, html)
        self.assertIn('Was Karna treated fairly?', html)
        self.assertIn('Begin Shastrarth', html)

    def test_debate_topic_relevance_rejects_unrelated_and_accepts_concise_relevant_claims(self):
        topic = 'Is Dharma always dependent on circumstances?'
        unrelated = [
            'We are here to solving the problems in hackathon.',
            'Sahil Pawar is a student.',
            'I like cricket.',
            'Today is Monday.',
            'Our project is MythoVerse.',
            'My name is Sahil Pawar and I am studying computer science.',
            "Krishna lifted the Govardhan hill to protect the villagers from Indra's storm.",
            'Hackathon teams are building projects this weekend.',
        ]
        relevant = [
            'Dharma changes according to the situation.',
            'Some moral principles should remain universal.',
            "Arjuna's dilemma shows that duty can conflict with personal relationships.",
            "Krishna explains that a person's duty must be understood in context.",
            'Dharma depends on circumstances because the same action can be right in one situation and wrong in another.',
            'Dharma should follow universal moral principles even when circumstances change.',
            "Arjuna's dilemma shows that understanding one's duty requires considering the situation.",
        ]
        for index, argument in enumerate(unrelated):
            result = app.validate_debate_topic_relevance(topic, argument)
            self.assertFalse(result['accepted'], argument)
            debate = self.client.post('/api/debate/create', json={
                'topic': topic, 'mode': 'student-vs-ai',
                'created_by': 'relevance-student-%d' % index, 'position': 'for',
            }).get_json()['debate']
            response = self.client.post(f"/api/debate/{debate['id']}/arguments", json={
                'student_id': debate['created_by'], 'argument': argument,
            })
            self.assertEqual(response.status_code, 422, argument)
            self.assertEqual(response.get_json()['error'],
                             'This argument does not address the current debate topic. Please submit a point that supports or challenges the proposition.')
            details = self.client.get(f"/api/debate/{debate['id']}").get_json()
            self.assertEqual(details['arguments'], [])
            self.assertEqual(details['debate']['current_round'], 1)

        for argument in relevant:
            result = app.validate_debate_topic_relevance(topic, argument)
            self.assertTrue(result['accepted'], argument)

    def test_analyze_debate_argument_rejects_relevant_but_non_rebuttal(self):
        topic = 'Is Dharma always dependent on circumstances?'
        history = [
            {'speaker': 'ai-opponent', 'text': 'Krishna taught Arjuna that duty must be performed without attachment to results.'},
        ]
        result = app.analyze_debate_argument(
            topic, 'Dharma changes according to the situation and context.', history, 'rebuttal-student', round_number=2)
        self.assertFalse(result['accepted'])
        self.assertEqual(
            result['reason'],
            "Your argument addresses the topic, but it needs to respond more directly to the other side's previous point.")
        self.assertEqual(result.get('category'), 'weak_rebuttal')
        self.assertFalse(result.get('addresses_previous'))

    def test_rebuttal_endpoint_rejects_relevant_but_non_rebuttal_without_advancing(self):
        created = self.client.post('/api/debate/create', json={
            'topic': 'Is Dharma always dependent on circumstances?',
            'mode': 'student-vs-student',
            'created_by': 'rebuttal-student', 'position': 'for',
        }).get_json()['debate']
        debate_id = created['id']
        self.assertEqual(self.client.post(
            f'/api/debate/{debate_id}/join', json={'student_id': 'rebuttal-opponent'}).status_code, 200)
        self.assertFalse(self.client.post(
            f'/api/debate/{debate_id}/ready', json={'student_id': 'rebuttal-student'}).get_json()['started'])
        self.assertTrue(self.client.post(
            f'/api/debate/{debate_id}/ready', json={'student_id': 'rebuttal-opponent'}).get_json()['started'])

        r1a = self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'rebuttal-student',
            'argument': 'Dharma changes according to the situation and context.',
        })
        self.assertEqual(r1a.status_code, 201, r1a.get_json())

        r1b = self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'rebuttal-opponent',
            'argument': 'Krishna taught Arjuna that duty must be performed without attachment to results.',
        })
        self.assertIn(r1b.status_code, (200, 201), r1b.get_json())

        r2 = self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'rebuttal-student',
            'argument': 'Context determines how dharma applies in different situations.',
        })
        self.assertEqual(r2.status_code, 422, r2.get_json())
        self.assertEqual(r2.get_json()['category'], 'invalid_argument')
        self.assertIn('respond more directly', r2.get_json()['error'])

        details = self.client.get(f'/api/debate/{debate_id}').get_json()
        self.assertEqual(details['debate']['current_round'], 2)
        round2_args = [a for a in details['arguments'] if a['round_number'] == 2]
        self.assertEqual(round2_args, [])

    def test_debate_difficulty_is_stored_and_invalid_values_rejected(self):
        invalid = self.client.post('/api/debate/create', json={
            'topic': 'Was Karna treated fairly?', 'created_by': 'difficulty-student',
            'difficulty': 'expert',
        })
        self.assertEqual(invalid.status_code, 400)
        created = self.client.post('/api/debate/create', json={
            'topic': 'Was Karna treated fairly?', 'created_by': 'difficulty-student',
            'difficulty': 'advanced', 'position': 'against',
        })
        self.assertEqual(created.status_code, 201)
        debate_id = created.get_json()['debate']['id']
        details = self.client.get(f'/api/debate/{debate_id}').get_json()
        self.assertEqual(details['debate']['difficulty'], 'advanced')
        empty_argument = self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'difficulty-student', 'argument': '   ',
        })
        self.assertEqual(empty_argument.status_code, 400)

    def create_ready_human_debate(self):
        debate = self.client.post('/api/debate/create', json={
            'topic': 'Was Arjuna right to hesitate?',
            'mode': 'student-vs-student',
            'created_by': 'student-a',
            'position': 'for',
        }).get_json()['debate']
        debate_id = debate['id']
        self.assertEqual(self.client.post(
            f'/api/debate/{debate_id}/join', json={'student_id': 'student-b'}).status_code, 200)
        self.assertFalse(self.client.post(
            f'/api/debate/{debate_id}/ready', json={'student_id': 'student-a'}).get_json()['started'])
        self.assertTrue(self.client.post(
            f'/api/debate/{debate_id}/ready', json={'student_id': 'student-b'}).get_json()['started'])
        return debate_id

    def test_rule_based_judge_scores_six_criteria_and_mean(self):
        judgement = app.judge_debate_round(
            'Was Arjuna right to hesitate?',
            1,
            [
                {'participant_key': 'A', 'argument': 'Krishna and Arjuna discuss dharma because duty matters.'},
                {'participant_key': 'B', 'argument': 'A respectful counterargument about duty and consequences.'},
            ],
            [],
            '13-15',
        )
        self.assertEqual(set(judgement), {'A', 'B', 'summary'})
        for key in ('A', 'B'):
            card = judgement[key]
            self.assertEqual(set(app.JUDGE_CRITERIA), set(card) & set(app.JUDGE_CRITERIA))
            self.assertTrue(all(0 <= card[name] <= 10 for name in app.JUDGE_CRITERIA))
            self.assertEqual(card['total'], round(
                sum(card[name] for name in app.JUDGE_CRITERIA) / 6, 1))

    def test_human_debate_enforces_readiness_duplicates_three_rounds_and_reward_idempotency(self):
        debate_id = self.create_ready_human_debate()
        early = self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'outsider', 'argument': 'Not a participant.',
        })
        self.assertEqual(early.status_code, 403)

        final = None
        for round_number in range(1, 4):
            first = self.client.post(f'/api/debate/{debate_id}/arguments', json={
                'student_id': 'student-a',
                'argument': (
                    f'Krishna and Arjuna discuss dharma, duty, consequences, and ethical '
                    f'reasoning in round {round_number}.'
                ),
            })
            self.assertEqual(first.status_code, 201)
            duplicate = self.client.post(f'/api/debate/{debate_id}/arguments', json={
                'student_id': 'student-a', 'argument': 'duplicate',
            })
            self.assertEqual(duplicate.status_code, 409)
            final = self.client.post(f'/api/debate/{debate_id}/arguments', json={
                'student_id': 'student-b',
                'argument': f'I disagree in round {round_number} because the opposing side needs to weigh consequences.',
            })
            self.assertIn(final.status_code, (200, 201))
            body = final.get_json()
            self.assertEqual(len(body['scores']), 2)
            self.assertTrue(all(
                0 <= score[name] <= 10
                for score in body['scores']
                for name in app.JUDGE_CRITERIA
            ))

        self.assertEqual(final.get_json()['status'], 'completed')
        self.assertIsNotNone(final.get_json()['reward'])
        self.assertEqual(final.get_json()['reward']['points'], 5)
        details = self.client.get(f'/api/debate/{debate_id}').get_json()
        self.assertEqual(len(details['rounds']), 3)
        self.assertEqual(len(details['scores']), 6)
        self.assertTrue(all(
            all(0 <= score[name] <= 10 for name in app.JUDGE_CRITERIA)
            for score in details['scores']
        ))

        repeated = self.client.post(f'/api/debate/{debate_id}/complete', json={'student_id': 'student-a'})
        self.assertEqual(repeated.status_code, 400)
        with app.get_db_connection() as connection:
            rewards = connection.execute(
                'SELECT * FROM dharma_reward_outbox WHERE debate_id = ?', (debate_id,)
            ).fetchall()
        self.assertEqual(len(rewards), 1)

    def test_dataset_opponent_uses_retrieved_content_and_ai_gets_no_reward(self):
        created = self.client.post('/api/debate/create', json={
            'topic': 'Why did Krishna guide Arjuna?',
            'mode': 'student-vs-ai',
            'created_by': 'student-ai',
            'position': 'for',
        })
        self.assertEqual(created.status_code, 201)
        debate = created.get_json()['debate']
        self.assertEqual(debate['status'], 'in_progress')
        debate_id = debate['id']
        initial_details = self.client.get(f'/api/debate/{debate_id}').get_json()
        self.assertEqual(initial_details['rounds'][0]['status'], 'active')
        self.assertTrue(self.client.post(
            f'/api/debate/{debate_id}/ready', json={'student_id': 'student-ai'}
        ).get_json()['started'])

        final = None
        for round_number in range(1, 4):
            final = self.client.post(f'/api/debate/{debate_id}/arguments', json={
                'student_id': 'student-ai',
                'argument': f'Krishna guided Arjuna about dharma and duty in round {round_number}.',
            })
            self.assertEqual(final.status_code, 201, final.get_json())
            body = final.get_json()
            self.assertEqual(body['ai_participant'], 'Dataset Computer Opponent')
            self.assertIn('Dataset-powered computer opponent', body['ai_response'])
            if round_number == 1:
                self.assertIn('Source:', body['ai_response'])
            self.assertEqual(body['round_number'], round_number)

        body = final.get_json()
        self.assertEqual(body['status'], 'completed')
        self.assertEqual(body['winner'], 'ai-opponent')
        self.assertIsNone(body['reward'])
        with app.get_db_connection() as connection:
            rewards = connection.execute(
                'SELECT student_id, points FROM dharma_reward_outbox WHERE debate_id = ?', (debate_id,)
            ).fetchall()
        self.assertEqual([dict(row) for row in rewards], [])

    def test_dataset_practice_rejects_unrelated_arguments_without_advancing(self):
        created = self.client.post('/api/debate/create', json={
            'topic': 'Karna was the greatest warrior in the Mahabharata.',
            'mode': 'student-vs-ai',
            'created_by': 'validation-student',
            'position': 'for',
        }).get_json()['debate']
        debate_id = created['id']
        response = self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'validation-student',
            'argument': 'Sahil Pawar is a student.',
        })
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.get_json()['category'], 'invalid_argument')
        details = self.client.get(f'/api/debate/{debate_id}').get_json()
        self.assertEqual(details['debate']['current_round'], 1)
        self.assertEqual(details['arguments'], [])
        self.assertEqual(details['rounds'][0]['status'], 'active')

    def test_llm_mode_requires_configuration_without_saving_argument(self):
        created = self.client.post('/api/debate/create', json={
            'topic': 'Krishna\'s strategy in the Mahabharata was necessary.',
            'mode': 'student-vs-llm',
            'created_by': 'llm-student',
            'position': 'for',
        }).get_json()['debate']
        with patch.dict(os.environ, {'DEBATE_PROVIDER': '', 'DEBATE_LLM_ENDPOINT': '', 'DEBATE_LLM_MODEL': ''}, clear=False):
            response = self.client.post(f"/api/debate/{created['id']}/arguments", json={
                'student_id': 'llm-student',
                'argument': 'Krishna advised Arjuna and used strategy to protect dharma.',
            })
        self.assertEqual(response.status_code, 503)
        self.assertIn('AI debate provider is not configured', response.get_json()['error'])
        details = self.client.get(f"/api/debate/{created['id']}").get_json()
        self.assertEqual(details['arguments'], [])
        self.assertEqual(details['rounds'][0]['status'], 'active')

    def test_configured_llm_provider_failure_is_visible_and_retryable(self):
        created = self.client.post('/api/debate/create', json={
            'topic': 'Dharma is more important than personal relationships.',
            'mode': 'student-vs-llm',
            'created_by': 'provider-student',
            'position': 'against',
        }).get_json()['debate']
        with patch.dict(os.environ, {
            'DEBATE_PROVIDER': 'llm',
            'DEBATE_LLM_ENDPOINT': 'https://example.invalid/chat',
            'DEBATE_LLM_MODEL': 'test-model',
        }, clear=False), patch('app.urlopen', side_effect=app.URLError('offline')):
            response = self.client.post(f"/api/debate/{created['id']}/arguments", json={
                'student_id': 'provider-student',
                'argument': 'Personal relationships can shape how dharma is understood in a difficult situation.',
            })
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.get_json()['category'], 'provider_error')
        details = self.client.get(f"/api/debate/{created['id']}").get_json()
        self.assertEqual(details['arguments'], [])
        self.assertEqual(details['rounds'][0]['status'], 'active')

    def test_configured_llm_provider_uses_mocked_response_and_preserves_mode_label(self):
        created = self.client.post('/api/debate/create', json={
            'topic': 'Krishna\'s strategy in the Mahabharata was necessary.',
            'mode': 'student-vs-llm',
            'created_by': 'mock-llm-student',
            'position': 'for',
        }).get_json()['debate']
        relevance_body = json.dumps({'choices': [{'message': {
            'content': json.dumps({'relevant': True, 'confidence': 0.95, 'reason': 'The argument addresses Krishna, dharma, and the Mahabharata proposition.'})
        }}]}).encode('utf-8')
        response_body = json.dumps({'choices': [{'message': {
            'content': 'You argue that Krishna\'s strategy was necessary. However, necessity should be tested against its consequences and the competing duties in the Mahabharata. Which consequence best supports your position?'
        }}]}).encode('utf-8')
        def mocked_response(body):
            return type('MockResponse', (), {
                '__enter__': lambda self: self,
                '__exit__': lambda self, exc_type, exc_value, traceback: None,
                'read': lambda self: body,
            })()
        with patch.dict(os.environ, {
            'DEBATE_PROVIDER': 'llm',
            'DEBATE_LLM_ENDPOINT': 'https://example.invalid/chat',
            'DEBATE_LLM_MODEL': 'test-model',
        }, clear=False), patch('app.urlopen', side_effect=[
            mocked_response(relevance_body), mocked_response(response_body),
            mocked_response(json.dumps({'choices': [{'message': {
                'content': 'The opening argument connects strategy, duty, and consequences clearly.'
            }}]}).encode('utf-8'))
        ]):
            response = self.client.post(f"/api/debate/{created['id']}/arguments", json={
                'student_id': 'mock-llm-student',
                'argument': 'Krishna used strategy to protect dharma and guide the war toward justice.',
            })
        self.assertEqual(response.status_code, 201, response.get_json())
        body = response.get_json()
        self.assertEqual(body['provider'], 'llm')
        self.assertEqual(body['ai_participant'], 'LLM Debate Opponent')
        self.assertIn('Which consequence', body['ai_response'])

    def test_draw_and_incomplete_debates_receive_no_reward(self):
        debate_id = self.create_ready_human_debate()
        self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'student-a', 'argument': 'Arjuna faced a conflict between duty and compassion.',
        })
        self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'student-b', 'argument': 'Arjuna faced a conflict between duty and compassion.',
        })
        completed_early = self.client.post(
            f'/api/debate/{debate_id}/complete', json={'student_id': 'student-a'})
        self.assertEqual(completed_early.status_code, 409)
        with app.get_db_connection() as connection:
            self.assertEqual(connection.execute(
                'SELECT COUNT(*) FROM dharma_reward_outbox WHERE debate_id = ?', (debate_id,)
            ).fetchone()[0], 0)


    def test_off_topic_argument_never_triggers_opponent_response_or_round_change(self):
        """End-to-end: rejection produces no AI reply, no save, no round change."""
        created = self.client.post('/api/debate/create', json={
            'topic': 'Is Dharma always dependent on circumstances?',
            'mode': 'student-vs-ai',
            'created_by': 'reject-flow-student',
            'position': 'for',
        }).get_json()['debate']
        debate_id = created['id']
        for argument in (
            'We are here to solving the problems in hackathon.',
            'My name is Sahil Pawar.',
            'I am studying computer science.',
        ):
            response = self.client.post(f'/api/debate/{debate_id}/arguments', json={
                'student_id': 'reject-flow-student', 'argument': argument,
            })
            self.assertEqual(response.status_code, 422)
            body = response.get_json()
            self.assertNotIn('ai_response', body)
            self.assertNotIn('scores', body)
            self.assertEqual(body['argument_saved'], False)
            details = self.client.get(f'/api/debate/{debate_id}').get_json()
            self.assertEqual(details['arguments'], [])
            self.assertEqual(details['debate']['current_round'], 1)
            self.assertEqual(details['rounds'][0]['status'], 'active')

    def test_accepted_opening_argument_receives_direct_opponent_response(self):
        """A valid opening argument gets a direct, in-topic counterargument."""
        created = self.client.post('/api/debate/create', json={
            'topic': 'Is Dharma always dependent on circumstances?',
            'mode': 'student-vs-ai',
            'created_by': 'direct-response-student',
            'position': 'for',
        }).get_json()['debate']
        response = self.client.post(f"/api/debate/{created['id']}/arguments", json={
            'student_id': 'direct-response-student',
            'argument': 'Dharma depends on circumstances because the same action can be right in one situation and wrong in another.',
        })
        self.assertEqual(response.status_code, 201, response.get_json())
        body = response.get_json()
        ai_response = body['ai_response']
        # Opponent stays on its assigned AGAINST side and addresses the claim.
        self.assertIn('circumstance', ai_response.lower())
        self.assertIn('dharma', ai_response.lower())
        self.assertNotIn('Govardhan', ai_response)
        self.assertNotIn('Dashavatara', ai_response)
        # Round 2 opens after the round-1 exchange.
        self.assertEqual(body['current_round'], 2)

    def test_opponent_maintains_assigned_position_across_rounds(self):
        created = self.client.post('/api/debate/create', json={
            'topic': 'Is Dharma always dependent on circumstances?',
            'mode': 'student-vs-ai',
            'created_by': 'position-student',
            'position': 'for',
        }).get_json()['debate']
        debate_id = created['id']
        previous_responses = []
        argument = (
            'Dharma depends on circumstances, and round %d shows the same act '
            'judged differently in two contexts.'
        )
        for round_number in range(1, 4):
            response = self.client.post(f'/api/debate/{debate_id}/arguments', json={
                'student_id': 'position-student',
                'argument': argument % round_number,
            })
            self.assertEqual(response.status_code, 201, response.get_json())
            body = response.get_json()
            ai_response = body['ai_response']
            # The opponent never concedes the student's side.
            self.assertNotIn('I agree with you completely', ai_response)
            self.assertIn('dharma', ai_response.lower())
            self.assertNotIn(ai_response, previous_responses)
            previous_responses.append(ai_response)

    def test_strong_relevant_rebuttal_is_accepted_in_round_two(self):
        created = self.client.post('/api/debate/create', json={
            'topic': 'Is Dharma always dependent on circumstances?',
            'mode': 'student-vs-ai',
            'created_by': 'rebuttal-strong-student',
            'position': 'for',
        }).get_json()['debate']
        debate_id = created['id']
        first = self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'rebuttal-strong-student',
            'argument': 'Dharma depends on circumstances because the same action can be right in one situation and wrong in another.',
        })
        self.assertEqual(first.status_code, 201, first.get_json())
        opponent = first.get_json()['ai_response']
        # A rebuttal that explicitly engages the opponent's last point passes.
        response = self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'rebuttal-strong-student',
            'argument': (
                'You said dharma must hold firm, but Yudhishthira\'s dice game was '
                'lawful in form and still wrong, which shows context does change '
                'what duty requires.'
            ),
        })
        self.assertEqual(response.status_code, 201, response.get_json())
        self.assertTrue(response.get_json()['ai_response'])

    def test_relevant_but_weak_rebuttal_receives_guidance_message(self):
        created = self.client.post('/api/debate/create', json={
            'topic': 'Is Dharma always dependent on circumstances?',
            'mode': 'student-vs-student',
            'created_by': 'rebuttal-weak-student',
            'position': 'for',
        }).get_json()['debate']
        debate_id = created['id']
        self.client.post(f'/api/debate/{debate_id}/join', json={'student_id': 'rebuttal-weak-opponent'})
        self.client.post(f'/api/debate/{debate_id}/ready', json={'student_id': 'rebuttal-weak-student'})
        self.client.post(f'/api/debate/{debate_id}/ready', json={'student_id': 'rebuttal-weak-opponent'})
        first = self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'rebuttal-weak-student',
            'argument': 'Dharma depends on circumstances because the same action can be right in one situation and wrong in another.',
        })
        self.assertIn(first.status_code, (200, 201), first.get_json())
        second = self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'rebuttal-weak-opponent',
            'argument': 'Dharma is an eternal order that does not bend to convenience; the epic treats lawful wrongdoing as still wrong.',
        })
        self.assertIn(second.status_code, (200, 201), second.get_json())
        # A relevant round-2 argument that completely ignores the opponent's
        # previous point receives rebuttal guidance, not topic rejection.
        third = self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'rebuttal-weak-student',
            'argument': 'Devotion and knowledge both matter, but duty in a specific situation decides right action.',
        })
        self.assertEqual(third.status_code, 422)
        body = third.get_json()
        self.assertEqual(
            body['error'],
            "Your argument addresses the topic, but it needs to respond more directly to the other side's previous point.")
        self.assertNotIn('ai_response', body)
        details = self.client.get(f'/api/debate/{debate_id}').get_json()
        self.assertEqual(details['debate']['current_round'], 2)
        self.assertEqual([a for a in details['arguments'] if a['round_number'] == 2 and a['speaker'] == 'rebuttal-weak-student'], [])

    def test_duplicate_topics_rejected_and_existing_history_preserved(self):
        first = self.client.post('/api/debate/create', json={
            'topic': 'Is Dharma always dependent on circumstances?',
            'mode': 'student-vs-ai',
            'created_by': 'dup-student',
            'position': 'for',
        })
        self.assertEqual(first.status_code, 201)
        debate_id = first.get_json()['debate']['id']
        self.client.post(f'/api/debate/{debate_id}/arguments', json={
            'student_id': 'dup-student',
            'argument': 'Dharma changes according to the situation and context.',
        })
        # Same topic, different casing and punctuation, is still a duplicate.
        variants = (
            'is dharma always dependent on circumstances',
            'Is Dharma always dependent on circumstances!',
            '  is   dharma always dependent on circumstances?  ',
        )
        saved_history = None
        for variant in variants:
            duplicate = self.client.post('/api/debate/create', json={
                'topic': variant,
                'mode': 'student-vs-ai',
                'created_by': 'dup-student',
                'position': 'for',
            })
            self.assertEqual(duplicate.status_code, 409, variant)
            self.assertIn('already have a debate on this topic', duplicate.get_json()['error'])
        # Distinct topics stay creatable.
        distinct = self.client.post('/api/debate/create', json={
            'topic': 'Was Karna treated fairly?',
            'mode': 'student-vs-ai',
            'created_by': 'dup-student',
            'position': 'for',
        })
        self.assertEqual(distinct.status_code, 201, distinct.get_json())
        # The first debate and its saved argument are untouched.
        details = self.client.get(f'/api/debate/{debate_id}').get_json()
        self.assertEqual(len(details['arguments']), 2)
        saved_history = details['arguments']
        self.assertTrue(saved_history)

    def test_debate_list_deduplicates_topics_and_preserves_records(self):
        for index in range(3):
            created = self.client.post('/api/debate/create', json={
                'topic': 'Is Dharma always dependent on circumstances?',
                'mode': 'student-vs-ai',
                'created_by': f'list-student-{index}',
                'position': 'for',
            })
            if index == 0:
                first_id = created.get_json()['debate']['id']
        # Same topic from the SAME student with sloppy punctuation dedupes.
        self.client.post('/api/debate/create', json={
            'topic': '  is dharma always dependent on circumstances  ',
            'mode': 'student-vs-ai',
            'created_by': 'list-student-0',
            'position': 'for',
        })
        listing = self.client.get('/api/debate/list').get_json()
        topics = [(debate['created_by'], debate['topic'].lower().strip(' ?!')) for debate in listing['debates']]
        self.assertEqual(len(topics), len(set(topics)))
        # Every earlier debate record is still retrievable: nothing deleted.
        for index in range(3):
            details = self.client.get(f"/api/debate/{first_id + index}").get_json()
            self.assertIn('debate', details)


if __name__ == '__main__':
    unittest.main(verbosity=2)

