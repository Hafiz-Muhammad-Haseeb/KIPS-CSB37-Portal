from html.parser import HTMLParser
from collections import Counter
from pathlib import Path

file = Path("production-build/index.html")

if not file.exists():
    raise SystemExit("Production HTML not found.")

class Audit(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.events = []
        self.inline_scripts = []
        self.current_script = None
        self.inline_styles = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)

        for name, value in attrs.items():
            if name and name.lower().startswith("on"):
                self.events.append((
                    tag,
                    name.lower(),
                    (value or "").strip()
                ))

            if name == "style":
                self.inline_styles += 1

        if tag.lower() == "script" and not attrs.get("src"):
            self.current_script = []

    def handle_data(self, data):
        if self.current_script is not None:
            self.current_script.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "script" and self.current_script is not None:
            content = "".join(self.current_script).strip()

            if content:
                self.inline_scripts.append(content)

            self.current_script = None

parser = Audit()
parser.feed(file.read_text(encoding="utf-8"))

print("\n===== INLINE EVENT COUNTS =====")

for name, count in Counter(
    event[1] for event in parser.events
).most_common():
    print(f"{name}: {count}")

print(f"\nTotal inline handlers: {len(parser.events)}")
print(f"Inline style attributes: {parser.inline_styles}")
print(f"Inline script blocks: {len(parser.inline_scripts)}")

print("\n===== FIRST 20 HANDLER EXAMPLES =====")

for tag, name, value in parser.events:
    print(f"\n<{tag}> {name}=")
    print((value or "[empty]")[:180])

print("\n===== INLINE SCRIPT SIZES =====")

for index, script in enumerate(parser.inline_scripts, 1):
    print(f"Script {index}: {len(script)} characters")

print("\nAudit completed. No files changed.")

