from __future__ import annotations

import hashlib
import secrets
from typing import ClassVar


class PasswordService:
    """Handles hashing and verifying user passwords."""

    ALGORITHM: ClassVar[str] = "pbkdf2_sha256"
    ITERATIONS: ClassVar[int] = 120_000

    def hash_password(self, password: str) -> str:
        if not password:
            raise ValueError("Password cannot be empty")
        salt = secrets.token_hex(16)
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            self.ITERATIONS,
        ).hex()
        return f"{self.ALGORITHM}${self.ITERATIONS}${salt}${digest}"

    def verify_password(self, password: str, encoded: str | None) -> bool:
        if not encoded:
            return False
        try:
            algorithm, iterations, salt, digest = encoded.split("$", 3)
        except ValueError:
            return False
        if algorithm != self.ALGORITHM:
            return False
        computed = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            int(iterations),
        ).hex()
        return secrets.compare_digest(computed, digest)
