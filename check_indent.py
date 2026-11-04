with open(r'C:\Users\sahilp\hack-funtastic-4\app.py', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')
for i in range(1230, 1345):
    line = lines[i]
    lead = len(line) - len(line.lstrip(' '))
    print(f'{i+1}: ws={lead} | {line.strip()[:75]}')
