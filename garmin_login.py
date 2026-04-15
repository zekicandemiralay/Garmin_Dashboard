"""
One-time interactive Garmin login.
Run this once to save OAuth tokens — no password stored anywhere.

Usage:
    py -3.12 garmin_login.py
"""

import getpass
from pathlib import Path
from garminconnect import Garmin

TOKEN_DIR = Path("garth_tokens")
TOKEN_DIR.mkdir(exist_ok=True)

print("Garmin Connect — one-time login")
print(f"Tokens will be saved to: {TOKEN_DIR.resolve()}")
print()

email    = input("Email: ").strip()
password = getpass.getpass("Password: ")   # hidden, never written to disk

client = Garmin(email=email, password=password)
mfa_status, _ = client.login(tokenstore=str(TOKEN_DIR))

if mfa_status:
    code = input("MFA code: ").strip()
    client.resume_login(mfa_token=code, tokenstore=str(TOKEN_DIR))

print(f"\nLogged in successfully.")
print(f"Tokens saved to {TOKEN_DIR.resolve()}")
print("The sync service will use these tokens automatically.")
