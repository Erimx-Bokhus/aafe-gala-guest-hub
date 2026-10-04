"""Turn each app's single-file build into ONE self-contained HTML that opens by double-click in Safari/Chrome/Edge.
- images inlined as base64
- inlined app script converted to a classic <script> at the end of <body> (no ES-module loading on file://)
Run after `npm run build`:  python3 scripts/make_open_files.py
"""
import base64, os, re
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pub = f'{root}/shared/public'
for app, out in [('guest-portal', 'OPEN-Guest-Portal.html'), ('staff-app', 'OPEN-Staff-App.html')]:
    s = open(f'{root}/{app}/dist/index.html').read()
    for sub in ['photos', 'brand']:
        for f in os.listdir(f'{pub}/{sub}'):
            mime = 'image/jpeg' if f.endswith('.jpg') else 'image/png'
            s = s.replace(f'./{sub}/{f}', f'data:{mime};base64,' + base64.b64encode(open(f'{pub}/{sub}/{f}', 'rb').read()).decode())
    start = s.index('<script type="module" crossorigin>')
    end = s.index('</script>', start) + len('</script>')
    body = s[start + len('<script type="module" crossorigin>'):end - len('</script>')]
    s = s[:start] + s[end:]
    s = s.replace('</body>', '<script>' + body + '</script>\n</body>')
    assert 'type="module"' not in s and './photos/' not in s
    open(f'{root}/{out}', 'w').write(s)
    print('wrote', out, f'{len(s)/1e6:.1f} MB')
