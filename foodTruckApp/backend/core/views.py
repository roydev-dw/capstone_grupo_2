import json, requests
from decimal import Decimal, InvalidOperation
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q
from django.core.paginator import Paginator
from django.utils import timezone
from django.conf import settings
from core.models import Producto, Categoria, Sucursal, Empresa, Usuario, Rol, Modificador, ProductoModificador, ReglaNegocio, MetodoPago, Pedido, PedidoDetalle, PedidoDetalleModificador, Pago, Boleta, UsuarioSucursal, TransaccionWebpay, Auditoria, CierreCaja
from core.passwords import check_password, make_hash  # Argon2
from core.jwt_utils import make_access_token, make_refresh_token, decode_token
from core.auth_decorators import require_jwt
from django.db import IntegrityError
from core import azure_blob
from django.core.files.uploadedfile import InMemoryUploadedFile 
from .auditoria import registrar_auditoria
from rest_framework.decorators import api_view
from drf_spectacular.utils import extend_schema
from datetime import datetime
from django.utils.timezone import now
from django.db.models import Max
import os
from reportlab.lib.pagesizes import letter
from django.http import FileResponse, Http404
from django.db.models import Sum, Count, F, Func
from django.db.models.functions import ExtractDay


def _set_token_cookies(resp: JsonResponse, access: str | None, refresh: str | None):
    """Setea cookies httpOnly para web. (Opcional: además devolvemos en JSON)."""
    flags = {
        "httponly": True,
        "secure": True,               # True porque ya tienes HTTPS con Nginx
        "samesite": "Strict",
        "path": "/",
    }
    if access is not None:
        resp.set_cookie(
            "access_token",
            access,
            max_age=int(settings.JWT_ACCESS_TTL.total_seconds()),
            **flags
        )
    if refresh is not None:
        resp.set_cookie(
            "refresh_token",   
            refresh,
            max_age=int(settings.JWT_REFRESH_TTL.total_seconds()),
            **flags
        )
    return resp


def _clear_token_cookies(resp: JsonResponse):
    resp.delete_cookie("access_token", path="/")
    resp.delete_cookie("refresh_token", path="/")
    return resp


@csrf_exempt
@extend_schema(
    summary="Login de usuario",
    description=(
        "Autentica un usuario mediante email y contraseña.\n\n"
        "**Devuelve:**\n"
        "- access_token (Bearer)\n"
        "- refresh_token\n"
        "- datos del usuario\n\n"
        "**Notas:**\n"
        "• Usa Basic Auth solo para este endpoint.\n"
        "• El token se usará luego como Bearer en el resto de la API."
    ),
    tags=["Auth"], 
    request={
        "application/json": {
            "type": "object",
            "required": ["email", "password"],
            "properties": {
                "email": {"type": "string"},
                "password": {"type": "string"},
            }
        }
    },
    responses={
        200: {
            "description": "Login exitoso",
            "content": {
                "application/json": {
                    "example": {
                        "ok": True,
                        "message": "Login exitoso",
                        "access_token": "<token>",
                        "refresh_token": "<token_refresh>",
                        "usuario": {
                            "id": 1,
                            "nombre": "Admin",
                            "email": "admin@foodtruck.cl",
                        "notas": "Copia y pega el Access Token para usar en Authorization"
                        }
                    }
                }
            }
        },
        400: {"description": "Credenciales inválidas"},
        401: {"description": "No autorizado"},
    },
    auth=None,  # ⬅️ Login NO usa Bearer
)
@api_view(["POST"])
def login_api(request):
    if request.method != 'POST':
        return JsonResponse({"detail": "Método no permitido. Usa POST."}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
    except Exception:
        return JsonResponse({"detail": "JSON inválido."}, status=400)

    email = (payload.get('email') or '').strip().lower()
    password = payload.get('password') or ''

    if not email or not password:
        return JsonResponse({"detail": "email y password son requeridos."}, status=400)

    try:
        user = Usuario.objects.get(email=email)
    except Usuario.DoesNotExist:
        return JsonResponse({"detail": "Credenciales inválidas."}, status=401)

    # Validación con Argon2
    if not check_password(password, user.contrasena_hash):
        return JsonResponse({"detail": "Credenciales inválidas."}, status=401)

    if not user.estado:
        return JsonResponse({"detail": "Usuario inactivo."}, status=403)

    request.usuario = user  # Para Auditoría

    # Tokens
    access = make_access_token(user)
    refresh = make_refresh_token(user)

    # Sucursales asignadas (estado=True)
    sucursales = UsuarioSucursal.objects.filter(usuario=user, estado=True)

    resp = JsonResponse({
        "ok": True,
        "access": access,
        "refresh": refresh,
        "user": {
            "usuario_id": user.usuario_id,
            "nombre": user.nombre_completo,
            "email": user.email,
            "rol": user.rol.nombre if user.rol_id else None,
            "empresa_id": user.empresa_id,
            "sucursales": [
                {
                    "sucursal_id": us.sucursal.sucursal_id,
                    "sucursal_nombre": us.sucursal.nombre
                }
                for us in sucursales
            ]
        }
    }, status=200)

    _set_token_cookies(resp, access, refresh)
    return resp

@csrf_exempt
@extend_schema(
    summary="Refrescar token JWT",
    description=(
        "Recibe un **refresh token** (por cookie `refresh_token` o en el body) y "
        "devuelve un **nuevo access token** y un **nuevo refresh token**.\n\n"
        "Si no se envía el token refresh, o es inválido/expirado, responde error."
    ),
    tags=["Auth"],
    request={
        "application/json": {
            "type": "object",
            "properties": {
                "refresh": {
                    "type": "string",
                    "description": "Refresh token opcional si no viene en cookie `refresh_token`"
                }
            },
            "example": {
                "refresh": "<REFRESH_TOKEN_OPCIONAL>"
            }
        }
    },
    responses={
        200: {
            "description": "Tokens refrescados correctamente",
            "content": {
                "application/json": {
                    "example": {
                        "ok": True,
                        "access": "<NUEVO_ACCESS_TOKEN>",
                        "refresh": "<NUEVO_REFRESH_TOKEN>"
                    }
                }
            }
        },
        400: {
            "description": "Falta token refresh",
            "content": {
                "application/json": {
                    "example": {"detail": "Falta token refresh."}
                }
            }
        },
        401: {
            "description": "Token inválido o usuario inexistente",
            "content": {
                "application/json": {
                    "examples": {
                        "token_invalido": {
                            "value": {"detail": "Token inválido."}
                        },
                        "tipo_invalido": {
                            "value": {"detail": "Token refresh inválido."}
                        },
                        "usuario_no_existe": {
                            "value": {"detail": "Usuario no existe."}
                        }
                    }
                }
            }
        },
        403: {
            "description": "Usuario inactivo",
            "content": {
                "application/json": {
                    "example": {"detail": "Usuario inactivo."}
                }
            }
        },
    },
    auth=None,  # No exige Authorization: Bearer, solo refresh token
)
@api_view(["POST"])
def refresh_api(request):
    if request.method != 'POST':
        return JsonResponse({"detail": "Método no permitido. Usa POST."}, status=405)

    # 1) Intentamos leer el refresh desde cookie httpOnly; si no, desde el body.
    token = request.COOKIES.get("refresh_token")
    if not token:
        try:
            data = json.loads(request.body.decode('utf-8'))
            token = data.get("refresh")
        except Exception:
            token = None
    if not token:
        return JsonResponse({"detail": "Falta token refresh."}, status=400)

    # 2) Validar token y tipo
    try:
        data = decode_token(token)
    except Exception:
        return JsonResponse({"detail": "Token inválido."}, status=401)

    if data.get("type") != "refresh":
        return JsonResponse({"detail": "Token refresh inválido."}, status=401)

    # 3) Buscar usuario
    try:
        user = Usuario.objects.get(pk=data.get("sub"))
    except Usuario.DoesNotExist:
        return JsonResponse({"detail": "Usuario no existe."}, status=401)

    if not user.estado:
        return JsonResponse({"detail": "Usuario inactivo."}, status=403)

    # 4) Rotación simple: emitimos un nuevo access y un nuevo refresh (no persistimos nada)
    new_access = make_access_token(user)
    new_refresh = make_refresh_token(user)

    resp = JsonResponse({"ok": True, "access": new_access, "refresh": new_refresh}, status=200)
    _set_token_cookies(resp, new_access, new_refresh)
    return resp



@csrf_exempt
@extend_schema(
    summary="Logout (cierre de sesión)",
    description=(
        "Realiza el logout **limpiando las cookies** `access_token` y `refresh_token`.\n\n"
        "No invalida tokens en servidor (stateless), solo borra cookies en el cliente."
    ),
    tags=["Auth"],
    request=None,  # no recibe body
    responses={
        200: {
            "description": "Logout exitoso",
            "content": {
                "application/json": {
                    "example": {
                        "ok": True,
                        "detail": "Sesión cerrada"
                    }
                }
            }
        }
    },
    auth=None,
)
@api_view(["POST"])
def logout_api(request):
    """
    Sin persistencia de refresh en BD, 'revocar' real no es posible (stateless).
    Este logout limpia cookies en el cliente; los tokens existentes expiran por tiempo.
    """
    resp = JsonResponse({"ok": True, "detail": "Sesión cerrada"})
    _clear_token_cookies(resp)
    return resp


@extend_schema(
    summary="Datos del usuario autenticado",
    description=(
        "Devuelve los datos del usuario autenticado según el JWT enviado.\n\n"
        "Incluye datos del usuario, rol, empresa, sucursales asignadas y claims del token."
    ),
    tags=["Auth"],
    auth=[{"BearerAuth": []}],
    request=None,
    responses={
        200: {
            "description": "Datos del usuario autenticado",
            "content": {
                "application/json": {
                    "example": {
                        "ok": True,
                        "user": {
                            "usuario_id": 1,
                            "nombre": "Juan Pérez",
                            "email": "juan@foodtrucksapp.cl",
                            "rol": "Administrador",
                            "empresa_id": 1,
                            "sucursales": [
                                {"sucursal_id": 1, "sucursal_nombre": "Sucursal Centro"}
                            ]
                        },
                        "claims": {"sub": 1, "type": "access", "exp": 1732046400}
                    }
                }
            }
        },
        401: {
            "description": "Sin JWT o token inválido",
            "content": {
                "application/json": {"example": {"detail": "Token inválido"}}
            }
        },
    },
)
@api_view(["GET"])
@require_jwt
def me_api(request):
    u = request.user

    # Obtener las sucursales activas del usuario
    sucursales = UsuarioSucursal.objects.filter(usuario=u, estado=True)

    return JsonResponse({
        "ok": True,
        "user": {
            "usuario_id": u.usuario_id,
            "nombre": u.nombre_completo,
            "email": u.email,
            "rol": u.rol.nombre if u.rol_id else None,
            "empresa_id": u.empresa_id,
            "sucursales": [
                {
                    "sucursal_id": us.sucursal.sucursal_id,
                    "sucursal_nombre": us.sucursal.nombre,
                }
                for us in sucursales
            ],
        },
        "claims": request.jwt_payload,
    })


def _producto_to_dict(p):
    return {
        "producto_id": p.producto_id,
        "nombre": p.nombre,
        "descripcion": p.descripcion,
        "categoria": {
            "categoria_id": p.categoria.categoria_id,
            "nombre": p.categoria.nombre
        } if p.categoria else None,
        "precio_base": str(p.precio_base),
        "tiempo_preparacion": p.tiempo_preparacion,
        "estado": p.estado,
        "imagen_url": p.imagen_url,
    }

def _parse_decimal(value, field_name):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"'{field_name}' debe ser decimal válido.")


def _parse_int(value, field_name):
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError(f"'{field_name}' debe ser entero válido.")




def _sucursal_to_dict(s: Sucursal):
    return {
        "sucursal_id": s.sucursal_id,
        "empresa_id": s.empresa_id,
        "empresa_nombre": s.empresa.nombre if s.empresa_id else None,
        "nombre": s.nombre,
        "direccion": s.direccion,
        "telefono": s.telefono,
        "estado": s.estado,
        "fecha_creacion": s.fecha_creacion.isoformat() if s.fecha_creacion else None,
    }

@csrf_exempt
@require_jwt
@extend_schema(
    summary="Lista y crea sucursales",
    description=(
        "**GET**: Lista sucursales con filtros y paginación.\n\n"
        "Parámetros de consulta (query params):\n"
        "- `q`: busca por nombre / dirección / teléfono\n"
        "- `empresa_id`: filtra por empresa\n"
        "- `estado`: `true` / `false`\n"
        "- `ordering`: campo de orden (ej: `nombre`, `-fecha_creacion`)\n"
        "- `page`, `page_size` (máx 100)\n\n"
        "**POST**: Crea una nueva sucursal asociada opcionalmente a una empresa."
    ),
    tags=["Sucursales"],
    request={
        "application/json": {
            "type": "object",
            "properties": {
                "empresa_id": {
                    "type": ["integer", "null"],
                    "description": "ID de la empresa asociada (opcional según tu modelo)"
                },
                "nombre": {"type": "string"},
                "direccion": {"type": ["string", "null"]},
                "telefono": {"type": ["string", "null"]},
                "estado": {
                    "type": "boolean",
                    "default": True
                }
            },
            "required": ["nombre"],
            "example": {
                "empresa_id": 1,
                "nombre": "Sucursal Providencia",
                "direccion": "Av. Siempre Viva 742",
                "telefono": "229876543",
                "estado": True
            }
        }
    },
    responses={
        200: {
            "description": "Listado paginado de sucursales",
            "content": {
                "application/json": {
                    "example": {
                        "ok": True,
                        "count": 1,
                        "page": 1,
                        "page_size": 20,
                        "results": [
                            {
                                "sucursal_id": 1,
                                "empresa_id": 1,
                                "empresa_nombre": "FoodTruck El Trapiche",
                                "nombre": "Sucursal Centro",
                                "direccion": "Av. Principal 123",
                                "telefono": "221234567",
                                "estado": True,
                                "fecha_creacion": "2025-11-15T12:00:00"
                            }
                        ]
                    }
                }
            }
        },
        201: {
            "description": "Sucursal creada correctamente",
            "content": {
                "application/json": {
                    "example": {
                        "ok": True,
                        "sucursal": {
                            "sucursal_id": 2,
                            "empresa_id": 1,
                            "empresa_nombre": "FoodTruck El Trapiche",
                            "nombre": "Sucursal Providencia",
                            "direccion": "Av. Siempre Viva 742",
                            "telefono": "229876543",
                            "estado": True,
                            "fecha_creacion": "2025-11-16T10:00:00"
                        }
                    }
                }
            }
        },
        400: {
            "description": "Error de validación o JSON inválido",
            "content": {
                "application/json": {
                    "example": {"detail": "'nombre' es requerido."}
                }
            }
        },
        404: {
            "description": "Empresa no existe (si se envía empresa_id inválido)",
            "content": {
                "application/json": {
                    "example": {"detail": "Empresa no existe."}
                }
            }
        }
    },
)
@api_view(["GET", "POST"])
def sucursales_list(request):
    """
    GET: lista de sucursales con filtros/paginación
      - q (busca por nombre/dirección/teléfono)
      - empresa_id
      - estado (true/false)
      - ordering (nombre, -fecha_creacion, etc)
      - page, page_size
    POST: crea sucursal
      Campos:
        - nombre (requerido)
        - direccion (opcional)
        - telefono (opcional)
        - estado (bool, default True)
        - empresa_id (según tu modelo: requerido u opcional)
    """
    if request.method == "GET":
        qs = Sucursal.objects.select_related("empresa").all()

        q = request.GET.get("q")
        if q:
            qs = qs.filter(
                Q(nombre__icontains=q) |
                Q(direccion__icontains=q) |
                Q(telefono__icontains=q)
            )

        empresa_id = request.GET.get("empresa_id")
        if empresa_id:
            qs = qs.filter(empresa_id=empresa_id)

        estado = request.GET.get("estado")
        if estado is not None:
            if estado.lower() in ("true", "1"):
                qs = qs.filter(estado=True)
            elif estado.lower() in ("false", "0"):
                qs = qs.filter(estado=False)

        ordering = request.GET.get("ordering")
        if ordering:
            qs = qs.order_by(ordering)

        page = int(request.GET.get("page", 1))
        page_size = min(int(request.GET.get("page_size", 20)), 100)
        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        data = [_sucursal_to_dict(s) for s in page_obj.object_list]
        return JsonResponse({
            "ok": True,
            "count": paginator.count,
            "page": page_obj.number,
            "page_size": page_size,
            "results": data,
        }, status=200)

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        nombre = (payload.get("nombre") or "").strip()
        if not nombre:
            return JsonResponse({"detail": "'nombre' es requerido."}, status=400)

        # empresa_id según tu modelo:
        empresa = None
        empresa_id = payload.get("empresa_id")
        if empresa_id:
            try:
                empresa = Empresa.objects.get(pk=empresa_id)
            except Empresa.DoesNotExist:
                return JsonResponse({"detail": "Empresa no existe."}, status=404)
        # Si tu modelo NO permite null, y no mandan empresa_id:
        # descomenta el siguiente bloque para forzar requerimiento:
        # else:
        #     return JsonResponse({"detail": "'empresa_id' es requerido."}, status=400)

        s = Sucursal.objects.create(
            empresa=empresa,
            nombre=nombre,
            direccion=payload.get("direccion") or None,
            telefono=payload.get("telefono") or None,
            estado=payload.get("estado", True),
        )
        return JsonResponse({"ok": True, "sucursal": _sucursal_to_dict(s)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina sucursal", tags=["Sucursales"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def sucursal_detail(request, sucursal_id: int):
    """
    GET: detalle
    PUT/PATCH: actualizar campos (incluye empresa_id opcional)
    DELETE: soft delete (estado=False) por defecto; hard delete con ?hard=1
    """
    try:
        s = Sucursal.objects.select_related("empresa").get(pk=sucursal_id)
    except Sucursal.DoesNotExist:
        return JsonResponse({"detail": "Sucursal no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse({"ok": True, "sucursal": _sucursal_to_dict(s)}, status=200)

    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "nombre" in payload:
            nombre = (payload.get("nombre") or "").strip()
            if not nombre:
                return JsonResponse({"detail": "'nombre' no puede ser vacío."}, status=400)
            s.nombre = nombre

        if "direccion" in payload:
            s.direccion = payload.get("direccion") or None

        if "telefono" in payload:
            s.telefono = payload.get("telefono") or None

        if "estado" in payload:
            estado = payload.get("estado")
            if isinstance(estado, bool):
                s.estado = estado
            else:
                return JsonResponse({"detail": "'estado' debe ser booleano."}, status=400)

        if "empresa_id" in payload:
            eid = payload.get("empresa_id")
            if eid in (None, "", "null"):
                s.empresa = None
            else:
                try:
                    emp = Empresa.objects.get(pk=eid)
                except Empresa.DoesNotExist:
                    return JsonResponse({"detail": "Empresa no existe."}, status=404)
                s.empresa = emp

        s.save()
        return JsonResponse({"ok": True, "sucursal": _sucursal_to_dict(s)}, status=200)

    if request.method == "DELETE":
        hard = request.GET.get("hard")
        if hard in ("1", "true", "True"):
            s.delete()
            return JsonResponse({"ok": True, "detail": "Sucursal eliminada (hard)."}, status=200)
        s.estado = False
        s.save(update_fields=["estado"])
        return JsonResponse({"ok": True, "detail": "Sucursal deshabilitada (soft delete)."}, status=200)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


def _empresa_to_dict(e: Empresa):
    return {
        "empresa_id": e.empresa_id,
        "nombre": e.nombre,
        "rut": e.rut,
        "direccion": e.direccion,
        "telefono": e.telefono,
        "email": e.email,
        "estado": e.estado,
        "fecha_creacion": e.fecha_creacion.isoformat() if e.fecha_creacion else None,
    }


@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea empresas", tags=["Empresas"])
@api_view(["GET", "POST"])
def empresas_list(request):
    """
    GET: lista con filtros/paginación
      - q (busca en nombre/direccion/email/telefono/rut)
      - rut (match exacto)
      - estado (true/false)
      - ordering (nombre, -fecha_creacion, rut, etc.)
      - page, page_size
    POST: crea empresa
      Campos requeridos: nombre, rut, email
      Opcionales: direccion, telefono, estado (default True)
    """
    if request.method == "GET":
        qs = Empresa.objects.all()

        q = request.GET.get("q")
        if q:
            qs = qs.filter(
                Q(nombre__icontains=q) |
                Q(direccion__icontains=q) |
                Q(email__icontains=q) |
                Q(telefono__icontains=q) |
                Q(rut__icontains=q)
            )

        rut = request.GET.get("rut")
        if rut:
            qs = qs.filter(rut=rut)

        estado = request.GET.get("estado")
        if estado is not None:
            if estado.lower() in ("true", "1"):
                qs = qs.filter(estado=True)
            elif estado.lower() in ("false", "0"):
                qs = qs.filter(estado=False)

        ordering = request.GET.get("ordering")
        if ordering:
            qs = qs.order_by(ordering)

        page = int(request.GET.get("page", 1))
        page_size = min(int(request.GET.get("page_size", 20)), 100)
        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        data = [_empresa_to_dict(e) for e in page_obj.object_list]
        return JsonResponse({
            "ok": True,
            "count": paginator.count,
            "page": page_obj.number,
            "page_size": page_size,
            "results": data,
        }, status=200)

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        nombre = (payload.get("nombre") or "").strip()
        rut = (payload.get("rut") or "").strip()
        email = (payload.get("email") or "").strip()
        if not nombre or not rut or not email:
            return JsonResponse({"detail": "Campos requeridos: nombre, rut, email."}, status=400)

        try:
            e = Empresa.objects.create(
                nombre=nombre,
                rut=rut,
                email=email,
                direccion=payload.get("direccion") or None,
                telefono=payload.get("telefono") or None,
                estado=payload.get("estado", True),
            )
        except IntegrityError as ie:
            # p.ej. RUT o Email duplicado (según constraints)
            return JsonResponse({"detail": f"Error de integridad: {str(ie)}"}, status=400)

        return JsonResponse({"ok": True, "empresa": _empresa_to_dict(e)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina empresa", tags=["Empresas"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def empresa_detail(request, empresa_id: int):
    """
    GET: detalle
    PUT/PATCH: actualización de campos
    DELETE:
      - soft delete: estado=False
      - hard delete: ?hard=1
    """
    try:
        e = Empresa.objects.get(pk=empresa_id)
    except Empresa.DoesNotExist:
        return JsonResponse({"detail": "Empresa no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse({"ok": True, "empresa": _empresa_to_dict(e)}, status=200)

    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "nombre" in payload:
            nombre = (payload.get("nombre") or "").strip()
            if not nombre:
                return JsonResponse({"detail": "'nombre' no puede ser vacío."}, status=400)
            e.nombre = nombre

        if "rut" in payload:
            rut = (payload.get("rut") or "").strip()
            if not rut:
                return JsonResponse({"detail": "'rut' no puede ser vacío."}, status=400)
            e.rut = rut

        if "email" in payload:
            email = (payload.get("email") or "").strip()
            if not email:
                return JsonResponse({"detail": "'email' no puede ser vacío."}, status=400)
            e.email = email

        if "direccion" in payload:
            e.direccion = payload.get("direccion") or None

        if "telefono" in payload:
            e.telefono = payload.get("telefono") or None

        if "estado" in payload:
            estado = payload.get("estado")
            if isinstance(estado, bool):
                e.estado = estado
            else:
                return JsonResponse({"detail": "'estado' debe ser booleano."}, status=400)

        try:
            e.save()
        except IntegrityError as ie:
            return JsonResponse({"detail": f"Error de integridad: {str(ie)}"}, status=400)

        return JsonResponse({"ok": True, "empresa": _empresa_to_dict(e)}, status=200)

    if request.method == "DELETE":
        hard = request.GET.get("hard")
        if hard in ("1", "true", "True"):
            # ⚠️ Si hay Sucursales dependientes y FK en CASCADE, esto las borrará.
            # Si tu modelo usa PROTECT/SET_NULL, actuará acorde.
            e.delete()
            return JsonResponse({"ok": True, "detail": "Empresa eliminada (hard)."}, status=200)

        # Soft delete
        e.estado = False
        e.save(update_fields=["estado"])
        return JsonResponse({"ok": True, "detail": "Empresa deshabilitada (soft delete)."}, status=200)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


def _categoria_to_dict(c: Categoria):
    return {
        "categoria_id": c.categoria_id,
        "sucursal_id": c.sucursal_id,
        "sucursal_nombre": c.sucursal.nombre if c.sucursal_id else None,
        "nombre": c.nombre,
        "descripcion": c.descripcion,
        "estado": c.estado,
        "fecha_creacion": c.fecha_creacion.isoformat() if c.fecha_creacion else None,
    }


@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea categorías", tags=["Categorías"])
@api_view(["GET", "POST"])
def categorias_list(request):
    """
    GET: lista con filtros y paginación
      - q (busca por nombre/descripcion)
      - sucursal_id (filtra por sucursal)
      - estado (true/false)
      - ordering (nombre, -fecha_creacion, etc.)
      - page, page_size
    POST: crea categoría (REQUERIDOS: nombre, sucursal_id)
    """
    if request.method == "GET":
        qs = Categoria.objects.select_related("sucursal").all()

        q = request.GET.get("q")
        if q:
            qs = qs.filter(Q(nombre__icontains=q) | Q(descripcion__icontains=q))

        sucursal_id = request.GET.get("sucursal_id")
        if sucursal_id:
            qs = qs.filter(sucursal_id=sucursal_id)

        estado = request.GET.get("estado")
        if estado is not None:
            if estado.lower() in ("true", "1"):
                qs = qs.filter(estado=True)
            elif estado.lower() in ("false", "0"):
                qs = qs.filter(estado=False)

        ordering = request.GET.get("ordering")
        if ordering:
            qs = qs.order_by(ordering)

        page = int(request.GET.get("page", 1))
        page_size = min(int(request.GET.get("page_size", 20)), 100)
        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        data = [_categoria_to_dict(c) for c in page_obj.object_list]
        return JsonResponse({
            "ok": True,
            "count": paginator.count,
            "page": page_obj.number,
            "page_size": page_size,
            "results": data,
        }, status=200)

    if request.method == "POST":
        # Requeridos: nombre, sucursal_id
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        nombre = (payload.get("nombre") or "").strip()
        if not nombre:
            return JsonResponse({"detail": "'nombre' es requerido."}, status=400)

        sucursal_id = payload.get("sucursal_id")
        if not sucursal_id:
            return JsonResponse({"detail": "'sucursal_id' es requerido."}, status=400)
        try:
            suc = Sucursal.objects.get(pk=sucursal_id)
        except Sucursal.DoesNotExist:
            return JsonResponse({"detail": "Sucursal no existe."}, status=404)

        c = Categoria.objects.create(
            sucursal=suc,
            nombre=nombre,
            descripcion=payload.get("descripcion") or None,
            estado=payload.get("estado", True),
        )
        return JsonResponse({"ok": True, "categoria": _categoria_to_dict(c)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina categoría", tags=["Categorías"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def categoria_detail(request, categoria_id: int):
    """
    GET: detalle
    PUT/PATCH: actualizar (se puede cambiar sucursal_id)
    DELETE: soft delete (estado=False) por defecto; hard delete con ?hard=1
    """
    try:
        c = Categoria.objects.select_related("sucursal").get(pk=categoria_id)
    except Categoria.DoesNotExist:
        return JsonResponse({"detail": "Categoría no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse({"ok": True, "categoria": _categoria_to_dict(c)}, status=200)

    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "nombre" in payload:
            nombre = (payload.get("nombre") or "").strip()
            if not nombre:
                return JsonResponse({"detail": "'nombre' no puede ser vacío."}, status=400)
            c.nombre = nombre

        if "descripcion" in payload:
            c.descripcion = payload.get("descripcion") or None

        if "estado" in payload:
            estado = payload.get("estado")
            if isinstance(estado, bool):
                c.estado = estado
            else:
                return JsonResponse({"detail": "'estado' debe ser booleano."}, status=400)

        if "sucursal_id" in payload:
            sid = payload.get("sucursal_id")
            if not sid:
                return JsonResponse({"detail": "'sucursal_id' no puede ser vacío."}, status=400)
            try:
                suc = Sucursal.objects.get(pk=sid)
            except Sucursal.DoesNotExist:
                return JsonResponse({"detail": "Sucursal no existe."}, status=404)
            c.sucursal = suc

        c.save()
        return JsonResponse({"ok": True, "categoria": _categoria_to_dict(c)}, status=200)

    if request.method == "DELETE":
        hard = request.GET.get("hard")
        if hard in ("1", "true", "True"):
            c.delete()
            return JsonResponse({"ok": True, "detail": "Categoría eliminada (hard)."}, status=200)
        c.estado = False
        c.save(update_fields=["estado"])
        return JsonResponse({"ok": True, "detail": "Categoría deshabilitada (soft delete)."}, status=200)

    return JsonResponse({"detail": "Método no permitido."}, status=405)

def _rol_to_dict(r: Rol):
    return {
        "rol_id": r.rol_id,
        "empresa_id": r.empresa_id,
        "empresa_nombre": r.empresa.nombre if r.empresa_id else None,
        "nombre": r.nombre,
        "descripcion": r.descripcion,
        "fecha_creacion": r.fecha_creacion.isoformat() if r.fecha_creacion else None,
    }


@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea roles", tags=["Roles"])
@api_view(["GET", "POST"])
def roles_list(request):
    """
    GET: lista con filtros/paginación
      - q (busca en nombre/descripcion)
      - empresa_id
      - ordering (nombre, -fecha_creacion, etc.)
      - page, page_size
    POST: crea rol
      Requeridos: nombre, empresa_id (según tu modelo)
      Opcionales: descripcion
    """
    if request.method == "GET":
        qs = Rol.objects.select_related("empresa").all()

        q = request.GET.get("q")
        if q:
            qs = qs.filter(Q(nombre__icontains=q) | Q(descripcion__icontains=q))

        empresa_id = request.GET.get("empresa_id")
        if empresa_id:
            qs = qs.filter(empresa_id=empresa_id)

        ordering = request.GET.get("ordering")
        if ordering:
            qs = qs.order_by(ordering)

        page = int(request.GET.get("page", 1))
        page_size = min(int(request.GET.get("page_size", 20)), 100)
        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        data = [_rol_to_dict(r) for r in page_obj.object_list]
        return JsonResponse({
            "ok": True,
            "count": paginator.count,
            "page": page_obj.number,
            "page_size": page_size,
            "results": data,
        }, status=200)

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        nombre = (payload.get("nombre") or "").strip()
        if not nombre:
            return JsonResponse({"detail": "'nombre' es requerido."}, status=400)

        empresa_id = payload.get("empresa_id")
        if not empresa_id:
            return JsonResponse({"detail": "'empresa_id' es requerido."}, status=400)

        try:
            emp = Empresa.objects.get(pk=empresa_id)
        except Empresa.DoesNotExist:
            return JsonResponse({"detail": "Empresa no existe."}, status=404)

        try:
            r = Rol.objects.create(
                empresa=emp,
                nombre=nombre,
                descripcion=payload.get("descripcion") or None,
            )
        except IntegrityError as ie:
            return JsonResponse({"detail": f"Error de integridad: {str(ie)}"}, status=400)

        return JsonResponse({"ok": True, "rol": _rol_to_dict(r)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina rol", tags=["Roles"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def rol_detail(request, rol_id: int):
    """
    GET: detalle
    PUT/PATCH: actualizar
    DELETE: hard delete (no hay 'estado' en el modelo)
    """
    try:
        r = Rol.objects.select_related("empresa").get(pk=rol_id)
    except Rol.DoesNotExist:
        return JsonResponse({"detail": "Rol no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse({"ok": True, "rol": _rol_to_dict(r)}, status=200)

    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "nombre" in payload:
            nombre = (payload.get("nombre") or "").strip()
            if not nombre:
                return JsonResponse({"detail": "'nombre' no puede ser vacío."}, status=400)
            r.nombre = nombre

        if "descripcion" in payload:
            r.descripcion = payload.get("descripcion") or None

        if "empresa_id" in payload:
            eid = payload.get("empresa_id")
            if not eid:
                return JsonResponse({"detail": "'empresa_id' no puede ser vacío."}, status=400)
            try:
                emp = Empresa.objects.get(pk=eid)
            except Empresa.DoesNotExist:
                return JsonResponse({"detail": "Empresa no existe."}, status=404)
            r.empresa = emp

        try:
            r.save()
        except IntegrityError as ie:
            return JsonResponse({"detail": f"Error de integridad: {str(ie)}"}, status=400)

        return JsonResponse({"ok": True, "rol": _rol_to_dict(r)}, status=200)

    if request.method == "DELETE":
        r.delete()
        return JsonResponse({"ok": True, "detail": "Rol eliminado (hard)."}, status=200)

    return JsonResponse({"detail": "Método no permitido."}, status=405)



def _usuario_to_dict(u: Usuario):
    sucursales = UsuarioSucursal.objects.filter(usuario=u, estado=True)

    return {
        "usuario_id": u.usuario_id,
        "empresa_id": u.empresa_id,
        "empresa_nombre": u.empresa.nombre if u.empresa_id else None,
        "rol_id": u.rol_id,
        "rol_nombre": u.rol.nombre if u.rol_id else None,
        "nombre_completo": u.nombre_completo,
        "email": u.email,
        "telefono": u.telefono,
        "estado": u.estado,
        "fecha_creacion": u.fecha_creacion.isoformat() if u.fecha_creacion else None,
        "sucursales": [
            {"sucursal_id": us.sucursal.sucursal_id, "sucursal_nombre": us.sucursal.nombre}
            for us in sucursales
        ]
    }


@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea usuarios", tags=["Usuarios"])
@api_view(["GET", "POST"])
def usuarios_list(request):
    if request.method == "GET":
        qs = Usuario.objects.select_related("empresa", "rol").all()

        q = request.GET.get("q")
        if q:
            qs = qs.filter(
                Q(nombre_completo__icontains=q) |
                Q(email__icontains=q) |
                Q(telefono__icontains=q)
            )

        empresa_id = request.GET.get("empresa_id")
        if empresa_id:
            qs = qs.filter(empresa_id=empresa_id)

        rol_id = request.GET.get("rol_id")
        if rol_id:
            qs = qs.filter(rol_id=rol_id)

        estado = request.GET.get("estado")
        if estado is not None:
            if estado.lower() in ("true", "1"):
                qs = qs.filter(estado=True)
            elif estado.lower() in ("false", "0"):
                qs = qs.filter(estado=False)

        ordering = request.GET.get("ordering")
        if ordering:
            qs = qs.order_by(ordering)

        page = int(request.GET.get("page", 1))
        page_size = min(int(request.GET.get("page_size", 20)), 100)
        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        data = [_usuario_to_dict(u) for u in page_obj.object_list]
        return JsonResponse({
            "ok": True,
            "count": paginator.count,
            "page": page_obj.number,
            "page_size": page_size,
            "results": data,
        }, status=200)

    # ---------- POST (CREAR USUARIO + SUCURSALES) ----------
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        nombre = (payload.get("nombre_completo") or "").strip()
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""
        sucursales_ids = payload.get("sucursales", [])

        if not nombre or not email or not password:
            return JsonResponse({"detail": "Campos requeridos: nombre_completo, email, password."}, status=400)

        # Validamos sucursales
        sucursales_objs = []
        if sucursales_ids:
            for sid in sucursales_ids:
                try:
                    sucursales_objs.append(Sucursal.objects.get(pk=sid))
                except Sucursal.DoesNotExist:
                    return JsonResponse({"detail": f"Sucursal {sid} no existe."}, status=404)

        empresa = None
        rol = None

        empresa_id = payload.get("empresa_id")
        if empresa_id:
            try:
                empresa = Empresa.objects.get(pk=empresa_id)
            except Empresa.DoesNotExist:
                return JsonResponse({"detail": "Empresa no existe."}, status=404)

        rol_id = payload.get("rol_id")
        if rol_id:
            try:
                rol = Rol.objects.get(pk=rol_id)
            except Rol.DoesNotExist:
                return JsonResponse({"detail": "Rol no existe."}, status=404)

        # Crear usuario
        try:
            u = Usuario.objects.create(
                empresa=empresa,
                rol=rol,
                nombre_completo=nombre,
                email=email,
                contrasena_hash=make_hash(password),
                telefono=payload.get("telefono") or None,
                estado=payload.get("estado", True),
            )
        except IntegrityError as ie:
            return JsonResponse({"detail": f"Error de integridad: {str(ie)}"}, status=400)

        # Crear asignaciones de sucursales
        for s in sucursales_objs:
            UsuarioSucursal.objects.create(
                usuario=u,
                sucursal=s,
                fecha_asignacion=timezone.now(),
                estado=True
            )

        return JsonResponse({"ok": True, "usuario": _usuario_to_dict(u)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina usuario", tags=["Usuarios"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def usuario_detail(request, usuario_id: int):
    try:
        u = Usuario.objects.select_related("empresa", "rol").get(pk=usuario_id)
    except Usuario.DoesNotExist:
        return JsonResponse({"detail": "Usuario no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse({"ok": True, "usuario": _usuario_to_dict(u)}, status=200)

    # ---------- PUT/PATCH (ACTUALIZAR USUARIO + SUCURSALES) ----------
    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "nombre_completo" in payload:
            nombre = (payload.get("nombre_completo") or "").strip()
            if not nombre:
                return JsonResponse({"detail": "'nombre_completo' no puede ser vacío."}, status=400)
            u.nombre_completo = nombre

        if "email" in payload:
            email = (payload.get("email") or "").strip().lower()
            if not email:
                return JsonResponse({"detail": "'email' no puede ser vacío."}, status=400)
            u.email = email

        if "telefono" in payload:
            u.telefono = payload.get("telefono") or None

        if "estado" in payload:
            estado = payload.get("estado")
            if not isinstance(estado, bool):
                return JsonResponse({"detail": "'estado' debe ser booleano."}, status=400)
            u.estado = estado

        if "password" in payload:
            pwd = payload.get("password") or ""
            if not pwd:
                return JsonResponse({"detail": "'password' no puede ser vacío."}, status=400)
            u.contrasena_hash = make_hash(pwd)

        # FKs
        if "empresa_id" in payload:
            eid = payload.get("empresa_id")
            if eid in (None, "", "null"):
                u.empresa = None
            else:
                try:
                    u.empresa = Empresa.objects.get(pk=eid)
                except Empresa.DoesNotExist:
                    return JsonResponse({"detail": "Empresa no existe."}, status=404)

        if "rol_id" in payload:
            rid = payload.get("rol_id")
            if rid in (None, "", "null"):
                u.rol = None
            else:
                try:
                    u.rol = Rol.objects.get(pk=rid)
                except Rol.DoesNotExist:
                    return JsonResponse({"detail": "Rol no existe."}, status=404)

        u.save()

        # ---------- SUCURSALES ----------
        if "sucursales" in payload:
            sucursales_ids = payload.get("sucursales", [])

            # Validar IDs
            sucursales_objs = []
            for sid in sucursales_ids:
                try:
                    sucursales_objs.append(Sucursal.objects.get(pk=sid))
                except Sucursal.DoesNotExist:
                    return JsonResponse({"detail": f"Sucursal {sid} no existe."}, status=404)

            # Eliminar asignaciones actuales
            UsuarioSucursal.objects.filter(usuario=u).delete()

            # Crear nuevas asignaciones
            for s in sucursales_objs:
                UsuarioSucursal.objects.create(
                    usuario=u,
                    sucursal=s,
                    fecha_asignacion=timezone.now(),
                    estado=True
                )

        return JsonResponse({"ok": True, "usuario": _usuario_to_dict(u)}, status=200)

    # ---------- DELETE ----------
    if request.method == "DELETE":
        hard = request.GET.get("hard")
        if hard in ("1", "true", "True"):
            u.delete()
            return JsonResponse({"ok": True, "detail": "Usuario eliminado (hard)."}, status=200)

        u.estado = False
        u.save(update_fields=["estado"])
        return JsonResponse({"ok": True, "detail": "Usuario deshabilitado (soft delete)."}, status=200)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
@registrar_auditoria("Producto")
@extend_schema(summary="Detalle, actualiza o elimina producto", tags=["Productos"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def producto_detail(request, producto_id: int):
    """
    GET: detalle
    PUT/PATCH: actualización (JSON)
    DELETE: baja lógica (estado=False) por defecto; hard delete con ?hard=1
    """
    try:
        p = Producto.objects.select_related("categoria").get(pk=producto_id)
    except Producto.DoesNotExist:
        return JsonResponse({"detail": "Producto no existe."}, status=404)

    # -------- GET --------
    if request.method == "GET":
        return JsonResponse({"ok": True, "producto": _producto_to_dict(p)})

    # -------- PUT/PATCH (solo JSON) --------
    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        # nombre
        if "nombre" in payload:
            nombre = (payload.get("nombre") or "").strip()
            if not nombre:
                return JsonResponse({"detail": "'nombre' no puede ser vacío."}, status=400)
            p.nombre = nombre

        # descripcion
        if "descripcion" in payload:
            p.descripcion = payload.get("descripcion") or None

        # categoria (permite null)
        if "categoria_id" in payload:
            cid = payload.get("categoria_id")
            if cid in (None, "", "null"):
                p.categoria = None
            else:
                try:
                    cat = Categoria.objects.get(pk=cid)
                except Categoria.DoesNotExist:
                    return JsonResponse({"detail": "Categoria no existe."}, status=404)
                p.categoria = cat

        # precio_base
        if "precio_base" in payload:
            try:
                p.precio_base = _parse_decimal(payload.get("precio_base"), "precio_base")
            except ValueError as e:
                return JsonResponse({"detail": str(e)}, status=400)

        # tiempo_preparacion
        if "tiempo_preparacion" in payload:
            try:
                p.tiempo_preparacion = _parse_int(payload.get("tiempo_preparacion"), "tiempo_preparacion")
            except ValueError as e:
                return JsonResponse({"detail": str(e)}, status=400)

        # estado
        if "estado" in payload:
            estado = payload.get("estado")
            if isinstance(estado, bool):
                p.estado = estado
            else:
                return JsonResponse({"detail": "'estado' debe ser booleano."}, status=400)

        p.save()

        return JsonResponse({"ok": True, "producto": _producto_to_dict(p)})

    # -------- DELETE --------
    if request.method == "DELETE":
        hard = request.GET.get("hard")
        if hard in ("1", "true", "True"):
            p.delete()
            return JsonResponse({"ok": True, "detail": "Producto eliminado."})
        p.estado = False
        p.save(update_fields=["estado"])
        return JsonResponse({"ok": True, "detail": "Producto deshabilitado."})

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
@extend_schema(summary="Imagen del producto", tags=["Productos"])
@api_view(["GET", "POST", "PUT", "DELETE"])
def producto_imagen(request, producto_id: int):
    """
    GET    : devuelve URL actual
    POST   : sube imagen (si había, elimina la anterior)
    PUT    : reemplaza imagen (igual que POST)
    DELETE : elimina imagen y limpia imagen_url
    """
    try:
        p = Producto.objects.get(pk=producto_id)
    except Producto.DoesNotExist:
        return JsonResponse({"detail": "Producto no existe."}, status=404)

    # GET
    if request.method == "GET":
        return JsonResponse({"ok": True, "producto_id": p.producto_id, "imagen_url": p.imagen_url})

    # POST/PUT: subir o reemplazar
    if request.method in ("POST", "PUT"):
        if "imagen" not in request.FILES:
            return JsonResponse({"detail": "Falta archivo 'imagen'."}, status=400)

        fileobj = request.FILES["imagen"]
        max_bytes = getattr(settings, "MAX_UPLOAD_MB", 10) * 1024 * 1024
        if fileobj.size > max_bytes:
            return JsonResponse({"detail": f"Archivo supera {settings.MAX_UPLOAD_MB} MB."}, status=400)

        try:
            url = azure_blob.upload_file(p.producto_id, fileobj, fileobj.name)
        except Exception as e:
            return JsonResponse({"detail": f"Error al subir archivo: {str(e)}"}, status=500)

        # si existía, borramos anterior
        if p.imagen_url and p.imagen_url != url:
            try:
                azure_blob.delete_by_url(p.imagen_url)
            except Exception as e:
                print(f"⚠️ No se pudo eliminar imagen anterior: {e}")

        p.imagen_url = url
        p.save(update_fields=["imagen_url"])
        return JsonResponse({"ok": True, "imagen_url": url}, status=201)

    # DELETE
    if request.method == "DELETE":
        if not p.imagen_url:
            return JsonResponse({"ok": True, "detail": "Producto no tenía imagen."})
        old = p.imagen_url
        p.imagen_url = None
        p.save(update_fields=["imagen_url"])
        try:
            azure_blob.delete_by_url(old)
        except Exception as e:
            print(f"⚠️ No se pudo eliminar del blob: {e}")
        return JsonResponse({"ok": True, "detail": "Imagen eliminada."})

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
@registrar_auditoria("Producto")
@extend_schema(summary="Lista y crea productos", tags=["Productos"])
@api_view(["GET", "POST"])
def productos_list(request):
    """
    GET: lista con filtros y paginación
      - q (búsqueda por nombre o descripción)
      - categoria_id
      - estado (true/false)
      - ordering (nombre, -precio_base, etc)
      - page, page_size
    POST: crea un nuevo producto
    """
    # --- GET: listar productos ---
    if request.method == "GET":
        qs = Producto.objects.select_related("categoria").all()

        # filtro por texto
        q = request.GET.get("q")
        if q:
            qs = qs.filter(Q(nombre__icontains=q) | Q(descripcion__icontains=q))

        # filtro por categoría
        categoria_id = request.GET.get("categoria_id")
        if categoria_id:
            qs = qs.filter(categoria_id=categoria_id)

        # filtro por estado (True / False)
        estado = request.GET.get("estado")
        if estado is not None:
            if estado.lower() in ("true", "1"):
                qs = qs.filter(estado=True)
            elif estado.lower() in ("false", "0"):
                qs = qs.filter(estado=False)

        # ordenamiento dinámico
        ordering = request.GET.get("ordering")
        if ordering:
            qs = qs.order_by(ordering)

        # paginación
        page = int(request.GET.get("page", 1))
        page_size = min(int(request.GET.get("page_size", 20)), 100)
        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        data = [_producto_to_dict(p) for p in page_obj.object_list]

        return JsonResponse({
            "ok": True,
            "count": paginator.count,
            "page": page_obj.number,
            "page_size": page_size,
            "results": data
        })

    # --- POST: crear producto ---
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        nombre = (payload.get("nombre") or "").strip()
        if not nombre:
            return JsonResponse({"detail": "'nombre' es requerido."}, status=400)

        cat = None
        categoria_id = payload.get("categoria_id")
        if categoria_id:
            try:
                cat = Categoria.objects.get(pk=categoria_id)
            except Categoria.DoesNotExist:
                return JsonResponse({"detail": "Categoria no existe."}, status=404)

        try:
            precio_base = _parse_decimal(payload.get("precio_base"), "precio_base")
        except ValueError as e:
            return JsonResponse({"detail": str(e)}, status=400)

        try:
            tiempo_preparacion = _parse_int(payload.get("tiempo_preparacion"), "tiempo_preparacion")
        except ValueError as e:
            return JsonResponse({"detail": str(e)}, status=400)

        descripcion = payload.get("descripcion") or None
        estado = payload.get("estado")
        estado_val = estado if isinstance(estado, bool) else True

        p = Producto.objects.create(
            categoria=cat,
            nombre=nombre,
            descripcion=descripcion,
            precio_base=precio_base,
            tiempo_preparacion=tiempo_preparacion,
            estado=estado_val,
        )

        return JsonResponse({"ok": True, "producto": _producto_to_dict(p)}, status=201)

    # --- Otros métodos no permitidos ---
    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea modificadores", tags=["Modificadores"])
@api_view(["GET", "POST"])
def modificadores_list(request):
    """
    GET: lista modificadores (filtrables por empresa, tipo, estado)
    POST: crea un modificador
    """
    if request.method == "GET":
        qs = Modificador.objects.all()

        empresa_id = request.GET.get("empresa_id")
        if empresa_id:
            qs = qs.filter(empresa_id=empresa_id)

        tipo = request.GET.get("tipo")
        if tipo:
            qs = qs.filter(tipo__icontains=tipo)

        estado = request.GET.get("estado")
        if estado is not None:
            if estado.lower() in ("true", "1"):
                qs = qs.filter(estado=True)
            elif estado.lower() in ("false", "0"):
                qs = qs.filter(estado=False)

        data = [
            {
                "modificador_id": m.modificador_id,
                "empresa_id": m.empresa_id,
                "nombre": m.nombre,
                "tipo": m.tipo,
                "valor_adicional": str(m.valor_adicional),
                "estado": m.estado,
                "fecha_creacion": m.fecha_creacion.isoformat(),
            }
            for m in qs
        ]
        return JsonResponse({"ok": True, "count": qs.count(), "results": data}, status=200)

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        required = ["empresa_id", "nombre", "tipo"]
        for field in required:
            if not payload.get(field):
                return JsonResponse({"detail": f"'{field}' es requerido."}, status=400)

        try:
            empresa = Empresa.objects.get(pk=payload["empresa_id"])
        except Empresa.DoesNotExist:
            return JsonResponse({"detail": "Empresa no existe."}, status=404)

        m = Modificador.objects.create(
            empresa=empresa,
            nombre=payload["nombre"],
            tipo=payload["tipo"],
            valor_adicional=payload.get("valor_adicional", 0),
            estado=payload.get("estado", True),
        )
        return JsonResponse(
            {
                "ok": True,
                "modificador": {
                    "modificador_id": m.modificador_id,
                    "empresa_id": m.empresa_id,
                    "nombre": m.nombre,
                    "tipo": m.tipo,
                    "valor_adicional": str(m.valor_adicional),
                    "estado": m.estado,
                },
            },
            status=201,
        )

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina modificador", tags=["Modificadores"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def modificador_detail(request, modificador_id: int):
    """
    GET: detalle
    PUT/PATCH: actualizar campos
    DELETE: baja lógica (estado=False) o hard delete (?hard=1)
    """
    try:
        m = Modificador.objects.get(pk=modificador_id)
    except Modificador.DoesNotExist:
        return JsonResponse({"detail": "Modificador no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse(
            {
                "ok": True,
                "modificador": {
                    "modificador_id": m.modificador_id,
                    "empresa_id": m.empresa_id,
                    "nombre": m.nombre,
                    "tipo": m.tipo,
                    "valor_adicional": str(m.valor_adicional),
                    "estado": m.estado,
                    "fecha_creacion": m.fecha_creacion.isoformat(),
                },
            },
            status=200,
        )

    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "nombre" in payload:
            m.nombre = payload["nombre"].strip()

        if "tipo" in payload:
            m.tipo = payload["tipo"].strip()

        if "valor_adicional" in payload:
            try:
                m.valor_adicional = Decimal(str(payload["valor_adicional"]))
            except Exception:
                return JsonResponse({"detail": "'valor_adicional' debe ser numérico."}, status=400)

        if "estado" in payload:
            estado = payload["estado"]
            if isinstance(estado, bool):
                m.estado = estado
            else:
                return JsonResponse({"detail": "'estado' debe ser booleano."}, status=400)

        m.save()
        return JsonResponse({"ok": True, "modificador": {
            "modificador_id": m.modificador_id,
            "nombre": m.nombre,
            "tipo": m.tipo,
            "valor_adicional": str(m.valor_adicional),
            "estado": m.estado,
        }}, status=200)

    if request.method == "DELETE":
        hard = request.GET.get("hard")
        if hard in ("1", "true", "True"):
            m.delete()
            return JsonResponse({"ok": True, "detail": "Modificador eliminado."})
        m.estado = False
        m.save(update_fields=["estado"])
        return JsonResponse({"ok": True, "detail": "Modificador deshabilitado."})

    return JsonResponse({"detail": "Método no permitido."}, status=405)

@csrf_exempt
@require_jwt
@registrar_auditoria("Producto")
@extend_schema(summary="Lista, crea, actualiza o elimina modificadores de un producto", tags=["Productos"])
@api_view(["GET", "POST", "PUT", "PATCH", "DELETE"])
def producto_modificadores(request, producto_id: int):
    """
    GET: lista los modificadores asociados a un producto
    POST: asocia un modificador existente al producto
    PUT/PATCH: cambia 'es_obligatorio'
    DELETE: elimina la asociación producto–modificador
    """
    try:
        producto = Producto.objects.get(pk=producto_id)
    except Producto.DoesNotExist:
        return JsonResponse({"detail": "Producto no existe."}, status=404)

    # --- GET ---
    if request.method == "GET":
        relaciones = ProductoModificador.objects.filter(producto=producto).select_related("modificador")
        data = [
            {
                "modificador_id": pm.modificador.modificador_id,
                "nombre": pm.modificador.nombre,
                "tipo": pm.modificador.tipo,
                "valor_adicional": str(pm.modificador.valor_adicional),
                "es_obligatorio": pm.es_obligatorio,
                "estado": pm.modificador.estado,
            }
            for pm in relaciones
        ]
        return JsonResponse({"ok": True, "count": len(data), "results": data}, status=200)

    # --- POST ---
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        mod_id = payload.get("modificador_id")
        if not mod_id:
            return JsonResponse({"detail": "'modificador_id' es requerido."}, status=400)

        try:
            modificador = Modificador.objects.get(pk=mod_id)
        except Modificador.DoesNotExist:
            return JsonResponse({"detail": "Modificador no existe."}, status=404)

        es_obligatorio = bool(payload.get("es_obligatorio", False))

        try:
            pm, created = ProductoModificador.objects.get_or_create(
                producto=producto,
                modificador=modificador,
                defaults={"es_obligatorio": es_obligatorio}
            )
            if not created:
                return JsonResponse({"detail": "Ya existe esta asociación."}, status=400)
        except Exception as e:
            return JsonResponse({"detail": f"Error creando asociación: {str(e)}"}, status=500)

        return JsonResponse({
            "ok": True,
            "producto_id": producto_id,
            "modificador_id": mod_id,
            "es_obligatorio": es_obligatorio
        }, status=201)

    # --- PUT/PATCH (actualizar es_obligatorio) ---
    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        mod_id = payload.get("modificador_id")
        if not mod_id:
            return JsonResponse({"detail": "'modificador_id' es requerido."}, status=400)

        try:
            pm = ProductoModificador.objects.get(producto_id=producto_id, modificador_id=mod_id)
        except ProductoModificador.DoesNotExist:
            return JsonResponse({"detail": "No existe esta relación producto–modificador."}, status=404)

        if "es_obligatorio" in payload:
            pm.es_obligatorio = bool(payload["es_obligatorio"])
            pm.save(update_fields=["es_obligatorio"])

        return JsonResponse({
            "ok": True,
            "producto_id": producto_id,
            "modificador_id": mod_id,
            "es_obligatorio": pm.es_obligatorio
        }, status=200)

    # --- DELETE ---
    if request.method == "DELETE":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        mod_id = payload.get("modificador_id")
        if not mod_id:
            return JsonResponse({"detail": "'modificador_id' es requerido para eliminar."}, status=400)

        deleted, _ = ProductoModificador.objects.filter(
            producto_id=producto_id,
            modificador_id=mod_id
        ).delete()

        if deleted:
            return JsonResponse({"ok": True, "detail": "Asociación eliminada."}, status=200)
        return JsonResponse({"detail": "No se encontró la asociación."}, status=404)

    return JsonResponse({"detail": "Método no permitido."}, status=405)

def _regla_to_dict(r: ReglaNegocio):
    return {
        "regla_id": r.regla_id,
        "producto": {
            "producto_id": r.producto.producto_id,
            "nombre": r.producto.nombre
        },
        "condicion_modificador": {
            "modificador_id": r.condicion_modificador.modificador_id,
            "nombre": r.condicion_modificador.nombre
        },
        "accion_modificador": {
            "modificador_id": r.accion_modificador.modificador_id,
            "nombre": r.accion_modificador.nombre
        },
        "tipo_regla": r.tipo_regla,
        "descripcion": r.descripcion
    }

@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea reglas de negocio", tags=["Reglas"])
@api_view(["GET", "POST"])
def reglas_list(request):
    """
    GET: lista reglas
      - producto_id
      - tipo_regla
      - modificador_id (en condición o acción)
    POST: crear regla
    """

    if request.method == "GET":
        qs = ReglaNegocio.objects.select_related(
            "producto", "condicion_modificador", "accion_modificador"
        ).all()

        # filtros opcionales
        pid = request.GET.get("producto_id")
        if pid:
            qs = qs.filter(producto_id=pid)

        mid = request.GET.get("modificador_id")
        if mid:
            qs = qs.filter(
                models.Q(condicion_modificador_id=mid) |
                models.Q(accion_modificador_id=mid)
            )

        tipo = request.GET.get("tipo_regla")
        if tipo:
            qs = qs.filter(tipo_regla=tipo)

        data = [_regla_to_dict(r) for r in qs]
        return JsonResponse({"ok": True, "results": data}, status=200)

    # --- POST ---
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        producto_id = payload.get("producto_id")
        condicion_id = payload.get("condicion_modificador_id")
        accion_id = payload.get("accion_modificador_id")
        tipo_regla = payload.get("tipo_regla")
        descripcion = payload.get("descripcion")

        # validación básica
        if not producto_id or not condicion_id or not accion_id or not tipo_regla:
            return JsonResponse({"detail": "Campos obligatorios: producto_id, condicion_modificador_id, accion_modificador_id, tipo_regla."}, status=400)

        if tipo_regla not in ("Requerido", "Prohibido"):
            return JsonResponse({"detail": "tipo_regla debe ser 'Requerido' o 'Prohibido'."}, status=400)

        # validar FKs
        try:
            producto = Producto.objects.get(pk=producto_id)
        except Producto.DoesNotExist:
            return JsonResponse({"detail": "Producto no existe."}, status=404)

        try:
            cond = Modificador.objects.get(pk=condicion_id)
        except Modificador.DoesNotExist:
            return JsonResponse({"detail": "CondicionModificador no existe."}, status=404)

        try:
            acc = Modificador.objects.get(pk=accion_id)
        except Modificador.DoesNotExist:
            return JsonResponse({"detail": "AccionModificador no existe."}, status=404)

        regla = ReglaNegocio.objects.create(
            producto=producto,
            condicion_modificador=cond,
            accion_modificador=acc,
            tipo_regla=tipo_regla,
            descripcion=descripcion
        )

        return JsonResponse({"ok": True, "regla": _regla_to_dict(regla)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)

@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina regla de negocio", tags=["Reglas"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def regla_detail(request, regla_id: int):
    try:
        r = ReglaNegocio.objects.select_related(
            "producto", "condicion_modificador", "accion_modificador"
        ).get(pk=regla_id)
    except ReglaNegocio.DoesNotExist:
        return JsonResponse({"detail": "Regla no existe."}, status=404)

    # GET detalle
    if request.method == "GET":
        return JsonResponse({"ok": True, "regla": _regla_to_dict(r)}, status=200)

    # PUT/PATCH actualización
    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "producto_id" in payload:
            pid = payload.get("producto_id")
            try:
                r.producto = Producto.objects.get(pk=pid)
            except Producto.DoesNotExist:
                return JsonResponse({"detail": "Producto no existe."}, status=404)

        if "condicion_modificador_id" in payload:
            cid = payload.get("condicion_modificador_id")
            try:
                r.condicion_modificador = Modificador.objects.get(pk=cid)
            except Modificador.DoesNotExist:
                return JsonResponse({"detail": "CondicionModificador no existe."}, status=404)

        if "accion_modificador_id" in payload:
            aid = payload.get("accion_modificador_id")
            try:
                r.accion_modificador = Modificador.objects.get(pk=aid)
            except Modificador.DoesNotExist:
                return JsonResponse({"detail": "AccionModificador no existe."}, status=404)

        if "tipo_regla" in payload:
            tipo = payload.get("tipo_regla")
            if tipo not in ("Requerido", "Prohibido"):
                return JsonResponse({"detail": "tipo_regla inválido."}, status=400)
            r.tipo_regla = tipo

        if "descripcion" in payload:
            r.descripcion = payload.get("descripcion") or None

        r.save()
        return JsonResponse({"ok": True, "regla": _regla_to_dict(r)}, status=200)

    # DELETE eliminar completamente
    if request.method == "DELETE":
        r.delete()
        return JsonResponse({"ok": True, "detail": "Regla eliminada."}, status=200)

    return JsonResponse({"detail": "Método no permitido."}, status=405)

def _metodo_pago_to_dict(m: MetodoPago):
    return {
        "metodo_pago_id": m.metodo_pago_id,
        "empresa_id": m.empresa_id,
        "empresa_nombre": m.empresa.nombre if m.empresa_id else None,
        "nombre": m.nombre,
        "tipo": m.tipo,
        "estado": m.estado,
    }

@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea métodos de pago", tags=["Pagos"])
@api_view(["GET", "POST"])
def metodos_pago_list(request):
    """
    GET: listar métodos de pago
    POST: crear método de pago
    """
    if request.method == "GET":
        qs = MetodoPago.objects.select_related("empresa").all()

        # Filtros opcionales
        empresa_id = request.GET.get("empresa_id")
        if empresa_id:
            qs = qs.filter(empresa_id=empresa_id)

        estado = request.GET.get("estado")
        if estado is not None:
            if estado.lower() in ("true", "1"):
                qs = qs.filter(estado=True)
            elif estado.lower() in ("false", "0"):
                qs = qs.filter(estado=False)

        data = [_metodo_pago_to_dict(m) for m in qs]
        return JsonResponse({"ok": True, "count": len(data), "results": data})

    # ---------------- POST ----------------
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except:
            return JsonResponse({"detail": "JSON inválido"}, status=400)

        empresa_id = payload.get("empresa_id")
        if not empresa_id:
            return JsonResponse({"detail": "'empresa_id' es requerido."}, status=400)

        try:
            empresa = Empresa.objects.get(pk=empresa_id)
        except Empresa.DoesNotExist:
            return JsonResponse({"detail": "Empresa no existe."}, status=404)

        nombre = (payload.get("nombre") or "").strip()
        if not nombre:
            return JsonResponse({"detail": "'nombre' es requerido."}, status=400)

        tipo = (payload.get("tipo") or "").strip()
        if not tipo:
            return JsonResponse({"detail": "'tipo' es requerido."}, status=400)

        estado = payload.get("estado")
        estado_val = estado if isinstance(estado, bool) else True

        m = MetodoPago.objects.create(
            empresa=empresa,
            nombre=nombre,
            tipo=tipo,
            estado=estado_val,
        )

        return JsonResponse({"ok": True, "metodo_pago": _metodo_pago_to_dict(m)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)

@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina método de pago", tags=["Pagos"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def metodo_pago_detail(request, metodo_pago_id: int):
    """
    GET: detalle
    PUT/PATCH: actualizar
    DELETE: soft o hard delete
    """
    try:
        m = MetodoPago.objects.select_related("empresa").get(pk=metodo_pago_id)
    except MetodoPago.DoesNotExist:
        return JsonResponse({"detail": "Método de pago no existe."}, status=404)

    # --------------- GET ---------------
    if request.method == "GET":
        return JsonResponse({"ok": True, "metodo_pago": _metodo_pago_to_dict(m)})

    # --------------- PUT/PATCH ---------------
    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "nombre" in payload:
            nombre = (payload.get("nombre") or "").strip()
            if not nombre:
                return JsonResponse({"detail": "'nombre' no puede ser vacío."}, status=400)
            m.nombre = nombre

        if "tipo" in payload:
            tipo = (payload.get("tipo") or "").strip()
            if not tipo:
                return JsonResponse({"detail": "'tipo' no puede ser vacío."}, status=400)
            m.tipo = tipo

        if "estado" in payload:
            estado = payload.get("estado")
            if isinstance(estado, bool):
                m.estado = estado
            else:
                return JsonResponse({"detail": "'estado' debe ser booleano."}, status=400)

        if "empresa_id" in payload:
            eid = payload.get("empresa_id")
            if eid:
                try:
                    m.empresa = Empresa.objects.get(pk=eid)
                except Empresa.DoesNotExist:
                    return JsonResponse({"detail": "Empresa no existe."}, status=404)

        m.save()
        return JsonResponse({"ok": True, "metodo_pago": _metodo_pago_to_dict(m)})

    # --------------- DELETE ---------------
    if request.method == "DELETE":
        hard = request.GET.get("hard")
        if hard in ("1", "true", "True"):
            m.delete()
            return JsonResponse({"ok": True, "detail": "Método de pago eliminado (hard)."})
        
        m.estado = False
        m.save(update_fields=["estado"])
        return JsonResponse({"ok": True, "detail": "Método de pago deshabilitado (soft delete)."})

    return JsonResponse({"detail": "Método no permitido."}, status=405)

def _pedido_to_dict(p: Pedido):
    return {
        "pedido_id": p.pedido_id,
        "sucursal_id": p.sucursal_id,
        "sucursal_nombre": p.sucursal.nombre if p.sucursal_id else None,
        "usuario_id": p.usuario_id,
        "usuario_nombre": p.usuario.nombre_completo if p.usuario_id else None,
        "numero_pedido": p.numero_pedido,
        "fecha_hora": p.fecha_hora.isoformat() if p.fecha_hora else None,
        "estado": p.estado,
        "tipo_venta": p.tipo_venta,
        "es_offline": p.es_offline,
        "fecha_sincronizacion": p.fecha_sincronizacion.isoformat() if p.fecha_sincronizacion else None,
        "total_bruto": str(p.total_bruto),
        "descuento_total": str(p.descuento_total),
        "iva": str(p.iva),
        "total_neto": str(p.total_neto),
    }


@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea pedidos", tags=["Pedidos"])
@api_view(["GET", "POST"])
@registrar_auditoria("Pedido")
def pedidos_list(request):
    # --- GET LISTA ---
    if request.method == "GET":
        qs = Pedido.objects.select_related("sucursal", "usuario").all()

        # filtros opcionales
        sucursal_id = request.GET.get("sucursal_id")
        if sucursal_id:
            qs = qs.filter(sucursal_id=sucursal_id)

        usuario_id = request.GET.get("usuario_id")
        if usuario_id:
            qs = qs.filter(usuario_id=usuario_id)

        estado = request.GET.get("estado")
        if estado:
            qs = qs.filter(estado__iexact=estado)

        data = [_pedido_to_dict(p) for p in qs]
        return JsonResponse({"ok": True, "results": data}, status=200)

    # --- POST CREAR ---
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        # Validaciones requeridas
        for campo in ["sucursal_id", "usuario_id", "numero_pedido", "estado", "tipo_venta", "total_bruto", "total_neto"]:
            if not payload.get(campo):
                return JsonResponse({"detail": f"'{campo}' es requerido."}, status=400)

        try:
            suc = Sucursal.objects.get(pk=payload["sucursal_id"])
        except Sucursal.DoesNotExist:
            return JsonResponse({"detail": "Sucursal no existe."}, status=404)

        try:
            user = Usuario.objects.get(pk=payload["usuario_id"])
        except Usuario.DoesNotExist:
            return JsonResponse({"detail": "Usuario no existe."}, status=404)

        p = Pedido.objects.create(
            sucursal=suc,
            usuario=user,
            numero_pedido=payload["numero_pedido"],
            estado=payload["estado"],
            tipo_venta=payload["tipo_venta"],
            es_offline=payload.get("es_offline", False),
            total_bruto=payload["total_bruto"],
            descuento_total=payload.get("descuento_total", 0),
            iva=payload.get("iva", 0),
            total_neto=payload["total_neto"],
        )

        return JsonResponse({"ok": True, "pedido": _pedido_to_dict(p)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)

@csrf_exempt
@require_jwt
@registrar_auditoria("Pedido")
@extend_schema(summary="Detalle, actualiza o elimina pedido", tags=["Pedidos"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def pedido_detail(request, pedido_id: int):

    try:
        p = Pedido.objects.select_related("sucursal", "usuario").get(pk=pedido_id)
    except Pedido.DoesNotExist:
        return JsonResponse({"detail": "Pedido no existe."}, status=404)

    # --- GET ---
    if request.method == "GET":
        return JsonResponse({"ok": True, "pedido": _pedido_to_dict(p)}, status=200)

    # --- PUT / PATCH ---
    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "sucursal_id" in payload:
            try:
                p.sucursal = Sucursal.objects.get(pk=payload["sucursal_id"])
            except Sucursal.DoesNotExist:
                return JsonResponse({"detail": "Sucursal no existe."}, status=404)

        if "usuario_id" in payload:
            try:
                p.usuario = Usuario.objects.get(pk=payload["usuario_id"])
            except Usuario.DoesNotExist:
                return JsonResponse({"detail": "Usuario no existe."}, status=404)

        for campo in ["numero_pedido", "estado", "tipo_venta", "total_bruto", "descuento_total", "iva", "total_neto"]:
            if campo in payload:
                setattr(p, campo, payload[campo])

        if "es_offline" in payload:
            p.es_offline = bool(payload["es_offline"])

        p.save()
        return JsonResponse({"ok": True, "pedido": _pedido_to_dict(p)}, status=200)

    # --- DELETE ---
    if request.method == "DELETE":
        hard = request.GET.get("hard")
        if hard in ("1", "true", "True"):
            p.delete()
            return JsonResponse({"ok": True, "detail": "Pedido eliminado."}, status=200)

        # Soft delete → por ahora mantenemos p.estado = "Eliminado"
        p.estado = "Eliminado"
        p.save(update_fields=["estado"])
        return JsonResponse({"ok": True, "detail": "Pedido deshabilitado (soft delete)."}, status=200)

    return JsonResponse({"detail": "Método no permitido."}, status=405)

def _pedido_detalle_to_dict(d: PedidoDetalle):
    return {
        "detalle_id": d.detalle_id,
        "pedido_id": d.pedido_id,
        "producto_id": d.producto_id,
        "producto_nombre": d.producto.nombre,
        "cantidad": d.cantidad,
        "precio_unitario": str(d.precio_unitario),
        "descuento": str(d.descuento),
        "total_linea": str(d.total_linea),
        "notas": d.notas,
    }

@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea detalles de pedido", tags=["Pedidos"])
@api_view(["GET", "POST"])
def pedido_detalles_list(request, pedido_id: int):
    try:
        pedido = Pedido.objects.get(pk=pedido_id)
    except Pedido.DoesNotExist:
        return JsonResponse({"detail": "Pedido no existe."}, status=404)

    # GET – listar detalles
    if request.method == "GET":
        detalles = PedidoDetalle.objects.filter(pedido=pedido)
        return JsonResponse({
            "ok": True,
            "detalles": [_pedido_detalle_to_dict(d) for d in detalles]
        })

    # POST – crear detalle
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        required = ["producto_id", "cantidad"]
        for r in required:
            if r not in payload:
                return JsonResponse({"detail": f"Falta '{r}'."}, status=400)

        # validar producto
        try:
            producto = Producto.objects.get(pk=payload["producto_id"])
        except Producto.DoesNotExist:
            return JsonResponse({"detail": "Producto no existe."}, status=404)

        cantidad = int(payload["cantidad"])
        if cantidad <= 0:
            return JsonResponse({"detail": "Cantidad debe ser > 0."}, status=400)

        precio_unitario = producto.precio_base
        descuento = payload.get("descuento", 0)
        total_linea = (precio_unitario - descuento) * cantidad

        detalle = PedidoDetalle.objects.create(
            pedido=pedido,
            producto=producto,
            cantidad=cantidad,
            precio_unitario=precio_unitario,
            descuento=descuento,
            total_linea=total_linea,
            notas=payload.get("notas")
        )

        return JsonResponse({
            "ok": True,
            "detalle": _pedido_detalle_to_dict(detalle)
        }, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)

@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina detalle de pedido", tags=["Pedidos"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def pedido_detalle_detail(request, detalle_id: int):
    try:
        det = PedidoDetalle.objects.select_related("producto", "pedido").get(pk=detalle_id)
    except PedidoDetalle.DoesNotExist:
        return JsonResponse({"detail": "Detalle no existe."}, status=404)

    # GET
    if request.method == "GET":
        return JsonResponse({"ok": True, "detalle": _pedido_detalle_to_dict(det)})

    # PUT / PATCH
    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "cantidad" in payload:
            cant = int(payload["cantidad"])
            if cant <= 0:
                return JsonResponse({"detail": "Cantidad debe ser > 0."}, status=400)
            det.cantidad = cant

        if "descuento" in payload:
            det.descuento = payload.get("descuento") or 0

        if "notas" in payload:
            det.notas = payload.get("notas")

        # recalcular total
        det.total_linea = (det.precio_unitario - det.descuento) * det.cantidad
        det.save()

        return JsonResponse({"ok": True, "detalle": _pedido_detalle_to_dict(det)})

    # DELETE — elimina el detalle
    if request.method == "DELETE":
        det.delete()
        return JsonResponse({"ok": True, "detail": "Detalle eliminado."})

    return JsonResponse({"detail": "Método no permitido."}, status=405)


def _detalle_modificador_to_dict(dm: PedidoDetalleModificador):
    return {
        "detalle_id": dm.detalle_id,
        "modificador_id": dm.modificador_id,
        "valor_aplicado": str(dm.valor_aplicado),
        "es_gratuito": dm.es_gratuito,
    }


@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea modificadores del detalle", tags=["Pedidos"])
@api_view(["GET", "POST"])
def detalle_modificadores_list(request, detalle_id: int):

    # Validar detalle
    try:
        d = PedidoDetalle.objects.get(pk=detalle_id)
    except PedidoDetalle.DoesNotExist:
        return JsonResponse({"detail": "Detalle no existe."}, status=404)

    # ----------------------------
    # GET → listar modificadores del detalle
    # ----------------------------
    if request.method == "GET":
        mods = PedidoDetalleModificador.objects.filter(detalle=d)
        data = [_detalle_modificador_to_dict(m) for m in mods]
        return JsonResponse({"ok": True, "count": len(data), "results": data})

    # ----------------------------
    # POST → crear relación modificador-detalle
    # ----------------------------
    if request.method == "POST":
        try:
            body = json.loads(request.body.decode("utf-8"))
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        modificador_id = body.get("modificador_id")
        if not modificador_id:
            return JsonResponse({"detail": "'modificador_id' es requerido."}, status=400)

        # validar modificador
        try:
            m = Modificador.objects.get(pk=modificador_id)
        except Modificador.DoesNotExist:
            return JsonResponse({"detail": "Modificador no existe."}, status=404)

        valor = body.get("valor_aplicado", 0)
        es_gratis = body.get("es_gratuito", False)

        try:
            dm = PedidoDetalleModificador.objects.create(
                detalle=d,
                modificador=m,
                valor_aplicado=valor,
                es_gratuito=es_gratis
            )
        except IntegrityError:
            return JsonResponse({"detail": "Este modificador ya está agregado al detalle."}, status=400)

        return JsonResponse({"ok": True, "modificador": _detalle_modificador_to_dict(dm)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)

@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina modificador del detalle", tags=["Pedidos"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def detalle_modificador_detail(request, detalle_id: int, modificador_id: int):

    # Validar existencia
    try:
        dm = PedidoDetalleModificador.objects.get(
            detalle_id=detalle_id,
            modificador_id=modificador_id
        )
    except PedidoDetalleModificador.DoesNotExist:
        return JsonResponse({"detail": "Detalle-Modificador no existe."}, status=404)

    # ----------------------------
    # GET → detalle
    # ----------------------------
    if request.method == "GET":
        return JsonResponse({"ok": True, "modificador": _detalle_modificador_to_dict(dm)})

    # ----------------------------
    # PUT/PATCH → actualizar valores
    # ----------------------------
    if request.method in ("PUT", "PATCH"):
        try:
            body = json.loads(request.body.decode("utf-8"))
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "valor_aplicado" in body:
            dm.valor_aplicado = body.get("valor_aplicado")

        if "es_gratuito" in body:
            dm.es_gratuito = bool(body.get("es_gratuito"))

        dm.save()
        return JsonResponse({"ok": True, "modificador": _detalle_modificador_to_dict(dm)})

    # ----------------------------
    # DELETE → eliminar modificador del detalle
    # ----------------------------
    if request.method == "DELETE":
        dm.delete()
        return JsonResponse({"ok": True, "detail": "Modificador eliminado del detalle."})

    return JsonResponse({"detail": "Método no permitido."}, status=405)

def _pago_to_dict(p: Pago):
    return {
        "pago_id": p.pago_id,
        "pedido_id": p.pedido_id,
        "metodo_pago_id": p.metodo_pago_id,
        "monto": str(p.monto),
        "referencia": p.referencia,
        "pos_id": p.pos_id,
        "fecha_hora": p.fecha_hora.isoformat() if p.fecha_hora else None,
    }

@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea pagos", tags=["Pagos"])
@api_view(["GET", "POST"])
def pagos_list(request):
    """
    GET  : listar pagos
    POST : crear pago manual (no Webpay; Webpay lo hará internamente)
    """
    if request.method == "GET":
        pagos = Pago.objects.select_related("pedido", "metodo_pago").all()
        data = [_pago_to_dict(p) for p in pagos]
        return JsonResponse({"ok": True, "results": data})

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        pedido_id = payload.get("pedido_id")
        metodo_pago_id = payload.get("metodo_pago_id")
        monto = payload.get("monto")

        if not pedido_id or not metodo_pago_id or monto is None:
            return JsonResponse({"detail": "pedido_id, metodo_pago_id y monto son requeridos."}, status=400)

        try:
            pedido = Pedido.objects.get(pk=pedido_id)
        except Pedido.DoesNotExist:
            return JsonResponse({"detail": "Pedido no existe."}, status=404)

        try:
            metodo = MetodoPago.objects.get(pk=metodo_pago_id)
        except MetodoPago.DoesNotExist:
            return JsonResponse({"detail": "MetodoPago no existe."}, status=404)

        p = Pago.objects.create(
            pedido=pedido,
            metodo_pago=metodo,
            monto=monto,
            referencia=payload.get("referencia"),
            pos_id=payload.get("pos_id")
        )

        return JsonResponse({"ok": True, "pago": _pago_to_dict(p)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)

@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina pago", tags=["Pagos"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def pago_detail(request, pago_id: int):
    try:
        p = Pago.objects.get(pk=pago_id)
    except Pago.DoesNotExist:
        return JsonResponse({"detail": "Pago no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse({"ok": True, "pago": _pago_to_dict(p)})

    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "monto" in payload:
            p.monto = payload.get("monto")

        if "referencia" in payload:
            p.referencia = payload.get("referencia") or None

        if "pos_id" in payload:
            p.pos_id = payload.get("pos_id") or None

        if "metodo_pago_id" in payload:
            try:
                mp = MetodoPago.objects.get(pk=payload.get("metodo_pago_id"))
                p.metodo_pago = mp
            except MetodoPago.DoesNotExist:
                return JsonResponse({"detail": "MetodoPago no existe."}, status=404)

        p.save()
        return JsonResponse({"ok": True, "pago": _pago_to_dict(p)})

    if request.method == "DELETE":
        p.delete()
        return JsonResponse({"ok": True, "detail": "Pago eliminado."})

    return JsonResponse({"detail": "Método no permitido."}, status=405)

def _boleta_to_dict(b: Boleta):
    return {
        "boleta_id": b.boleta_id,
        "pedido_id": b.pedido_id,
        "folio": b.folio,
        "fecha_emision": b.fecha_emision.isoformat() if b.fecha_emision else None,

        "rut_cliente": b.rut_cliente,
        "monto_total": str(b.monto_total),

        "codigo_qr": b.codigo_qr,
        "estado_envio_sii": b.estado_envio_sii,

        "xml_boleta": b.xml_boleta,
        "url_pdf": b.url_pdf
    }

@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea boletas", tags=["Boletas"])
@api_view(["GET", "POST"])
def boletas_list(request):
    """
    GET  : listar boletas
    POST : crear boleta (manual o tras Webpay)
    """
    if request.method == "GET":
        qs = Boleta.objects.select_related("pedido").all()
        data = [_boleta_to_dict(b) for b in qs]
        return JsonResponse({"ok": True, "results": data})

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        pedido_id = payload.get("pedido_id")
        folio = payload.get("folio")
        monto_total = payload.get("monto_total")

        if not pedido_id or not folio or monto_total is None:
            return JsonResponse({
                "detail": "pedido_id, folio y monto_total son requeridos."
            }, status=400)

        try:
            pedido = Pedido.objects.get(pk=pedido_id)
        except Pedido.DoesNotExist:
            return JsonResponse({"detail": "Pedido no existe."}, status=404)

        b = Boleta.objects.create(
            pedido=pedido,
            folio=folio,
            monto_total=monto_total,
            rut_cliente=payload.get("rut_cliente"),
            codigo_qr=payload.get("codigo_qr"),
            estado_envio_sii=payload.get("estado_envio_sii"),
            xml_boleta=payload.get("xml_boleta"),
            url_pdf=payload.get("url_pdf")
        )

        return JsonResponse({"ok": True, "boleta": _boleta_to_dict(b)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)

@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina boleta", tags=["Boletas"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def boleta_detail(request, boleta_id: int):
    try:
        b = Boleta.objects.get(pk=boleta_id)
    except Boleta.DoesNotExist:
        return JsonResponse({"detail": "Boleta no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse({"ok": True, "boleta": _boleta_to_dict(b)})

    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "rut_cliente" in payload:
            b.rut_cliente = payload.get("rut_cliente") or None

        if "monto_total" in payload:
            b.monto_total = payload.get("monto_total")

        if "codigo_qr" in payload: 
            b.codigo_qr = payload.get("codigo_qr") or None

        if "estado_envio_sii" in payload:
            b.estado_envio_sii = payload.get("estado_envio_sii") or None

        if "xml_boleta" in payload:
            b.xml_boleta = payload.get("xml_boleta") or None

        if "url_pdf" in payload:
            b.url_pdf = payload.get("url_pdf") or None

        b.save()
        return JsonResponse({"ok": True, "boleta": _boleta_to_dict(b)})

    if request.method == "DELETE":
        b.delete()
        return JsonResponse({"ok": True, "detail": "Boleta eliminada."})

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
def emitir_boleta(request, pedido_id: int):

    if request.method != "POST":
        return JsonResponse({"detail": "Método no permitido."}, status=405)

    # 1. Buscar pedido
    try:
        pedido = Pedido.objects.select_related("sucursal", "usuario").get(pk=pedido_id)
    except Pedido.DoesNotExist:
        return JsonResponse({"detail": "Pedido no existe."}, status=404)

    # 2. Monto total = total_neto + iva
    monto_total = pedido.total_neto + pedido.iva

    # 3. Generar un folio secuencial
    ultimo_folio = Boleta.objects.aggregate(Max("folio")).get("folio__max") or 0
    nuevo_folio = ultimo_folio + 1

    # 4. Crear Boleta (solo lo necesario)
    boleta = Boleta.objects.create(
        pedido=pedido,
        folio=nuevo_folio,
        rut_cliente=None,               # No lo estamos usando por ahora
        monto_total=monto_total,
        estado_envio_sii="PENDIENTE",   # placeholder estándar
        xml_boleta=None,
        url_pdf=None,
    )

    # 5. Respuesta limpia
    return JsonResponse({
        "ok": True,
        "boleta_id": boleta.boleta_id,
        "folio": boleta.folio,
        "monto_total": str(boleta.monto_total),
        "pedido": pedido.numero_pedido,
        "sucursal": pedido.sucursal.nombre,
        "fecha_emision": boleta.fecha_emision.strftime("%Y-%m-%d %H:%M:%S"),
        "estado_envio_sii": boleta.estado_envio_sii,
    }, status=201)

def obtener_metodo_pago(pedido):
    pago = Pago.objects.filter(pedido=pedido).first()
    if pago:
        return pago.metodo_pago.nombre
    return "No informado"

    

def _usuario_sucursal_to_dict(us: UsuarioSucursal):
    return {
        "usuario_sucursal_id": us.usuario_sucursal_id,
        "usuario_id": us.usuario_id,
        "usuario_nombre": us.usuario.nombre_completo if us.usuario else None,
        "sucursal_id": us.sucursal_id,
        "sucursal_nombre": us.sucursal.nombre if us.sucursal else None,
        "fecha_asignacion": us.fecha_asignacion.isoformat() if us.fecha_asignacion else None,
        "estado": us.estado,
    }

@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea asignaciones usuario–sucursal", tags=["Usuarios"])
@api_view(["GET", "POST"])
def usuarios_sucursales_list(request):
    """
    GET: listar asignaciones
    POST: crear asignación (una o múltiples sucursales)
      - Formato 1:
            {"usuario_id": 10, "sucursal_id": 3}
      - Formato 2:
            {"usuario_id": 10, "sucursales": [1,2,3]}
    """
    if request.method == "GET":
        qs = UsuarioSucursal.objects.select_related("usuario", "sucursal").all()
        data = [_usuario_sucursal_to_dict(us) for us in qs]
        return JsonResponse({"ok": True, "results": data}, status=200)

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        usuario_id = payload.get("usuario_id")
        sucursal_id = payload.get("sucursal_id")
        sucursales_lista = payload.get("sucursales")

        # --- Validaciones ---
        if not usuario_id:
            return JsonResponse({"detail": "usuario_id es requerido."}, status=400)

        if sucursal_id and sucursales_lista:
            return JsonResponse({"detail": "Usa solo 'sucursal_id' o solo 'sucursales'."}, status=400)

        # Buscar usuario
        try:
            usuario = Usuario.objects.get(pk=usuario_id)
        except Usuario.DoesNotExist:
            return JsonResponse({"detail": "Usuario no existe."}, status=404)

        # --- Caso: agregar UNA sucursal ---
        if sucursal_id:
            try:
                sucursal = Sucursal.objects.get(pk=sucursal_id)
            except Sucursal.DoesNotExist:
                return JsonResponse({"detail": "Sucursal no existe."}, status=404)

            us, created = UsuarioSucursal.objects.get_or_create(
                usuario=usuario,
                sucursal=sucursal,
                defaults={"fecha_asignacion": timezone.now(), "estado": True},
            )

            return JsonResponse({"ok": True, "usuario_sucursal": _usuario_sucursal_to_dict(us)}, status=201)

        # --- Caso: agregar VARIAS sucursales ---
        if sucursales_lista:
            if not isinstance(sucursales_lista, list):
                return JsonResponse({"detail": "'sucursales' debe ser una lista."}, status=400)

            creados = []
            for sid in sucursales_lista:
                try:
                    sucursal = Sucursal.objects.get(pk=sid)
                except Sucursal.DoesNotExist:
                    return JsonResponse({"detail": f"Sucursal {sid} no existe."}, status=404)

                us, created = UsuarioSucursal.objects.get_or_create(
                    usuario=usuario,
                    sucursal=sucursal,
                    defaults={"fecha_asignacion": timezone.now(), "estado": True},
                )
                creados.append(_usuario_sucursal_to_dict(us))

            return JsonResponse({"ok": True, "creados": creados}, status=201)

        return JsonResponse({"detail": "Debes enviar 'sucursal_id' o 'sucursales'."}, status=400)

    return JsonResponse({"detail": "Método no permitido."}, status=405)

@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina asignación usuario–sucursal", tags=["Usuarios"])
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def usuario_sucursal_detail(request, usuario_sucursal_id):
    try:
        us = UsuarioSucursal.objects.select_related("usuario", "sucursal").get(
            pk=usuario_sucursal_id
        )
    except UsuarioSucursal.DoesNotExist:
        return JsonResponse({"detail": "Asignación no existe."}, status=404)

    # =======================
    #          GET
    # =======================
    if request.method == "GET":
        return JsonResponse({"ok": True, "usuario_sucursal": _usuario_sucursal_to_dict(us)}, status=200)

    # =======================
    #    PUT / PATCH
    # =======================
    if request.method in ("PUT", "PATCH"):
        try:
            payload = json.loads(request.body)
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        if "estado" in payload:
            if isinstance(payload["estado"], bool):
                us.estado = payload["estado"]
            else:
                return JsonResponse({"detail": "'estado' debe ser booleano."}, status=400)

        us.save()
        return JsonResponse({"ok": True, "usuario_sucursal": _usuario_sucursal_to_dict(us)}, status=200)

    # =======================
    #        DELETE
    # =======================
    if request.method == "DELETE":
        us.delete()
        return JsonResponse({"ok": True, "detail": "Asignación eliminada."}, status=200)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
@extend_schema(summary="Iniciar transacción Webpay", tags=["Webpay"])
@api_view(["POST"])
def webpay_init(request):
    if request.method != "POST":
        return JsonResponse({"detail": "Método no permitido."}, status=405)

    try:
        data = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"detail": "JSON inválido."}, status=400)

    pedido_id = data.get("pedido_id")
    monto = data.get("monto")
    return_url = data.get("return_url") or "https://foodtrucksapp.cl/webpay/retorno/"

    if not pedido_id or not monto:
        return JsonResponse({"detail": "pedido_id y monto son requeridos."}, status=400)

    # validar pedido
    try:
        pedido = Pedido.objects.get(pk=pedido_id)
    except Pedido.DoesNotExist:
        return JsonResponse({"detail": "Pedido no existe."}, status=404)

    # ---------------------------------------------------------------------
    # 1️⃣ Llamar a Webpay (Transbank)
    # ---------------------------------------------------------------------
    url = "https://webpay3gint.transbank.cl/rswebpaytransaction/api/webpay/v1.2/transactions"

    headers = {
        "Tbk-Api-Key-Id": settings.WEBPAY_COMMERCE_CODE,
        "Tbk-Api-Key-Secret": settings.WEBPAY_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "buy_order": f"order_{pedido_id}_{int(timezone.now().timestamp())}",
        "session_id": f"session_{pedido.usuario.usuario_id}",
        "amount": float(monto),
        "return_url": return_url
    }

    resp = requests.post(url, json=payload, headers=headers)

    if resp.status_code not in (200, 201):
        return JsonResponse({
            "detail": "Error llamando a Webpay",
            "response": resp.text
        }, status=500)

    wp = resp.json()

    # ---------------------------------------------------------------------
    # 2️⃣ Guardar la transacción en tu tabla PAGO (estado inicial "pendiente")
    # ---------------------------------------------------------------------
    # 🎯 Aquí NO se crea todavía un Pago real porque Webpay aún no confirma.
    #    Creamos una tabla nueva llamada TransaccionWebpay (te la paso ahora).
    from .models import TransaccionWebpay
    
    tr = TransaccionWebpay.objects.create(
        pedido=pedido,
        token=wp["token"],
        buy_order=payload["buy_order"],
        session_id=payload["session_id"],
        monto=monto,
        estado="pendiente",
        fecha_creacion=timezone.now()
    )

    # ---------------------------------------------------------------------
    # 3️⃣ Responder al frontend
    # ---------------------------------------------------------------------
    return JsonResponse({
        "ok": True,
        "token": wp["token"],
        "url": wp["url"],   # el frontend redirige a url?token=xxxxx
        "transaccion_id": tr.transaccion_id
    })

def _transaccion_to_dict(t: TransaccionWebpay):
    return {
        "transaccion_id": t.transaccion_id,
        "pedido_id": t.pedido_id,
        "token": t.token,
        "buy_order": t.buy_order,
        "session_id": t.session_id,
        "monto": float(t.monto),
        "estado": t.estado,
        "fecha_creacion": t.fecha_creacion.isoformat(),
        "fecha_actualizacion": t.fecha_actualizacion.isoformat()
    }

@csrf_exempt
@require_jwt
@extend_schema(summary="Lista transacciones Webpay", tags=["Webpay"])
@api_view(["GET"])
def webpay_transacciones_list(request):
    """
    GET: lista todas las transacciones Webpay
      Filtros opcionales:
        - pedido_id
        - estado (pendiente / autorizado / rechazado)
        - token (búsqueda exacta)
    """
    if request.method != "GET":
        return JsonResponse({"detail": "Método no permitido."}, status=405)

    qs = TransaccionWebpay.objects.all()

    pedido_id = request.GET.get("pedido_id")
    if pedido_id:
        qs = qs.filter(pedido_id=pedido_id)

    estado = request.GET.get("estado")
    if estado:
        qs = qs.filter(estado=estado)

    token = request.GET.get("token")
    if token:
        qs = qs.filter(token=token)

    data = [_transaccion_to_dict(t) for t in qs]

    return JsonResponse({"ok": True, "results": data}, status=200)

@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle de transacción Webpay", tags=["Webpay"])
@api_view(["GET"])
def webpay_transaccion_detail(request, transaccion_id: int):
    if request.method != "GET":
        return JsonResponse({"detail": "Método no permitido."}, status=405)

    try:
        t = TransaccionWebpay.objects.get(pk=transaccion_id)
    except TransaccionWebpay.DoesNotExist:
        return JsonResponse({"detail": "Transacción no existe."}, status=404)

    return JsonResponse({"ok": True, "transaccion": _transaccion_to_dict(t)}, status=200)

@extend_schema(summary="Commit de Webpay", tags=["Webpay"])
@api_view(["POST"])
@csrf_exempt
def webpay_commit(request):
    if request.method != "POST":
        return JsonResponse({"detail": "Método no permitido. Usa POST."}, status=405)

    try:
        payload = json.loads(request.body.decode("utf-8"))
        token_ws = payload.get("token_ws")
    except:
        return JsonResponse({"detail": "JSON inválido."}, status=400)

    if not token_ws:
        return JsonResponse({"detail": "token_ws es requerido"}, status=400)

    # Buscar transacción en nuestra BD
    try:
        tx = TransaccionWebpay.objects.get(token=token_ws)
    except TransaccionWebpay.DoesNotExist:
        return JsonResponse({"detail": "Transacción no encontrada para este token_ws"}, status=404)

    # URL que corresponde al COMMIT
    url = f"{settings.WEBPAY_URL}/rswebpaytransaction/api/webpay/v1.2/transactions/{token_ws}"

    headers = {
        "Tbk-Api-Key-Id": settings.WEBPAY_COMMERCE_CODE,
        "Tbk-Api-Key-Secret": settings.WEBPAY_API_KEY,
        "Content-Type": "application/json"
    }

    try:
        response = requests.put(url, headers=headers)
        data = response.json()
    except Exception as e:
        return JsonResponse({"detail": f"Error al llamar Webpay: {str(e)}"}, status=500)

    # Manejo de posibles respuestas
    status = data.get("status")

    if status == "AUTHORIZED":
        tx.estado = "autorizado"
    elif status == "FAILED" or status == "REJECTED":
        tx.estado = "rechazado"
    else:
        tx.estado = "pendiente"  # fallback

    tx.fecha_actualizacion = datetime.now()
    tx.save()

    return JsonResponse({
        "ok": True,
        "estado": tx.estado,
        "token": token_ws,
        "buy_order": tx.buy_order,
        "session_id": tx.session_id,
        "monto": float(tx.monto),
        "webpay_response": data
    }, status=200)

def _auditoria_to_dict(a):
    return {
        "auditoria_id": a.auditoria_id,
        "usuario_id": a.usuario_id,
        "usuario_nombre": a.usuario.nombre_completo,
        "sucursal_id": a.sucursal_id,
        "sucursal_nombre": a.sucursal.nombre,
        "accion": a.accion,
        "entidad": a.entidad,
        "entidad_id": a.entidad_id,
        "detalles": a.detalles,
        "ip": a.ip,
        "fecha_hora": a.fecha_hora.isoformat(),
    }

@csrf_exempt
@require_jwt
@extend_schema(summary="Lista registros de auditoría", tags=["Auditoría"])
@api_view(["GET", "POST"])
def auditorias_list(request):
    """
    GET: listar auditoría con filtros
    POST: crear registro manual (si lo necesitas)
    """
    # ---------- GET LISTADO ----------
    if request.method == "GET":
        qs = Auditoria.objects.select_related("usuario", "sucursal").all()

        # Filtros opcionales
        usuario_id = request.GET.get("usuario_id")
        if usuario_id:
            qs = qs.filter(usuario_id=usuario_id)

        sucursal_id = request.GET.get("sucursal_id")
        if sucursal_id:
            qs = qs.filter(sucursal_id=sucursal_id)

        entidad = request.GET.get("entidad")
        if entidad:
            qs = qs.filter(entidad__iexact=entidad)

        accion = request.GET.get("accion")
        if accion:
            qs = qs.filter(accion__iexact=accion)

        # Ordenar
        qs = qs.order_by("-fecha_hora")

        data = [_auditoria_to_dict(a) for a in qs]
        return JsonResponse({"ok": True, "results": data}, status=200)

    # ---------- POST CREAR MANUAL ----------
    if request.method == "POST":
        try:
            payload = json.loads(request.body)
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        try:
            usuario = Usuario.objects.get(pk=payload.get("usuario_id"))
            sucursal = Sucursal.objects.get(pk=payload.get("sucursal_id"))
        except:
            return JsonResponse({"detail": "Usuario o sucursal no existe."}, status=404)

        a = Auditoria.objects.create(
            usuario=usuario,
            sucursal=sucursal,
            accion=payload.get("accion"),
            entidad=payload.get("entidad"),
            entidad_id=payload.get("entidad_id"),
            detalles=payload.get("detalles"),
            ip=payload.get("ip"),
        )
        return JsonResponse({"ok": True, "auditoria": _auditoria_to_dict(a)}, status=201)

    return JsonResponse({"detail": "Método no permitido"}, status=405)


@require_jwt
@extend_schema(summary="Detalle de auditoría", tags=["Auditoría"])
@api_view(["GET"])
def auditoria_detail(request, auditoria_id):
    try:
        a = Auditoria.objects.select_related("usuario", "sucursal").get(pk=auditoria_id)
    except Auditoria.DoesNotExist:
        return JsonResponse({"detail": "Auditoría no existe."}, status=404)

    return JsonResponse({"ok": True, "auditoria": _auditoria_to_dict(a)}, status=200)


def _cierre_to_dict(c):
    return {
        "cierre_id": c.cierre_id,
        "sucursal_id": c.sucursal_id,
        "sucursal_nombre": c.sucursal.nombre,
        "usuario_id": c.usuario_id,
        "usuario_nombre": c.usuario.nombre_completo,

        "fecha_apertura": c.fecha_apertura,
        "fecha_cierre": c.fecha_cierre,

        "monto_inicial": float(c.monto_inicial),
        "ingresos_efectivo": float(c.ingresos_efectivo),
        "ingresos_electronicos": float(c.ingresos_electronicos),

        "total_esperado": float(c.total_esperado),
        "total_real": float(c.total_real),
        "diferencia": float(c.diferencia),

        "estado": c.estado,
        "observaciones": c.observaciones,
    }
    

@csrf_exempt
@require_jwt
@extend_schema(summary="Lista y crea cierres de caja", tags=["Caja"])
@api_view(["GET", "POST"])
def cierres_caja_list(request):
    if request.method == "GET":
        qs = CierreCaja.objects.select_related("sucursal", "usuario").order_by("-fecha_apertura")
        data = [_cierre_to_dict(c) for c in qs]
        return JsonResponse({"ok": True, "results": data}, status=200)

    if request.method == "POST":
        # Apertura de caja
        try:
            payload = json.loads(request.body)
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        try:
            sucursal = Sucursal.objects.get(pk=payload.get("sucursal_id"))
            usuario = Usuario.objects.get(pk=payload.get("usuario_id"))
        except:
            return JsonResponse({"detail": "Usuario o sucursal no existe."}, status=404)

        c = CierreCaja.objects.create(
            sucursal=sucursal,
            usuario=usuario,
            fecha_apertura=payload["fecha_apertura"],
            monto_inicial=payload.get("monto_inicial", 0),
            estado="abierto",
        )
        return JsonResponse({"ok": True, "cierre_caja": _cierre_to_dict(c)}, status=201)

    return JsonResponse({"detail": "Método no permitido"}, status=405)


@csrf_exempt
@require_jwt
@extend_schema(summary="Detalle, actualiza o elimina cierre de caja", tags=["Caja"])
@api_view(["GET", "PUT", "DELETE"])
def cierre_caja_detail(request, cierre_id):
    try:
        c = CierreCaja.objects.get(pk=cierre_id)
    except CierreCaja.DoesNotExist:
        return JsonResponse({"detail": "Cierre no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse({"ok": True, "cierre": _cierre_to_dict(c)}, status=200)

    if request.method == "PUT":
        # Cierre de caja
        try:
            payload = json.loads(request.body)
        except:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        c.ingresos_efectivo = payload.get("ingresos_efectivo", c.ingresos_efectivo)
        c.ingresos_electronicos = payload.get("ingresos_electronicos", c.ingresos_electronicos)
        c.total_real = payload.get("total_real", c.total_real)

        c.total_esperado = (
            c.monto_inicial +
            c.ingresos_efectivo +
            c.ingresos_electronicos
        )

        c.diferencia = c.total_real - c.total_esperado
        c.fecha_cierre = payload.get("fecha_cierre")
        c.estado = "cerrado"
        c.observaciones = payload.get("observaciones", c.observaciones)

        c.save()

        return JsonResponse({"ok": True, "cierre": _cierre_to_dict(c)}, status=200)

    if request.method == "DELETE":
        c.delete()
        return JsonResponse({"ok": True, "detail": "Cierre eliminado"}, status=200)

    return JsonResponse({"detail": "Método no permitido"}, status=405)

@csrf_exempt
@require_jwt
def metricas_dashboard(request):

    if request.method != "GET":
        return JsonResponse({"detail": "Método no permitido"}, status=405)

    from django.utils.timezone import localdate
    from django.db.models.functions import ExtractDay

    hoy = localdate()
    inicio_mes = hoy.replace(day=1)

    # ============================
    # 1. Ventas del día
    # ============================
    ventas_dia = Pedido.objects.filter(
        fecha_hora__date=hoy
    ).aggregate(
        total=Sum('total_neto') + Sum('iva')
    )['total'] or 0

    # ============================
    # 2. Ventas por sucursal (día actual)
    # ============================
    ventas_sucursal = (
        Pedido.objects.filter(fecha_hora__date=hoy)
        .order_by()
        .values("sucursal_id", "sucursal__nombre")
        .annotate(total=Sum('total_neto') + Sum('iva'))
    )

    ventas_por_sucursal = [
        {
            "sucursal_id": v["sucursal_id"],
            "nombre": v["sucursal__nombre"],
            "total": float(v["total"] or 0)
        }
        for v in ventas_sucursal
    ]

    # ============================
    # 3. Top productos del día
    # ============================
    top_productos_raw = (
        PedidoDetalle.objects.filter(pedido__fecha_hora__date=hoy)
        .order_by()
        .values("producto_id", "producto__nombre")
        .annotate(cantidad=Sum("cantidad"))
        .order_by("-cantidad")[:5]
    )

    top_productos = [
        {
            "producto_id": p["producto_id"],
            "nombre": p["producto__nombre"],
            "cantidad": p["cantidad"]
        }
        for p in top_productos_raw
    ]

    # ============================
    # 4. Cantidad de pedidos del día
    # ============================
    pedidos_dia = Pedido.objects.filter(
        fecha_hora__date=hoy
    ).count()

    # ============================
    # 5. Producto más vendido del mes
    # ============================
    prod_mes_raw = (
        PedidoDetalle.objects.filter(pedido__fecha_hora__date__gte=inicio_mes)
        .order_by()
        .values("producto__nombre")
        .annotate(total_vendido=Sum("cantidad"))
        .order_by("-total_vendido")
        .first()
    )

    producto_mas_vendido_mes = (
        {
            "producto": prod_mes_raw["producto__nombre"],
            "cantidad": prod_mes_raw["total_vendido"]
        }
        if prod_mes_raw else None
    )

    # ============================
    # 6. Sucursal con mejor rendimiento del mes
    # ============================
    suc_mes_raw = (
        Pedido.objects.filter(fecha_hora__date__gte=inicio_mes)
        .order_by()
        .values("sucursal__nombre")
        .annotate(total_mes=Sum('total_neto') + Sum('iva'))
        .order_by("-total_mes")
        .first()
    )

    sucursal_mejor_mes = (
        {
            "sucursal": suc_mes_raw["sucursal__nombre"],
            "total": float(suc_mes_raw["total_mes"])
        }
        if suc_mes_raw else None
    )

    # ============================
    # 7. Ventas por día del mes
    # ============================
    ventas_mensuales = (
        Pedido.objects.filter(fecha_hora__date__gte=inicio_mes)
        .order_by()
        .annotate(dia=ExtractDay('fecha_hora'))
        .values("dia")
        .annotate(total=Sum('total_neto') + Sum('iva'))
        .order_by("dia")
    )

    ventas_mensuales_dias = [
        {
            "dia": v["dia"],
            "total": float(v["total"] or 0)
        }
        for v in ventas_mensuales
    ]

    ventas_totales_mes_empresa = sum(v["total"] for v in ventas_mensuales_dias)

    # ============================
    # 8. Promedio de ventas mensual por sucursal (NUEVO)
    # ============================
    ventas_por_sucursal_mes = (
        Pedido.objects.filter(fecha_hora__date__gte=inicio_mes)
        .order_by()
        .values("sucursal_id", "sucursal__nombre")
        .annotate(total=Sum("total_neto") + Sum("iva"))
    )

    # Obtener días activos (días con ventas hechas)
    dias_activos = ventas_mensuales.count() or 1  # Evita división entre cero

    promedio_ventas_mensual_por_sucursal = [
        {
            "sucursal_id": v["sucursal_id"],
            "nombre": v["sucursal__nombre"],
            "promedio": float((v["total"] or 0) / dias_activos)
        }
        for v in ventas_por_sucursal_mes
    ]

    # ============================
    # RESPUESTA FINAL
    # ============================
    return JsonResponse({
        "ventas_dia": float(ventas_dia),
        "ventas_por_sucursal": ventas_por_sucursal,
        "top_productos": top_productos,
        "pedidos_dia": pedidos_dia,
        "producto_mas_vendido_mes": producto_mas_vendido_mes,
        "sucursal_mejor_mes": sucursal_mejor_mes,
        "ventas_mensuales_dias": ventas_mensuales_dias,
        "ventas_totales_mes_empresa": ventas_totales_mes_empresa,
        "promedio_ventas_mensual_por_sucursal": promedio_ventas_mensual_por_sucursal,
    })

@csrf_exempt
@require_jwt
def boleta_pdf(request, boleta_id: int):
    """
    POST: subir o reemplazar PDF de la boleta
    DELETE: eliminar PDF de Azure y borrar url_pdf
    GET: obtener URL del PDF
    """
    try:
        b = Boleta.objects.get(pk=boleta_id)
    except Boleta.DoesNotExist:
        return JsonResponse({"detail": "Boleta no existe."}, status=404)

    # ========== GET ==========
    if request.method == "GET":
        return JsonResponse({
            "ok": True,
            "boleta_id": b.boleta_id,
            "url_pdf": b.url_pdf
        })

    # ========== POST (upload o replace) ==========
    if request.method == "POST":
        if "pdf" not in request.FILES:
            return JsonResponse({"detail": "Falta archivo 'pdf'."}, status=400)

        fileobj = request.FILES["pdf"]

        # Validar tamaño
        max_bytes = getattr(settings, "MAX_UPLOAD_MB", 10) * 1024 * 1024
        if fileobj.size > max_bytes:
            return JsonResponse({"detail": f"Archivo supera {settings.MAX_UPLOAD_MB} MB."}, status=400)

        # Subir nuevo PDF
        try:
            url = azure_blob.upload_boleta_pdf(b.boleta_id, fileobj, fileobj.name)
        except Exception as e:
            return JsonResponse({"detail": f"Error al subir PDF: {str(e)}"}, status=500)

        # Eliminar antiguo si existía
        if b.url_pdf and b.url_pdf != url:
            try:
                azure_blob.delete_by_url(b.url_pdf)
            except Exception as e:
                print(f"⚠️ No se pudo eliminar PDF antiguo: {e}")

        # Guardar nueva URL
        b.url_pdf = url
        b.save(update_fields=["url_pdf"])

        return JsonResponse({"ok": True, "url_pdf": url}, status=201)

    # ========== DELETE ==========
    if request.method == "DELETE":
        if not b.url_pdf:
            return JsonResponse({"ok": True, "detail": "Boleta no tenía PDF."})

        old = b.url_pdf
        b.url_pdf = None
        b.save(update_fields=["url_pdf"])

        try:
            azure_blob.delete_by_url(old)
        except Exception as e:
            print(f"⚠️ No se pudo eliminar del blob: {e}")

        return JsonResponse({"ok": True, "detail": "PDF eliminado."})

    return JsonResponse({"detail": "Método no permitido."}, status=405)

@csrf_exempt
@require_jwt
def boleta_generar_pdf(request, boleta_id: int):
    if request.method != "POST":
        return JsonResponse({"detail": "Método no permitido."}, status=405)

    try:
        b = Boleta.objects.get(pk=boleta_id)
    except Boleta.DoesNotExist:
        return JsonResponse({"detail": "Boleta no existe."}, status=404)

    from core.services.boleta_pdf_service import generar_y_subir_pdf_boleta

    url = generar_y_subir_pdf_boleta(b)

    return JsonResponse({
        "ok": True,
        "boleta_id": b.boleta_id,
        "url_pdf": url,
    }, status=200)