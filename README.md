# MythoVerse

MythoVerse is a Flask and SQLite learning application with three connected modules:

- Dataset Mentor
- Learning Intelligence
- Dataset Debate Room

## Local setup

The application uses the checked-in local mythology dataset and requires no API key.

    python -m pip install -r requirements.txt
    python app.py

Open http://127.0.0.1:5000/.

Optional settings can be copied from .env.example:

- SECRET_KEY controls Flask session signing.
- DATABASE_PATH selects a SQLite database location. If omitted, the application uses mythoverse.db in the project directory.

The application does not require .env, an external AI service, or network access for normal Mentor, Learning, or Debate workflows.

## Dataset

The source data is data/mythology_dataset.json plus the curated domain pack in data/mythology_dataset_expansion.json. They are JSON arrays of records. Every record must contain:

- id, title, category, and topic
- summary and detailed_content
- characters, keywords, and questions
- source_name and source_reference
- language and age_group

Records are validated when loaded. To add a record, preserve the schema, use a stable unique ID, include factual content appropriate to the listed age groups, and provide a specific source name and reference. Do not add unsourced claims or fabricated quotations.

dataset_service.py builds a TF-IDF index over weighted title/topic fields, summaries, detailed content, keywords, characters, relationships, locations, teachings, and verse references. Search normalizes aliases such as Ram/Rama and Gokul/Gokula, expands transparent intent terms such as chariot/charioteer, birthplace/parents, fought/battlefield, live/Dwarka, and wrote/author, applies exact curated-question, title, and structured-field ranking, uses a cosine-similarity floor, and can filter by age group. Follow-up questions can reuse the prior student question in the same conversation.

The dataset currently contains 102 validated records across 20 categories. It includes 18 structured Bhagavad Gita chapter records with chapter names, English meanings, standard 700-verse-recension counts, summaries, teachings, practical examples, questions, related chapters, and source references. It also includes a separately sourced and verified Bhagavad Gita 2.47 verse record with Sanskrit, transliteration, and a plain-English paraphrase, plus expanded records for epic events, Vedic and Upanishadic traditions, Puranic stories, philosophy, places, festivals, texts, symbols, and ancient knowledge traditions. The full 700-verse corpus, word-by-word commentary for every verse, and complete coverage of every Purana are not yet included.

## Dataset Mentor

POST /api/mentor/chat retrieves the best matching dataset records and returns:

- Grounded content from the selected record
- Dataset record IDs and relevance values
- Source names and source references
- A related second record when available

If no record clears the relevance threshold, the Mentor returns an honest out-of-scope response instead of inventing an answer. Conversation turns are persisted in SQLite. When a response needs more than one record, the answer includes the strongest grounded record plus related retrieved records and their sources.

## Learning Intelligence

The learning APIs are:

- GET /api/learning/quiz
- POST /api/learning/quiz/submit
- POST /api/learning/records
- GET /api/learning/summary

The Learning Intelligence dashboard uses the existing student ID and SQLite
database. It reports lessons completed, quiz attempts, question-level accuracy,
average score, activity streaks when timestamp data supports one, strongest and
weakest topics, topic trends, revision items, recent history, and actionable
recommendations. A new student receives an honest empty state.

Quiz questions and answer keys come from dataset records. The server grades submitted answers against the canonical dataset answer and ignores any client-provided correctness flag. Scored quiz submissions become real learning_records plus question-level learning_question_results. Topic accuracy is calculated from all saved question outcomes; strong and weak labels require at least two answered questions and use transparent thresholds of 80% and 60%. Trends require at least two quiz attempts. The adaptive quiz selects easy, medium, or hard records from the latest three attempts and respects the selected age group. Revision recommendations contain previously incorrect questions and existing dataset record IDs. No progress or recommendation is fabricated for an empty history.

## Dataset Debate Room

Debates are available through /api/debate/* and the Debate Room page.

Dataset Practice debates retrieve relevant dataset records and produce clearly labelled, deterministic retrieval-based practice responses for each of three rounds. They are not generative AI and include source names and references with their evidence. Arguments are checked for topic relevance and exact repetition before they are accepted, so an unrelated message does not consume a round.

An optional LLM Debate mode is available through the same provider boundary. Configure `DEBATE_PROVIDER=llm`, `DEBATE_LLM_ENDPOINT`, `DEBATE_LLM_MODEL`, and optionally `DEBATE_LLM_API_KEY` in the server environment. The endpoint must accept an OpenAI-compatible chat-completions request. If it is not configured or fails, the API returns a visible provider error and does not save the argument. No API key is required for Dataset Practice mode or for the automated test suite.

The automated rubric judge scores both participants on six criteria:

1. Relevance
2. Reasoning
3. Evidence
4. Clarity
5. Rebuttal
6. Respect

Each criterion is scored from 0 to 10. The total is the rounded mean of the six scores. Readiness checks, current-round enforcement, duplicate-submission protection, and the three-round state machine are stored in SQLite.

A completed non-draw debate awards exactly five points to the human winner through the dharma_reward_outbox table. Draws, incomplete debates, and the dataset opponent receive no reward. The reward row is unique per debate.

## Routes and frontend

The existing MythoVerse pages remain:

- /ai-mentor
- /learning-intelligence
- /debate-room

The frontend displays Mentor source references, learning progress and recommendations, clearly labelled Dataset Practice or LLM Debate responses, round status, automated rubric summaries, all six scores, and the final winner.

## Testing

Run the application tests:

    python -m unittest discover -s tests -v

Run the focused debate verification:

    python verify_debate_flows.py

Tests use temporary SQLite databases and do not modify the production database.

## Known limitations

- Student IDs are integration identifiers; authentication and authorization are not included.
- The dataset is currently English-language content.
- Retrieval is an explainable lexical TF-IDF system with aliases, intent expansion, structured relationship/location fields, and conversation context; it is not embedding-based semantic search.
- All 18 Bhagavad Gita chapters are represented, but the dataset does not yet contain every one of the approximately 700 individual verses or full verse-by-verse commentary.
- Ramayana, Mahabharata, Puranic, philosophical, location, festival, and traditional-knowledge coverage is curated but not exhaustive.
- Numerical debate scoring is deterministic heuristic rubric scoring, kept separate from optional LLM qualitative feedback.
- Dharma Points are queued locally; no external points service is connected.
- /api/search searches the SQLite learning catalog, while Mentor and quizzes use the mythology JSON dataset.

