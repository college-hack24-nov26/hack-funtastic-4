import app
c = app.app.test_client()
for q in ['How do I file an income tax return?', 'Why did Krishna guide Arjuna?', 'Tell me about Ramas exile.']:
    r = c.post('/api/mentor/chat', json={'message': q, 'student_id': 't', 'age_group': '13-15'})
    a = r.get_json()
    print(q[:42], '->', a.get('provider'), '|', a.get('answer', '')[:65])
