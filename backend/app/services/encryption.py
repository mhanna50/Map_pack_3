from __future__ import annotations

from functools import lru_cache
from typing import Optional, Type, cast

from ..core.config import settings

try:
    from cryptography.fernet import Fernet, InvalidToken
except ModuleNotFoundError as exc:  # pragma: no cover - handled via runtime guard
    Fernet = None  # type: ignore[assignment]
    InvalidToken = Exception  # type: ignore[assignment]
    _CRYPTOGRAPHY_IMPORT_ERROR: Optional[Exception] = exc
else:
    _CRYPTOGRAPHY_IMPORT_ERROR = None


class EncryptionService:
    def __init__(self, key: str) -> None:
        if _CRYPTOGRAPHY_IMPORT_ERROR:
            raise RuntimeError(
                "cryptography is required for token encryption. "
                "Install it via `pip install cryptography`."
            ) from _CRYPTOGRAPHY_IMPORT_ERROR
        if not key:
            raise ValueError("ENCRYPTION_KEY is required for token storage.")
        normalized = key.strip()
        if not normalized:
            raise ValueError("ENCRYPTION_KEY cannot be blank.")
        if len(normalized) != 44:
            raise ValueError(
                "ENCRYPTION_KEY must be a 32-byte urlsafe base64 string (length 44)."
            )
        fernet_cls: Type[Fernet] = cast(Type[Fernet], Fernet)
        self._fernet = fernet_cls(normalized.encode())

    def encrypt(self, plaintext: str) -> str:
        token = self._fernet.encrypt(plaintext.encode("utf-8"))
        return token.decode("utf-8")

    def decrypt(self, token: str) -> str:
        try:
            decrypted = self._fernet.decrypt(token.encode("utf-8"))
        except InvalidToken as exc:
            raise ValueError("Unable to decrypt token") from exc
        return decrypted.decode("utf-8")


@lru_cache
def get_encryption_service() -> EncryptionService:
    return EncryptionService(settings.ENCRYPTION_KEY)
