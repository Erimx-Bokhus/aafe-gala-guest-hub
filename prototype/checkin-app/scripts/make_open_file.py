"""Rebuild prototype/OPEN-CheckIn-App.html, the check-in app's double-click copy.
It is the single-file build (checkin-app/dist/index.html) with the logo and photos from shared/public inlined.
Run from prototype/checkin-app after `npm run build`:  python3 scripts/make_open_file.py
Rebuilding from an unchanged door list gives the committed file byte for byte, so a diff shows only real changes.
"""
import base64, os, re
app = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root = os.path.dirname(app)
pub = f'{root}/shared/public'
s = open(f'{app}/dist/index.html', encoding='utf-8').read()
for sub in ['photos', 'brand']:
    for f in os.listdir(f'{pub}/{sub}'):
        mime = 'image/jpeg' if f.endswith('.jpg') else 'image/png'
        s = s.replace(f'./{sub}/{f}', f'data:{mime};base64,' + base64.b64encode(open(f'{pub}/{sub}/{f}', 'rb').read()).decode())
# Same guard as scripts/make_open_files.py: a build made with a Supabase .env.local must not end up in the repo.
if re.search(r'https://[a-z0-9]+\.supabase\.co', s):
    raise SystemExit('The check-in app was built with a Supabase .env.local, so its demo file would carry the project '
                     'address and key. Move checkin-app/.env.local aside, run npm run build again, then rerun this script.')
out = f'{root}/OPEN-CheckIn-App.html'
open(out, 'w', encoding='utf-8', newline='\n').write(s)   # LF on every OS, like scripts/make_open_files.py
print('wrote OPEN-CheckIn-App.html', f'{len(s)/1e6:.1f} MB')
