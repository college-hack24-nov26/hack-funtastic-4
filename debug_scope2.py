from dataset_service import get_dataset, tokenize, content_tokens

d = get_dataset()
doc_tokens = [set(content_tokens(r)) for r in d.records]
for term in ['return', 'tax', 'income', 'file', 'krishna', 'arjuna', 'exile', 'rama']:
    df = sum(1 for tokens in doc_tokens if term in tokens)
    print(f"{term!r}: in {df}/{len(doc_tokens)} records")
