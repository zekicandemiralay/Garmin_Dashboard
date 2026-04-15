"""
Quick Garmin connection test — no database required.
Logs in, fetches yesterday's data, and prints it.

Usage:
    py -3.12 test_connection.py
    py -3.12 test_connection.py --date 2024-03-01
"""

import sys
import argparse
from datetime import date, timedelta, datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
import os

load_dotenv()

from garminconnect import Garmin

EMAIL     = os.getenv("GARMIN_EMAIL")
PASSWORD  = os.getenv("GARMIN_PASSWORD")
TOKEN_DIR = "garth_tokens"


def login() -> Garmin:
    Path(TOKEN_DIR).mkdir(exist_ok=True)
    client = Garmin(email=EMAIL, password=PASSWORD)
    mfa_status, _ = client.login(tokenstore=TOKEN_DIR)

    if mfa_status:
        code = input("MFA code: ").strip()
        client.resume_login(mfa_token=code, tokenstore=TOKEN_DIR)

    print(f"Logged in OK.")
    return client


def fetch_and_print(client: Garmin, target: date):
    ds = target.strftime("%Y-%m-%d")
    print(f"\n{'='*55}")
    print(f"Data for: {ds}")
    print("="*55)

    # ── Daily summary ──────────────────────────────────────────
    print("\n[1/4] Daily Summary")
    try:
        s = client.get_user_summary(ds)
        if s:
            for k, v in [
                ("steps",             s.get("totalSteps")),
                ("step_goal",         s.get("dailyStepGoal")),
                ("resting_hr",        s.get("restingHeartRate")),
                ("body_battery_high", s.get("bodyBatteryHighestValue")),
                ("body_battery_low",  s.get("bodyBatteryLowestValue")),
                ("stress_avg",        s.get("averageStressLevel")),
                ("spo2_avg",          s.get("averageSpo2")),
                ("active_calories",   s.get("activeKilocalories")),
                ("distance_m",        s.get("totalDistanceMeters")),
            ]:
                print(f"  {k:<22} {v}")
        else:
            print("  No data.")
    except Exception as e:
        print(f"  ERROR: {e}")

    # ── Sleep ──────────────────────────────────────────────────
    print("\n[2/4] Sleep")
    try:
        data = client.get_sleep_data(ds)
        if data and "dailySleepDTO" in data:
            s = data["dailySleepDTO"]
            start_ms = s.get("sleepStartTimestampGMT")
            end_ms   = s.get("sleepEndTimestampGMT")
            duration = s.get("sleepTimeSeconds") or 0
            score    = (s.get("sleepScores") or {}).get("overall", {}).get("value")
            print(f"  start         {datetime.fromtimestamp(start_ms/1000, tz=timezone.utc) if start_ms else 'n/a'}")
            print(f"  end           {datetime.fromtimestamp(end_ms/1000, tz=timezone.utc) if end_ms else 'n/a'}")
            print(f"  duration      {duration/3600:.2f} hrs")
            print(f"  deep          {(s.get('deepSleepSeconds') or 0)/60:.0f} min")
            print(f"  light         {(s.get('lightSleepSeconds') or 0)/60:.0f} min")
            print(f"  rem           {(s.get('remSleepSeconds') or 0)/60:.0f} min")
            print(f"  awake         {(s.get('awakeSleepSeconds') or 0)/60:.0f} min")
            print(f"  sleep_score   {score}")
            print(f"  avg_spo2      {s.get('averageSpO2Value')}")
            print(f"  avg_resp      {s.get('averageRespirationValue')} bpm")
        else:
            print("  No data.")
    except Exception as e:
        print(f"  ERROR: {e}")

    # ── HRV ────────────────────────────────────────────────────
    print("\n[3/4] HRV")
    try:
        data = client.get_hrv_data(ds)
        if data and "hrvSummary" in data:
            s = data["hrvSummary"]
            print(f"  weekly_avg    {s.get('weeklyAvg')} ms")
            print(f"  last_night    {s.get('lastNight')} ms")
            print(f"  5min_peak     {s.get('lastNight5MinHigh')} ms")
            print(f"  status        {s.get('status')}")
        else:
            print("  No data.")
    except Exception as e:
        print(f"  ERROR: {e}")

    # ── Activities (last 7 days) ───────────────────────────────
    print("\n[4/4] Recent Activities (last 7 days)")
    try:
        week_ago = (target - timedelta(days=7)).strftime("%Y-%m-%d")
        activities = client.get_activities_by_date(week_ago, ds)
        if activities:
            for a in activities:
                atype = (a.get("activityType") or {}).get("typeKey", "?").upper()
                name  = a.get("activityName", "?")
                dur   = a.get("duration") or 0
                dist  = a.get("distance") or 0
                start = a.get("startTimeGMT", "?")
                print(f"  {start[:10]}  {atype:<15} {name:<30}  {dur/60:.0f} min  {dist/1000:.2f} km")
        else:
            print("  No activities.")
    except Exception as e:
        print(f"  ERROR: {e}")

    print()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=None, help="YYYY-MM-DD (default: yesterday)")
    args = parser.parse_args()

    if not EMAIL or not PASSWORD:
        print("ERROR: GARMIN_EMAIL and GARMIN_PASSWORD must be set in .env")
        sys.exit(1)

    target = date.fromisoformat(args.date) if args.date else date.today() - timedelta(days=1)

    client = login()
    fetch_and_print(client, target)


if __name__ == "__main__":
    main()
