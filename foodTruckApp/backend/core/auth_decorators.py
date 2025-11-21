from functools import wraps
from django.http import JsonResponse
from core.jwt_utils import decode_token
from core.models import Usuario

def require_jwt(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth.startswith("Bearer "):
            return JsonResponse({"detail": "Falta token Bearer."}, status=401)

        token = auth.split(" ", 1)[1].strip()

        try:
            payload = decode_token(token)

            if payload.get("type") != "access":
                return JsonResponse({"detail": "Token inválido (tipo)."}, status=401)

            user = Usuario.objects.get(pk=payload.get("sub"))

            if not user.estado:
                return JsonResponse({"detail": "Usuario inactivo."}, status=403)
            request.usuario = user
            request.jwt_payload = payload  

        except Usuario.DoesNotExist:
            return JsonResponse({"detail": "Usuario no existe."}, status=401)

        except Exception as e:
            return JsonResponse({"detail": f"Token inválido: {str(e)}"}, status=401)

        return view_func(request, *args, **kwargs)

    return wrapper