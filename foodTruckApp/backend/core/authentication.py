from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from core.jwt_utils import decode_token
from core.models import Usuario

class CustomJWTAuthentication(BaseAuthentication):
    """
    Autenticación JWT para DRF + Swagger.
    Lee el encabezado Authorization: Bearer <token>.
    """

    keyword = "Bearer"

    def authenticate(self, request):
        auth_header = request.headers.get("Authorization")

        if not auth_header:
            return None  # DRF sigue buscando otros métodos

        if not auth_header.startswith("Bearer "):
            raise AuthenticationFailed("Formato inválido. Use 'Bearer <token>'")

        token = auth_header.split(" ")[1]

        try:
            payload = decode_token(token)
        except Exception:
            raise AuthenticationFailed("Token inválido o expirado")

        # Buscar usuario
        try:
            user = Usuario.objects.get(pk=payload["sub"])
        except Usuario.DoesNotExist:
            raise AuthenticationFailed("Usuario no encontrado")

        # Guardar payload para usar en request.jwt_payload
        request.jwt_payload = payload

        return (user, None)