#!/usr/bin/env python3
"""Real-browser layout regression checks; requires Python Playwright and Chromium."""
from __future__ import annotations

import json
import os
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError as exc:
    raise SystemExit(
        "Playwright is required for this optional browser test. "
        "Run it with a Python environment that has playwright installed."
    ) from exc

ROOT = Path(__file__).resolve().parents[1]
VIEWPORTS = [
    (1280, 800),
    (1365, 768),
    (1536, 1024),
    (1024, 600),
    (360, 800),
    (390, 844),
    (412, 915),
]


class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_args):
        pass


def synthetic_state_script(fixed_now: str = "2026-11-19T12:00:00") -> str:
    missions = [
        {
            "id": f"layout-mission-{i}",
            "title": (
                f"합성 미션 {i:02d} — 좁은 화면에서도 전체 제목과 목록을 확인하기 위한 긴 테스트 문구"
            ),
            "points": 5,
            "due": "",
            "bonus": 0,
            "member": "m3",
            "days": [],
            "doneOn": None,
            "doneAt": "",
            "earned": 0,
            "goalMet": False,
            "earlyBonusEarned": 0,
        }
        for i in range(1, 9)
    ]
    wishes = [
        {
            "id": f"layout-wish-{i}",
            "title": f"합성 위시 항목 {i:02d}",
            "need": 150 + i * 10,
            "cat": "supply",
            "at": "2026-11-19",
            "by": "m3",
            "boughtAt": "",
        }
        for i in range(1, 13)
    ]
    state = {
        "v": 3,
        "theme": "light",
        "dashboardTitle": "",
        "showAdultMissions": False,
        "parentPin": "0000",
        "members": [
            {"id": "m1", "name": "성인 A", "color": "#ff7a6b"},
            {"id": "m2", "name": "성인 B", "color": "#21c39a"},
            {"id": "m3", "name": "아이", "color": "#4f95ff"},
        ],
        "missions": missions,
        "points": {"total": 100, "byMember": {"m3": 100}},
        "pokemon": {"key": "pikachu", "xp": 0, "dex": [], "caught": {}},
        "wishlist": wishes,
        "school": {"name": "합성학교", "cls": "1학년", "byDate": {}},
        "events": [
            {"id": "layout-event-01", "date": "2026-08-31", "time": "09:00", "title": "합성 일정 01", "member": "m3", "done": False},
            {"id": "layout-event-02", "date": "2026-09-01", "time": "10:00", "title": "합성 일정 02", "member": "m3", "done": False},
            {"id": "layout-event-03", "date": "2026-09-02", "time": "11:00", "title": "합성 일정 03", "member": "m3", "done": False},
        ],
        "logs": [],
        "letters": [],
        "shopping": [],
        "wiki": [],
        "links": [],
        "pointUses": [],
    }
    encoded = json.dumps(state, ensure_ascii=False)
    return f"""(() => {{
      const NativeDate = Date;
      const fixedNow = new NativeDate({json.dumps(fixed_now)});
      window.Date = class SyntheticDate extends NativeDate {{
        constructor(...args) {{ super(...(args.length ? args : [fixedNow.getTime()])); }}
        static now() {{ return fixedNow.getTime(); }}
      }};
      const state = {encoded};
      const d = new Date();
      const today = `${{d.getFullYear()}}-${{String(d.getMonth() + 1).padStart(2, '0')}}-${{String(d.getDate()).padStart(2, '0')}}`;
      state.school.byDate[today] = {{
        meal: {json.dumps(", ".join(f"합성급식{i:02d}" for i in range(1, 21)), ensure_ascii=False)},
        timetable: {json.dumps(", ".join(f"합성준비물항목{i:02d}-추가안내" for i in range(1, 21)), ensure_ascii=False)}
      }};
      localStorage.setItem('family-dashboard:v1', JSON.stringify(state));
      localStorage.removeItem('family-dashboard:weather');
    }})();"""


MEASURE_SCRIPT = r"""() => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const overlapArea = (a, b) => {
    if (!a || !b) return 0;
    return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  };
  const inBox = (child, box) => child && box
    && child.left >= box.left - 1 && child.right <= box.right + 1
    && child.top >= box.top - 1 && child.bottom <= box.bottom + 1;
  const style = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return { display: s.display, overflowY: s.overflowY, height: s.height, minHeight: s.minHeight, maxHeight: s.maxHeight };
  };

  const missionList = document.querySelector('#missionScroll');
  const schoolBody = document.querySelector('#schoolBody');
  const wishList = document.querySelector('#wishList');
  const calendar = document.querySelector('#calGrid');
  const schedule = document.querySelector('#cardSchedule');
  const upcoming = document.querySelector('#upcomingEvents');
  const missionBanner = document.querySelector('#freeBannerMission');
  const scheduleBanner = document.querySelector('#freeBannerSchedule');
  if (missionList) {
    const last = document.querySelector('#choreList > .chore:last-of-type');
    if (last) missionList.scrollTop = last.getBoundingClientRect().top - missionList.getBoundingClientRect().top + missionList.scrollTop - 4;
  }
  if (schoolBody) schoolBody.scrollTop = schoolBody.scrollHeight;
  if (wishList) wishList.scrollTop = wishList.scrollHeight;

  const missionRows = [...document.querySelectorAll('#choreList > .chore')];
  const chips = [...document.querySelectorAll('#schoolBody .sch-chip:not(.sch-more)')];
  const visibleChips = [...document.querySelectorAll('#schoolBody .sch-chip:not([hidden])')];
  const summaryButtons = [...document.querySelectorAll('#schoolBody .sch-more')];
  const wishItems = [...document.querySelectorAll('#wishList > .wish-item, #wishList > .wish-card')];
  const fbPill = document.querySelector('#fbPill');
  const school = document.querySelector('#cardSchool');
  const wish = document.querySelector('#cardWish');
  const balance = document.querySelector('#wishSub');
  const lastMission = missionRows.at(-1);
  const lastChip = visibleChips.at(-1);
  const lastWish = wishItems.at(-1);
  const missionRect = rect(missionList);
  const schoolBodyRect = rect(schoolBody);
  const wishListRect = rect(wishList);
  const balanceRect = rect(balance);
  const wishRect = rect(wish);
  const scheduleRect = rect(schedule);
  const upcomingRect = rect(upcoming);
  const primaryCards = ['#cardOverview', '#cardSchedule', '#cardSchool', '#cardWish', '#cardChores', '#cardTimer']
    .map((selector) => document.querySelector(selector)).filter(Boolean);

  return {
    viewport: [innerWidth, innerHeight],
    pageWidth: document.documentElement.scrollWidth,
    pill: {
      rect: rect(fbPill),
      overlapsPrimaryCards: primaryCards.some((card) => overlapArea(rect(fbPill), rect(card)) > 0),
    },
    columns: [...document.querySelectorAll('.col')].map((el) => style(el)),
    calendar: {
      weekCount: Number(getComputedStyle(calendar).getPropertyValue('--calendar-weeks')) || 0,
      cellCount: calendar?.querySelectorAll('.cal-cell').length || 0,
      isSunday: new Date().getDay() === 0,
      missionBannerVisible: !!missionBanner && !missionBanner.hidden && rect(missionBanner).height > 0,
      scheduleBannerVisible: !!scheduleBanner && !scheduleBanner.hidden
        && getComputedStyle(scheduleBanner).display !== 'none' && rect(scheduleBanner).height > 0,
      upcomingFullyInsideCard: inBox(upcomingRect, scheduleRect),
    },
    missions: {
      count: missionRows.length,
      rect: missionRect,
      style: style(missionList),
      scrollHeight: missionList?.scrollHeight || 0,
      clientHeight: missionList?.clientHeight || 0,
      lastRowFullyReachable: inBox(rect(lastMission), missionRect),
      stampFollowsList: document.querySelector('#choreList').compareDocumentPosition(document.querySelector('.mission-stamp-board')) === Node.DOCUMENT_POSITION_FOLLOWING,
      longTitleWraps: (document.querySelector('#choreList .chore-title')?.scrollHeight || 0)
        <= (document.querySelector('#choreList .chore-title')?.clientHeight || 0) + 1,
    },
    school: {
      rect: rect(school),
      bodyRect: schoolBodyRect,
      bodyStyle: style(schoolBody),
      chipCount: chips.length,
      summaryCount: summaryButtons.length,
      hiddenExtraCount: document.querySelectorAll('#schoolBody .sch-extra[hidden]').length,
      scrollHeight: schoolBody?.scrollHeight || 0,
      clientHeight: schoolBody?.clientHeight || 0,
      lastChipFullyReachable: inBox(rect(lastChip), schoolBodyRect),
    },
    wish: {
      rect: wishRect,
      style: style(wish),
      balanceInHeader: !!balance && /🪙\s*\d+P/.test(balance.textContent || '')
        && balanceRect.height > 0 && overlapArea(balanceRect, wishRect) > 0,
      subtitleSingleLine: !!balance && balance.scrollHeight <= balance.clientHeight + 1,
      listStyle: style(wishList),
      itemCount: wishItems.length,
      clientH: wishList?.clientHeight || 0,
      lastItemFullyReachable: inBox(rect(lastWish), wishListRect),
      cardHasUncontainedContent: !!wish && wish.scrollHeight > wish.clientHeight + 1,
    },
  };
}"""


def assert_condition(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def main() -> None:
    handler = QuietHandler
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"
    failures: list[str] = []
    browser_path = os.environ.get("CHROMIUM_PATH") or shutil.which("chromium") or shutil.which("chromium-browser")

    try:
        with sync_playwright() as playwright:
            launch_args = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
            if browser_path:
                launch_args["executable_path"] = browser_path
            browser = playwright.chromium.launch(**launch_args)
            page = browser.new_page(viewport={"width": 1280, "height": 800})

            def allow_local_only(route):
                if route.request.url.startswith(base_url + "/") or route.request.url.startswith("data:"):
                    route.continue_()
                else:
                    route.abort()

            page.route("**/*", allow_local_only)
            page.add_init_script(synthetic_state_script())
            page.goto(base_url + "/index.html", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_function("document.querySelectorAll('#choreList > .chore').length === 8", timeout=15000)
            page.wait_for_timeout(300)

            assert_condition(page.locator("#schoolBody .sch-more").count() == 0,
                             "school: obsolete disclosure button remains", failures)
            assert_condition(page.locator("#schoolBody .sch-chip[hidden]").count() == 0,
                             "school: entries are still hidden", failures)

            for width, height in VIEWPORTS:
                page.set_viewport_size({"width": width, "height": height})
                page.wait_for_timeout(80)
                result = page.evaluate(MEASURE_SCRIPT)
                label = f"{width}x{height}"
                assert_condition(result["pageWidth"] <= width + 1,
                                 f"{label}: horizontal page overflow ({result['pageWidth']}px > {width}px)", failures)
                assert_condition(result["calendar"]["weekCount"] == 5 and result["calendar"]["cellCount"] == 35,
                                 f"{label}: synthetic November calendar is not a complete 5-week/35-cell month", failures)
                assert_condition(not result["calendar"]["isSunday"] and not result["calendar"]["missionBannerVisible"],
                                 f"{label}: weekday baseline unexpectedly shows the free-day banner", failures)
                assert_condition(not result["calendar"]["scheduleBannerVisible"],
                                 f"{label}: schedule free-day banner is visible over the calendar", failures)
                assert_condition(not result["pill"]["overlapsPrimaryCards"],
                                 f"{label}: Firebase pill overlaps a dashboard card", failures)
                assert_condition(result["missions"]["count"] == 8,
                                 f"{label}: expected 8 synthetic mission rows, got {result['missions']['count']}", failures)
                assert_condition(result["missions"]["lastRowFullyReachable"],
                                 f"{label}: last mission row is clipped after scrolling the mission list", failures)
                assert_condition(result["school"]["chipCount"] == 40,
                                 f"{label}: expected 40 synthetic school chips, got {result['school']['chipCount']}", failures)
                assert_condition(result["school"]["lastChipFullyReachable"],
                                 f"{label}: last school chip is clipped after scrolling the school body", failures)
                assert_condition(result["school"]["summaryCount"] == 0,
                                 f"{label}: school rows do not expose all chips without disclosure", failures)
                if (width, height) == (1024, 600):
                    assert_condition(result["school"]["bodyStyle"]["overflowY"] in ("auto", "scroll")
                                     and result["school"]["summaryCount"] == 0,
                                     "1024x600: school rows do not remain readable with internal scroll", failures)
                assert_condition(result["wish"]["balanceInHeader"],
                                 f"{label}: wish balance is missing from the card header", failures)
                assert_condition(result["wish"]["subtitleSingleLine"],
                                 f"{label}: wish balance/count subtitle wraps to multiple lines", failures)
                assert_condition(result["wish"]["lastItemFullyReachable"],
                                 f"{label}: last wish item is clipped after scrolling the wish list", failures)
                assert_condition(result["wish"]["clientH"] >= 32,
                                 f"{label}: wish list is shorter than 32px ({result['wish']['clientH']}px)", failures)
                if width <= 1023:
                    assert_condition(result["wish"]["style"]["maxHeight"] == "none",
                                     f"{label}: mobile wishlist has a fixed max-height", failures)
                    assert_condition(not result["wish"]["cardHasUncontainedContent"],
                                     f"{label}: mobile wishlist card has content clipped by a fixed height", failures)
                if (width, height) in ((1024, 600), (1280, 800), (1365, 768)):
                    assert_condition(result["school"]["rect"]["height"] == 96
                                     and result["wish"]["rect"]["height"] == 96,
                                     f"{label}: approved 96px school/wish card height changed", failures)
                if (width, height) == (1024, 600):
                    assert_condition(all(col["overflowY"] in ("auto", "scroll") for col in result["columns"]),
                                     "1024x600: columns are not vertically scrollable", failures)
                    assert_condition(result["missions"]["clientHeight"] >= 100,
                                     f"1024x600: mission list is too short for two rows ({result['missions']['clientHeight']}px)", failures)

                print(
                    f"{label}: pageWidth={result['pageWidth']}, "
                    f"missionList={result['missions']['clientHeight']}px/{result['missions']['count']} rows, "
                    f"schoolChips={result['school']['chipCount']} +{result['school']['summaryCount']} summaries, "
                    f"wishList={result['wish']['clientH']}px (last reachable={result['wish']['lastItemFullyReachable']}), "
                    f"calendar={result['calendar']['weekCount']} weeks, Sunday={result['calendar']['isSunday']}, "
                    f"badgeOverlap={result['pill']['overlapsPrimaryCards']}"
                )

            # The lower stamp board stays discoverable and reachable by keyboard.
            page.set_viewport_size({"width": 1280, "height": 800})
            page.locator("#stampBoardOpenBtn").focus()
            page.keyboard.press("Enter")
            page.wait_for_timeout(400)
            stamp_access = page.evaluate("""() => {
              const wrap = document.querySelector('#missionScroll'), board = document.querySelector('.mission-stamp-board');
              const w = wrap.getBoundingClientRect(), b = board.getBoundingClientRect();
              return document.activeElement === board && b.top >= w.top - 1 && b.bottom <= w.bottom + 1;
            }""")
            assert_condition(stamp_access, "stamp board: keyboard shortcut did not reveal and focus the board", failures)
            page.locator(".stamp-help summary").click()
            page.locator(".stamp-help").scroll_into_view_if_needed()
            help_access = page.evaluate("""() => {
              const wrap = document.querySelector('#missionScroll').getBoundingClientRect();
              return document.querySelector('.stamp-help').open && document.querySelector('#readingNote').getBoundingClientRect().bottom <= wrap.bottom + 1;
            }""")
            assert_condition(help_access, "stamp board: expanded help is clipped", failures)
            page.locator(".stamp-help").evaluate("el => el.open = false")

            # Stress the connected label width without any remote account or writes.
            page.evaluate("""() => {
              const row = document.querySelector('#memberStats .mstat');
              row.querySelector('.mstat-name').textContent = '김아이수호 🧒';
              row.querySelector('.mstat-streak').textContent = '🔥 연속 119+일 · 01/01~';
              row.querySelector('.mstat-total').textContent = '누적 99999P';
            }""")
            for width, height in ((360, 800), (390, 844), (768, 1024), (820, 1180)):
                page.set_viewport_size({"width": width, "height": height})
                page.wait_for_timeout(80)
                inside = page.evaluate("""() => {
                  const row = document.querySelector('#memberStats .mstat'), box = row.getBoundingClientRect();
                  return row.scrollWidth <= row.clientWidth + 1 && [...row.children].every(e => {
                    const r = e.getBoundingClientRect();
                    return r.right <= box.right + 1 && r.bottom <= box.bottom + 1;
                  });
                }""")
                assert_condition(inside, f"{width}x{height}: long streak/point label clipped", failures)
                print(f"{width}x{height}: long connected streak and points inside member row={inside}")

            sunday_page = browser.new_page(viewport={"width": 1280, "height": 800})
            sunday_page.route("**/*", allow_local_only)
            sunday_page.add_init_script(synthetic_state_script("2026-08-30T12:00:00"))
            sunday_page.goto(base_url + "/index.html", wait_until="domcontentloaded", timeout=30000)
            sunday_page.wait_for_function("document.querySelectorAll('#choreList > .chore').length === 8", timeout=15000)
            sunday_page.wait_for_timeout(300)
            for width, height in ((1280, 800), (1365, 768), (1536, 1024)):
                sunday_page.set_viewport_size({"width": width, "height": height})
                sunday_page.wait_for_timeout(80)
                result = sunday_page.evaluate(MEASURE_SCRIPT)
                label = f"{width}x{height} Sunday"
                assert_condition(result["calendar"]["weekCount"] == 6 and result["calendar"]["cellCount"] == 42,
                                 f"{label}: August calendar is not a complete 6-week/42-cell month", failures)
                assert_condition(result["calendar"]["isSunday"] and result["calendar"]["missionBannerVisible"],
                                 f"{label}: 6-week Sunday free-day condition was not active", failures)
                assert_condition(not result["calendar"]["scheduleBannerVisible"],
                                 f"{label}: schedule free-day banner is visible over the calendar", failures)
                assert_condition(result["calendar"]["upcomingFullyInsideCard"],
                                 f"{label}: upcoming-event strip is clipped outside the schedule card", failures)
                print(
                    f"{label}: {result['calendar']['weekCount']} weeks/42 cells, "
                    f"Sunday mission banner={result['calendar']['missionBannerVisible']}, "
                    f"upcomingInside={result['calendar']['upcomingFullyInsideCard']}"
                )
            sunday_page.close()

            browser.close()
    finally:
        server.shutdown()
        server.server_close()

    if failures:
        raise SystemExit("\nLAYOUT REGRESSION FAILURES:\n- " + "\n- ".join(failures))
    print(f"PASS: {len(VIEWPORTS)} viewport layouts and 3 six-week Sunday scenarios passed with synthetic data.")


if __name__ == "__main__":
    main()
