"""End-to-end verification for the local dataset Debate Room.

This script uses the real dataset opponent and deterministic rubric judge. It
never calls an external AI provider and uses a temporary SQLite database.
"""
import os
import tempfile
import unittest
from pathlib import Path

import app


class DebateFlowVerification(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.previous_database = app.app.config.get('DATABASE')
        app.app.config.update(TESTING=True, DATABASE=str(Path(self.directory.name) / 'debate.db'))
        app.init_db()
        self.client = app.app.test_client()

    def tearDown(self):
        app.app.config['DATABASE'] = self.previous_database
        self.directory.cleanup()

    def ready_human_debate(self, topic='Was Arjuna right to hesitate?', suffix=''):
        created = self.client.post('/api/debate/create', json={
            'topic': topic, 'mode': 'student-vs-student',
            'created_by': 'student-a' + suffix, 'position': 'for',
        })
        self.assertEqual(created.status_code, 201, created.get_json())
        debate = created.get_json()['debate']
        debate_id = debate['id']
        self.assertEqual(self.client.post(
            f'/api/debate/{debate_id}/join', json={'student_id': 'student-b' + suffix}).status_code, 200)
        self.assertFalse(self.client.post(
            f'/api/debate/{debate_id}/ready', json={'student_id': 'student-a' + suffix}
        ).get_json()['started'])
        self.assertTrue(self.client.post(
            f'/api/debate/{debate_id}/ready', json={'student_id': 'student-b' + suffix}
        ).get_json()['started'])
        return debate_id

    def test_human_three_rounds_reward_and_duplicate_protection(self):
        debate_id = self.ready_human_debate()
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
                'student_id': 'student-a', 'argument': 'duplicate submission',
            })
            self.assertEqual(duplicate.status_code, 409)
            second = self.client.post(f'/api/debate/{debate_id}/arguments', json={
                'student_id': 'student-b',
                'argument': f'I disagree in round {round_number} because the opposing side must weigh consequences.',
            })
            self.assertIn(second.status_code, (200, 201))
            result = second.get_json()
            self.assertEqual(len(result['scores']), 2)
            for score in result['scores']:
                for criterion in app.JUDGE_CRITERIA:
                    self.assertGreaterEqual(score[criterion], 0)
                    self.assertLessEqual(score[criterion], 10)

        final = result
        self.assertEqual(final['status'], 'completed')
        self.assertEqual(final['winner'], 'student-a')
        self.assertEqual(final['reward']['points'], 5)
        with app.get_db_connection() as connection:
            self.assertEqual(connection.execute(
                'SELECT COUNT(*) FROM dharma_reward_outbox WHERE debate_id = ?',
                (debate_id,),
            ).fetchone()[0], 1)

    def test_draw_and_incomplete_debates_get_no_reward(self):
        debate_id = self.ready_human_debate('Is Dharma always dependent on circumstances?')
        for round_number in range(1, 4):
            self.client.post(f'/api/debate/{debate_id}/arguments', json={
                'student_id': 'student-a', 'argument': f'Dharma can depend on context in round {round_number}.',
            })
            response = self.client.post(f'/api/debate/{debate_id}/arguments', json={
                'student_id': 'student-b', 'argument': f'Dharma can depend on context in round {round_number}.',
            })
        self.assertEqual(response.get_json()['winner'], 'draw')
        self.assertIsNone(response.get_json()['reward'])

        incomplete = self.ready_human_debate('Is Dharma always dependent on circumstances?', suffix='-2')
        self.client.post(f'/api/debate/{incomplete}/arguments', json={
            'student_id': 'student-a', 'argument': 'Only one submission.',
        })
        completed = self.client.post(
            f'/api/debate/{incomplete}/complete', json={'student_id': 'student-a-2'})
        self.assertIn(completed.status_code, (403, 409))
        with app.get_db_connection() as connection:
            self.assertEqual(connection.execute(
                'SELECT COUNT(*) FROM dharma_reward_outbox WHERE debate_id = ?',
                (incomplete,),
            ).fetchone()[0], 0)

    def test_dataset_opponent_completes_three_rounds_and_never_gets_reward(self):
        debate = self.client.post('/api/debate/create', json={
            'topic': 'Why did Krishna guide Arjuna?',
            'mode': 'student-vs-ai',
            'created_by': 'student-ai',
            'position': 'for',
        })
        self.assertEqual(debate.status_code, 201, debate.get_json())
        debate = debate.get_json()['debate']
        debate_id = debate['id']
        self.assertTrue(self.client.post(
            f'/api/debate/{debate_id}/ready', json={'student_id': 'student-ai'}
        ).get_json()['started'])

        for round_number in range(1, 4):
            response = self.client.post(f'/api/debate/{debate_id}/arguments', json={
                'student_id': 'student-ai',
                'argument': (
                    f'Krishna guided Arjuna about dharma, duty, and consequences '
                    f'in round {round_number}.'
                ),
            })
            self.assertEqual(response.status_code, 201, response.get_json())
            body = response.get_json()
            self.assertEqual(body['ai_participant'], 'Dataset Computer Opponent')
            self.assertIn('Dataset-powered computer opponent', body['ai_response'])
            if round_number == 1:
                self.assertIn('Source:', body['ai_response'])
            self.assertEqual(body['round_number'], round_number)

        final = response.get_json()
        self.assertEqual(final['status'], 'completed')
        self.assertEqual(final['winner'], 'ai-opponent')
        self.assertIsNone(final['reward'])
        with app.get_db_connection() as connection:
            rows = connection.execute(
                'SELECT student_id, points FROM dharma_reward_outbox WHERE debate_id = ?',
                (debate_id,),
            ).fetchall()
        self.assertEqual([dict(row) for row in rows], [])


if __name__ == '__main__':
    unittest.main(verbosity=2)

