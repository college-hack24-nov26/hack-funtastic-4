import json
import io

def rec(rid, title, category, topic, summary, content, chars, keywords, questions, source_name, source_ref, ages):
    return {
        "id": rid, "title": title, "category": category, "topic": topic,
        "summary": summary, "detailed_content": content, "characters": chars,
        "keywords": keywords, "questions": questions,
        "source_name": source_name, "source_reference": source_ref,
        "language": "en", "age_group": ages,
    }

records = []

# ---- Temples and Pilgrimage ----
records.append(rec(
    "templ-001", "Kashi Vishwanath — Varanasi's Shiva Temple", "Temples and Pilgrimage", "Kashi Vishwanath",
    "One of the twelve Jyotirlingas, standing on the western bank of the Ganga in Varanasi, one of the world's oldest continuously inhabited cities.",
    "Kashi Vishwanath is among the twelve Jyotirlingas, the shrines where Shiva is worshipped as a pillar of light. Varanasi, also called Kashi and Banaras, is documented continuously from at least the sixth century BCE, and Buddhist texts reference it. Pilgrims traditionally believe that dying in Kashi, with the belief associated with the adjacent Manikarnika ghat, brings liberation. The present temple structure dates to 1780, rebuilt under Ahilyabai Holkar of Indore after earlier destructions. A modern corridor completed in 2021 connects the temple directly to the Ganga ghats.",
    ["Shiva", "Ahilyabai Holkar"],
    ["kashi", "varanasi", "jyotirlinga", "ganga", "pilgrimage", "shiva", "temple"],
    ["How many Jyotirlingas are there in total?", "Who rebuilt the Kashi Vishwanath temple in 1780?", "Why do pilgrims visit Varanasi?"],
    "Temple records and historical surveys of Varanasi",
    "Kashi Vishwanath temple trust documentation; Ahilyabai Holkar's 1780 reconstruction is a documented historical fact",
    ["13-15", "16-18", "18+"],
))
records.append(rec(
    "templ-002", "Kedarnath — The Himalayan Jyotirlinga", "Temples and Pilgrimage", "Kedarnath",
    "A stone temple at 3,583 metres in Uttarakhand, traditionally attributed to Adi Shankaracharya and reached by a 16-kilometre trek.",
    "Kedarnath, dedicated to Shiva as a Jyotirlinga, sits at about 3,583 metres in the Garhwal Himalaya. The temple is traditionally attributed to the philosopher-saint Adi Shankaracharya (eighth century CE), and a shrine behind the main temple is honoured as his samadhi. The temple closes each winter and the deity is ceremonially moved to Ukhimath for six months. In June 2013 catastrophic floods devastated the Kedarnath valley, killing thousands; the temple survived and access was later rebuilt. The Char Dham yatra traditionally includes Kedarnath alongside Badrinath, Gangotri and Yamunotri.",
    ["Shiva", "Adi Shankaracharya"],
    ["kedarnath", "himalaya", "char dham", "jyotirlinga", "shankaracharya", "temple"],
    ["At what altitude is Kedarnath located?", "Who is the temple traditionally attributed to?", "Where is the deity moved during winter?"],
    "Uttarakhand temple administration documentation",
    "Kedarnath temple official records; the 2013 flood is a well-documented disaster event",
    ["13-15", "16-18", "18+"],
))
records.append(rec(
    "templ-003", "Somnath — The First Jyotirlinga by the Sea", "Temples and Pilgrimage", "Somnath",
    "A coastal temple in Gujarat traditionally listed first among the twelve Jyotirlingas, with a history of destruction and reconstruction.",
    "Somnath stands on the Saurashtra coast of Gujarat, traditionally counted as the first of the twelve Jyotirlingas. Its recorded history is one of repeated destruction: Mahmud of Ghazni raided the temple in 1026, and later rulers damaged it several times, with documentation of sacking in 1297, 1395, and 1706. Each time it was rebuilt. The current structure, completed in 1951 after India's independence, was championed by Sardar Vallabhbhai Patel, with president Rajendra Prasad performing the consecration. The temple's rebuilding is often cited as a symbol of cultural resilience.",
    ["Shiva", "Sardar Patel", "Rajendra Prasad"],
    ["somnath", "gujarat", "jyotirlinga", "mahmud of ghazni", "reconstruction", "temple"],
    ["Which historical invader raided Somnath in 1026?", "Who championed the modern reconstruction?", "How many Jyotirlingas exist?"],
    "Somnath temple trust history documentation",
    "Somnath Trust published history; the 1026 raid is a documented historical event",
    ["13-15", "16-18", "18+"],
))

# ---- Sanskrit Language ----
records.append(rec(
    "lang-001", "Sanskrit — The Classical Language of India", "Sanskrit Language", "Sanskrit overview",
    "Sanskrit is a classical Indo-Aryan language whose literature spans the Vedas, epics, philosophy, science, and poetry.",
    "Sanskrit belongs to the Indo-Aryan branch of the Indo-European language family. Vedic Sanskrit, the language of the Rigveda, differs from later Classical Sanskrit, which was codified by the grammarian Panini around the fourth century BCE in his Ashtadhyayi, a rule system of nearly 4,000 sutras that linguists still study as a model of formal description. Sanskrit literature includes the epics, Kalidasa's poetry, mathematical treatises of Aryabhata and Bhaskara, medical texts like the Charaka Samhita, and philosophical schools. The 2011 Indian census recorded about 25,000 people reporting Sanskrit as their first language, and several villages actively use it.",
    ["Panini", "Kalidasa", "Aryabhata"],
    ["sanskrit", "panini", "ashtadhyayi", "vedas", "classical language", "grammar"],
    ["Who codified Classical Sanskrit grammar?", "How does Vedic Sanskrit differ from Classical Sanskrit?", "Is Sanskrit still spoken today?"],
    "Ashtadhyayi; census documentation",
    "Panini's Ashtadhyayi; India Census 2011 language data",
    ["13-15", "16-18", "18+"],
))
records.append(rec(
    "lang-002", "Panini's Ashtadhyayi — A Grammar Like a Machine", "Sanskrit Language", "Panini",
    "Around the fourth century BCE, Panini described Sanskrit with nearly 4,000 rules so systematic that modern linguists compare it to formal computation.",
    "Panini's Ashtadhyayi ('Eight Chapters') is a generative grammar: it does not list correct sentences but gives rules for deriving them, organised with meta-rules like the Shivsutra sound inventory and the convention that later rules override earlier ones (viparishedha). Computer scientists in the twentieth century noted structural similarities between Panini's system and the formal grammars used in programming-language theory, though it is not a literal computing machine. The text's precision kept Sanskrit phonologically stable across centuries, and it remains the foundation of Sanskrit instruction in India today.",
    ["Panini"],
    ["panini", "ashtadhyayi", "grammar", "generative", "shivasutra", "linguistics"],
    ["How many rules are in the Ashtadhyayi?", "What is viparishedha?", "How did Panini influence modern linguistics?"],
    "Ashtadhyayi; history of linguistics scholarship",
    "Panini's Ashtadhyayi; twentieth-century formal-linguistics scholarship",
    ["16-18", "18+"],
))
records.append(rec(
    "lang-003", "Namaste and Everyday Sanskrit Words", "Sanskrit Language", "Sanskrit in daily life",
    "Many everyday Indian words and greetings come directly from Sanskrit — namaste, guru, yoga, dharma, karma, and more.",
    "Sanskrit survives in daily Indian speech through thousands of loanwords. 'Namaste' combines namah (to bow) and te (to you) — 'I bow to you'. 'Guru' derives from a root meaning 'heavy', figuratively 'weighty with knowledge'. 'Yoga' comes from yuj, to join or harness. 'Dharma' and 'karma' carry the meanings students have already met. 'Namaskar', 'pranam', 'shubh' (auspicious) and 'shanti' (peace) appear across Indian languages. Sanskrit numerals gave Europe the decimal digits through Arabic intermediaries, which is why they are called Hindu-Arabic numerals.",
    [],
    ["namaste", "guru", "yoga", "dharma", "karma", "shanti", "loanwords", "etymology"],
    ["What does namaste literally mean?", "What is the root meaning of guru?", "Where do the numerals 0-9 come from?"],
    "Etymological references and spoken tradition",
    "Sanskrit etymological dictionaries; history of the Hindu-Arabic numeral system",
    ["6-8", "9-12", "13-15"],
))

# ---- Ancient Science and Mathematics ----
records.append(rec(
    "sci-001", "Aryabhata and the Concept of Zero", "Ancient Science and Mathematics", "Zero and place value",
    "Indian mathematicians systematised zero and the place-value decimal system that became the world's standard numerals.",
    "The digit zero appears in Indian mathematics by the Gupta era; Bhaskara I's commentary (c. 629 CE) and the Bakhshali manuscript show early zero symbols, and the number 'shunya' is treated as a full number by Brahmagupta (c. 628 CE), who gave rules for arithmetic with zero and negative numbers. Combined with the place-value system, this enabled efficient calculation of large numbers. The system travelled to the Arab world and then to Europe, where it became the Hindu-Arabic numeral system used worldwide. Aryabhata (c. 499 CE) calculated pi to four decimal places and explained eclipses astronomically, and the Kerala school under Madhava (c. 1340) developed series anticipating calculus concepts.",
    ["Aryabhata", "Brahmagupta", "Bhaskara I", "Madhava"],
    ["zero", "shunya", "brahmagupta", "place value", "decimal", "aryabhata", "mathematics"],
    ["Who gave rules for arithmetic with zero around 628 CE?", "What does shunya mean?", "How did the Indian numeral system reach Europe?"],
    "Brahmagupta's Brahmasphutasiddhanta; mathematical history scholarship",
    "Brahmasphutasiddhanta (c. 628 CE); documented history of Hindu-Arabic numerals",
    ["9-12", "13-15", "16-18", "18+"],
))
records.append(rec(
    "sci-002", "Sushruta and Ancient Indian Medicine", "Ancient Science and Mathematics", "Ayurveda",
    "The Sushruta Samhita, an ancient Sanskrit medical text, describes surgical instruments and procedures centuries before modern surgery.",
    "The Sushruta Samhita is a foundational Ayurvedic text, with scholarly dating generally placing its compilation in the early centuries CE based on earlier material. It catalogues around 300 surgical procedures and 120 instruments, describes methods for treating wounds and fractures, and documents reconstructive techniques including rhinoplasty that later drew European surgical interest. It classifies surgical training, ethics and anatomy. Alongside the Charaka Samhita (medicine) and the Ashtanga Hridayam, it forms the classical Ayurvedic canon. Modern historians caution that while some techniques were genuinely surgical, others are theoretical; the texts remain important both historically and in contemporary AYUSH practice.",
    ["Sushruta", "Charaka"],
    ["sushruta", "surgery", "ayurveda", "charaka", "medicine", "surgical instruments"],
    ["How many surgical procedures does the Sushruta Samhita describe?", "Which two Samhitas form the core of classical Ayurveda?", "What is rhinoplasty?"],
    "Sushruta Samhita translations; medical history scholarship",
    "Sushruta Samhita; published translations and medical-history literature",
    ["13-15", "16-18", "18+"],
))
records.append(rec(
    "sci-003", "Aryabhata's Astronomy — Eclipses and the Spinning Earth", "Ancient Science and Mathematics", "Aryabhata",
    "Aryabhata (c. 499 CE) explained eclipses as shadows, calculated pi precisely, and proposed that the Earth rotates on its axis.",
    "Aryabhata's Aryabhatiya (c. 499 CE) treats mathematics and astronomy in 118 verses. It states that eclipses occur when the Moon's shadow falls on the Earth or the Moon enters the Earth's shadow — removing supernatural explanations from the phenomenon. It gives the length of the year as 365.258 days (close to the modern 365.256 sidereal figure), computes pi to about 3.1416, and describes the Earth as spinning on its axis, which explains the apparent motion of the stars. Later Indian astronomers, including Brahmagupta and Bhaskara II, built on and debated his work. India's first satellite, launched in 1975, was named Aryabhata in his honour.",
    ["Aryabhata"],
    ["aryabhata", "eclipse", "astronomy", "pi", "rotation", "aryabhatiya"],
    ["How does Aryabhata explain eclipses?", "What is the Aryabhatiya?", "What was named after Aryabhata in 1975?"],
    "Aryabhatiya; astronomy history",
    "Aryabhatiya (c. 499 CE); ISRO Aryabhata satellite (1975)",
    ["9-12", "13-15", "16-18", "18+"],
))

# ---- Festivals and Traditions ----
records.append(rec(
    "fest-001", "Diwali — The Festival of Lights", "Festivals and Traditions", "Diwali",
    "Diwali, celebrated across India, marks different regional stories: Rama's return to Ayodhya, Krishna's victory over Narakasura, and the Jain Tirthankara Mahavira's nirvana.",
    "Diwali falls in the autumn (Ashvin-Kartika months) and is celebrated in different ways across regions. In North India many families commemorate Rama's return to Ayodhya after defeating Ravana, with lamps traditionally lit to guide him home. In South India the day often marks Krishna's defeat of the demon Narakasura. For Jains it is the nirvana anniversary of Mahavira; for Sikhs it is the release of Guru Hargobind from imprisonment. The Bhai Dooj festival follows Diwali, honouring the bond between sisters and brothers. Fireworks, lamps and sweets are common, and the day after is the Hindu new year in many western and northern regions.",
    ["Rama", "Krishna", "Mahavira", "Guru Hargobind"],
    ["diwali", "festival", "lights", "ramayana", "narakasura", "mahavira", "bhai dooj"],
    ["Why is Diwali celebrated in North India?", "Which Jain festival coincides with Diwali?", "What is Bhai Dooj?"],
    "Regional festival traditions",
    "Documented regional Diwali traditions; Jain and Sikh festival calendars",
    ["6-8", "9-12", "13-15", "16-18"],
))
records.append(rec(
    "fest-002", "Holi — The Festival of Colours", "Festivals and Traditions", "Holi",
    "Holi welcomes spring with colours, bonfires, and the story of Prahlad and Holika's fire.",
    "Holi is celebrated in the spring month of Phalguna. The evening before involves Holika Dahan bonfires, recalling the Puranic story of the boy Prahlad, a devoted worshipper of Vishnu, whose tyrannical father Hiranyakashipu tried to kill him; the demoness Holika, immune to fire, sat with him on a pyre, but by the traditional narrative the fire spared Prahlad and consumed Holika. The next day involves colour throwing, sweets like gujiya, and community music. Regional names vary — Lathmar Holi in Barsana and Nandgaon involves playful stick-swinging, and in Odisha it is called Dola Purnima. The festival's theme is the triumph of good over evil and the arrival of spring.",
    ["Prahlad", "Hiranyakashipu", "Vishnu"],
    ["holi", "colours", "prahlad", "holika", "spring", "festival"],
    ["What does Holika Dahan commemorate?", "What is Lathmar Holi?", "Which season does Holi welcome?"],
    "Puranic narratives and regional customs",
    "Bhagavata Purana Prahlad narrative; documented regional Holi customs",
    ["6-8", "9-12", "13-15"],
))
records.append(rec(
    "fest-003", "Navratri and Durga Puja", "Festivals and Traditions", "Navratri",
    "Nine nights honouring the goddess Durga in her many forms, celebrated across India with distinct regional traditions.",
    "Navratri ('nine nights') honours Durga and her forms, culminating in Vijayadashami (Dussehra), which commemorates Rama's defeat of Ravana in North India and Durga's defeat of the buffalo demon Mahishasura in Bengal and eastern regions. In Gujarat, communities perform the garba and dandiya dances. In Bengal, Durga Puja is the largest annual festival, with elaborate clay idols, pandals, and rituals — UNESCO inscribed Kolkata's Durga Puja as intangible cultural heritage in 2021. Fasting, music and feasting vary by family and region. The festival's core narrative celebrates the goddess's power protecting order.",
    ["Durga", "Rama", "Mahishasura"],
    ["navratri", "durga", "dussehra", "garba", "durga puja", "festival"],
    ["What does Dussehra commemorate in North India?", "Which dances are performed during Navratri in Gujarat?", "When did UNESCO inscribe Durga Puja?"],
    "Regional traditions and cultural heritage documentation",
    "UNESCO Intangible Cultural Heritage inscription (2021); regional Navratri traditions",
    ["6-8", "9-12", "13-15", "16-18"],
))

# ---- Ethics and Values ----
records.append(rec(
    "eth-001", "Satya — Truthfulness in Everyday Life", "Ethics and Values", "Satya",
    "Satya means truth — not only saying what is true but living consistently with it.",
    "Satya (truth) appears in Vedic literature and in Patanjali's Yoga Sutras as one of the yamas. Indian traditions treat truth as more than not lying: it includes consistency between words, intention and action. The Mahabharata dramatises hard cases — Yudhishthira's conditional half-truth about Ashwatthama in the war debate raises the question of whether a truth that causes harm is fully truthful. Gandhi made satya the foundation of his public life alongside ahimsa, stating his autobiography as 'The Story of My Experiments with Truth'. Students can practise satya by being honest in work, tests and relationships even when it costs them.",
    ["Yudhishthira", "Gandhi"],
    ["satya", "truth", "honesty", "ethics", "yama", "gandhi"],
    ["What does satya mean?", "What ethical question does Yudhishthira's half-truth raise?", "Which two principles did Gandhi combine?"],
    "Yoga Sutras and Mahabharata traditions",
    "Yoga Sutras 2.36; Mahabharata Drona Parva; Gandhi's autobiography",
    ["9-12", "13-15", "16-18", "18+"],
))
records.append(rec(
    "eth-002", "Ahimsa in Daily Practice", "Ethics and Values", "Ahimsa practice",
    "Ahimsa is not only avoiding physical harm but reducing harm in speech, thought, food, and treatment of nature.",
    "Classical texts apply ahimsa broadly: the Yoga Sutras list it as the first yama, Jain teaching extends it to all living beings with great care, and the Mahabharata debates it in the context of war. Practically, students apply ahimsa by avoiding hurtful words, not bullying, treating animals with care, and reducing waste that harms the environment. Gandhi's satyagraha showed ahimsa as social action — resisting injustice without dehumanising the opponent. Indian tradition distinguishes the ideal (often absolute in Jain practice) from everyday guidance (Hindu and Buddhist texts discuss context), which is why thoughtful application matters.",
    ["Gandhi", "Mahavira"],
    ["ahimsa", "nonviolence", "practice", "ethics", "speech", "environment"],
    ["How can students practise ahimsa daily?", "Which tradition applies ahimsa most strictly?", "What is satyagraha?"],
    "Yoga Sutras; Jain ethics; Gandhian literature",
    "Yoga Sutras 2.30; Jain anuvrat movement documentation; Gandhi's Hind Swaraj",
    ["9-12", "13-15", "16-18", "18+"],
))
records.append(rec(
    "eth-003", "Seva — Service as a Value", "Ethics and Values", "Seva",
    "Seva means selfless service — helping others without expecting reward, a value visible across Indian traditions.",
    "Seva (service) appears in Sikh tradition as central practice, in the Bhagavad Gita's teaching of action without selfish attachment, and in everyday Indian life through langar (community kitchens), temple volunteering, and festivals that involve feeding others. The Gita frames it as karma yoga: work offered beyond oneself. Students practise seva by tutoring younger children, helping with household and community work, and participating in cleanliness drives — an idea modern India echoes in the Swachh Bharat mission. Seva contrasts with charity as transaction: its classical sense is service without the need for recognition.",
    ["Krishna", "Guru Nanak"],
    ["seva", "service", "langar", "karma yoga", "community", "ethics"],
    ["What is seva?", "What is langar?", "How does seva relate to karma yoga?"],
    "Guru Granth Sahib traditions; Bhagavad Gita",
    "Sikh langar practice; Bhagavad Gita karma yoga sections",
    ["9-12", "13-15", "16-18"],
))

# ---- Kings and Kingdoms ----
records.append(rec(
    "king-001", "The Mauryan Empire and Ashoka's Dhamma", "Kings and Kingdoms", "Mauryan Empire",
    "The Mauryan Empire (c. 322–185 BCE) unified much of the subcontinent; Ashoka's transformation after the Kalinga war is documented in his own inscriptions.",
    "Founded by Chandragupta Maurya around 322 BCE with guidance from his minister Chanakya (Kautilya), the Mauryan Empire became the largest unified polity in ancient India, with capital at Pataliputra (modern Patna). Its administrative model is described in Chanakya's Arthashastra, a treatise on statecraft, economics and warfare. The empire's most famous ruler, Ashoka (c. 268–232 BCE), fought a brutal war against Kalinga, and his own rock edicts record remorse — he then promoted dhamma (ethical conduct), built hospitals and rest houses, and sent envoys across Asia. His lion capital from Sarnath is now India's national emblem, and the Ashoka Chakra appears on the national flag.",
    ["Chandragupta Maurya", "Chanakya", "Ashoka"],
    ["maurya", "ashoka", "kalinga", "chanakya", "arthashastra", "patliputra", "edicts"],
    ["Which war changed Ashoka's policies?", "Who wrote the Arthashastra?", "Where does the Ashoka Chakra appear today?"],
    "Ashokan edicts; Arthashastra",
    "Ashoka's rock and pillar edicts (documented inscriptions); Kautilya's Arthashastra",
    ["9-12", "13-15", "16-18", "18+"],
))
records.append(rec(
    "king-002", "The Gupta Era — Classical Golden Age", "Kings and Kingdoms", "Gupta Empire",
    "The Gupta Empire (c. 320–550 CE) saw major developments in mathematics, astronomy, literature, and art — the era of Kalidasa and Aryabhata.",
    "The Gupta Empire, founded by Chandragupta I around 320 CE with capital at Pataliputra, is celebrated as a classical golden age of Indian civilisation. Under Samudragupta the empire expanded widely; under Chandragupta II it patronised scholars — the poet-dramatist Kalidasa, whose works like Abhijnanashakuntalam are literary landmarks, and the astronomer Aryabhata, whose Aryabhatiya advanced mathematics. Nalanda University flourished in this era, attracting students from across Asia. Sanskrit theatre, sculpture (Sarnath school) and painting (Ajanta caves) reached new refinement. Chinese Buddhist pilgrims Fa-Hien visited during this era, documenting the society they saw.",
    ["Chandragupta I", "Samudragupta", "Chandragupta II", "Kalidasa", "Aryabhata"],
    ["gupta", "golden age", "kalidasa", "aryabhata", "nalanda", "sanskrit", "classical"],
    ["Which university flourished in the Gupta era?", "Which poet lived under Chandragupta II?", "Which caves contain Gupta-era paintings?"],
    "Gupta inscriptions; literary records; pilgrim accounts",
    "Gupta-era inscriptions; Kalidasa's works; Fa-Hien's travel record",
    ["9-12", "13-15", "16-18", "18+"],
))
records.append(rec(
    "king-003", "Rajendra Chola and the Naval Empire", "Kings and Kingdoms", "Chola Empire",
    "The Chola dynasty (ninth–thirteenth century CE) built a maritime empire under Rajendra I that projected power across Southeast Asia.",
    "The Chola dynasty of Tamilakam, with capitals at Thanjavur and later Gangaikonda Cholapuram, became a major maritime power under Rajaraja I (r. 985–1014) and his son Rajendra Chola I (r. 1014–1044). The Brihadisvara temple at Thanjavur, built under Rajaraja, is a UNESCO World Heritage Site. Rajendra I sent naval expeditions to Sri Vijaya in Southeast Asia — documented in Tamil inscriptions — and conquered regions up to the Ganga, taking the title 'Gangaikonda'. Chola administration produced detailed inscriptions recording land, taxes and village assemblies (the urar and sabha), among the most detailed medieval records in the world. Their bronze sculpture, especially Chola bronzes of Nataraja, remains celebrated.",
    ["Rajaraja I", "Rajendra Chola I"],
    ["chola", "rajaraja", "rajendra", "thanjavur", "brihadisvara", "naval", "inscription"],
    ["Which temple did Rajaraja I build at Thanjavur?", "What does 'Gangaikonda' mean?", "Which Southeast Asian power did Rajendra I attack?"],
    "Chola inscriptions; UNESCO heritage documentation",
    "Tamil Chola inscriptions; Brihadisvara temple UNESCO World Heritage listing",
    ["13-15", "16-18", "18+"],
))

with io.open("data/mythology_dataset.json", "r", encoding="utf-8") as f:
    existing = json.load(f)

existing.extend(records)

with io.open("data/mythology_dataset.json", "w", encoding="utf-8") as f:
    json.dump(existing, f, indent=2, ensure_ascii=False)

print("total records:", len(existing))
print("categories:", sorted({r['category'] for r in existing}))
