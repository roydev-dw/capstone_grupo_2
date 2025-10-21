from argon2 import PasswordHasher

ph = PasswordHasher()

def make_hash(raw_password: str) -> str:
    return ph.hash(raw_password)

def check_password(raw_password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hashed_password, raw_password)
    except Exception:
        return False