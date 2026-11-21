"""Fetch a complete official public-holiday year. No credentials in outputs/files.
Run only with an approved portal service key in KASI_SERVICE_KEY environment.
Current year must succeed. Keep prior valid years if next year is not yet published.
"""
import datetime as dt
import json
import os
from pathlib import Path
import sys
import tempfile
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ENDPOINT = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo'

def parse_year(xml, year):
    root = ET.fromstring(xml)
    if root.findtext('./header/resultCode') != '00':
        raise ValueError('Official holiday request did not succeed')
    total = int(root.findtext('./body/totalCount', '-1'))
    items = root.findall('./body/items/item')
    if len(items) != total or not 1 <= total <= 100:
        raise ValueError('Incomplete holiday year, keep previous file')
    bydate = {}
    for item in items:
        if item.findtext('isHoliday') != 'Y':
            continue
        raw = item.findtext('locdate', '')
        date = dt.datetime.strptime(raw, '%Y%m%d').date()
        if date.year != year or len(raw) != 8:
            raise ValueError('Holiday date outside requested year')
        name = item.findtext('dateName', '').strip()
        if not name or len(name) > 100:
            raise ValueError('Invalid holiday name')
        bydate.setdefault(date.isoformat(), set()).add(name)
    if not bydate:
        raise ValueError('No public holidays in successful year')
    return [{'date': date, 'name': ' · '.join(sorted(names))} for date, names in sorted(bydate.items())]

def main():
    key = os.environ.get('KASI_SERVICE_KEY', '')
    if not key:
        raise ValueError('KASI_SERVICE_KEY is required; previous data retained')
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))
    years = [now.year, now.year + 1]
    target = Path(sys.argv[1] if len(sys.argv) > 1 else 'data/kr-holidays.json')
    data = {}
    try:
        old = json.loads(target.read_text(encoding='utf-8'))
        for y, rows in old.get('years', {}).items():
            if y.isdigit() and now.year - 1 <= int(y) <= now.year + 1 and isinstance(rows, list) and rows:
                data[y] = rows
    except Exception:
        pass
    for year in years:
        query = urllib.parse.urlencode({'serviceKey': urllib.parse.unquote(key), 'solYear': year, 'numOfRows': 100, 'pageNo': 1})
        try:
            with urllib.request.urlopen(ENDPOINT + '?' + query, timeout=30) as response:
                xml = response.read(1000000)
            data[str(year)] = parse_year(xml, year)
        except Exception:
            # Never echo HTTP exceptions or URLs, which may include the key.
            if year == now.year:
                raise ValueError('Official holiday fetch failed; previous data retained') from None
            print('Next-year update unavailable; retaining any previous validated next-year list')
    result = {'version': 1, 'country': 'KR', 'source': 'https://www.data.go.kr/data/15012690/openapi.do', 'checkedAt': now.isoformat(), 'years': data}
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=target.parent, delete=False) as out:
        json.dump(result, out, ensure_ascii=False, indent=2)
        out.write('\n')
        temp = out.name
    os.replace(temp, target)
    print('Official holiday data validated and saved for', ', '.join(sorted(data)))

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Holiday refresh failed. Previous data unchanged. Check service authorization and upstream availability.', file=sys.stderr)
        sys.exit(1)
