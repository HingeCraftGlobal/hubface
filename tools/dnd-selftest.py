#!/usr/bin/env python3
"""HubFace Dashboard Builder widget drag-and-drop self-test (widgetdnd-20261025).
Run from any machine with Playwright + Chrome:  python3 dnd-selftest.py [URL] [CHROME_PATH]
Drags EVERY row in the Builder Widgets list to the top and back down, adds a synthetic widget row at runtime and drags it,
checks order persists after reload and no JS errors. Exit 0 = pass. Appends a line to ./dnd-selftest.log."""
import sys,time
from playwright.sync_api import sync_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'https://hubface.org/interface/?src=dock&t=dndself'
CH=sys.argv[2] if len(sys.argv)>2 else '/usr/bin/google-chrome'
Q="#ui > aside.panel:not(.props) > .witem"
J="()=>[].filter.call(document.querySelectorAll('%s'),e=>e.offsetHeight>0).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top).map(e=>{const s=e.querySelector('span');return (s?s.textContent:'').trim().replace(/\\d+$/,'').trim()})"%Q
fails=[];errs=[]
def order(pg): return pg.evaluate(J)
def box(pg,n): return pg.evaluate("(n)=>{const e=[].find.call(document.querySelectorAll('%s'),e=>{const s=e.querySelector('span');return s&&s.textContent.trim().replace(/\\d+$/,'').trim()===n&&e.offsetHeight>0});const r=e.getBoundingClientRect();return [r.left,r.top,r.width,r.height]}"%Q,n)
def drag(pg,n,to):
    pg.evaluate("()=>document.querySelectorAll('.hfa-ov').forEach(e=>e.remove())")  # guest sign-in prompt from Save; not part of DnD
    x,y,w,h=box(pg,n);x+=min(40,w/3);y+=h/2;tx,ty,tw,th=box(pg,to)
    ty=ty+2 if order(pg).index(to)<order(pg).index(n) else ty+th-2
    pg.mouse.move(x,y);pg.mouse.down();pg.mouse.move(x,y+(8 if ty>y else -8),steps=3);pg.mouse.move(x,ty,steps=12);pg.mouse.up();pg.wait_for_timeout(int(sys.argv[3]) if len(sys.argv)>3 else 400)
def start(pg):
    pg.goto(URL,wait_until='load');pg.wait_for_timeout(7000)
    try: pg.get_by_text('Continue as guest').first.click(timeout=2500)
    except Exception: pass
    pg.wait_for_timeout(1500)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CH,args=['--no-sandbox']);pg=b.new_context(viewport={'width':1440,'height':900}).new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)))
    start(pg)
    if not pg.evaluate("()=>!!window.__widgetDnd"): fails.append('widgetdnd owner script not loaded')
    pg.evaluate("""()=>{const P=document.querySelector('#ui > aside.panel:not(.props)'),t=P.querySelector(':scope > .witem.wopen')||P.querySelector(':scope > .witem');const c=t.cloneNode(true);c.removeAttribute('id');c.querySelector('span').textContent='Selftest Widget';P.appendChild(c);}""")
    pg.wait_for_timeout(2500)
    names=[n for n in order(pg) if n!='Widget Picker']
    if 'Selftest Widget' not in names: fails.append('synthetic widget not listed')
    for n in names:
        o=order(pg)
        if o[0]!=n: drag(pg,n,o[0])
        if order(pg)[0]!=n: fails.append('%s: up to top failed %s'%(n,order(pg)[:3]))
        o=order(pg);last=[k for k in o if k not in(n,'Widget Picker')][-1];drag(pg,n,last)
        if [k for k in order(pg) if k!='Widget Picker'][-1]!=n: fails.append('%s: down to bottom failed %s'%(n,order(pg)))
    pg.evaluate("()=>[].forEach.call(document.querySelectorAll('%s'),e=>{if(e.textContent.includes('Selftest Widget'))e.remove()})"%Q)
    real=[n for n in names if n!='Selftest Widget'];drag(pg,real[-1],order(pg)[0]);pg.wait_for_timeout(2500);want=order(pg)
    start(pg);got=order(pg)
    if got!=want: fails.append('order not persisted after reload: %s vs %s'%(got,want))
    if errs: fails.append('js errors: %s'%errs[:3])
    pg.screenshot(path='/tmp/dnd-selftest.png');b.close()
res='PASS' if not fails else 'FAIL'
line='%s %s rows=%d %s'%(time.strftime('%Y-%m-%d %H:%M:%S'),res,len(names),'; '.join(fails))
print(line);open('dnd-selftest.log','a').write(line+'\n');sys.exit(0 if not fails else 1)
