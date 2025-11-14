import json
from decimal import Decimal, InvalidOperation
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q
from django.core.paginator import Paginator
from django.conf import settings
from core.models import Producto, Categoria, Sucursal, Empresa, Usuario, Rol, Modificador, ProductoModificador
from core.passwords import check_password, make_hash  # Argon2
from core.jwt_utils import make_access_token, make_refresh_token, decode_token
from core.auth_decorators import require_jwt
from django.db import IntegrityError
from core import azure_blob
from django.core.files.uploadedfile import InMemoryUploadedFile


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

    # ✅ Validación segura con Argon2 (sin texto plano)
    if not check_password(password, user.contrasena_hash):
        return JsonResponse({"detail": "Credenciales inválidas."}, status=401)

    if not user.estado:
        return JsonResponse({"detail": "Usuario inactivo."}, status=403)

    # Emisión de tokens según tus TTL (ACCESS=5h, REFRESH=7d)
    access = make_access_token(user)
    refresh = make_refresh_token(user)

    # Devolvemos en JSON (útil para Postman/SPA) y setemos cookies httpOnly (web)
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
            "sucursal_id": user.sucursal_id,
        }
    }, status=200)
    _set_token_cookies(resp, access, refresh)
    return resp


@csrf_exempt
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
def logout_api(request):
    """
    Sin persistencia de refresh en BD, 'revocar' real no es posible (stateless).
    Este logout limpia cookies en el cliente; los tokens existentes expiran por tiempo.
    """
    resp = JsonResponse({"ok": True, "detail": "Sesión cerrada"})
    _clear_token_cookies(resp)
    return resp


@require_jwt
def me_api(request):
    u = request.user_obj
    return JsonResponse({
        "ok": True,
        "user": {
            "usuario_id": u.usuario_id,
            "nombre": u.nombre_completo,
            "email": u.email,
            "rol": u.rol.nombre if u.rol_id else None,
            "empresa_id": u.empresa_id,
            "sucursal_id": u.sucursal_id,
            "imagen_url": u.imagen_url,
        },
        "claims": request.jwt_payload,
    })


def _producto_to_dict(p: Producto):
    return {
        "producto_id": p.producto_id,
        "categoria_id": p.categoria_id,
        "categoria_nombre": p.categoria.nombre if p.categoria_id else None,
        "nombre": p.nombre,
        "descripcion": p.descripcion,
        # Serializamos Decimal a str para evitar issues en JSON:
        "precio_base": str(p.precio_base),
        "tiempo_preparacion": p.tiempo_preparacion,
        "estado": p.estado,
        "fecha_creacion": p.fecha_creacion.isoformat() if p.fecha_creacion else None,
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
    return {
        "usuario_id": u.usuario_id,
        "empresa_id": u.empresa_id,
        "empresa_nombre": u.empresa.nombre if u.empresa_id else None,
        "sucursal_id": u.sucursal_id,
        "sucursal_nombre": u.sucursal.nombre if u.sucursal_id else None,
        "rol_id": u.rol_id,
        "rol_nombre": u.rol.nombre if u.rol_id else None,
        "nombre_completo": u.nombre_completo,
        "email": u.email,
        "telefono": u.telefono,
        "estado": u.estado,
        "fecha_creacion": u.fecha_creacion.isoformat() if u.fecha_creacion else None,
    }


@csrf_exempt
@require_jwt
def usuarios_list(request):
    """
    GET: lista con filtros y paginación
      - q (busca en nombre_completo/email/telefono)
      - empresa_id, sucursal_id, rol_id
      - estado (true/false)
      - ordering (nombre_completo, -fecha_creacion, email, etc.)
      - page, page_size

    POST: crea usuario
      Requeridos: nombre_completo, email, password
      Opcionales: telefono, estado (default True), empresa_id, sucursal_id, rol_id
      - Hashea automáticamente 'password' a contrasena_hash (Argon2)
    """
    if request.method == "GET":
        qs = Usuario.objects.select_related("empresa", "sucursal", "rol").all()

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

        sucursal_id = request.GET.get("sucursal_id")
        if sucursal_id:
            qs = qs.filter(sucursal_id=sucursal_id)

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

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except Exception:
            return JsonResponse({"detail": "JSON inválido."}, status=400)

        nombre = (payload.get("nombre_completo") or "").strip()
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""

        if not nombre or not email or not password:
            return JsonResponse({"detail": "Campos requeridos: nombre_completo, email, password."}, status=400)

        # FK opcionales (ajusta a requeridos si ya lo decidiste)
        empresa = None
        sucursal = None
        rol = None

        empresa_id = payload.get("empresa_id")
        if empresa_id:
            try:
                empresa = Empresa.objects.get(pk=empresa_id)
            except Empresa.DoesNotExist:
                return JsonResponse({"detail": "Empresa no existe."}, status=404)

        sucursal_id = payload.get("sucursal_id")
        if sucursal_id:
            try:
                sucursal = Sucursal.objects.get(pk=sucursal_id)
            except Sucursal.DoesNotExist:
                return JsonResponse({"detail": "Sucursal no existe."}, status=404)

        rol_id = payload.get("rol_id")
        if rol_id:
            try:
                rol = Rol.objects.get(pk=rol_id)
            except Rol.DoesNotExist:
                return JsonResponse({"detail": "Rol no existe."}, status=404)

        try:
            u = Usuario.objects.create(
                empresa=empresa,
                sucursal=sucursal,
                rol=rol,
                nombre_completo=nombre,
                email=email,
                contrasena_hash=make_hash(password),  # hash Argon2
                telefono=payload.get("telefono") or None,
                estado=payload.get("estado", True),
            )
        except IntegrityError as ie:
            # p.ej. email duplicado (unique=True)
            return JsonResponse({"detail": f"Error de integridad: {str(ie)}"}, status=400)

        return JsonResponse({"ok": True, "usuario": _usuario_to_dict(u)}, status=201)

    return JsonResponse({"detail": "Método no permitido."}, status=405)


@csrf_exempt
@require_jwt
def usuario_detail(request, usuario_id: int):
    """
    GET: detalle
    PUT/PATCH: actualizar (incluye cambio de password; si viene 'password', se re-hashea)
    DELETE:
      - soft delete: estado=False
      - hard delete: ?hard=1
    """
    try:
        u = Usuario.objects.select_related("empresa", "sucursal", "rol").get(pk=usuario_id)
    except Usuario.DoesNotExist:
        return JsonResponse({"detail": "Usuario no existe."}, status=404)

    if request.method == "GET":
        return JsonResponse({"ok": True, "usuario": _usuario_to_dict(u)}, status=200)

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
            if isinstance(estado, bool):
                u.estado = estado
            else:
                return JsonResponse({"detail": "'estado' debe ser booleano."}, status=400)

        # cambio de password (re-hash)
        if "password" in payload:
            pwd = payload.get("password") or ""
            if not pwd:
                return JsonResponse({"detail": "'password' no puede ser vacío."}, status=400)
            u.contrasena_hash = make_hash(pwd)

        # FKs (opcionales; ajústalos a requeridos si quieres)
        if "empresa_id" in payload:
            eid = payload.get("empresa_id")
            if eid in (None, "", "null"):
                u.empresa = None
            else:
                try:
                    u.empresa = Empresa.objects.get(pk=eid)
                except Empresa.DoesNotExist:
                    return JsonResponse({"detail": "Empresa no existe."}, status=404)

        if "sucursal_id" in payload:
            sid = payload.get("sucursal_id")
            if sid in (None, "", "null"):
                u.sucursal = None
            else:
                try:
                    u.sucursal = Sucursal.objects.get(pk=sid)
                except Sucursal.DoesNotExist:
                    return JsonResponse({"detail": "Sucursal no existe."}, status=404)

        if "rol_id" in payload:
            rid = payload.get("rol_id")
            if rid in (None, "", "null"):
                u.rol = None
            else:
                try:
                    u.rol = Rol.objects.get(pk=rid)
                except Rol.DoesNotExist:
                    return JsonResponse({"detail": "Rol no existe."}, status=404)

        try:
            u.save()
        except IntegrityError as ie:
            return JsonResponse({"detail": f"Error de integridad: {str(ie)}"}, status=400)

        return JsonResponse({"ok": True, "usuario": _usuario_to_dict(u)}, status=200)

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