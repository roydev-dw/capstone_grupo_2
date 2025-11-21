# core/jwt_utils.py

import jwt
from datetime import datetime, timezone
from django.conf import settings

def _now():
    return datetime.now(timezone.utc)


def _get_sucursales_ids(user):
    """
    Devuelve lista de IDs de sucursales asignadas al usuario.
    """
    try:
        us = user.usuariosucursal_set.filter(estado=True)
        return [x.sucursal_id for x in us]
    except:
        return []


def make_access_token(user):
    payload = {
        "sub": str(user.usuario_id),
        "email": user.email,
        "rol": (user.rol.nombre if getattr(user, "rol_id", None) else None),
        "empresa_id": user.empresa_id,
        "sucursales": _get_sucursales_ids(user),  # 👈 AHORA MULTI-SUCURSAL

        "type": "access",
        "iat": int(_now().timestamp()),
        "exp": int((_now() + settings.JWT_ACCESS_TTL).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def make_refresh_token(user):
    payload = {
        "sub": str(user.usuario_id),
        "type": "refresh",
        "iat": int(_now().timestamp()),
        "exp": int((_now() + settings.JWT_REFRESH_TTL).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str):
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])