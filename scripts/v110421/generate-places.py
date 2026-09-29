"""Generate the pinned public-domain Census place lookup (no runtime download).

Usage: python scripts/v110421/generate-places.py /path/2025_Gaz_place_national.zip
Source: https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip
Representative points identify nearby places; they are not municipal boundaries.
"""
import csv
import hashlib
import io
import json
import pathlib
import re
import sys
import zipfile

raw = pathlib.Path(sys.argv[1]).read_bytes()
archive = zipfile.ZipFile(io.BytesIO(raw))
rows = csv.DictReader(io.StringIO(archive.read('2025_Gaz_place_national.txt').decode('utf-8-sig')), delimiter='|')
points = []
for row in rows:
    name = re.sub(r' (city|town|village|borough|municipality|CDP|comunidad|zona urbana)( \(balance\))?$', '', row['NAME'])
    points.append([round(float(row['INTPTLAT']), 5), round(float(row['INTPTLONG']), 5), row['USPS'], name])
points.sort()
assert len(points) > 30000
out = pathlib.Path(__file__).parent / 'censusPlaces.js'
out.write_text('// U.S. Census Bureau, 2025 National Places Gazetteer. Public domain.\n'
               '// ZIP SHA-256: ' + hashlib.sha256(raw).hexdigest() + '\n'
               '// [representative latitude, longitude, state, place]; never a boundary claim.\n'
               'export default ' + json.dumps(points, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(f'{len(points)} places; {out.stat().st_size} bytes')
