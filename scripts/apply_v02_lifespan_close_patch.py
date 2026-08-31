from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old!r}")
    p.write_text(text.replace(old, new, 1))


world = Path('src/sim/world.ts')
text = world.read_text()
marker = "const TAU = Math.PI * 2;\n"
if "const MAX_AGE = 1000;" not in text:
    if text.count(marker) != 1:
        raise SystemExit('Could not place MAX_AGE constant')
    text = text.replace(marker, marker + "const MAX_AGE = 1000;\n", 1)
text = text.replace('parent.age > 900', 'parent.age >= MAX_AGE')
text = text.replace('creature.age <= 900', 'creature.age < MAX_AGE')
if '> 900' in text or '<= 900' in text:
    raise SystemExit('Old 900-second lifespan check still present')
world.write_text(text)

old_handlers = """fossilButton.addEventListener('click', () => { renderFossils(); fossilOverlay.classList.remove('hidden'); });
fossilClose.addEventListener('click', () => fossilOverlay.classList.add('hidden'));
fossilOverlay.addEventListener('click', (event) => { if (event.target === fossilOverlay) fossilOverlay.classList.add('hidden'); });"""
new_handlers = """let fossilCloseTimer = 0;
function closeFossilRecord(): void {
  window.clearTimeout(fossilCloseTimer);
  fossilClose.classList.add('pressed');
  fossilClose.textContent = 'Closing…';
  fossilOverlay.classList.add('closing');
  fossilCloseTimer = window.setTimeout(() => {
    fossilOverlay.classList.add('hidden');
    fossilOverlay.classList.remove('closing');
    fossilClose.classList.remove('pressed');
    fossilClose.textContent = 'Close';
  }, 110);
}
function openFossilRecord(): void {
  window.clearTimeout(fossilCloseTimer);
  fossilOverlay.classList.remove('closing', 'hidden');
  fossilClose.classList.remove('pressed');
  fossilClose.textContent = 'Close';
  renderFossils();
}
fossilButton.addEventListener('click', openFossilRecord);
fossilClose.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  closeFossilRecord();
});
fossilClose.addEventListener('click', (event) => {
  event.preventDefault();
  if (!fossilOverlay.classList.contains('hidden') && !fossilOverlay.classList.contains('closing')) closeFossilRecord();
});
fossilOverlay.addEventListener('click', (event) => { if (event.target === fossilOverlay) closeFossilRecord(); });"""
replace_once('src/main.ts', old_handlers, new_handlers)

styles = Path('src/styles.css')
css = styles.read_text()
extra = """
#fossil-close{min-width:84px;min-height:48px;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .08s ease,background .08s ease,border-color .08s ease}
#fossil-close.pressed{transform:translateY(1px) scale(.97);background:#1c7188;border-color:#6fc5d8}
.fossil-overlay{transition:opacity .11s ease}
.fossil-overlay.closing{opacity:.35;pointer-events:none}
@media(prefers-reduced-motion:reduce){.fossil-overlay{transition:none}}
"""
if '#fossil-close{min-width:84px' not in css:
    styles.write_text(css.rstrip() + '\n' + extra.lstrip())
