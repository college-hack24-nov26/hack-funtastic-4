from dataset_service import get_dataset, tokenize, _STOPWORDS

d = get_dataset()
q = 'How do I file an income tax return?'
qv = d._query_vector(q)
terms = [t for t in tokenize(q) if t not in _STOPWORDS]
print('query terms:', terms)
for i, rec in enumerate(d.records):
    shared = set(terms) & set(d.tfidf[i])
    if shared:
        print(rec.id, rec.title[:35], '| shared:', shared, '| cosine:', round(d._cosine(qv, d.tfidf[i]), 3))
