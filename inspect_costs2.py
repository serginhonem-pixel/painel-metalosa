import json
from pathlib import Path
text = Path('src/data/custos.json').read_text(encoding='utf-8')
data = json.loads(text)
print(len(data))
for entry in data[:5]:
    print(entry['Valores'])
